import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, mkdirSync, createReadStream, createWriteStream, statSync, unlinkSync, statfsSync, readFileSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join, extname } from 'path';
import crypto from 'crypto';
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
    setTimeout(async () => {
      try {
        await pool.query("UPDATE server_downloads SET status = 'queued' WHERE status = 'downloading'");
        triggerNextQueuedDownload().catch(() => {});
      } catch {}
    }, 2000);
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

// Helpers for parsing .torrent files, episode numbering, and release titles
export function parseTorrentBuffer(buf: Buffer): {
  hash: string;
  name: string;
  files: Array<{ id: number; path: string; length: number }>;
} {
  let pos = 0;
  let infoStart = -1;
  let infoEnd = -1;

  function parseVal(): any {
    if (pos >= buf.length) return null;
    const b = buf[pos];
    if (b === 0x69) { // 'i' integer
      pos++;
      const end = buf.indexOf(0x65, pos);
      if (end === -1) return null;
      const val = parseInt(buf.subarray(pos, end).toString('ascii'), 10);
      pos = end + 1;
      return val;
    }
    if (b === 0x6c) { // 'l' list
      pos++;
      const list: any[] = [];
      while (pos < buf.length && buf[pos] !== 0x65) {
        list.push(parseVal());
      }
      pos++; // skip 'e'
      return list;
    }
    if (b === 0x64) { // 'd' dict
      pos++;
      const dict: Record<string, any> = {};
      while (pos < buf.length && buf[pos] !== 0x65) {
        const keyBuf = parseVal();
        const key = Buffer.isBuffer(keyBuf) ? keyBuf.toString('utf8') : String(keyBuf || '');
        const isInfo = (key === 'info');
        if (isInfo) infoStart = pos;
        const val = parseVal();
        if (isInfo) infoEnd = pos;
        dict[key] = val;
      }
      pos++; // skip 'e'
      return dict;
    }
    if (b >= 0x30 && b <= 0x39) { // string
      const col = buf.indexOf(0x3a, pos);
      if (col === -1) return null;
      const len = parseInt(buf.subarray(pos, col).toString('ascii'), 10);
      pos = col + 1;
      const res = buf.subarray(pos, pos + len);
      pos += len;
      return res;
    }
    return null;
  }

  const root = parseVal() || {};
  let hash = '';
  if (infoStart !== -1 && infoEnd !== -1) {
    const infoBytes = buf.subarray(infoStart, infoEnd);
    hash = crypto.createHash('sha1').update(infoBytes).digest('hex').toLowerCase();
  }

  const info = root.info || {};
  const nameBuf = info.name;
  const name = Buffer.isBuffer(nameBuf)
    ? nameBuf.toString('utf8')
    : (info['name.utf-8'] ? info['name.utf-8'].toString('utf8') : '');

  const files: Array<{ id: number; path: string; length: number }> = [];
  if (info.files && Array.isArray(info.files)) {
    let fId = 1;
    for (const f of info.files) {
      const pArr = (f['path.utf-8'] || f.path || []);
      const parts = Array.isArray(pArr)
        ? pArr.map((p: any) => Buffer.isBuffer(p) ? p.toString('utf8') : String(p))
        : [Buffer.isBuffer(pArr) ? pArr.toString('utf8') : String(pArr)];
      files.push({
        id: fId++,
        path: parts.join('/'),
        length: Number(f.length || 0),
      });
    }
  } else if (info.length) {
    files.push({
      id: 1,
      path: name,
      length: Number(info.length || 0),
    });
  }

  return { hash, name, files };
}

export function parseEpisodeInfo(filePath: string): { season: number; episode: number } {
  const parts = filePath.split(/[\/\\]/);
  const fileName = parts.pop() || filePath;
  let season = 0;
  let episode = 0;

  for (const part of parts) {
    const sMatch = part.match(/(?:сезон|season)\s*0*(\d+)/i) || part.match(/\b[sS]0*(\d+)\b/i);
    if (sMatch) {
      season = parseInt(sMatch[1], 10);
      break;
    }
  }

  const seMatch = fileName.match(/[sS](\d+)[eE](\d+)/i) ||
                  fileName.match(/\b(\d+)[xх](\d+)\b/i) ||
                  fileName.match(/(?:сезон|season)\s*(\d+).*?(?:сери[яий]|выпуск|ep)\s*(\d+)/i) ||
                  fileName.match(/\b(\d{2})[-_](\d{2})\b/);
  if (seMatch) {
    return { season: parseInt(seMatch[1], 10), episode: parseInt(seMatch[2], 10) };
  }

  const eMatch = fileName.match(/[eE]p?\.?\s*0*(\d+)\b/i) ||
                 fileName.match(/(?:сери[яий]|выпуск|эпизод)\s*[:#№]?\s*0*(\d+)\b/i) ||
                 fileName.match(/\b0*(\d+)\s*(?:сери[яий]|выпуск|эпизод)/i) ||
                 fileName.match(/[\[\(_\s\.-]0*(\d+)[\s\._\)\]-]/i);
  if (eMatch) {
    return { season: season || 1, episode: parseInt(eMatch[1], 10) };
  }

  return { season, episode };
}

export function cleanReleaseTitle(raw: string): string {
  if (!raw) return '';
  let clean = raw.split('/')[0].split('|')[0];
  clean = clean.replace(/\[[^\]]*\]/g, ' ').replace(/\([^\)]*\)/g, ' ');
  clean = clean.replace(/\b(\d{4})\b/g, ' ');
  clean = clean.replace(/\b(1080p|720p|2160p|4k|uhd|bluray|remux|bdrip|web-dl|webrip|hdtv|lostfilm|hdrezka|amedia|kuraj-bambey|red-head-sound|newstudio|hd|avc|hevc|x264|x265|aac|ac3|dts|rus|eng|sub|subs|mkv|avi|mp4)\b/gi, ' ');
  clean = clean.replace(/\b[sS]\d+\b/gi, ' ');
  clean = clean.replace(/\b\d+\s*сезон\b/gi, ' ');
  clean = clean.replace(/[\._-]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || raw.trim();
}

// Track active background downloads in memory for cancellation
const activeDownloads = new Map<string, { abortController: AbortController; stream?: any }>();
const MAX_CONCURRENT_DOWNLOADS = 1;

export async function triggerNextQueuedDownload() {
  if (activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) return;
  try {
    const nextRes = await pool.query(
      `SELECT id FROM server_downloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
    );
    if (nextRes.rows.length === 0) return;
    const nextId = nextRes.rows[0].id;
    console.log(`[Downloads] Triggering next queued download: ${nextId}`);
    runServerDownloadStream(nextId).catch((err) => {
      console.error(`[Downloads] Error running queued download ${nextId}:`, err.message);
    });
  } catch (err: any) {
    console.error('[Downloads] triggerNextQueuedDownload error:', err.message);
  }
}

export async function runServerDownloadStream(id: string) {
  await ensureServerDownloadsTable();
  const itemRes = await pool.query('SELECT * FROM server_downloads WHERE id = $1', [id]);
  if (itemRes.rows.length === 0) return;
  const item = itemRes.rows[0];

  if (activeDownloads.has(id)) return;

  const abortController = new AbortController();
  activeDownloads.set(id, { abortController });

  await pool.query("UPDATE server_downloads SET status = 'downloading', error_message = '' WHERE id = $1", [id]);

  const localFilePath = item.file_path;
  const initialSizeEstimate = item.file_size > 0 ? formatBytes(Number(item.file_size)) : undefined;

  // Telegram alert: download started
  notifyDownloadStarted(item.user_id, item.title, initialSizeEstimate).catch(() => {});

  console.log(`[Downloads] Starting server download: "${item.title}" (ID: ${id}) -> ${localFilePath}`);

  let writeStream: any = null;
  try {
    const torrUrl = await getActiveTorrServerUrl();
    let targetMagnet = item.magnet || '';
    if (targetMagnet) {
      for (const tr of FALLBACK_PUBLIC_TRACKERS) {
        if (!targetMagnet.includes(encodeURIComponent(tr)) && !targetMagnet.includes(tr)) {
          targetMagnet += `&tr=${encodeURIComponent(tr)}`;
        }
      }
    }

    let activeHash = item.torrent_hash;
    // Preload into TorrServer
    try {
      const addRes = await fetch(`${torrUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          link: targetMagnet || activeHash,
          title: item.title || 'Download',
          poster: item.poster || '',
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

    let resolvedIndex = item.torrent_index;
    let resolvedSize = Number(item.file_size || 0);
    const statLink = activeHash || encodeURIComponent(targetMagnet);

    // Wait for metadata / file_stats from TorrServer if needed
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
              /\.(mkv|mp4|avi|ts|m4v|mov|webm)$/i.test(f.path)
            );
            if (videoFiles.length > 0) {
              videoFiles.sort((a: any, b: any) => b.length - a.length);
              if (resolvedIndex === 0 || !resolvedIndex) {
                if (item.season > 0 && item.episode > 0) {
                  const patterns = [
                    new RegExp(`s0*${item.season}e0*${item.episode}\\b`, 'i'),
                    new RegExp(`\\b0*${item.season}[xх]0*${item.episode}\\b`, 'i'),
                    new RegExp(`\\b0*${item.episode}\\s*(?:выпуск|сери[яий]|эпизод)`, 'i'),
                    new RegExp(`(?:выпуск|сери[яий]|эпизод)\\s*[:#№]?\s*0*${item.episode}\\b`, 'i'),
                    new RegExp(`\\bep?\\.?0*${item.episode}\\b`, 'i'),
                    new RegExp(`[\\[\\(_\\s\\.-]0*${item.episode}[\\]\\)_\\s\\.-]`, 'i'),
                  ];
                  let matchedEpisodeFile = videoFiles.find((f: any) =>
                    patterns.some((re) => re.test(f.path))
                  );
                  if (!matchedEpisodeFile) {
                    const sortedByPath = [...videoFiles].sort((a: any, b: any) =>
                      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    if (sortedByPath[item.episode - 1]) {
                      matchedEpisodeFile = sortedByPath[item.episode - 1];
                    }
                  }
                  if (matchedEpisodeFile) {
                    resolvedIndex = matchedEpisodeFile.id;
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
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (resolvedSize > 0 && resolvedSize !== Number(item.file_size)) {
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
    const nodeStream = res.body as any;

    for await (const chunk of nodeStream) {
      if (abortController.signal.aborted) {
        throw new Error('Download aborted by user');
      }

      writeStream.write(chunk);
      downloaded += chunk.length;

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

    await pool.query(
      `UPDATE server_downloads SET
        status = 'completed',
        file_size = GREATEST(file_size, $1),
        downloaded_bytes = $1,
        completed_at = NOW()
       WHERE id = $2`,
      [finalSize, id]
    );

    console.log(`[Downloads] Completed server download: "${item.title}" (${formatBytes(finalSize)})`);

    notifyDownloadFinished(item.user_id, id, item.title, formatBytes(finalSize), item.poster).catch(() => {});
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
    triggerNextQueuedDownload().catch(() => {});
  }
}

export async function registerServerDownload(params: {
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

  const initialStatus = activeDownloads.size < MAX_CONCURRENT_DOWNLOADS ? 'downloading' : 'queued';

  await pool.query(
    `INSERT INTO server_downloads (
      id, user_id, title, media_type, media_id, season, episode,
      file_path, file_name, file_size, downloaded_bytes, status,
      poster, torrent_hash, torrent_index, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14, NOW())
    ON CONFLICT (id) DO UPDATE SET
      status = $11,
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
      initialStatus,
      poster,
      torrentHash,
      torrentIndex,
    ]
  );

  console.log(`[Downloads] Registered server download: "${title}" (ID: ${id}) [Status: ${initialStatus}]`);

  if (initialStatus === 'downloading') {
    runServerDownloadStream(id).catch((err) => {
      console.error(`[Downloads] Error running download ${id}:`, err.message);
    });
  }
}

export async function startServerDownloadProcess(params: Parameters<typeof registerServerDownload>[0]) {
  await registerServerDownload(params);
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

      let userId: number = Number((req.body as any)?.userId) || req.user?.userId || 0;
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

  // 1b. Upload Torrent / Magnet for Server Download (Telegram bot, Web upload, etc.)
  app.post(
    '/api/downloads/server/upload-torrent',
    {
      bodyLimit: 30 * 1024 * 1024,
      preHandler: [optionalAuth],
    },
    async (req: AuthenticatedRequest, reply: FastifyReply) => {
      await ensureServerDownloadsTable();
      const body = (req.body as any) || {};

      const torrentBase64 = body.torrentBase64 as string | undefined;
      const magnet = body.magnet as string | undefined;
      const fileName = body.fileName as string | undefined;
      const title = body.title as string | undefined;
      const startAll = Boolean(body.startAll);
      const selectedIndices = Array.isArray(body.selectedIndices)
        ? body.selectedIndices.map((n: any) => Number(n))
        : undefined;

      let torrentHash = (body.torrentHash || '').toLowerCase().trim();
      let userId: number = Number(body.userId) || req.user?.userId || 0;
      if (!userId) {
        const u = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        userId = u.rows[0]?.id || 1;
      }

      let parsed: { hash: string; name: string; files: Array<{ id: number; path: string; length: number }> } | null = null;

      const torrUrl = await getActiveTorrServerUrl();

      // 1. If torrentBase64 is provided, parse it and upload to TorrServer /torrent/upload
      if (torrentBase64) {
        try {
          const buf = Buffer.from(torrentBase64, 'base64');
          parsed = parseTorrentBuffer(buf);
          if (parsed.hash && !torrentHash) {
            torrentHash = parsed.hash.toLowerCase();
          }

          const fd = new FormData();
          fd.append('save', 'true');
          fd.append('file', new Blob([buf]), fileName || `${torrentHash || 'file'}.torrent`);
          if (parsed.name || title) {
            fd.append('title', parsed.name || title || '');
          }

          await fetch(`${torrUrl}/torrent/upload`, {
            method: 'POST',
            body: fd,
            signal: AbortSignal.timeout(10000),
          }).catch((err) => {
            console.warn('[Downloads] TorrServer /torrent/upload warning:', err.message);
          });
        } catch (err: any) {
          console.error('[Downloads] Error parsing torrent buffer:', err.message);
        }
      }

      // 2. If magnet link provided
      if (magnet && !torrentBase64) {
        const hashMatch = magnet.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
        if (hashMatch && !torrentHash) {
          torrentHash = hashMatch[1].toLowerCase();
        }

        let targetMagnet = magnet;
        for (const tr of FALLBACK_PUBLIC_TRACKERS) {
          if (!targetMagnet.includes(encodeURIComponent(tr)) && !targetMagnet.includes(tr)) {
            targetMagnet += `&tr=${encodeURIComponent(tr)}`;
          }
        }

        try {
          await fetch(`${torrUrl}/torrents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add',
              link: targetMagnet,
              title: title || 'Download',
              save_to_db: true,
            }),
            signal: AbortSignal.timeout(12000),
          });
        } catch (err: any) {
          console.warn('[Downloads] TorrServer add magnet warning:', err.message);
        }
      }

      if (!torrentHash && !parsed?.hash) {
        return reply.code(400).send({ error: 'Не удалось определить хэш торрента. Проверьте торрент-файл или magnet-ссылку.' });
      }

      // 3. Query TorrServer for file_stats with retry loop
      let fileStats: Array<{ id: number; path: string; length: number }> = [];
      let torrTitle = '';

      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const statRes = await fetch(`${torrUrl}/stream?link=${torrentHash}&index=-1&stat`, {
            signal: AbortSignal.timeout(4000),
          });
          if (statRes.ok) {
            const statData = (await statRes.json()) as any;
            if (statData.title) torrTitle = statData.title;
            if (statData.file_stats && statData.file_stats.length > 0) {
              fileStats = statData.file_stats;
              break;
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 800));
      }

      // Fallback to parsed files from buffer if TorrServer stat hasn't resolved them yet
      if (fileStats.length === 0 && parsed?.files && parsed.files.length > 0) {
        fileStats = parsed.files;
      }

      if (fileStats.length === 0) {
        return reply.code(400).send({
          error: 'Не удалось получить список файлов раздачи из TorrServer. Возможно, на торренте нет сидов или DHT ещё ищет метаданные. Попробуйте через минуту.',
        });
      }

      // 4. Filter video files and parse episode info
      const videoFiles = fileStats
        .filter((f) => /\.(mkv|mp4|avi|ts|mov|m4v|webm)$/i.test(f.path) && !/sample|trailer/i.test(f.path))
        .map((f) => {
          const epInfo = parseEpisodeInfo(f.path);
          return {
            id: f.id,
            path: f.path,
            name: f.path.split(/[\/\\]/).pop() || f.path,
            season: epInfo.season,
            episode: epInfo.episode,
            size: Number(f.length || 0),
            sizeFormatted: formatBytes(Number(f.length || 0)),
          };
        });

      if (videoFiles.length === 0) {
        return reply.code(400).send({
          error: 'В торрент-раздаче не найдено ни одного видеофайла (.mkv, .mp4, .avi и т.д.)',
        });
      }

      // Sort video files naturally by season, then episode, or path
      videoFiles.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        if (a.episode !== b.episode) return a.episode - b.episode;
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
      });

      // 5. Title & TMDB metadata search
      const rawName = torrTitle || parsed?.name || title || fileName || videoFiles[0].name;
      const cleanName = cleanReleaseTitle(rawName);

      let tmdbTitle = cleanName;
      let tmdbPoster = body.poster || '';
      let tmdbMediaType = body.mediaType || (videoFiles.length > 1 ? 'tv' : 'movie');
      let tmdbMediaId = body.mediaId || 0;
      let tmdbYear = '';
      let tmdbScore = 0;

      try {
        const sUrl = `http://127.0.0.1:${config.port}/api/search?q=${encodeURIComponent(cleanName)}`;
        const sRes = await fetch(sUrl, { signal: AbortSignal.timeout(4000) });
        if (sRes.ok) {
          const sData = (await sRes.json()) as any;
          const top = (sData.results || [])[0];
          if (top) {
            tmdbTitle = top.name || top.title || tmdbTitle;
            tmdbMediaId = top.id || top.tmdbId || tmdbMediaId;
            tmdbYear = String(top.year || '');
            tmdbScore = Number(top.score || 0);
            const rawP = top.poster || top.posterPath || '';
            if (rawP && !tmdbPoster) {
              if (rawP.includes('/api/image?url=')) {
                try {
                  const u = new URL(rawP, 'http://localhost');
                  tmdbPoster = u.searchParams.get('url') || rawP;
                } catch {
                  tmdbPoster = rawP;
                }
              } else if (rawP.startsWith('http')) {
                tmdbPoster = rawP;
              } else {
                tmdbPoster = `https://image.tmdb.org/t/p/w500${rawP}`;
              }
            }
            if (top.type) tmdbMediaType = top.type;
          }
        }
      } catch (err: any) {
        console.warn('[Downloads] TMDB search error:', err.message);
      }

      // If user requested: start downloading ALL files (whole season)
      if (startAll) {
        for (const f of videoFiles) {
          const dlId = `dl_${torrentHash}_${f.id}_${Date.now().toString(36)}`;
          const epTitle = f.season > 0 && f.episode > 0
            ? `${tmdbTitle} S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`
            : (videoFiles.length === 1 ? tmdbTitle : `${tmdbTitle} - ${f.name}`);

          await registerServerDownload({
            id: dlId,
            userId,
            title: epTitle,
            mediaType: videoFiles.length > 1 ? 'tv' : 'movie',
            mediaId: tmdbMediaId,
            season: f.season,
            episode: f.episode,
            poster: tmdbPoster,
            torrentHash,
            torrentIndex: f.id,
            magnet: magnet || '',
            fileSize: f.size,
            fileName: f.name,
          });
        }
        return {
          success: true,
          startedCount: videoFiles.length,
          message: `Поставлено на загрузку ${videoFiles.length} серий сериала «${tmdbTitle}»`,
          title: tmdbTitle,
          poster: tmdbPoster,
        };
      }

      // If user selected specific indices
      if (selectedIndices && selectedIndices.length > 0) {
        const targets = videoFiles.filter((f) => selectedIndices.includes(f.id));
        for (const f of targets) {
          const dlId = `dl_${torrentHash}_${f.id}_${Date.now().toString(36)}`;
          const epTitle = f.season > 0 && f.episode > 0
            ? `${tmdbTitle} S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`
            : (videoFiles.length === 1 ? tmdbTitle : `${tmdbTitle} - ${f.name}`);

          await registerServerDownload({
            id: dlId,
            userId,
            title: epTitle,
            mediaType: videoFiles.length > 1 ? 'tv' : 'movie',
            mediaId: tmdbMediaId,
            season: f.season,
            episode: f.episode,
            poster: tmdbPoster,
            torrentHash,
            torrentIndex: f.id,
            magnet: magnet || '',
            fileSize: f.size,
            fileName: f.name,
          });
        }
        return {
          success: true,
          startedCount: targets.length,
          message: `Поставлено на загрузку ${targets.length} файл(ов)`,
          title: tmdbTitle,
          poster: tmdbPoster,
        };
      }

      // If single video file (Movie or single episode): automatically start immediately!
      if (videoFiles.length === 1) {
        const f = videoFiles[0];
        const dlId = `dl_${torrentHash}_${f.id}_${Date.now().toString(36)}`;
        const isMovie = f.season === 0 && f.episode === 0;
        const finalTitle = isMovie
          ? tmdbTitle
          : `${tmdbTitle} S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}`;

        await registerServerDownload({
          id: dlId,
          userId,
          title: finalTitle,
          mediaType: isMovie ? 'movie' : 'tv',
          mediaId: tmdbMediaId,
          season: f.season,
          episode: f.episode,
          poster: tmdbPoster,
          torrentHash,
          torrentIndex: f.id,
          magnet: magnet || '',
          fileSize: f.size,
          fileName: f.name,
        });

        return {
          success: true,
          isMultiFile: false,
          downloadId: dlId,
          title: finalTitle,
          fileSize: f.size,
          fileSizeFormatted: f.sizeFormatted,
          poster: tmdbPoster,
          year: tmdbYear,
          rating: tmdbScore > 0 ? tmdbScore.toFixed(1) : '',
          mediaType: isMovie ? 'movie' : 'tv',
          message: `Загрузка «${finalTitle}» начата на сервере`,
        };
      }

      // If multi-file series: return summary and file list so bot or UI can present episode selector / whole season download
      const totalBytes = videoFiles.reduce((acc, f) => acc + f.size, 0);
      const detectedSeason = videoFiles.find((f) => f.season > 0)?.season || 1;

      return {
        success: true,
        isMultiFile: true,
        torrentHash,
        title: tmdbTitle,
        mediaType: 'tv',
        mediaId: tmdbMediaId,
        poster: tmdbPoster,
        year: tmdbYear,
        rating: tmdbScore > 0 ? tmdbScore.toFixed(1) : '',
        detectedSeason,
        totalEpisodes: videoFiles.length,
        totalSize: totalBytes,
        totalSizeFormatted: formatBytes(totalBytes),
        files: videoFiles,
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
        const requestedUserId = Number((req.query as any)?.userId);
        let res;
        if (requestedUserId) {
          res = await pool.query(
            `SELECT * FROM server_downloads WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
            [requestedUserId]
          );
        } else if (req.user && req.user.role !== 'admin') {
          res = await pool.query(
            `SELECT * FROM server_downloads WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
            [req.user.userId]
          );
        } else {
          res = await pool.query(
            `SELECT * FROM server_downloads ORDER BY created_at DESC LIMIT 100`
          );
        }

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
