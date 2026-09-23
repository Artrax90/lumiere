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
RUN node node_modules/typescript/bin/tsc && node -e "const fs=require('fs'); fs.mkdirSync('dist/db', {recursive:true}); fs.copyFileSync('src/db/migrations.sql', 'dist/db/migrations.sql');"

# ===================================================
# Stage 3: Production Runner
# ===================================================
FROM node:20-bookworm-slim AS runner

# Install FFmpeg and FFprobe (essential for HLS remuxing, transcoding & audio track detection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3500

# Install production dependencies only
COPY back/package*.json ./
RUN npm install --omit=dev

# Copy compiled backend code and migrations
COPY --from=back-builder /app/back/dist ./dist

# Copy TV app files from back/public/tv
COPY back/public/tv ./public/tv

# Copy compiled web frontend into public root
COPY --from=front-builder /app/front/dist/ ./public/

EXPOSE 3500

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3500/api/health || exit 1

CMD ["node", "dist/index.js"]
