# ─── Aşama 1: Temel İmaj ve Sistem Bağımlılıkları ─────────────────────────
FROM node:20-slim

# Sistem bağımlılıklarını tek katmanda yükle
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'yi en güncel sürümüyle doğrudan indir ve yetki ver
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# ─── Aşama 2: Uygulama Kurulumu ───────────────────────────────────────────
WORKDIR /app

# Önce sadece package dosyalarını kopyala (Cache avantajı için)
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Uygulama dosyalarını kopyala
COPY . .

# Render veya diğer servisler için Port tanımla
ENV PORT=3000
EXPOSE 3000

# Sağlık kontrolü
HEALTHCHECK --interval=1m --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Uygulamayı başlat
CMD ["node", "server.js"]
