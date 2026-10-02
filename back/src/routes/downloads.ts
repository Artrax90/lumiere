import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, mkdirSync, createReadStream, createWriteStream, statSync, unlinkSync, statfsSync, readFileSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join, extname } from 'path';
import pool from '../db/pool.js';
import { config } from '../config.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  notifyDownloadStarted,
  notifyDownloadFinished,
  notifyDownloadDeleted,
} from '../services/telegram.js';
import { getActiveTorrServerUrl, FALLBACK_PUBLIC_TRACKERS } from './torrents.js';

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

  let {
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

  // Fallback poster if not provided
  if (!poster && mediaId) {
    try {
      const epUrl = `http://127.0.0.1:${config.port}/api/${mediaType === 'tv' ? 'tv' : 'movie'}/${mediaId}?lang=ru`;
      const detRes = await fetch(epUrl, { signal: AbortSignal.timeout(3000) });
      if (detRes.ok) {
        const detData = (await detRes.json()) as any;
        const pPath = detData?.poster_path || detData?.poster;
        if (pPath) {
          poster = pPath.startsWith('http') ? pPath : `https://image.tmdb.org/t/p/w500${pPath}`;
        }
      }
    } catch {}
  }

  let localExt = extname(fileName || '').toLowerCase();
  if (!['.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'].includes(localExt)) {
    localExt = '.mkv';
  }
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
      poster = COALESCE(NULLIF(EXCLUDED.poster, ''), server_downloads.poster),
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

  const abortController = new AbortController();
  activeDownloads.set(id, { abortController });

  console.log(`[Downloads] Starting server download: "${title}" (ID: ${id}) -> ${localFilePath}`);

  (async () => {
    let writeStream: any = null;
    try {
      // 3. Initiate TorrServer streaming into local file
      const torrUrl = await getActiveTorrServerUrl();
      let targetMagnet = magnet || '';
      if (targetMagnet) {
        for (const tr of FALLBACK_PUBLIC_TRACKERS) {
          if (!targetMagnet.includes(encodeURIComponent(tr)) && !targetMagnet.includes(tr)) {
            targetMagnet += `&tr=${encodeURIComponent(tr)}`;
          }
        }
      }

      let activeHash = torrentHash;
      // Step 3a: Pre-add torrent to TorrServer with save_to_db: true so it actively resolves peers & metadata
      try {
        const addRes = await fetch(`${torrUrl}/torrents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            link: targetMagnet || activeHash,
            title: title || 'Download',
            poster: poster || '',
            save_to_db: true,
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (addRes.ok) {
          const addData = (await addRes.json()) as { hash?: string };
          if (addData.hash) activeHash = addData.hash;
        }
      } catch (err: any) {
        console.warn('[Downloads] TorrServer preload warning:', err.message);
      }

      // Step 3b: Wait for metadata / file_stats from TorrServer so we get the exact video file index & size
      let resolvedIndex = torrentIndex;
      let resolvedSize = fileSize;
      const statLink = activeHash || encodeURIComponent(targetMagnet);

      for (let attempt = 0; attempt < 8; attempt++) {
        if (abortController.signal.aborted) break;
        try {
          const statRes = await fetch(`${torrUrl}/stream?link=${statLink}&index=-1&stat`, {
            signal: AbortSignal.timeout(4000),
          });
          if (statRes.ok) {
            const statData = (await statRes.json()) as any;
            if (statData.file_stats && statData.file_stats.length > 0) {
              const videoFiles = statData.file_stats.filter((f: any) =>
                /\.(mkv|mp4|avi|ts|m4v|mov)$/i.test(f.path)
              );
              if (videoFiles.length > 0) {
                videoFiles.sort((a: any, b: any) => b.length - a.length);
                if (resolvedIndex === 0 || !resolvedIndex) {
                  // If season and episode are specified, select the exact episode file!
                  if (season > 0 && episode > 0) {
                    const sStr = String(season).padStart(2, '0');
                    const eStr = String(episode).padStart(2, '0');
                    const patterns = [
                      new RegExp(`s0?${season}e0?${episode}\\b`, 'i'),
                      new RegExp(`\\b0?${season}x0?${episode}\\b`, 'i'),
                      new RegExp(`\\b0?${episode}\\s*серия`, 'i'),
                      new RegExp(`\\bсерия\\s*0?${episode}\\b`, 'i'),
                      new RegExp(`\\bep?0?${episode}\\b`, 'i'),
                    ];
                    const matchedEpisodeFile = videoFiles.find((f: any) =>
                      patterns.some((re) => re.test(f.path))
                    );
                    if (matchedEpisodeFile) {
                      resolvedIndex = matchedEpisodeFile.id;
                      console.log(`[Downloads] Matched single episode file for S${sStr}E${eStr}: "${matchedEpisodeFile.path}" (ID: ${resolvedIndex})`);
                    } else {
                      resolvedIndex = videoFiles[0].id;
                    }
                  } else {
                    resolvedIndex = videoFiles[0].id;
                  }
                }
                const chosen = statData.file_stats.find((f: any) => f.id === resolvedIndex) || videoFiles[0];
                resolvedIndex = chosen.id;
                if (chosen.length > 0) {
                  resolvedSize = chosen.length;
                }
                if (chosen.path) {
                  const baseName = chosen.path.split(/[\/\\]/).pop();
                  if (baseName) {
                    await pool.query('UPDATE server_downloads SET file_name = $1 WHERE id = $2', [baseName, id]).catch(() => {});
                  }
                }
              }
              break;
            }
          }
        } catch {
          // Retry
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (resolvedSize > 0 && resolvedSize !== fileSize) {
        await pool.query('UPDATE server_downloads SET file_size = $1 WHERE id = $2', [resolvedSize, id]).catch(() => {});
      }

      const linkParam = targetMagnet ? encodeURIComponent(targetMagnet) : activeHash;
      const torrStreamUrl = `${torrUrl}/stream?link=${linkParam}&index=${resolvedIndex}&play=1`;

      console.log(`[Downloads] Streaming from TorrServer: ${torrStreamUrl}`);

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

    const { download, dl } = req.query as { download?: string; dl?: string };
    const isAttachment = download === '1' || dl === '1';

    // MIME type detection
    const ext = (extname(filePath) || '.mkv').toLowerCase();
    let contentType = 'video/mp4';
    if (ext === '.mkv') contentType = 'video/x-matroska';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.ts') contentType = 'video/mp2t';

    let rawFileName = (item.file_name || item.title || 'video').trim();
    if (!extname(rawFileName)) {
      rawFileName = `${rawFileName}${ext}`;
    }
    const safeAscii = rawFileName.replace(/[^\x20-\x7E]/g, '_');
    const disposition = isAttachment
      ? `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawFileName)}`
      : 'inline';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const fileStream = createReadStream(filePath, { start, end });

      return reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', chunkSize)
        .header('Content-Type', contentType)
        .header('Content-Disposition', disposition)
        .header('Access-Control-Allow-Origin', '*')
        .send(fileStream);
    } else {
      const fileStream = createReadStream(filePath);

      return reply
        .code(200)
        .header('Content-Length', fileSize)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Type', contentType)
        .header('Content-Disposition', disposition)
        .header('Access-Control-Allow-Origin', '*')
        .send(fileStream);
    }
  });

  // 4a. Explicit Download to Device (Local offline storage for tablet, phone, PC)
  app.get('/api/downloads/server/download-file/:id', async (req, reply) => {
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
    const ext = (extname(filePath) || '.mkv').toLowerCase();
    let rawFileName = (item.file_name || item.title || 'video').trim();
    if (!extname(rawFileName)) {
      rawFileName = `${rawFileName}${ext}`;
    }
    const safeAscii = rawFileName.replace(/[^\x20-\x7E]/g, '_');

    let contentType = 'video/mp4';
    if (ext === '.mkv') contentType = 'video/x-matroska';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.avi') contentType = 'video/x-msvideo';
    else if (ext === '.ts') contentType = 'video/mp2t';

    return reply
      .code(200)
      .header('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(rawFileName)}`)
      .header('Content-Length', fileSize)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Type', contentType)
      .header('Access-Control-Allow-Origin', '*')
      .send(createReadStream(filePath));
  });

  // Helper: inspect local media file with ffprobe for duration, audio tracks, and subtitle tracks
  interface MediaInfo {
    duration: number;
    audioTracks: Array<{ id: number; name: string; lang: string; codec: string }>;
    subtitleTracks: Array<{ id: number; name: string; lang: string }>;
  }

  async function inspectMediaFile(filePath: string): Promise<MediaInfo> {
    return new Promise((resolve) => {
      const defaultInfo: MediaInfo = { duration: 0, audioTracks: [], subtitleTracks: [] };
      try {
        const proc = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration:stream=index,codec_name,codec_type,tags',
          '-of', 'json',
          filePath,
        ]);
        let stdout = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
          if (code !== 0 || !stdout) return resolve(defaultInfo);
          try {
            const json = JSON.parse(stdout);
            const dur = parseFloat(json.format?.duration || '0') || 0;
            const audioTracks: any[] = [];
            const subtitleTracks: any[] = [];
            let aIdx = 0;
            let sIdx = 0;
            (json.streams || []).forEach((st: any) => {
              const tags = st.tags || {};
              const lang = tags.language || tags.lang || 'und';
              const title = tags.title || '';
              if (st.codec_type === 'audio') {
                audioTracks.push({
                  id: aIdx++,
                  streamIndex: st.index,
                  name: title ? `${title} (${lang})` : `Дорожка ${audioTracks.length + 1} (${lang})`,
                  lang,
                  codec: st.codec_name || 'aac',
                });
              } else if (st.codec_type === 'subtitle') {
                subtitleTracks.push({
                  id: sIdx++,
                  streamIndex: st.index,
                  name: title ? `${title} (${lang})` : `Субтитры ${subtitleTracks.length + 1} (${lang})`,
                  lang,
                });
              }
            });
            resolve({ duration: dur, audioTracks, subtitleTracks });
          } catch {
            resolve(defaultInfo);
          }
        });
        proc.on('error', () => resolve(defaultInfo));
      } catch {
        resolve(defaultInfo);
      }
    });
  }

  // 4b. Downloaded File Media Info (Duration & Tracks for TV seeking / Web player)
  app.get('/api/downloads/server/info/:id', async (req, reply) => {
    await ensureServerDownloadsTable();
    const { id } = req.params as { id: string };

    const itemRes = await pool.query('SELECT * FROM server_downloads WHERE id = $1', [id]);
    if (itemRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Download not found' });
    }
    const item = itemRes.rows[0];
    const filePath = item.file_path;
    if (!filePath || !existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not on disk' });
    }

    const info = await inspectMediaFile(filePath);
    return reply.send({
      id: item.id,
      title: item.title,
      fileName: item.file_name,
      fileSize: item.file_size,
      duration: info.duration,
      audioTracks: info.audioTracks,
      subtitleTracks: info.subtitleTracks,
      streamUrl: `/api/downloads/server/stream/${item.id}`,
      hlsUrl: `/api/downloads/server/hls/${item.id}/stream.m3u8`,
    });
  });

  // Track active HLS transcode sessions for downloaded files
  const activeHlsSessions = new Map<string, { pid: number; hlsDir: string; playlistPath: string; lastActivity: number }>();

  // Periodically clean inactive HLS sessions after 60s idle
  setInterval(() => {
    const now = Date.now();
    for (const [key, sess] of activeHlsSessions.entries()) {
      if (now - sess.lastActivity > 60000) {
        try {
          if (sess.pid) process.kill(sess.pid, 'SIGKILL');
        } catch {}
        try {
          if (existsSync(sess.hlsDir)) rmSync(sess.hlsDir, { recursive: true, force: true });
        } catch {}
        activeHlsSessions.delete(key);
      }
    }
  }, 15000);

  // 4c. HLS Manifest with On-the-Fly Audio Transcoding to AAC & Instant Seeking
  app.get('/api/downloads/server/hls/:id/stream.m3u8', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { audio, start } = req.query as { audio?: string; start?: string };
    const audioIdx = parseInt(audio || '0', 10) || 0;
    const seekTime = Math.max(0, Math.floor(parseFloat(start || '0') || 0));

    const itemRes = await pool.query('SELECT * FROM server_downloads WHERE id = $1', [id]);
    if (itemRes.rows.length === 0) {
      return reply.code(404).send({ error: 'File not found in downloads' });
    }
    const item = itemRes.rows[0];
    const filePath = item.file_path;
    if (!filePath || !existsSync(filePath)) {
      return reply.code(404).send({ error: 'Downloaded file does not exist on disk' });
    }

    const sessKey = `${id}-a${audioIdx}-s${seekTime}`;
    const hlsDir = join(DOWNLOADS_DIR, '.hls', sessKey);
    const playlistPath = join(hlsDir, 'stream.m3u8');

    if (!existsSync(hlsDir)) {
      mkdirSync(hlsDir, { recursive: true });
    }

    // Clean up older active sessions for the same downloaded file id to preserve CPU/RAM
    for (const [key, activeSess] of activeHlsSessions.entries()) {
      if (key.startsWith(`${id}-`) && key !== sessKey) {
        if (activeSess?.pid) {
          try { process.kill(activeSess.pid, 'SIGKILL'); } catch {}
        }
        try {
          if (existsSync(activeSess.hlsDir)) rmSync(activeSess.hlsDir, { recursive: true, force: true });
        } catch {}
        activeHlsSessions.delete(key);
      }
    }

    let sess = activeHlsSessions.get(sessKey);
    if (!sess || !existsSync(playlistPath)) {
      if (sess?.pid) {
        try { process.kill(sess.pid, 'SIGKILL'); } catch {}
      }

      const ffmpegArgs = ['-threads', '2'];
      if (seekTime > 0) {
        ffmpegArgs.push('-accurate_seek', '-ss', String(seekTime));
      }
      ffmpegArgs.push(
        '-i', filePath,
        '-map', '0:v:0',
        '-map', `0:a:${audioIdx}?`,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', join(hlsDir, 'seg-%04d.ts'),
        playlistPath,
      );

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      sess = {
        pid: ffmpeg.pid!,
        hlsDir,
        playlistPath,
        lastActivity: Date.now(),
      };
      activeHlsSessions.set(sessKey, sess);

      ffmpeg.on('close', () => {
        console.log(`[Downloads HLS] FFmpeg session ${sessKey} closed`);
      });
      ffmpeg.on('error', (err) => {
        console.error(`[Downloads HLS] FFmpeg session ${sessKey} error:`, err.message);
      });
    }

    sess.lastActivity = Date.now();

    // Wait up to 6s for playlist to have at least one segment
    const waitForPlaylist = () => new Promise<boolean>((resolve) => {
      let attempts = 0;
      const check = () => {
        if (existsSync(playlistPath)) {
          const content = readFileSync(playlistPath, 'utf-8');
          if (content.includes('.ts')) return resolve(true);
        }
        if (attempts++ < 60) setTimeout(check, 100);
        else resolve(false);
      };
      check();
    });

    const ready = await waitForPlaylist();
    if (!ready || !existsSync(playlistPath)) {
      return reply.code(503).send({ error: 'HLS stream generating, please retry in 1s' });
    }

    let manifest = readFileSync(playlistPath, 'utf-8');
    manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/downloads/server/hls/${id}/seg-$1.ts?a=${audioIdx}&s=${seekTime}`);

    return reply
      .header('Content-Type', 'application/vnd.apple.mpegurl')
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Access-Control-Allow-Origin', '*')
      .send(manifest);
  });

  // 4d. Serve HLS segments for downloaded file
  app.get('/api/downloads/server/hls/:id/:filename', async (req, reply) => {
    const { id, filename } = req.params as { id: string; filename: string };
    const { a, s } = req.query as { a?: string; s?: string };
    const audioIdx = parseInt(a || '0', 10) || 0;
    const seekTime = Math.max(0, Math.floor(parseFloat(s || '0') || 0));
    const sessKey = `${id}-a${audioIdx}-s${seekTime}`;
    const hlsDir = join(DOWNLOADS_DIR, '.hls', sessKey);
    const segPath = join(hlsDir, filename);

    const sess = activeHlsSessions.get(sessKey);
    if (sess) sess.lastActivity = Date.now();

    const waitForSeg = () => new Promise<boolean>((resolve) => {
      let attempts = 0;
      const check = () => {
        if (existsSync(segPath)) return resolve(true);
        if (attempts++ < 40) setTimeout(check, 100);
        else resolve(false);
      };
      check();
    });

    const ready = await waitForSeg();
    if (!ready || !existsSync(segPath)) {
      return reply.code(404).send({ error: 'Segment not found' });
    }

    const stat = statSync(segPath);
    return reply
      .header('Content-Type', 'video/mp2t')
      .header('Content-Length', stat.size)
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=86400')
      .send(createReadStream(segPath));
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
