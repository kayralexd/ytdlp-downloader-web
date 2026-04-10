# ─── Aşama 1: Bağımlılıkları yükle ─────────────────────────────────────────
FROM node:20-slim AS base

# Sistem bağımlılıklarını yükle
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp'yi en güncel sürümüyle yükle
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# ─── Aşama 2: Uygulama ──────────────────────────────────────────────────────
WORKDIR /app

# Önce bağımlılıkları kopyala (Docker cache katmanı optimizasyonu)
COPY package*.json ./
RUN npm ci --only=production

# Uygulama dosyalarını kopyala
COPY . .

# Render.com varsayılan portu
EXPOSE 3000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
