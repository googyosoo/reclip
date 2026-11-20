const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;
// 개인 PC 로컬 전용: 127.0.0.1 (외부 임의 접속 차단)
const HOST = process.env.HOST || '127.0.0.1';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 기본 저장 폴더: ~/Downloads/Reclip ────────────────────────────────────────
const DEFAULT_SAVE_DIR = path.join(os.homedir(), 'Downloads', 'Reclip');
if (!fs.existsSync(DEFAULT_SAVE_DIR)) {
  try {
    fs.mkdirSync(DEFAULT_SAVE_DIR, { recursive: true });
  } catch (err) {
    console.warn('[init] 기본 저장 디렉터리 생성 실패:', err.message);
  }
}

// ── ffmpeg 설치 여부 검사 ─────────────────────────────────────────────────────
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}
const HAS_FFMPEG = checkFfmpeg();

// ── Helper: resolve yt-dlp executable ────────────────────────────────────────
function resolveYtDlp() {
  const candidates = [
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
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
      console.log(`[yt-dlp] 실행 파일 감지: ${c}`);
      return { cmd: c, args: [] };
    }
  }

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  console.log(`[yt-dlp] 독립 바이너리 없음 — 파이썬 모듈 사용: ${pyCmd} -m yt_dlp`);
  return { cmd: pyCmd, args: ['-m', 'yt_dlp'] };
}

const YTDLP = resolveYtDlp();

// ── Helper: spawn yt-dlp ──────────────────────────────────────────────────────
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
      reject(new Error('yt-dlp 프로세스 응답 시간이 초과되었습니다 (60초).'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || 'yt-dlp 실행 실패'));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp 실행 불가: ${err.message}`));
    });
  });
}

// ── Helper: 상세 에러 사유 분석기 ─────────────────────────────────────────────
function analyzeYtDlpError(rawMsg) {
  const msg = String(rawMsg || '');
  if (/Sign in to confirm (you're not a bot|your age)/i.test(msg) || /Private video/i.test(msg) || /login/i.test(msg)) {
    return {
      title: '로그인 또는 비공개 영상',
      description: '게시자가 비공개로 설정했거나, 유튜브 봇 방지 인증 또는 로그인이 필요한 영상입니다.',
      solution: '공개 상태의 영상인지 확인해 주시거나, 브라우저에서 직접 시청해 주세요.',
      code: 'AUTH_REQUIRED'
    };
  }
  if (/Age-restricted/i.test(msg)) {
    return {
      title: '연령 제한 영상',
      description: '성인 인증이 필요한 연령 제한 영상입니다.',
      solution: '해당 영상은 외부 프로그램에서 다운로드가 제한됩니다.',
      code: 'AGE_RESTRICTED'
    };
  }
  if (/Geo-restricted|not available in your country/i.test(msg)) {
    return {
      title: '지역 제한 영상',
      description: '게시자가 특정 국가(대한민국 등)에서 시청할 수 없도록 제한한 영상입니다.',
      solution: '국내에서 정식 서비스되는 공개 영상 링크를 이용해 주세요.',
      code: 'GEO_BLOCKED'
    };
  }
  if (/Video unavailable|This video has been removed/i.test(msg)) {
    return {
      title: '삭제되었거나 존재하지 않는 영상',
      description: '영상이 삭제되었거나 URL 주소에 오타가 있어 영상을 찾을 수 없습니다.',
      solution: '브라우저 주소창에서 정상 재생되는 영상 URL인지 다시 확인해 주세요.',
      code: 'NOT_FOUND'
    };
  }
  if (/HTTP Error 403/i.test(msg)) {
    return {
      title: '접근 차단 (403 Forbidden)',
      description: '유튜브 서버에서 일시적으로 요청을 차단했습니다.',
      solution: '잠시 후 다시 시도하거나, 다른 화질 옵션을 선택해 보세요.',
      code: 'FORBIDDEN'
    };
  }
  if (/ffmpeg/i.test(msg)) {
    return {
      title: 'ffmpeg 미설치 또는 변환 오류',
      description: '영상과 오디오를 하나로 합치거나 MP3로 변환할 때 ffmpeg가 필요합니다.',
      solution: '관리자 권한 터미널에서 "winget install Gyan.FFmpeg" 명령어로 설치해 주세요.',
      code: 'FFMPEG_ERROR'
    };
  }
  if (/timed out|IncompleteRead|getaddrinfo/i.test(msg)) {
    return {
      title: '네트워크 연결 불안정',
      description: '영상 서버로부터 데이터를 수신하는 도중 연결이 끊어졌거나 지연되었습니다.',
      solution: '인터넷 연결 상태를 점검하신 후 다시 시도해 주세요.',
      code: 'NETWORK_ERROR'
    };
  }
  return {
    title: '다운로드 실패',
    description: msg.split('\n').pop() || '알 수 없는 오류가 발생했습니다.',
    solution: 'URL을 다시 확인하거나 브라우저 새로고침 후 재시도해 주세요.',
    code: 'UNKNOWN_ERROR'
  };
}

// ── Helper: URL 안전 검증 (SSRF 방지) ─────────────────────────────────────────
function isSafePublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '[::1]' || host === '::1'
  ) {
    return false;
  }
  return true;
}

// ── Helper: 파일명 정제 ───────────────────────────────────────────────────────
function sanitizeFilename(name, maxLen = 80) {
  return (name || 'video')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen) || 'video';
}

// ── Helper: 재생시간 포맷팅 ───────────────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── SSE 진행률 관리 인메모리 맵 ───────────────────────────────────────────────
const activeJobs = new Map(); // jobId -> { proc, listeners: Set(res), status, percent, speed, eta, error, result }

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════

// GET / ─ 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/config ─ 로컬 설정 및 환경 상태 반환
app.get('/api/config', (req, res) => {
  res.json({
    defaultFolder: DEFAULT_SAVE_DIR,
    ytdlpCmd: YTDLP.cmd,
    hasFfmpeg: HAS_FFMPEG,
    isLocal: true,
  });
});

// POST /api/info ─ 영상 메타데이터 분석
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL을 입력해 주세요.' });
  }
  if (!isSafePublicUrl(url)) {
    return res.status(400).json({ error: '유효한 공개 http/https URL만 지원합니다.' });
  }

  try {
    const raw = await runYtDlp([
      '--no-playlist',
      '--dump-json',
      '--no-warnings',
      url.trim(),
    ], 60000);

    const info = JSON.parse(raw);

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
    console.error('[/api/info 오류]', err.message);
    const analysis = analyzeYtDlpError(err.message);
    return res.status(400).json({
      error: err.message,
      detail: analysis
    });
  }
});

// GET /api/download ─ 브라우저 직접 스트리밍 다운로드 (기존 방식)
app.get('/api/download', (req, res) => {
  const { url, format, format_id, title } = req.query;

  if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' });
  if (!isSafePublicUrl(url)) return res.status(400).json({ error: '유효한 공개 URL만 지원합니다.' });

  const isAudio = format === 'audio';
  const safeTitle = sanitizeFilename(title);
  const ext = isAudio ? 'mp3' : 'mp4';
  const filename = `${safeTitle}.${ext}`;

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const dlArgs = [
    '--no-playlist',
    '-o',
    '-',
    '--no-warnings',
    '--extractor-args',
    'youtube:player_client=android'
  ];
  if (isAudio) {
    dlArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format_id) {
    dlArgs.push('-f', `${format_id}+bestaudio/best`, '--merge-output-format', 'mp4');
  } else {
    dlArgs.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
  }
  dlArgs.push(url);

  console.log(`[스트리밍 다운로드] 시작: ${url} (${filename})`);
  const proc = spawnYtDlp(dlArgs);
  proc.stdout.pipe(res);

  proc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('[download]') && !msg.includes('Merging')) {
      console.error('[yt-dlp stderr]', msg.trim());
    }
  });

  proc.on('close', (code) => {
    console.log(`[스트리밍 다운로드] 종료 (code=${code}): ${filename}`);
    if (!res.writableEnded) res.end();
  });

  proc.on('error', (err) => {
    console.error('[스트리밍 에러]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });

  req.on('close', () => {
    proc.kill();
  });
});

// POST /api/save-local ─ 로컬 PC 지정 폴더에 직접 다운로드 (진행률 추적 지원)
app.post('/api/save-local', (req, res) => {
  const { url, format, format_id, title, saveDir } = req.body;

  if (!url || !isSafePublicUrl(url)) {
    return res.status(400).json({ error: '유효한 공개 URL만 지원합니다.' });
  }

  // 대상 디렉터리 검증 및 생성
  const targetDir = (saveDir && typeof saveDir === 'string' && saveDir.trim())
    ? path.resolve(saveDir.trim())
    : DEFAULT_SAVE_DIR;

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (err) {
    return res.status(400).json({ error: `저장 폴더를 생성할 수 없습니다: ${err.message}` });
  }

  const isAudio = format === 'audio';
  const safeTitle = sanitizeFilename(title);
  const ext = isAudio ? 'mp3' : 'mp4';
  const outTemplate = path.join(targetDir, `${safeTitle}.%(ext)s`);

  const jobId = crypto.randomUUID();
  const jobState = {
    jobId,
    targetDir,
    filename: `${safeTitle}.${ext}`,
    status: 'starting', // starting | downloading | processing | finished | error
    percent: 0,
    speed: '',
    eta: '',
    error: null,
    listeners: new Set(),
  };
  activeJobs.set(jobId, jobState);

  // yt-dlp 인자 구성
  const dlArgs = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--extractor-args',
    'youtube:player_client=android',
    '--progress-template',
    'PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '-o',
    outTemplate,
  ];

  if (isAudio) {
    dlArgs.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format_id) {
    dlArgs.push('-f', `${format_id}+bestaudio/best`, '--merge-output-format', 'mp4');
  } else {
    dlArgs.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
  }
  dlArgs.push(url);

  console.log(`[로컬 저장 시작] jobId=${jobId} | 경로=${targetDir}`);
  const proc = spawnYtDlp(dlArgs);
  jobState.proc = proc;

  // 진행률 파싱
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        const parts = line.replace('PROGRESS:', '').trim().split('|');
        const rawPercent = parts[0]?.replace('%', '').trim();
        const percent = parseFloat(rawPercent) || 0;
        jobState.status = 'downloading';
        jobState.percent = percent;
        jobState.speed = parts[1] || '';
        jobState.eta = parts[2] || '';
        broadcastJob(jobState, 'progress');
      } else if (line.includes('[ExtractAudio]') || line.includes('[Merger]')) {
        jobState.status = 'processing';
        broadcastJob(jobState, 'processing');
      }
    }
  });

  let stderrBuf = '';
  proc.stderr.on('data', (d) => {
    stderrBuf += d.toString();
  });

  proc.on('close', (code) => {
    if (code === 0) {
      jobState.status = 'finished';
      jobState.percent = 100;
      broadcastJob(jobState, 'finished');
      console.log(`[로컬 저장 완료] jobId=${jobId}`);
    } else {
      jobState.status = 'error';
      const analysis = analyzeYtDlpError(stderrBuf);
      jobState.error = analysis;
      broadcastJob(jobState, 'error');
      console.error(`[로컬 저장 실패] jobId=${jobId} error=`, stderrBuf);
    }
    // 5분 후 메모리 정리
    setTimeout(() => activeJobs.delete(jobId), 5 * 60 * 1000);
  });

  proc.on('error', (err) => {
    jobState.status = 'error';
    jobState.error = analyzeYtDlpError(err.message);
    broadcastJob(jobState, 'error');
  });

  return res.json({
    jobId,
    targetDir,
    filename: jobState.filename,
  });
});

// GET /api/progress/:jobId ─ SSE 진행률 스트림
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: '해당 작업을 찾을 수 없습니다.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 초기 상태 즉시 전송
  res.write(`data: ${JSON.stringify({
    status: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    filename: job.filename,
    targetDir: job.targetDir,
    error: job.error,
  })}\n\n`);

  job.listeners.add(res);

  req.on('close', () => {
    job.listeners.delete(res);
  });
});

function broadcastJob(job, eventType) {
  const payload = JSON.stringify({
    type: eventType,
    status: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    filename: job.filename,
    targetDir: job.targetDir,
    error: job.error,
  });
  for (const listener of job.listeners) {
    listener.write(`data: ${payload}\n\n`);
  }
}

// POST /api/open-folder ─ 윈도우 탐색기로 다운로드 폴더 열기 (교사용 편의)
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  const target = (folderPath && typeof folderPath === 'string')
    ? path.resolve(folderPath)
    : DEFAULT_SAVE_DIR;

  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: '폴더가 존재하지 않습니다.' });
  }

  if (process.platform === 'win32') {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' });
  } else {
    spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
  }

  return res.json({ success: true, opened: target });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n🌊 Reclip Pro (교사용 미디어 도구) 가동 완료: http://${HOST}:${PORT}`);
  console.log(`   기본 저장 폴더: ${DEFAULT_SAVE_DIR}`);
  console.log(`   ffmpeg 지원: ${HAS_FFMPEG ? '정상 작동' : '미설치 (기본 MP4만 지원)'}`);
  if (YTDLP.args.length > 0) {
    console.log(`   yt-dlp: ${YTDLP.cmd} ${YTDLP.args.join(' ')}`);
  } else {
    console.log(`   yt-dlp: ${YTDLP.cmd}`);
  }
  console.log(`   종료하려면 Ctrl+C 를 누르세요.\n`);
});
