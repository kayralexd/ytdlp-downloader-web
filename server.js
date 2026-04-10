const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000; // Render genellikle 10000 kullanır

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────

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
 * Render için User-Agent ve IP engeli önlemleri eklendi
 */
function fetchVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates', // Sertifika hatalarını görmezden gel
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
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
        console.error("yt-dlp hatası detayı:", stderr); // Render loglarında hatayı gör
        let errorMsg = 'Video bilgisi alınamadı.';
        if (stderr.includes('403') || stderr.includes('Sign in')) {
          errorMsg = 'Bu video platform tarafından engelleniyor (Giriş veya IP kısıtlaması).';
        } else if (stderr.includes('Unsupported URL')) {
          errorMsg = 'Bu URL desteklenmiyor.';
        }
        return reject(new Error(errorMsg));
      }

      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const info = JSON.parse(lines[0]);
        resolve(info);
      } catch {
        reject(new Error('Video verisi işlenirken hata oluştu.'));
      }
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('Zaman aşımı: Video bilgisi alınamadı.'));
    }, 60000);
  });
}

function buildFormatList(info) {
  const formats = [];
  formats.push({ id: 'mp3', label: 'MP3 - Sadece Ses', ext: 'mp3', type: 'audio', quality: 0 });
  formats.push({ id: 'm4a', label: 'M4A - Yüksek Kalite Ses', ext: 'm4a', type: 'audio', quality: 1 });

  if (!info.formats) return formats;

  const qualityMap = { 2160: '4K', 1440: '2K', 1080: 'Full HD', 720: 'HD', 480: 'Orta', 360: 'Düşük' };
  const seenHeights = new Set();

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
  return formats;
}

// ─── Route'lar ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL boş olamaz.' });

  try {
    const info = await fetchVideoInfo(url.trim());
    const formats = buildFormatList(info);

    // Frontend'e giden veriyi temizle
    res.json({
      title: info.title || 'Başlıksız',
      thumbnail: info.thumbnail || null,
      duration: info.duration || 0,
      uploader: info.uploader || 'Bilinmiyor',
      viewCount: info.view_count || 0,
      formats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/download', (req, res) => {
  const { url, format, filename } = req.query;
  if (!url || !format) return res.status(400).send('Eksik parametre.');

  const safeFilename = encodeURIComponent(filename || 'video');
  
  let ytdlpArgs = ['--no-playlist', '--no-warnings', '--no-check-certificates', '-o', '-', url];
  let contentType = 'video/mp4';

  if (format === 'mp3') {
    ytdlpArgs.unshift('-x', '--audio-format', 'mp3');
    contentType = 'audio/mpeg';
  } else if (format === 'm4a') {
    ytdlpArgs.unshift('-x', '--audio-format', 'm4a');
    contentType = 'audio/mp4';
  } else {
    ytdlpArgs.unshift('-f', format, '--merge-output-format', 'mp4');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${format === 'mp3' ? 'mp3' : 'mp4'}"`);
  res.setHeader('Content-Type', contentType);

  const proc = spawn('yt-dlp', ytdlpArgs);
  proc.stdout.pipe(res);

  req.on('close', () => proc.kill());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} üzerinde çalışıyor...`);
});
