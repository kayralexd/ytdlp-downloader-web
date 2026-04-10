# ─── Aşama 1: Bağımlılıkları yükle ─────────────────────────────────────────
FROM node:20-slim AS base

# Sistem bağımlılıklarını yükle (yt-dlp ve ffmpeg için gerekli)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'yi en güncel sürümüyle doğrudan indir
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# ─── Aşama 2: Uygulama Kurulumu ───────────────────────────────────────────
WORKDIR /app

# npm ci hatasını önlemek için klasik install kullanıyoruz
COPY package*.json ./
RUN npm install --only=production

# Tüm dosyaları kopyala
COPY . .

# Render portu
EXPOSE 3000

# Sağlık kontrolü (Sistemin ayakta olduğunu doğrular)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
