# Reclip Pro (수업용 미디어 도구)

> **선생님 PC에서 직접 실행하는 개인 수업 자료 미디어 저장 도구**  
> 외부 서버로 영상을 업로드하거나 중계하지 않고, 선생님의 PC 환경에서 `yt-dlp`와 `ffmpeg`를 사용해 필요한 수업용 영상을 내려받습니다.

---

## ⚖️ 저작권 및 이용 준수 사항

본 도구는 **저작권법 제25조(학교교육 목적 등에의 이용)**를 준수하며, **본인이 권리를 보유하고 있거나 교육용으로 이용 허락된 영상에 한하여 수업 목적 범위 내에서만** 활용해야 합니다. 영리 목적의 활용이나 무단 재배포는 엄격히 금지됩니다.

---

## ✨ 주요 기능

1. **원클릭 더블클릭 실행 (`실행.bat`)**:
   - Node.js, yt-dlp, ffmpeg 설치 여부를 자동으로 점검합니다.
   - 필수 패키지를 검사하고 브라우저(`http://127.0.0.1:8080`)를 자동으로 열어줍니다.
2. **저장 위치 지정 및 실시간 진행률(%)**:
   - 내 PC의 원하는 폴더(`기본값: ~/Downloads/Reclip`)에 직접 저장할 수 있습니다.
   - 다운로드 퍼센트, 속도, 예상 남은 시간(ETA)을 실시간 바 형태로 확인할 수 있습니다.
   - 저장 완료 후 [📂 폴더 열기] 버튼으로 탐색기에서 파일을 즉시 확인합니다.
3. **오류 원인 상세 진단**:
   - 로그인 필요 영상, 연령 제한, 비공개 영상, 지역 제한(국가 차단) 등 실패 사유를 분석하여 한국어 대처 방안을 안내합니다.
4. **글래스모피즘 오션 블루 UI**:
   - 현대적이고 직관적인 웹 인터페이스로 PC와 모바일 화면 모두를 지원합니다.

---

## 🚀 빠른 시작 (선생님 PC)

### 1. 간편 실행 (Windows)
폴더 안의 **`실행.bat`** 파일을 마우스로 더블클릭하세요.
자동으로 필수 도구를 확인하고 브라우저가 열립니다.

### 2. 수동 실행 (터미널)
```bash
# 1. 의존성 설치
npm install

# 2. 서버 실행
npm start
# 또는
node server.js
```
브라우저에서 `http://127.0.0.1:8080` 으로 접속합니다.

---

## 🛠️ 사전 요구사항 및 설치 안내

- **Node.js**: v18 이상 ([공식 다운로드](https://nodejs.org/))
- **Python & yt-dlp**:
  ```bash
  python -m pip install --upgrade yt-dlp
  ```
- **ffmpeg** (고화질 병합 및 MP3 변환용):
  - Windows 관리자 터미널:
    ```powershell
    winget install Gyan.FFmpeg
    ```
  - 또는 [Gyan.dev FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/)에서 수동 다운로드 후 PATH 등록

---

## 🌐 선택: 서버 배포 (Docker / Railway / Render)

> **주의**: Vercel과 같은 서버리스 환경은 yt-dlp 및 ffmpeg 바이너리 실행이 불가하므로 적합하지 않습니다. 상시 컨테이너 서버가 필요한 경우 아래 설정을 참고하세요.

### Dockerfile 예시
```dockerfile
FROM node:20-bookworm
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip curl && rm -rf /var/lib/apt/lists/*
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

### Railway 배포 시
- Repository를 연결하고 `PORT=8080`, `HOST=0.0.0.0` 환경변수를 설정하여 Dockerfile 빌드로 배포할 수 있습니다.

---

## 📢 알림
- Vercel 등 외부 호스팅에 본 저장소가 연결되어 있을 경우, 본 도구의 로컬 전용 구조(yt-dlp 실행 환경)로 인해 웹 빌드 실패 알림이 수신될 수 있으나 로컬 PC 동작에는 영향이 없습니다.

---

## ❓ 문제 해결 (FAQ)

- **Q. `HTTP Error 403: Forbidden` 오류가 발생합니다.**  
  👉 YouTube의 스트리밍 보안 정책 업데이트로 인한 현상일 수 있습니다. 터미널에서 `pip install -U yt-dlp` 로 최신 버전으로 업데이트하세요.
- **Q. MP3 오디오 변환 시 오류가 발생합니다.**  
  👉 시스템에 `ffmpeg`가 설치되어 있지 않으면 발생합니다. `ffmpeg -version`을 확인해 주세요.
- **Q. 연령 제한 영상이나 회원 전용 영상이 다운로드되지 않습니다.**  
  👉 성인 인증이나 로그인이 요구되는 영상은 외부 다운로드 도구에서 접근이 제한됩니다.
