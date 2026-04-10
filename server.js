const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────

/**
 * URL geçerliliğini kontrol eder
 */
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * yt-dlp'yi JSON modunda çalıştırıp video bilgisi alır
 */
function fetchVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '30',
      url
    ];

    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        // Hata mesajını Türkçeleştir
        let errorMsg = 'Video bilgisi alınamadı.';
        if (stderr.includes('Unsupported URL') || stderr.includes('is not a valid URL')) {
          errorMsg = 'Bu URL desteklenmiyor veya geçersiz.';
        } else if (stderr.includes('Private video') || stderr.includes('private')) {
          errorMsg = 'Bu video gizli. İndirilemiyor.';
        } else if (stderr.includes('not available') || stderr.includes('removed')) {
          errorMsg = 'Video mevcut değil veya kaldırılmış.';
        } else if (stderr.includes('age')) {
          errorMsg = 'Bu video yaş kısıtlamalı. İndirilemiyor.';
        } else if (stderr.includes('copyright') || stderr.includes('Copyright')) {
          errorMsg = 'Bu video telif hakkı nedeniyle kısıtlı.';
        }
        return reject(new Error(errorMsg));
      }

      try {
        // Bazen birden fazla JSON satırı gelebilir (playlist), ilkini al
        const lines = stdout.trim().split('\n').filter(Boolean);
        const info = JSON.parse(lines[0]);
        resolve(info);
      } catch {
        reject(new Error('Video verisi işlenirken hata oluştu.'));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp kurulu değil. Sunucu yapılandırmasını kontrol edin.'));
      } else {
        reject(new Error('Süreç başlatılamadı: ' + err.message));
      }
    });

    // 60 saniye timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error('Zaman aşımı: Video bilgisi 60 saniyede alınamadı.'));
    }, 60000);
  });
}

/**
 * Format seçeneklerini kullanıcı dostu hale getirir
 */
function buildFormatList(info) {
  const formats = [];

  // MP3 seçeneği her zaman ekle
  formats.push({
    id: 'mp3',
    label: 'MP3 - Sadece Ses',
    ext: 'mp3',
    type: 'audio',
    quality: 0
  });

  // M4A seçeneği
  formats.push({
    id: 'm4a',
    label: 'M4A - Yüksek Kalite Ses',
    ext: 'm4a',
    type: 'audio',
    quality: 1
  });

  if (!info.formats) return formats;

  // Kalite haritası
  const qualityMap = {
    2160: '4K (2160p)',
    1440: '2K (1440p)',
    1080: 'Full HD (1080p)',
    720: 'HD (720p)',
    480: 'Orta (480p)',
    360: 'Düşük (360p)',
    240: 'Çok Düşük (240p)',
    144: 'En Düşük (144p)'
  };

  const seenHeights = new Set();

  // Video formatlarını filtrele ve sırala
  const videoFormats = info.formats
    .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
    .sort((a, b) => b.height - a.height);

  for (const f of videoFormats) {
    const h = f.height;
    if (seenHeights.has(h)) continue;
    seenHeights.add(h);

    const label = qualityMap[h] || `${h}p`;
    formats.push({
      id: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
      label: `${label} - Video + Ses`,
      ext: 'mp4',
      type: 'video',
      height: h,
      quality: h
    });
  }

  // Kaliteye göre sırala (en yüksekten en düşüğe), ses formatları en alta
  formats.sort((a, b) => {
    if (a.type === 'audio' && b.type === 'video') return 1;
    if (a.type === 'video' && b.type === 'audio') return -1;
    return b.quality - a.quality;
  });

  return formats;
}

// ─── Route: Sağlık Kontrolü ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Route: Video Bilgisi ───────────────────────────────────────────────────
app.post('/info', async (req, res) => {
  const { url } = req.body;

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL boş olamaz.' });
  }

  if (!isValidUrl(url.trim())) {
    return res.status(400).json({ error: 'Geçersiz URL formatı.' });
  }

  try {
    const info = await fetchVideoInfo(url.trim());

    const formats = buildFormatList(info);

    res.json({
      title: info.title || 'Başlıksız Video',
      thumbnail: info.thumbnail || null,
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || 'Bilinmiyor',
      viewCount: info.view_count || 0,
      platform: info.extractor_key || 'Bilinmiyor',
      formats
    });
  } catch (err) {
    console.error('[/info] Hata:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: İndirme (Streaming) ─────────────────────────────────────────────
app.get('/download', (req, res) => {
  const { url, format, filename } = req.query;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Geçersiz URL.' });
  }

  if (!format) {
    return res.status(400).json({ error: 'Format belirtilmedi.' });
  }

  // Güvenli dosya adı oluştur
  const safeFilename = (filename || 'indirme')
    .replace(/[^\w\s\-_.çğıöşüÇĞİÖŞÜ]/gi, '')
    .substring(0, 100)
    .trim() || 'indirme';

  let ext = 'mp4';
  let ytdlpArgs = [];

  if (format === 'mp3') {
    ext = 'mp3';
    ytdlpArgs = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '--no-warnings',
      '-o', '-',
      url
    ];
  } else if (format === 'm4a') {
    ext = 'm4a';
    ytdlpArgs = [
      '-x',
      '--audio-format', 'm4a',
      '--audio-quality', '0',
      '--no-playlist',
      '--no-warnings',
      '-o', '-',
      url
    ];
  } else {
    // Video + ses birleştirme (FFmpeg gerekli)
    // "-o -" ile pipe çıktısı, ancak birleştirme için temp gerekebilir
    // Bu yüzden mkv/mp4 container kullanıyoruz
    ext = 'mp4';
    ytdlpArgs = [
      '-f', format,
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '-o', '-',
      url
    ];
  }

  // HTTP başlıklarını ayarla
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename + '.' + ext)}`);
  res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  console.log(`[/download] Başlatıldı: format=${format}, url=${url.substring(0, 60)}...`);

  const proc = spawn('yt-dlp', ytdlpArgs);

  // yt-dlp stdout'unu doğrudan response'a bağla (pipe)
  proc.stdout.pipe(res);

  let stderrData = '';
  proc.stderr.on('data', (data) => {
    stderrData += data.toString();
    // Konsola yaz ama yanıta ekleme
    process.stdout.write('.');
  });

  proc.on('close', (code) => {
    console.log(`\n[/download] Tamamlandı: code=${code}`);
    if (!res.headersSent) {
      if (code !== 0) {
        res.status(500).end();
      }
    }
  });

  proc.on('error', (err) => {
    console.error('[/download] Süreç hatası:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'İndirme başlatılamadı.' });
    }
  });

  // İstemci bağlantıyı keserse süreci durdur
  req.on('close', () => {
    proc.kill('SIGTERM');
    console.log('[/download] İstemci bağlantıyı kesti, süreç durduruldu.');
  });
});

// ─── Sunucuyu Başlat ────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   YT-DLP İndirme Servisi Başladı       ║
║   Port: ${PORT}                            ║
║   Ortam: ${process.env.NODE_ENV || 'development'}                   ║
╚════════════════════════════════════════╝
  `);
});
