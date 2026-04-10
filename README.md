# VidAl — Video & Ses İndirici

yt-dlp ve FFmpeg kullanan, Render.com'a deploy edilebilir Docker tabanlı video indirme servisi.

## Özellikler

- 🎬 1000+ platform desteği (YouTube, Instagram, TikTok, Twitter...)
- 🎵 MP3 / M4A ses çıkarma
- 📹 144p'den 4K'ya kadar video kalitesi
- ⚡ Disk kullanmadan doğrudan pipe/stream
- 🌙 Karanlık tema, Türkçe arayüz

## Kurulum

### Docker ile (Tavsiye Edilir)

```bash
docker build -t vidal .
docker run -p 3000:3000 vidal
```

### Manuel

```bash
# Gereksinimler: Node.js 18+, Python3, yt-dlp, FFmpeg
npm install
npm start
```

## Render.com'a Deploy

1. GitHub'a push et
2. Render Dashboard → New Web Service
3. Docker ortamını seç
4. Deploy!

## API Endpointleri

| Endpoint | Method | Açıklama |
|---|---|---|
| `GET /health` | GET | Sağlık kontrolü |
| `POST /info` | POST | Video bilgisi getir (`{"url": "..."}`) |
| `GET /download` | GET | Dosya indir (`?url=...&format=...&filename=...`) |

## Notlar

- FFmpeg, yüksek kalite videoların ses ile birleştirilmesi için gereklidir
- Yalnızca yasal ve telif hakkı serbest içerikler için kullanın
