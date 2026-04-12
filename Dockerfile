# ── 빌드 단계 ────────────────────────────────────────────
FROM node:20-bookworm

# 필요한 시스템 패키지 설치 (ffmpeg, python3 포함)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp 최신 바이너리 설치 (가장 확실한 방법)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 소스 코드 복사
COPY . .

# Railway는 PORT 환경 변수를 자동으로 주입합니다.
# 기본 포트를 8080으로 권장하는 경우가 많으므로 내부 포트를 맞춥니다.
EXPOSE 8080

# 실행 명령
CMD ["node", "server.js"]
