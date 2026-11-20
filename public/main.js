/* ════════════════════════════════════════════════════════════════
   Reclip Pro — main.js
   교사용 수업 자료 다운로더 프론트엔드 컨트롤러
   ════════════════════════════════════════════════════════════════ */

const API_BASE = ''; // Same-origin

// ── DOM 참조 ──────────────────────────────────────────────────────────────────
const urlInput       = document.getElementById('url-input');
const clearBtn       = document.getElementById('clear-btn');
const fetchBtn       = document.getElementById('fetch-btn');
const btnVideo       = document.getElementById('btn-video');
const btnAudio       = document.getElementById('btn-audio');
const modeLocalBtn   = document.getElementById('mode-local-btn');
const modeStreamBtn  = document.getElementById('mode-stream-btn');
const folderRow      = document.getElementById('folder-setting-row');
const saveDirInput   = document.getElementById('save-dir-input');
const openFolderBtn  = document.getElementById('open-folder-btn');
const errorBanner    = document.getElementById('error-banner');
const errorTitle     = document.getElementById('error-title');
const errorDesc      = document.getElementById('error-desc');
const errorSolution  = document.getElementById('error-solution');
const errorRaw       = document.getElementById('error-raw');
const resultsSection = document.getElementById('results-section');
const resultsGrid    = document.getElementById('results-grid');
const resultCount    = document.getElementById('result-count');
const downloadAllBtn = document.getElementById('download-all-btn');
const clearResBtn    = document.getElementById('clear-results-btn');
const cardTemplate   = document.getElementById('card-template');

// ── 애플리케이션 상태 ─────────────────────────────────────────────────────────
let selectedFormat = 'video'; // 'video' | 'audio'
let saveMode       = 'local'; // 'local' (PC 직접 저장) | 'stream' (브라우저 다운로드)
let videoItems     = [];      // [{ url, info, formatId }]
let defaultSaveDir = '';

// ── 초기 설정 로드 (서버 설정 및 기본 폴더 조회) ──────────────────────────────
async function initConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (res.ok) {
      const data = await res.json();
      defaultSaveDir = data.defaultFolder || '';
      saveDirInput.value = defaultSaveDir;
      if (!data.hasFfmpeg) {
        console.warn('[시스템 알림] ffmpeg가 시스템 경로에 없습니다. 고화질 영상 병합에 제한이 있을 수 있습니다.');
      }
    }
  } catch (err) {
    console.warn('[설정 로드 실패]', err);
    saveDirInput.value = '내 다운로드 폴더 (Reclip)';
  }
}
initConfig();

// ── 저장 방식 토글 ────────────────────────────────────────────────────────────
modeLocalBtn.addEventListener('click', () => {
  saveMode = 'local';
  modeLocalBtn.classList.add('active');
  modeLocalBtn.setAttribute('aria-checked', 'true');
  modeStreamBtn.classList.remove('active');
  modeStreamBtn.setAttribute('aria-checked', 'false');
  folderRow.hidden = false;
});

modeStreamBtn.addEventListener('click', () => {
  saveMode = 'stream';
  modeStreamBtn.classList.add('active');
  modeStreamBtn.setAttribute('aria-checked', 'true');
  modeLocalBtn.classList.remove('active');
  modeLocalBtn.setAttribute('aria-checked', 'false');
  folderRow.hidden = true;
});

// ── 저장 폴더 탐색기 열기 ──────────────────────────────────────────────────────
openFolderBtn.addEventListener('click', async () => {
  const folderPath = saveDirInput.value.trim() || defaultSaveDir;
  try {
    const res = await fetch(`${API_BASE}/api/open-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || '폴더를 열 수 없습니다.');
    }
  } catch (err) {
    alert('폴더 열기 요청 실패: ' + err.message);
  }
});

// ── 포맷 토글 ─────────────────────────────────────────────────────────────────
[btnVideo, btnAudio].forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedFormat = btn.dataset.format;
    btnVideo.classList.toggle('active', selectedFormat === 'video');
    btnAudio.classList.toggle('active', selectedFormat === 'audio');
    btnVideo.setAttribute('aria-pressed', String(selectedFormat === 'video'));
    btnAudio.setAttribute('aria-pressed', String(selectedFormat === 'audio'));
  });
});

// ── URL 입력창 제어 ───────────────────────────────────────────────────────────
urlInput.addEventListener('input', () => {
  clearBtn.hidden = urlInput.value.trim().length === 0;
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.hidden = true;
  urlInput.focus();
});

// ── URL 파싱 ──────────────────────────────────────────────────────────────────
function parseUrls(raw) {
  const parts = raw.split(/[\n,\s]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  const urls = [];
  for (const p of parts) {
    try {
      new URL(p);
      if (!seen.has(p)) {
        seen.add(p);
        urls.push(p);
      }
    } catch {
      /* 무효한 URL 제외 */
    }
  }
  return urls;
}

// ── 에러 상세 배너 제어 ───────────────────────────────────────────────────────
function showError(title, desc, solution, rawMsg) {
  errorTitle.textContent    = title || '오류 발생';
  errorDesc.textContent     = desc || '';
  errorSolution.textContent = solution ? `💡 대처 방법: ${solution}` : '';
  if (rawMsg) {
    errorRaw.textContent = rawMsg;
    errorRaw.hidden = false;
  } else {
    errorRaw.hidden = true;
  }
  errorBanner.hidden = false;
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeError() {
  errorBanner.hidden = true;
}
window.closeError = closeError;

// ── 로딩 상태 ─────────────────────────────────────────────────────────────────
function setLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtn.querySelector('.btn-text').hidden = loading;
  fetchBtn.querySelector('.btn-spinner').hidden = !loading;
}

// ── 스켈레톤 로더 ─────────────────────────────────────────────────────────────
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

// ── 비디오 카드 생성 ──────────────────────────────────────────────────────────
function buildCard(url, info, index) {
  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.video-card');

  // 썸네일
  const img = card.querySelector('.card-thumb');
  img.src = info.thumbnail || '';
  img.alt = `${info.title} 썸네일`;
  img.onerror = () => {
    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%230a1f3a" width="320" height="180"/%3E%3Ctext x="50%25" y="50%25" fill="%23387ebf" font-family="sans-serif" font-size="14" text-anchor="middle" dy=".3em"%3E🎬 썸네일 없음%3C/text%3E%3C/svg%3E';
  };

  // 재생시간
  card.querySelector('.card-duration').textContent = info.duration || '';

  // 제목
  card.querySelector('.card-title').textContent = info.title || url;

  // 메타 정보
  const uploader = card.querySelector('.card-uploader');
  uploader.textContent = info.uploader ? `게시자: ${info.uploader}` : '';
  if (!info.uploader) uploader.style.display = 'none';

  // 화질 선택
  const sel = card.querySelector('.quality-select');
  if (selectedFormat === 'audio') {
    card.querySelector('.card-format-wrap').style.display = 'none';
  } else {
    for (const f of (info.formats || [])) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.label} 고화질`;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      videoItems[index].formatId = sel.value;
    });
  }

  // 다운로드 버튼 및 진행률 바
  const dlBtn       = card.querySelector('.download-btn');
  const openFileBtn = card.querySelector('.open-file-btn');
  const progWrap    = card.querySelector('.progress-wrap');
  const progFill    = card.querySelector('.progress-bar-fill');
  const progStatus  = card.querySelector('.progress-status');
  const progMeta    = card.querySelector('.progress-meta');

  dlBtn.addEventListener('click', () => {
    triggerDownload(url, info, index, {
      dlBtn,
      openFileBtn,
      progWrap,
      progFill,
      progStatus,
      progMeta,
      formatId: sel.value || '',
    });
  });

  openFileBtn.addEventListener('click', async () => {
    const targetFolder = saveDirInput.value.trim() || defaultSaveDir;
    await fetch(`${API_BASE}/api/open-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: targetFolder }),
    });
  });

  videoItems[index] = { url, info, formatId: sel.value || '' };
  return frag;
}

// ── 개별 다운로드 실행 로직 ───────────────────────────────────────────────────
function triggerDownload(url, info, index, ui) {
  const { dlBtn, openFileBtn, progWrap, progFill, progStatus, progMeta, formatId } = ui;
  if (dlBtn.disabled) return;

  const title = info.title || 'video';

  // 1. 브라우저 스트리밍 모드
  if (saveMode === 'stream') {
    dlBtn.disabled = true;
    dlBtn.innerHTML = `
      <svg class="spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      스트리밍 준비...`;

    const params = new URLSearchParams({
      url,
      format: selectedFormat,
      ...(formatId ? { format_id: formatId } : {}),
      title,
    });

    const a = document.createElement('a');
    a.href = `${API_BASE}/api/download?${params}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      dlBtn.disabled = false;
      dlBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        다운로드 시작됨`;
      setTimeout(() => {
        dlBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          다시 저장`;
      }, 3000);
    }, 1200);
    return;
  }

  // 2. 내 PC 폴더 직접 저장 모드 (실시간 진행률 추적)
  dlBtn.disabled = true;
  progWrap.hidden = false;
  progFill.style.width = '0%';
  progStatus.textContent = '다운로드 시작 중...';
  progMeta.textContent = '0%';
  openFileBtn.hidden = true;

  const saveDir = saveDirInput.value.trim() || defaultSaveDir;

  fetch(`${API_BASE}/api/save-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      format: selectedFormat,
      format_id: formatId,
      title,
      saveDir,
    }),
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 시작 실패');
      return data;
    })
    .then(({ jobId }) => {
      // SSE 이벤트 스트림 연결
      const evtSource = new EventSource(`${API_BASE}/api/progress/${jobId}`);

      evtSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.status === 'downloading') {
            progFill.style.width = `${payload.percent}%`;
            progStatus.textContent = '미디어 다운로드 중...';
            const metaStr = `${payload.percent.toFixed(1)}%` +
              (payload.speed ? ` · ${payload.speed}` : '') +
              (payload.eta ? ` · 남은시간 ${payload.eta}` : '');
            progMeta.textContent = metaStr;
          } else if (payload.status === 'processing') {
            progFill.style.width = '98%';
            progStatus.textContent = '영상·오디오 병합 및 변환 중...';
            progMeta.textContent = '마무리 단계';
          } else if (payload.status === 'finished') {
            evtSource.close();
            progFill.style.width = '100%';
            progStatus.textContent = '저장 완료!';
            progMeta.textContent = '100%';

            dlBtn.disabled = false;
            dlBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              저장 완료`;
            openFileBtn.hidden = false;
          } else if (payload.status === 'error') {
            evtSource.close();
            dlBtn.disabled = false;
            dlBtn.innerHTML = '다시 시도';
            progStatus.textContent = '저장 실패';
            progFill.style.width = '0%';

            const errDetail = payload.error || {};
            showError(
              errDetail.title || '다운로드 실패',
              errDetail.description || '다운로드 중 오류가 발생했습니다.',
              errDetail.solution || 'URL 또는 저장 폴더 권한을 확인해 주세요.',
              errDetail.code
            );
          }
        } catch (e) {
          console.error('[SSE 파싱 에러]', e);
        }
      };

      evtSource.onerror = () => {
        evtSource.close();
      };
    })
    .catch((err) => {
      dlBtn.disabled = false;
      progStatus.textContent = '오류 발생';
      showError('저장 요청 실패', err.message, '서버 상태를 확인해 주세요.');
    });
}

// ── 영상 정보 분석 (Fetch 버튼) ──────────────────────────────────────────────
fetchBtn.addEventListener('click', async () => {
  closeError();
  const raw = urlInput.value.trim();
  if (!raw) {
    showError('URL 입력 필요', '분석할 영상의 인터넷 주소(URL)를 입력해 주세요.', '유튜브 등 영상 페이지 주소를 복사해 붙여넣으세요.');
    urlInput.focus();
    return;
  }

  const urls = parseUrls(raw);
  if (urls.length === 0) {
    showError('유효하지 않은 URL', '입력하신 주소에서 올바른 인터넷 링크를 찾을 수 없습니다.', 'http:// 또는 https:// 로 시작하는 주소를 확인해 주세요.');
    return;
  }

  // 기존 목록 초기화
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
        if (!r.ok) {
          const errObj = new Error(data.error || '분석 실패');
          errObj.detail = data.detail;
          throw errObj;
        }
        return { url, info: data };
      })
    )
  );

  removeSkeletons();
  setLoading(false);

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures  = results.filter((r) => r.status === 'rejected');

  if (failures.length > 0) {
    const firstFail = failures[0].reason;
    const detail = firstFail.detail;
    if (detail) {
      showError(
        detail.title || '영상 분석 실패',
        detail.description || firstFail.message,
        detail.solution || '다른 영상을 시도해 주세요.',
        firstFail.message
      );
    } else {
      showError(
        '일부 영상 분석 실패',
        firstFail.message || '영상을 불러오는 데 실패했습니다.',
        'URL이 올바른지, 비공개나 로그인 전용 영상이 아닌지 확인해 주세요.'
      );
    }
  }

  if (successes.length === 0) {
    resultsSection.hidden = true;
    return;
  }

  successes.forEach(({ value: { url, info } }) => {
    videoItems.push({ url, info, formatId: '' });
    const frag = buildCard(url, info, videoItems.length - 1);
    resultsGrid.appendChild(frag);
  });

  resultCount.textContent = successes.length;
  resultsSection.hidden = false;
});

// ── 전체 다운로드 ─────────────────────────────────────────────────────────────
downloadAllBtn.addEventListener('click', () => {
  const cards = resultsGrid.querySelectorAll('.video-card');
  cards.forEach((card, i) => {
    const item = videoItems[i];
    if (!item) return;

    const dlBtn       = card.querySelector('.download-btn');
    const openFileBtn = card.querySelector('.open-file-btn');
    const progWrap    = card.querySelector('.progress-wrap');
    const progFill    = card.querySelector('.progress-bar-fill');
    const progStatus  = card.querySelector('.progress-status');
    const progMeta    = card.querySelector('.progress-meta');
    const sel         = card.querySelector('.quality-select');

    // 1초 간격 순차 실행
    setTimeout(() => {
      triggerDownload(item.url, item.info, i, {
        dlBtn,
        openFileBtn,
        progWrap,
        progFill,
        progStatus,
        progMeta,
        formatId: sel ? sel.value : '',
      });
    }, i * 1000);
  });
});

// ── 결과 목록 초기화 ──────────────────────────────────────────────────────────
clearResBtn.addEventListener('click', () => {
  videoItems = [];
  resultsGrid.innerHTML = '';
  resultsSection.hidden = true;
  resultCount.textContent = '0';
  closeError();
});

// ── 단축키 지원 (Ctrl+Enter 로 정보 불러오기) ─────────────────────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    fetchBtn.click();
  }
});
