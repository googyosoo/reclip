const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8899;
const HOST = process.env.HOST || '0.0.0.0';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper: resolve yt-dlp executable ────────────────────────────────────────
function resolveYtDlp() {
  // Check absolute paths: Linux/Docker first, then Windows
  const candidates = [
    // Linux / Docker (installed via pip or apt)
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    // Windows (pip --user install)
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    'C:\\Python314\\Scripts\\yt-dlp.exe',
    'C:\\Python313\\Scripts\\yt-dlp.exe',
    'C:\\Python312\\Scripts\\yt-dlp.exe',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`[yt-dlp] Found at: ${c}`);
      return { cmd: c, args: [] };
    }
  }

  // Fallback: python3 -m yt_dlp (Linux/Docker), then python -m yt_dlp (Windows)
  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  console.log(`[yt-dlp] Not found as standalone binary — using: ${pyCmd} -m yt_dlp`);
  return { cmd: pyCmd, args: ['-m', 'yt_dlp'] };
}

const YTDLP = resolveYtDlp();

// ── Helper: spawn yt-dlp with correct cmd/args prefix ────────────────────────
function spawnYtDlp(extraArgs, opts = {}) {
  return spawn(YTDLP.cmd, [...YTDLP.args, ...extraArgs], { windowsHide: true, ...opts });
}

// ── Helper: run yt-dlp and collect stdout ─────────────────────────────────────
function runYtDlp(extraArgs, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawnYtDlp(extraArgs);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('yt-dlp process timed out'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().split('\n').pop() || 'yt-dlp failed'));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to launch yt-dlp: ${err.message}`));
    });
  });
}

// ── Sanitize filename ─────────────────────────────────────────────────────────
function sanitizeFilename(name, maxLen = 80) {
  return (name || 'video')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen) || 'video';
}

// ── Format duration ───────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

// GET / ─ serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST /api/info ─ fetch video metadata
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL이 필요합니다.' });
  }

  try {
    const raw = await runYtDlp([
      '--no-playlist',
      '--dump-json',
      '--no-warnings',
      url.trim(),
    ], 60000);

    const info = JSON.parse(raw);

    // Build quality options – best format per resolution
    const bestByHeight = {};
    for (const f of info.formats || []) {
      const h = f.height;
      if (h && f.vcodec && f.vcodec !== 'none') {
        const tbr = f.tbr || 0;
        if (!bestByHeight[h] || tbr > (bestByHeight[h].tbr || 0)) {
          bestByHeight[h] = f;
        }
      }
    }
    const formats = Object.values(bestByHeight)
      .map((f) => ({ id: f.format_id, label: `${f.height}p`, height: f.height }))
      .sort((a, b) => b.height - a.height);

    return res.json({
      title: info.title || '',
      thumbnail: info.thumbnail || '',
      duration: formatDuration(info.duration),
      uploader: info.uploader || info.channel || '',
      view_count: info.view_count,
      formats,
      extractor: info.extractor_key || info.extractor || '',
    });
  } catch (err) {
    console.error('[/api/info]', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/download ─ stream file directly to browser
app.get('/api/download', (req, res) => {
  const { url, format, format_id, title } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL이 필요합니다.' });
  }

  const isAudio = format === 'audio';
  const safeTitle = sanitizeFilename(title);
  const ext = isAudio ? 'mp3' : 'mp4';
  const filename = `${safeTitle}.${ext}`;

  // Set headers to trigger browser download
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Build yt-dlp args
  const dlArgs = ['--no-playlist', '-o', '-', '--no-warnings'];

  if (isAudio) {
    dlArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format_id) {
    dlArgs.push('-f', `${format_id}+bestaudio/best`, '--merge-output-format', 'mp4');
  } else {
    dlArgs.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
  }

  dlArgs.push(url);

  console.log(`[download] Starting: ${url} | format=${format} | format_id=${format_id}`);

  const proc = spawnYtDlp(dlArgs);

  proc.stdout.pipe(res);

  proc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('[download]') && !msg.includes('Merging')) {
      console.error('[yt-dlp stderr]', msg.trim());
    }
  });

  proc.on('close', (code) => {
    console.log(`[download] Done (code=${code}): ${filename}`);
    if (!res.writableEnded) res.end();
  });

  proc.on('error', (err) => {
    console.error('[download error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  // Destroy yt-dlp if client disconnects
  req.on('close', () => {
    proc.kill();
    console.log('[download] Client disconnected, process killed.');
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n🌊 Reclip Pro running at http://localhost:${PORT}`);
  if (YTDLP.args.length > 0) {
    console.log(`   yt-dlp: ${YTDLP.cmd} ${YTDLP.args.join(' ')}`);
  } else {
    console.log(`   yt-dlp: ${YTDLP.cmd}`);
  }
  console.log(`   Press Ctrl+C to stop.\n`);
});
