# ─── Aşama 1: Temel İmaj ve Sistem Bağımlılıkları ─────────────────────────
FROM node:20-slim

# Sistem bağımlılıklarını yükle
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'yi en güncel sürümüyle indir
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# ─── Aşama 2: Uygulama Kurulumu ───────────────────────────────────────────
WORKDIR /app

# npm paketlerini kopyala ve yükle
COPY package*.json ./
RUN npm install --production

# 1. KRİTİK ADIM: cookies.txt dosyasını Docker imajına kopyala
# Bu dosyanın server.js ile aynı dizinde olduğundan emin ol
COPY cookies.txt ./cookies.txt

# 2. Geri kalan tüm uygulama dosyalarını kopyala
COPY . .

# Render port ayarı
ENV PORT=10000
EXPOSE 10000

# Sağlık kontrolü
HEALTHCHECK --interval=1m --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Uygulamayı başlat
CMD ["node", "server.js"]
