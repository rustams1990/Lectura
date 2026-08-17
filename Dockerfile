# Build Stage
FROM node:20-bookworm AS builder

# Install python3 and python-is-python3 because yt-dlp-exec postinstall requires python binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
# Prune node_modules to remove devDependencies after building
RUN npm prune --omit=dev

# Production Stage
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install python3, python-is-python3, ca-certificates, ffmpeg, and faster-whisper
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    ffmpeg \
    && pip install --no-cache-dir --break-system-packages faster-whisper \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy production node_modules from builder (pre-built Better-SQLite3 binary is here)
COPY --from=builder /app/node_modules ./node_modules

# Copy the built server and frontend assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV NODE_OPTIONS="--max-old-space-size=256 --expose-gc"

# Create data directory for SQLite database and media caches
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start server
CMD ["node", "dist/server.cjs"]
