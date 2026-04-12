/* ════════════════════════════════════════════════════════════════
   Reclip Pro — main.js
   Frontend logic: URL parsing, API calls, card rendering, download
   ════════════════════════════════════════════════════════════════ */

const API_BASE = '';   // same-origin

// ── DOM refs ──────────────────────────────────────────────────────────────────
const urlInput       = document.getElementById('url-input');
const clearBtn       = document.getElementById('clear-btn');
const fetchBtn       = document.getElementById('fetch-btn');
const btnVideo       = document.getElementById('btn-video');
const btnAudio       = document.getElementById('btn-audio');
const errorBanner    = document.getElementById('error-banner');
const errorMsg       = document.getElementById('error-msg');
const resultsSection = document.getElementById('results-section');
const resultsGrid    = document.getElementById('results-grid');
const resultCount    = document.getElementById('result-count');
const downloadAllBtn = document.getElementById('download-all-btn');
const clearResBtn    = document.getElementById('clear-results-btn');
const cardTemplate   = document.getElementById('card-template');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFormat = 'video'; // 'video' | 'audio'
let videoItems = [];           // [{ url, info, formatId }]

// ── Format toggle ─────────────────────────────────────────────────────────────
[btnVideo, btnAudio].forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedFormat = btn.dataset.format;
    btnVideo.classList.toggle('active', selectedFormat === 'video');
    btnAudio.classList.toggle('active', selectedFormat === 'audio');
    btnVideo.setAttribute('aria-pressed', String(selectedFormat === 'video'));
    btnAudio.setAttribute('aria-pressed', String(selectedFormat === 'audio'));
  });
});

// ── URL input ─────────────────────────────────────────────────────────────────
urlInput.addEventListener('input', () => {
  const has = urlInput.value.trim().length > 0;
  clearBtn.hidden = !has;
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.hidden = true;
  urlInput.focus();
});

// ── Parse URLs from textarea ───────────────────────────────────────────────────
function parseUrls(raw) {
  // Split by newline, comma, or space; then filter valid-looking URLs
  const parts = raw.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const urls = [];
  for (const p of parts) {
    try {
      new URL(p);
      if (!seen.has(p)) { seen.add(p); urls.push(p); }
    } catch { /* skip invalid */ }
  }
  return urls;
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorBanner.hidden = false;
}

function closeError() {
  errorBanner.hidden = true;
}
window.closeError = closeError;

// ── Set loading state ─────────────────────────────────────────────────────────
function setLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtn.querySelector('.btn-text').hidden = loading;
  fetchBtn.querySelector('.btn-spinner').hidden = !loading;
}

// ── Skeleton loader ────────────────────────────────────────────────────────────
function addSkeletons(n) {
  resultsSection.hidden = false;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton-card';
    s.innerHTML = `
      <div class="skeleton-thumb"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>`;
    resultsGrid.appendChild(s);
  }
}

function removeSkeletons() {
  resultsGrid.querySelectorAll('.skeleton-card').forEach((el) => el.remove());
}

// ── Format number ─────────────────────────────────────────────────────────────
function fmtViews(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M 조회`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K 조회`;
  return `${n} 조회`;
}

// ── Build video card ──────────────────────────────────────────────────────────
function buildCard(url, info, index) {
  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.video-card');

  // Thumbnail
  const img = card.querySelector('.card-thumb');
  img.src  = info.thumbnail || '';
  img.alt  = `${info.title} 썸네일`;
  img.onerror = () => { img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%230a1f3a" width="320" height="180"/%3E%3Ctext x="50%25" y="50%25" fill="%23387ebf" font-family="sans-serif" font-size="14" text-anchor="middle" dy=".3em"%3E🎬 썸네일 없음%3C/text%3E%3C/svg%3E'; };

  // Duration
  const dur = card.querySelector('.card-duration');
  dur.textContent = info.duration || '';

  // Title
  card.querySelector('.card-title').textContent = info.title || url;

  // Meta
  const uploader = card.querySelector('.card-uploader');
  uploader.textContent = info.uploader || '';
  if (!info.uploader) uploader.style.display = 'none';

  // Quality selector (only for video)
  const sel = card.querySelector('.quality-select');
  if (selectedFormat === 'audio') {
    card.querySelector('.card-format-wrap').style.display = 'none';
  } else {
    for (const f of (info.formats || [])) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.label;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      videoItems[index].formatId = sel.value;
    });
  }

  // Download button
  const dlBtn = card.querySelector('.download-btn');
  dlBtn.addEventListener('click', () => triggerDownload(url, info, index, dlBtn, sel));

  videoItems[index] = { url, info, formatId: sel.value || '' };
  return frag;
}

// ── Trigger single download ────────────────────────────────────────────────────
function triggerDownload(url, info, index, btn, sel) {
  if (btn.disabled) return;

  const formatId = sel ? sel.value : '';
  const params = new URLSearchParams({
    url,
    format: selectedFormat,
    ...(formatId ? { format_id: formatId } : {}),
    title: info.title || 'video',
  });

  btn.disabled = true;
  btn.classList.add('downloading');
  btn.innerHTML = `
    <svg class="spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    다운로드 중...`;

  // Create an anchor to trigger browser download
  const a = document.createElement('a');
  a.href = `${API_BASE}/api/download?${params}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Re-enable after short delay (streaming has started)
  setTimeout(() => {
    btn.disabled = false;
    btn.classList.remove('downloading');
    btn.classList.add('success');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      완료!`;
    setTimeout(() => {
      btn.classList.remove('success');
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        다운로드`;
    }, 3000);
  }, 1500);
}

// ── Fetch video info for all URLs ─────────────────────────────────────────────
fetchBtn.addEventListener('click', async () => {
  closeError();
  const raw = urlInput.value.trim();
  if (!raw) { showError('URL을 하나 이상 입력해 주세요.'); urlInput.focus(); return; }

  const urls = parseUrls(raw);
  if (urls.length === 0) { showError('유효한 URL을 찾을 수 없습니다.'); return; }

  // Clear previous results
  videoItems = [];
  resultsGrid.innerHTML = '';
  resultsSection.hidden = true;

  setLoading(true);
  addSkeletons(urls.length);
  resultsSection.hidden = false;

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '요청 실패');
        return { url, info: data };
      })
    )
  );

  removeSkeletons();
  setLoading(false);

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures  = results.filter((r) => r.status === 'rejected');

  if (failures.length > 0) {
    const msg = failures.length === urls.length
      ? `모든 URL에서 오류 발생: ${failures[0].reason?.message}`
      : `${failures.length}개 URL 실패: ${failures[0].reason?.message}`;
    showError(msg);
  }

  if (successes.length === 0) {
    resultsSection.hidden = true;
    return;
  }

  successes.forEach(({ value: { url, info } }, i) => {
    videoItems.push({ url, info, formatId: '' });
    const frag = buildCard(url, info, videoItems.length - 1);
    resultsGrid.appendChild(frag);
  });

  resultCount.textContent = successes.length;
  resultsSection.hidden = false;
});

// ── Download all ──────────────────────────────────────────────────────────────
downloadAllBtn.addEventListener('click', () => {
  const cards = resultsGrid.querySelectorAll('.video-card');
  cards.forEach((card, i) => {
    const btn = card.querySelector('.download-btn');
    const sel = card.querySelector('.quality-select');
    const item = videoItems[i];
    if (!item) return;
    // Stagger downloads by 800ms
    setTimeout(() => triggerDownload(item.url, item.info, i, btn, sel), i * 800);
  });
});

// ── Clear results ─────────────────────────────────────────────────────────────
clearResBtn.addEventListener('click', () => {
  videoItems = [];
  resultsGrid.innerHTML = '';
  resultsSection.hidden = true;
  resultCount.textContent = '0';
  closeError();
});

// ── Keyboard shortcut: Enter in textarea ──────────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    fetchBtn.click();
  }
});
