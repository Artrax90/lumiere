# ===================================================
# Stage 1: Build Frontend (React Web App)
# ===================================================
FROM node:20-alpine AS front-builder

WORKDIR /app/front
COPY front/package*.json ./
RUN npm install

COPY front/ ./
RUN npm run build

# ===================================================
# Stage 2: Build Backend (TypeScript Fastify)
# ===================================================
FROM node:20-alpine AS back-builder

WORKDIR /app/back
COPY back/package*.json ./
RUN npm install

COPY back/ ./
RUN npm run build

# ===================================================
# Stage 3: Production Runner
# ===================================================
FROM node:20-bookworm-slim AS runner

# Use fast Russian mirror (mirror.yandex.ru) to prevent slow CDN downloads
RUN (sed -i 's|deb.debian.org|mirror.yandex.ru|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true) && \
    (sed -i 's|deb.debian.org|mirror.yandex.ru|g' /etc/apt/sources.list 2>/dev/null || true) && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    intel-media-va-driver \
    mesa-va-drivers \
    vainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3500

# Install production dependencies only
COPY back/package*.json ./
RUN npm install --omit=dev

# Copy compiled backend code and migrations
COPY --from=back-builder /app/back/dist ./dist

# Copy TV app files and IPTV assets
COPY back/public/tv ./public/tv
COPY back/public/iptv ./public/iptv
COPY back/src/assets ./src/assets

# Copy compiled web frontend into public root
COPY --from=front-builder /app/front/dist/ ./public/

# Copy Telegram Companion Bot and set up python venv
COPY bot/ ./bot/
RUN python3 -m venv /app/bot/venv && \
    /app/bot/venv/bin/pip install --no-cache-dir -r /app/bot/requirements.txt

EXPOSE 3500

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3500/api/health || exit 1

CMD ["node", "dist/index.js"]
