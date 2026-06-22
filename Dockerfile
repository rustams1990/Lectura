# Build Stage
FROM node:20-bookworm AS builder

# Install python3 and python-is-python3 because yt-dlp-exec postinstall requires python binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Prune node_modules to remove devDependencies after building
RUN npm prune --omit=dev

# Production Stage
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install python3, python-is-python3 and ffmpeg for yt-dlp support
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy production node_modules from builder (pre-built Better-SQLite3 binary is here)
COPY --from=builder /app/node_modules ./node_modules

# Copy the built server and frontend assets
COPY --from=builder /app/dist ./dist

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Create data directory for SQLite database and media caches
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.cjs"]
