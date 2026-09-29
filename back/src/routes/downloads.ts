import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, mkdirSync, createReadStream, createWriteStream, statSync, unlinkSync, statfsSync } from 'fs';
import { join, extname } from 'path';
import pool from '../db/pool.js';
import { config } from '../config.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  notifyDownloadStarted,
  notifyDownloadFinished,
  notifyDownloadDeleted,
} from '../services/telegram.js';

const DOWNLOADS_DIR = join(process.cwd(), 'data', 'downloads');
if (!existsSync(DOWNLOADS_DIR)) {
  try {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  } catch (err: any) {
    console.error('[Downloads] Could not create downloads dir:', err.message);
  }
}

let tableReady = false;
export async function ensureServerDownloadsTable() {
  if (tableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS server_downloads (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER,
        title VARCHAR(500) NOT NULL,
        media_type VARCHAR(50) DEFAULT 'movie',
        media_id INTEGER DEFAULT 0,
        season INTEGER DEFAULT 0,
        episode INTEGER DEFAULT 0,
        file_path TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT DEFAULT 0,
        downloaded_bytes BIGINT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'downloading',
        error_message TEXT DEFAULT '',
        poster VARCHAR(500) DEFAULT '',
        torrent_hash VARCHAR(100) DEFAULT '',
        torrent_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_server_downloads_user_id ON server_downloads(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_server_downloads_status ON server_downloads(status)`).catch(() => {});
    tableReady = true;
    console.log('[Downloads] server_downloads table ready');
  } catch (err: any) {
    console.error('[Downloads] ensureServerDownloadsTable error:', err.message);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getDiskSpace(): { free: string; freeBytes: number; total: string; totalBytes: number } {
  try {
    const stats = statfsSync(DOWNLOADS_DIR);
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    return {
      free: formatBytes(freeBytes),
      freeBytes,
      total: formatBytes(totalBytes),
      totalBytes,
    };
  } catch (err: any) {
    return { free: 'Unknown', freeBytes: 0, total: 'Unknown', totalBytes: 0 };
  }
}

// Track active background downloads in memory for cancellation
const activeDownloads = new Map<string, { abortController: AbortController; stream?: any }>();

export async function startServerDownloadProcess(params: {
  id: string;
  userId: number;
  title: string;
  mediaType: string;
  mediaId: number;
  season: number;
  episode: number;
  poster: string;
  torrentHash: string;
  torrentIndex: number;
  magnet?: string;
  fileSize?: number;
  fileName?: string;
}) {
  await ensureServerDownloadsTable();

  const {
    id,
    userId,
    title,
    mediaType,
    mediaId,
    season,
    episode,
    poster,
    torrentHash,
    torrentIndex,
    magnet,
    fileSize = 0,
    fileName = `${title.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_')}.mkv`,
  } = params;

  const localExt = extname(fileName) || '.mkv';
  const localFileName = `${id}${localExt}`;
  const localFilePath = join(DOWNLOADS_DIR, localFileName);

  // 1. Insert download record
  await pool.query(
    `INSERT INTO server_downloads (
      id, user_id, title, media_type, media_id, season, episode,
      file_path, file_name, file_size, downloaded_bytes, status,
      poster, torrent_hash, torrent_index, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'downloading', $11, $12, $13, NOW())
    ON CONFLICT (id) DO UPDATE SET
      status = 'downloading',
      error_message = '',
      downloaded_bytes = 0`,
    [
      id,
      userId || null,
      title,
      mediaType,
      mediaId,
      season,
      episode,
      localFilePath,
      fileName,
      fileSize,
      poster,
      torrentHash,
      torrentIndex,
    ]
  );

  // 2. Telegram Alert: Download Started
  notifyDownloadStarted(userId, title, fileSize > 0 ? formatBytes(fileSize) : undefined).catch(() => {});

  // 3. Initiate TorrServer streaming into local file
  const torrUrl = config.torrserver.url;
  const linkParam = magnet ? encodeURIComponent(magnet) : torrentHash;
  const torrStreamUrl = `${torrUrl}/stream?link=${linkParam}&index=${torrentIndex}&play=1`;

  const abortController = new AbortController();
  activeDownloads.set(id, { abortController });

  console.log(`[Downloads] Starting server download: "${title}" (ID: ${id}) -> ${localFilePath}`);

  (async () => {
    let writeStream: any = null;
    try {
      const res = await fetch(torrStreamUrl, {
        signal: abortController.signal,
        headers: { 'User-Agent': 'LumiereServer/1.0' },
      });

      if (!res.ok || !res.body) {
        throw new Error(`TorrServer returned HTTP ${res.status}: ${res.statusText}`);
      }

      writeStream = createWriteStream(localFilePath);
      activeDownloads.set(id, { abortController, stream: writeStream });

      let downloaded = 0;
      let lastDbUpdate = Date.now();
      const nodeStream = res.body as any; // ReadableStream / Node stream

      for await (const chunk of nodeStream) {
        if (abortController.signal.aborted) {
          throw new Error('Download aborted by user');
        }

        writeStream.write(chunk);
        downloaded += chunk.length;

        // Update DB progress every 3 seconds
        const now = Date.now();
        if (now - lastDbUpdate > 3000) {
          lastDbUpdate = now;
          await pool.query(
            'UPDATE server_downloads SET downloaded_bytes = $1 WHERE id = $2',
            [downloaded, id]
          ).catch(() => {});
        }
      }

      await new Promise((resolve, reject) => {
        writeStream.end((err: any) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      const finalSize = statSync(localFilePath).size;

      // Update DB: completed
      await pool.query(
        `UPDATE server_downloads SET
          status = 'completed',
          file_size = GREATEST(file_size, $1),
          downloaded_bytes = $1,
          completed_at = NOW()
         WHERE id = $2`,
        [finalSize, id]
      );

      console.log(`[Downloads] Completed server download: "${title}" (${formatBytes(finalSize)})`);

      // 4. Telegram Alert: Download Complete
      notifyDownloadFinished(userId, id, title, formatBytes(finalSize), poster).catch(() => {});
    } catch (err: any) {
      if (writeStream) writeStream.close();
      if (abortController.signal.aborted) {
        console.log(`[Downloads] Download ${id} cancelled by user`);
        await pool.query(
          "UPDATE server_downloads SET status = 'cancelled', error_message = 'Отменено пользователем' WHERE id = $1",
          [id]
        ).catch(() => {});
      } else {
        console.error(`[Downloads] Download ${id} error:`, err.message);
        await pool.query(
          "UPDATE server_downloads SET status = 'error', error_message = $1 WHERE id = $2",
          [err.message, id]
        ).catch(() => {});
      }
    } finally {
      activeDownloads.delete(id);
    }
  })();
}

export function downloadRoutes(app: FastifyInstance) {
  ensureServerDownloadsTable().catch(() => {});

  // ==========================================
  // SERVER DOWNLOADS (Killer Feature 2)
  // ==========================================

  // 1. Start Server Download
  app.post(
    '/api/downloads/server/start',
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      const body = req.body as {
        id?: string;
        title: string;
        mediaType?: string;
        mediaId?: number;
        season?: number;
        episode?: number;
        poster?: string;
        torrentHash?: string;
        torrentIndex?: number;
        magnet?: string;
        fileSize?: number;
        fileName?: string;
      };

      if (!body.title) {
        return reply.code(400).send({ error: 'Title is required' });
      }

      let userId: number = req.user?.userId || 0;
      if (!userId) {
        // Fallback to first user in system
        const u = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        userId = u.rows[0]?.id || 1;
      }

      const id = body.id || `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const mediaType = body.mediaType || 'movie';
      const mediaId = body.mediaId || 0;
      const season = body.season || 0;
      const episode = body.episode || 0;
      const poster = body.poster || '';
      const torrentHash = body.torrentHash || '';
      const torrentIndex = body.torrentIndex !== undefined ? body.torrentIndex : 0;
      const magnet = body.magnet || '';
      const fileSize = body.fileSize || 0;
      const fileName = body.fileName || `${body.title.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_')}.mkv`;

      await startServerDownloadProcess({
        id,
        userId,
        title: body.title,
        mediaType,
        mediaId,
        season,
        episode,
        poster,
        torrentHash,
        torrentIndex,
        magnet,
        fileSize,
        fileName,
      });

      return {
        success: true,
        downloadId: id,
        message: 'Загрузка фильма/серии на сервер начата',
      };
    }
  );

  // 2. List Server Downloads
  app.get(
    '/api/downloads/server/list',
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest) => {
      await ensureServerDownloadsTable();
      const disk = getDiskSpace();

      try {
        const res = await pool.query(
          `SELECT * FROM server_downloads ORDER BY created_at DESC LIMIT 100`
        );

        const list = res.rows.map((r: any) => {
          const fileSize = Number(r.file_size || 0);
          const downloaded = Number(r.downloaded_bytes || 0);
          const progress = fileSize > 0 ? Math.min(100, Math.round((downloaded / fileSize) * 100)) : (r.status === 'completed' ? 100 : 0);
          const existsOnDisk = r.file_path ? existsSync(r.file_path) : false;

          return {
            id: r.id,
            userId: r.user_id,
            title: r.title,
            mediaType: r.media_type,
            mediaId: r.media_id,
            season: r.season,
            episode: r.episode,
            fileName: r.file_name,
            fileSize,
            fileSizeFormatted: formatBytes(fileSize),
            downloadedBytes: downloaded,
            downloadedBytesFormatted: formatBytes(downloaded),
            progress,
            status: existsOnDisk ? r.status : (r.status === 'completed' ? 'missing' : r.status),
            poster: r.poster,
            streamUrl: `/api/downloads/server/stream/${r.id}`,
            createdAt: r.created_at,
            completedAt: r.completed_at,
          };
        });

        return {
          downloads: list,
          disk,
        };
      } catch (err: any) {
        console.error('[Downloads] list error:', err.message);
        return { downloads: [], disk };
      }
    }
  );

  // 3. Delete Server Download (Mandatory Telegram Notification with Disk Space)
  app.delete(
    '/api/downloads/server/:id',
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      await ensureServerDownloadsTable();
      const { id } = req.params as { id: string };

      try {
        const itemRes = await pool.query('SELECT * FROM server_downloads WHERE id = $1', [id]);
        if (itemRes.rows.length === 0) {
          return reply.code(404).send({ error: 'Download not found' });
        }

        const item = itemRes.rows[0];

        // Abort active download stream if in progress
        const active = activeDownloads.get(id);
        if (active) {
          active.abortController.abort();
          activeDownloads.delete(id);
        }

        let freedBytes = 0;
        if (item.file_path && existsSync(item.file_path)) {
          try {
            freedBytes = statSync(item.file_path).size;
            unlinkSync(item.file_path);
          } catch (delErr: any) {
            console.warn(`[Downloads] Error unlinking file ${item.file_path}:`, delErr.message);
          }
        }

        await pool.query('DELETE FROM server_downloads WHERE id = $1', [id]);

        const diskAfter = getDiskSpace();
        const freedFormatted = formatBytes(freedBytes);

        // Telegram Alert: Download Deleted
        let targetUserId = item.user_id || req.user?.userId;
        if (!targetUserId) {
          const u = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
          targetUserId = u.rows[0]?.id || 1;
        }

        notifyDownloadDeleted(targetUserId, item.title, freedFormatted, diskAfter.free).catch(() => {});

        return {
          success: true,
          freedSpace: freedFormatted,
          totalFreeSpace: diskAfter.free,
          message: `Файл "${item.title}" удален с сервера. Освобождено ${freedFormatted}.`,
        };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 4. Stream Downloaded Local File with HTTP Range (0ms buffering & instant seek for Tizen/ExoPlayer/Web)
  app.get('/api/downloads/server/stream/:id', async (req, reply) => {
    await ensureServerDownloadsTable();
    const { id } = req.params as { id: string };

    const itemRes = await pool.query('SELECT * FROM server_downloads WHERE id = $1', [id]);
    if (itemRes.rows.length === 0) {
      return reply.code(404).send({ error: 'File not found in downloads' });
    }

    const item = itemRes.rows[0];
    const filePath = item.file_path;

    if (!filePath || !existsSync(filePath)) {
      return reply.code(404).send({ error: 'Downloaded file does not exist on disk' });
    }

    const stat = statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // MIME type detection
    const ext = extname(filePath).toLowerCase();
    let contentType = 'video/mp4';
    if (ext === '.mkv') contentType = 'video/x-matroska';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.ts') contentType = 'video/mp2t';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const fileStream = createReadStream(filePath, { start, end });

      reply.raw.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });

      return fileStream.pipe(reply.raw);
    } else {
      reply.raw.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });

      return createReadStream(filePath).pipe(reply.raw);
    }
  });

  // 5. Pre-caching Next Episode (Killer Feature 4: TorrServer Preload)
  app.post('/api/downloads/server/precache-next', async (req, reply) => {
    const body = (req.body as any) || {};
    const hash = body.hash || body.torrentHash || '';
    const magnet = body.magnet || '';
    const nextIndex = body.nextIndex;

    if ((!hash && !magnet) || nextIndex === undefined) {
      return reply.code(400).send({ error: 'hash/magnet and nextIndex are required' });
    }

    try {
      const torrUrl = config.torrserver.url;
      const linkParam = magnet ? encodeURIComponent(magnet) : hash;
      const preloadUrl = `${torrUrl}/stream?link=${linkParam}&index=${nextIndex}&preload`;

      console.log(`[Precache] Triggering TorrServer preload for next episode: index=${nextIndex}`);
      // Fire-and-forget preload request to TorrServer
      fetch(preloadUrl, { signal: AbortSignal.timeout(6000) }).catch((err) => {
        console.warn('[Precache] TorrServer preload warning:', err.message);
      });

      return { success: true, message: `Pre-cache started for next episode (index ${nextIndex})` };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
