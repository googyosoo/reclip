# ── Stage: runtime ────────────────────────────────────────────
FROM node:20-slim

# Install Python, pip, ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally via pip
RUN python3 -m pip install --break-system-packages yt-dlp

# Verify installs
RUN yt-dlp --version && ffmpeg -version | head -1

# Set working directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source files
COPY server.js ./
COPY public/ ./public/

# Expose port
EXPOSE 8899

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8899/ || exit 1

# Start server
CMD ["node", "server.js"]
