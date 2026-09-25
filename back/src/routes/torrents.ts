import type { FastifyInstance } from 'fastify';
import os from 'os';
import http from 'http';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { config } from '../config.js';

let jacredUrl = config.jacred.url;
const TORRSERVER_URL = config.torrserver.url;

function isFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getHlsTmpBase(): string {
  if (process.env.HLS_TMP_DIR) return process.env.HLS_TMP_DIR;
  if (process.platform === 'win32') return join(os.tmpdir(), 'lumiere-hls');
  return '/tmp';
}

function getHlsDir(sessionId: string): string {
  return join(getHlsTmpBase(), `hls-${sessionId}`);
}

interface JacRedResult {
  Title: string;
  Tracker: string;
  CategoryDesc?: string;
  Size: number;
  Seeders: number;
  Peers: number;
  MagnetUri?: string;
  Link?: string;
  Details?: string;
  PublishDate: string;
  Guid: string;
}

interface TorrentItem {
  id: string;
  title: string;
  tracker: string;
  category: string;
  size: number;
  sizeFormatted: string;
  seeders: number;
  peers: number;
  magnet: string;
  link: string;
  details: string;
  date: string;
}

interface TorrentFile {
  id: number;
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  streamUrl: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractSubLang(filename: string): string {
  // Extract language from filename patterns like Movie.rus.srt, Movie.eng.vtt, Movie.en.srt
  const langMap: Record<string, string> = {
    rus: 'rus', ru: 'rus', russian: 'rus', рус: 'rus', русский: 'rus',
    eng: 'eng', en: 'eng', english: 'eng',
    ukr: 'ukr', uk: 'ukr', ukrainian: 'ukr',
    ger: 'ger', de: 'ger', german: 'ger',
    fre: 'fre', fr: 'fre', french: 'fre',
    spa: 'spa', es: 'spa', spanish: 'spa',
    ita: 'ita', it: 'ita', italian: 'ita',
    por: 'por', pt: 'por', portuguese: 'por',
    jpn: 'jpn', ja: 'jpn', japanese: 'jpn',
    kor: 'kor', ko: 'kor', korean: 'kor',
    chi: 'chi', zh: 'chi', chinese: 'chi',
    ara: 'ara', ar: 'ara', arabic: 'ara',
    hin: 'hin', hi: 'hin', hindi: 'hin',
  };
  const name = filename.toLowerCase();
  // Try to find language code between dots
  const parts = name.split('.');
  for (const part of parts) {
    if (langMap[part]) return langMap[part];
  }
  return 'und';
}

const JACRED_MIRRORS = [
  'http://ns3bg91xvuqfvq9h.cfhttp.top',
  'http://jacred.xyz',
  'http://jacred.me',
];

async function fetchFromJacRed(targetUrl: string, query: string, category?: string): Promise<JacRedResult[]> {
  try {
    const catParam = category ? `&category[]=${category}` : '';
    const url = `${targetUrl}/api/v2.0/indexers/all/results?query=${encodeURIComponent(query)}${catParam}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { Results?: JacRedResult[] };
    return data.Results || [];
  } catch {
    return [];
  }
}

async function ensureTorrServerOptimized() {
  try {
    const res = await fetch(`${TORRSERVER_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get' }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const sets = (await res.json()) as any;
      if (!sets.CacheSize || sets.CacheSize < 536870912 || (sets.ConnectionsLimit && sets.ConnectionsLimit < 100)) {
        await fetch(`${TORRSERVER_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set',
            sets: {
              CacheSize: 536870912, // 512 MB cache to support concurrent streams
              ConnectionsLimit: 100, // 100 connections
              ReaderReadAHead: 95,
            },
          }),
          signal: AbortSignal.timeout(5000),
        });
        console.log('[TorrServer] Automatically optimized settings: 512MB cache, 100 connections');
      }
    }
  } catch {
    // Non-blocking if TorrServer is not yet running
  }
}

export function torrentRoutes(app: FastifyInstance) {
  // Proactively check and optimize TorrServer cache & peer limits
  ensureTorrServerOptimized().catch(() => {});
  // Search torrents via JacRed with multi-indexer aggregation & smart fallback
  app.get('/api/torrents/search', async (req, reply) => {
    const { q, alt, category, tmdbId, type } = req.query as {
      q?: string;
      alt?: string;
      category?: string;
      tmdbId?: string;
      type?: string;
    };

    if (!q) {
      return reply.code(400).send({ error: 'Query required' });
    }

    try {
      const activeUrl = jacredUrl;
      const mirrors = [activeUrl, ...JACRED_MIRRORS.filter((m) => m !== activeUrl)];

      // 1. Primary search
      let rawResults = await fetchFromJacRed(mirrors[0], q, category);

      // If primary mirror returned 0, try secondary mirror
      if (rawResults.length === 0 && mirrors.length > 1) {
        rawResults = await fetchFromJacRed(mirrors[1], q, category);
      }

      // 2. If results are few (< 15), generate smart query variants
      if (rawResults.length < 15) {
        const extraQueries: string[] = [];

        // Alternative title (e.g. original English or localized title)
        if (alt && alt.trim() && alt.trim().toLowerCase() !== q.trim().toLowerCase()) {
          extraQueries.push(alt.trim());
        }

        // Fetch English title / alternative titles from TMDB if tmdbId provided
        if (tmdbId) {
          try {
            const mediaT = type === 'tv' ? 'tv' : 'movie';
            const headers: Record<string, string> = {};
            if (config.tmdb.token) headers['Authorization'] = `Bearer ${config.tmdb.token}`;
            const [enRes, altRes] = await Promise.all([
              fetch(`https://api.themoviedb.org/3/${mediaT}/${tmdbId}?language=en-US`, { headers, signal: AbortSignal.timeout(4000) })
                .then((r) => r.json())
                .catch(() => null),
              fetch(`https://api.themoviedb.org/3/${mediaT}/${tmdbId}/alternative_titles`, { headers, signal: AbortSignal.timeout(4000) })
                .then((r) => r.json())
                .catch(() => null),
            ]);
            if (enRes && (enRes.title || enRes.name)) {
              const enTitle = String(enRes.title || enRes.name).trim();
              if (enTitle.toLowerCase() !== q.trim().toLowerCase() && !extraQueries.includes(enTitle)) {
                extraQueries.push(enTitle);
              }
            }
            const altList = altRes ? (altRes.titles || altRes.results || []) : [];
            for (const item of altList) {
              const aTitle = String(item.title || item.name || '').trim();
              if (aTitle && aTitle.toLowerCase() !== q.trim().toLowerCase() && !extraQueries.includes(aTitle)) {
                extraQueries.push(aTitle);
              }
            }
          } catch {}
        }

        // Franchise and popular tracker naming variants (e.g. "Comedy Club" <-> "Новый Comedy Club" <-> "Камеди Клаб")
        const franchiseRules: Array<{ test: RegExp; expansions: string[] }> = [
          {
            test: /\b(камеди\s*клаб|comedy\s*club|новый\s*comedy\s*club|новый\s*камеди\s*клаб)\b/i,
            expansions: ['новый comedy club', 'comedy club', 'новый камеди клаб', 'камеди клаб'],
          },
          {
            test: /\b(стендап|стэндап|stand\s*up|standup)\b/i,
            expansions: ['stand up', 'стендап', 'stand up brand new', 'standup'],
          },
          {
            test: /\b(comedy\s*woman|камеди\s*вум[ае]н)\b/i,
            expansions: ['comedy woman', 'камеди вумен', 'камеди вуман'],
          },
          {
            test: /\b(comedy\s*батт?л|камеди\s*батт?л|comedy\s*battle)\b/i,
            expansions: ['comedy battle', 'камеди баттл', 'comedy батл'],
          },
          {
            test: /\b(импровизаци[яи]|импровизаторы)\b/i,
            expansions: ['импровизация', 'импровизаторы'],
          },
          {
            test: /\b(однажды\s*в\s*россии)\b/i,
            expansions: ['однажды в россии'],
          },
        ];

        for (const rule of franchiseRules) {
          if (rule.test.test(q) || (alt && rule.test.test(alt))) {
            for (const exp of rule.expansions) {
              if (exp.toLowerCase() !== q.trim().toLowerCase() && !extraQueries.includes(exp)) {
                extraQueries.push(exp);
              }
            }
          }
        }

        // Cyrillic-to-English phonetic loanwords mapping (e.g. "Камеди Клаб" -> "Comedy Club")
        const loanwordMap: Record<string, string> = {
          'камеди': 'comedy',
          'клаб': 'club',
          'шоу': 'show',
          'лайв': 'live',
          'батл': 'battle',
          'батлл': 'battle',
          'баттл': 'battle',
          'стэндап': 'standup',
          'стендап': 'standup',
          'бойз': 'boys',
          'герлз': 'girls',
          'пацаны': 'the boys',
        };
        const words = q.toLowerCase().split(/\s+/);
        let hasLoanword = false;
        const convertedWords = words.map((w) => {
          const cleanW = w.replace(/[^\w\u0400-\u04FF]/g, '');
          if (loanwordMap[cleanW]) {
            hasLoanword = true;
            return loanwordMap[cleanW];
          }
          return w;
        });
        if (hasLoanword) {
          const loanQuery = convertedWords.join(' ').trim();
          if (loanQuery.toLowerCase() !== q.trim().toLowerCase() && !extraQueries.includes(loanQuery)) {
            extraQueries.push(loanQuery);
          }
        }

        // Replace Roman numerals with Arabic numerals
        const withArabic = q
          .replace(/(^|[\s.,])VIII([\s.,]|$)/gi, '$18$2')
          .replace(/(^|[\s.,])VII([\s.,]|$)/gi, '$17$2')
          .replace(/(^|[\s.,])VI([\s.,]|$)/gi, '$16$2')
          .replace(/(^|[\s.,])IV([\s.,]|$)/gi, '$14$2')
          .replace(/(^|[\s.,])V([\s.,]|$)/gi, '$15$2')
          .replace(/(^|[\s.,])III([\s.,]|$)/gi, '$13$2')
          .replace(/(^|[\s.,])II([\s.,]|$)/gi, '$12$2');
        if (withArabic !== q) extraQueries.push(withArabic.trim());

        // Subtitle split by colon or em-dash (e.g. "Человек-паук: Новый день" -> "Человек-паук")
        if (q.includes(':') || q.includes(' — ') || q.includes(' - ')) {
          const mainTitle = q.split(/\s*[:—]\s*|\s+-\s+/)[0].trim();
          if (mainTitle.length >= 3 && mainTitle !== q) {
            extraQueries.push(mainTitle);
          }
        }

        // Run extra queries in parallel
        if (extraQueries.length > 0) {
          const extraResults = await Promise.all(
            extraQueries.slice(0, 8).map((query) => fetchFromJacRed(mirrors[0], query, category))
          );
          for (const resList of extraResults) {
            rawResults.push(...resList);
          }
        }
      }

      // Deduplicate by magnet hash or guid
      const seen = new Set<string>();
      const results: TorrentItem[] = [];

      for (const r of rawResults) {
        const link = r.MagnetUri || r.Link || '';
        if (!link) continue;
        const key = link.startsWith('magnet:') ? link.split('&')[0].toLowerCase() : (r.Guid || r.Title);
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          id: r.Guid || key,
          title: r.Title,
          tracker: Array.isArray(r.Tracker) ? r.Tracker.join(', ') : r.Tracker,
          category: r.CategoryDesc || 'Unknown',
          size: r.Size,
          sizeFormatted: formatSize(r.Size),
          seeders: r.Seeders || 0,
          peers: r.Peers || 0,
          magnet: r.MagnetUri || r.Link || '',
          link: r.Link || '',
          details: r.Details || '',
          date: r.PublishDate,
        });
      }

      function scoreTorrentItem(t: TorrentItem): number {
        let score = t.seeders || 0;
        const title = (t.title || '').toUpperCase();
        const tracker = (t.tracker || '').toLowerCase();
        const hasTrackers = Boolean(t.magnet && t.magnet.includes('&tr='));

        if (tracker.includes('rutracker')) score += 500;
        if (tracker.includes('rutor')) score += 350;
        if (tracker.includes('nnm')) score += 300;
        if (hasTrackers) score += 200;

        if (tracker === 'kinozal' && !hasTrackers) score -= 1000;

        if (title.includes('1080P') || title.includes('WEB-DL') || title.includes('BDRIP') || title.includes('REMUX')) score += 250;
        if (title.includes('720P') || title.includes('HDTV')) score += 100;
        if (/\b\d+\s*[-–—]\s*\d+\s*(выпуск|сери)/i.test(title)) score += 150;
        if (title.includes('SATRIP') || title.includes('TVRIP') || title.includes('XVID') || title.includes('.AVI')) score -= 200;

        return score;
      }

      results.sort((a, b) => scoreTorrentItem(b) - scoreTorrentItem(a));

      return { results };
    } catch (err: any) {
      console.error('JacRed search error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Stream torrent via TorrServer (correct flow: add → stat → play)
  app.post('/api/torrents/stream', async (req, reply) => {
    const { magnet, title } = req.body as { magnet?: string; title?: string };

    if (!magnet) {
      return reply.code(400).send({ error: 'Magnet link required' });
    }

    try {
      // Step 1: Add torrent to TorrServer (ephemeral, not saved to DB)
      const addRes = await fetch(`${TORRSERVER_URL}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          link: magnet,
          title: title || 'Unknown',
          poster: '',
          save_to_db: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!addRes.ok) {
        const errText = await addRes.text();
        return reply.code(502).send({ error: `TorrServer ошибка добавления: ${errText || addRes.statusText}` });
      }

      const addData = await addRes.json() as { hash?: string };
      const hash = addData.hash;

      if (!hash) {
        return reply.code(500).send({ error: 'Не получен хэш торрента от TorrServer' });
      }

      // Step 2: Get file list via stat endpoint with retry to give TorrServer time to retrieve metadata
      let stat: {
        file_stats?: Array<{ id: number; path: string; length: number }>;
        hash?: string;
        name?: string;
        stat?: number;
      } = {};

      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const statRes = await fetch(`${TORRSERVER_URL}/stream?link=${hash}&index=-1&stat`, {
            signal: AbortSignal.timeout(8000),
          });
          if (statRes.ok) {
            stat = await statRes.json() as any;
            if (stat.file_stats && stat.file_stats.length > 0) {
              break;
            }
          }
        } catch (statErr: any) {
          console.warn(`Stat fetch attempt ${attempt + 1} failed:`, statErr.message);
        }

        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (!stat.file_stats?.length) {
        return reply.code(200).send({
          hash,
          name: title,
          files: [],
          error: 'Поиск пиров и загрузка метаданных торрента... Повторите попытку через пару секунд.',
        });
      }

      // Find video and subtitle files
      const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m4v'];
      const subtitleExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.sup'];

      const videoFiles = stat.file_stats.filter((f) => {
        const ext = f.path.toLowerCase().split('.').pop();
        return ext && videoExtensions.some((ve) => ext.endsWith(ve.replace('.', '')));
      });

      const subtitleFiles = stat.file_stats.filter((f) => {
        const ext = f.path.toLowerCase().split('.').pop();
        return ext && subtitleExtensions.some((se) => ext.endsWith(se.replace('.', '')));
      });

      // Associate subtitles with video files by name matching
      const files: TorrentFile[] = videoFiles.map((f) => {
        const videoName = f.path.replace(/\.[^.]+$/, ''); // remove extension
        const videoDir = f.path.substring(0, f.path.lastIndexOf('/'));
        const baseName = videoName.split('/').pop() || videoName;

        // Find matching subtitle files
        const matchingSubs = subtitleFiles.filter((sf) => {
          const subName = sf.path.replace(/\.[^.]+$/, '');
          const subBase = subName.split('/').pop() || subName;
          const subDir = sf.path.substring(0, sf.path.lastIndexOf('/'));
          // Match by: same directory + subtitle name starts with video name
          // Or: subtitle name contains video name (for patterns like Movie.rus.srt)
          return subDir === videoDir && (
            subBase.startsWith(baseName) ||
            subBase.toLowerCase().includes(baseName.toLowerCase())
          );
        }).map((sf) => ({
          id: sf.id,
          name: sf.path.split('/').pop() || sf.path,
          path: sf.path,
          url: `/api/torrents/subtitle-file?link=${encodeURIComponent(magnet)}&index=${sf.id}`,
          lang: extractSubLang(sf.path),
        }));

        const fileName = f.path.split('/').pop() || f.path;
        const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.mkv';
        const isAvi = ext.toLowerCase() === '.avi';
        const directProxyUrl = `/api/torrents/proxy/video${ext}?link=${encodeURIComponent(magnet)}&index=${f.id}`;

        return {
          id: f.id,
          name: fileName,
          path: f.path,
          size: f.length,
          streamUrl: directProxyUrl,
          directUrl: directProxyUrl,
          hlsUrl: `/api/torrents/hls/stream.m3u8?link=${encodeURIComponent(magnet)}&index=${f.id}${isAvi ? '&vcodec=h264' : ''}`,
          externalSubs: matchingSubs,
        } as any;
      });

      return {
        hash,
        name: stat.name || title,
        files,
      };
    } catch (err: any) {
      console.error('TorrServer stream error:', err);
      const isConnectionError =
        err.message?.includes('fetch failed') ||
        err.code === 'ECONNREFUSED' ||
        err.cause?.code === 'ECONNREFUSED' ||
        err.name === 'TimeoutError' ||
        err.name === 'AbortError';

      const errorMsg = isConnectionError
        ? `Не удалось подключиться к TorrServer (${TORRSERVER_URL}). Проверьте, что TorrServer запущен и доступен.`
        : (err.message || 'Ошибка обработки торрента');

      return reply.code(502).send({ error: errorMsg });
    }
  });

  // Proxy TorrServer streams (direct) — supports Range & container hint for AVPlay seeking
  const handleTorrentProxy = async (req: any, reply: any) => {
    const { link, index } = req.query as { link?: string; index?: string };
    const filename = req.params?.filename || 'video.mkv';

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    const torrUrl = new URL(`${TORRSERVER_URL}/stream/${encodeURIComponent(filename)}?link=${encodeURIComponent(link)}&index=${index || 0}&play`);

    const headers: Record<string, string | string[]> = {};
    if (req.headers.range) {
      headers['range'] = req.headers.range;
    }
    if (req.headers['user-agent']) {
      headers['user-agent'] = req.headers['user-agent'];
    }

    return new Promise<void>((resolve) => {
      const proxyReq = http.request(torrUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
      }, (proxyRes) => {
        // Forward all headers from TorrServer with CORS and DLNA seeking indicators
        const resHeaders: Record<string, any> = { ...proxyRes.headers };
        resHeaders['access-control-allow-origin'] = '*';
        resHeaders['access-control-allow-methods'] = 'GET, HEAD, OPTIONS';
        resHeaders['access-control-allow-headers'] = 'Range, Content-Range';
        resHeaders['access-control-expose-headers'] = 'Content-Length, Content-Range, transfermode.dlna.org, contentfeatures.dlna.org, Accept-Ranges';
        if (!resHeaders['accept-ranges']) {
          resHeaders['accept-ranges'] = 'bytes';
        }
        if (!resHeaders['transfermode.dlna.org']) {
          resHeaders['transfermode.dlna.org'] = 'Streaming';
        }

        reply.raw.writeHead(proxyRes.statusCode || 200, resHeaders);

        if (req.method === 'HEAD') {
          reply.raw.end();
          resolve();
          return;
        }

        proxyRes.pipe(reply.raw);
        proxyRes.on('end', () => resolve());
        proxyRes.on('error', (err) => {
          console.error('[Proxy] TorrServer stream pipe error:', err.message);
          resolve();
        });
      });

      req.raw.on('close', () => {
        try { proxyReq.destroy(); } catch {}
      });

      proxyReq.on('error', (err) => {
        console.error('[Proxy] TorrServer proxy request error:', err.message);
        if (!reply.raw.headersSent) {
          reply.code(502).send({ error: 'TorrServer connection error' });
        }
        resolve();
      });

      proxyReq.end();
    });
  };

  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/proxy', handler: handleTorrentProxy });
  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/proxy/:filename', handler: handleTorrentProxy });

  // Get audio and subtitle track info via FFprobe
  app.get('/api/torrents/tracks', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link required' });
    }

    try {
      const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
      const { execSync } = await import('child_process');
      const probe = execSync(
        `ffprobe -v quiet -print_format json -show_streams -probesize 5000000 -analyzeduration 5000000 "${streamUrl}"`,
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      ).toString();
      const streams = JSON.parse(probe).streams || [];

      const langMap: Record<string, string> = { rus: 'Русский', ukr: 'Украинский', eng: 'English', und: 'Неизвестно' };
      const codecMap: Record<string, string> = {
        aac: 'AAC', ac3: 'AC3', eac3: 'EAC3', dts: 'DTS', truehd: 'TrueHD',
        mp3: 'MP3', flac: 'FLAC', opus: 'Opus', vorbis: 'Vorbis', pcm: 'PCM',
      };
      const channelMap: Record<number, string> = { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' };

      const audioTracks = streams
        .filter((s: any) => s.codec_type === 'audio')
        .map((s: any, i: number) => {
          const lang = langMap[s.tags?.language] || s.tags?.language || 'Неизвестно';
          const codec = codecMap[s.codec_name?.toLowerCase()] || s.codec_name?.toUpperCase() || '';
          const channels = channelMap[s.channels] || (s.channels ? `${s.channels}ch` : '');
          const title = s.tags?.title || '';
          // Build descriptive name: "Русский DTS 5.1" or "Русский (author) DTS 5.1"
          let name = lang;
          if (title && title !== s.tags?.language) name += ` (${title})`;
          if (codec) name += ` ${codec}`;
          if (channels) name += ` ${channels}`;
          return { id: i, lang: s.tags?.language || 'und', name, codec: s.codec_name, channels: s.channels || 2 };
        });

      const subtitleTracks = streams
        .filter((s: any) => s.codec_type === 'subtitle')
        .map((s: any, i: number) => ({
          id: i,
          lang: s.tags?.language || 'und',
          name: s.tags?.title || langMap[s.tags?.language] || s.tags?.language || `Субтитры ${i + 1}`,
          codec: s.codec_name,
        }));

      return { audioTracks, subtitleTracks };
    } catch (err: any) {
      console.warn('Track probe warning:', err.message);
      return {
        audioTracks: [{ id: 0, lang: 'und', name: 'Основная аудиодорожка', channels: 2 }],
        subtitleTracks: [],
      };
    }
  });

  // Get video duration using FFprobe
  app.get('/api/torrents/duration', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;

    try {
      const { execSync } = await import('child_process');
      // Try to get accurate duration with large probesize
      let dur = 0;

      // Method 1: format-level duration with large probesize
      try {
        const fmtResult = execSync(
          `ffprobe -v quiet -print_format json -show_format -probesize 5000000 -analyzeduration 5000000 "${streamUrl}"`,
          { timeout: 15000 }
        ).toString();
        const fmtData = JSON.parse(fmtResult);
        dur = parseFloat(fmtData.format?.duration || '0');
      } catch {}

      // Method 2: stream-level duration if format is wrong
      if (dur <= 0) {
        try {
          const streamResult = execSync(
            `ffprobe -v quiet -print_format json -show_streams -select_streams v:0 "${streamUrl}"`,
            { timeout: 30000 }
          ).toString();
          const streamData = JSON.parse(streamResult);
          const videoStream = streamData.streams?.[0];
          if (videoStream) {
            dur = parseFloat(videoStream.duration || '0');
            // Try nb_frames / fps
            if (dur <= 0 && videoStream.nb_frames && videoStream.avg_frame_rate) {
              const frames = parseInt(videoStream.nb_frames);
              const fpsParts = videoStream.avg_frame_rate.split('/');
              const fps = parseInt(fpsParts[0]) / (parseInt(fpsParts[1]) || 1);
              if (frames > 0 && fps > 0) dur = frames / fps;
            }
          }
        } catch {}
      }

      return { duration: dur, formatted: formatTime(dur) };
    } catch (err: any) {
      console.warn('FFprobe error:', err.message);
      return { duration: 0, formatted: '0:00' };
    }
  });

  function formatTime(seconds: number): string {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Track active FFmpeg sessions with dynamic CPU throttling (SIGSTOP/SIGCONT)
  interface FfmpegSession {
    pid: number;
    hlsDir: string;
    streamKey: string;
    paused: boolean;
    lastRequestedSeg: number;
    lastActivity: number;
    timer?: NodeJS.Timeout;
  }

  const activeSessions = new Map<string, FfmpegSession>();
  const activeSubtitles = new Map<string, { pid: number }>();

  function pauseFfmpeg(sess: FfmpegSession) {
    if (!sess.paused && process.platform !== 'win32') {
      try {
        process.kill(sess.pid, 'SIGSTOP');
        sess.paused = true;
      } catch {}
    }
  }

  function resumeFfmpeg(sess: FfmpegSession) {
    if (sess.paused && process.platform !== 'win32') {
      try {
        process.kill(sess.pid, 'SIGCONT');
        sess.paused = false;
      } catch {}
    }
  }

  function checkThrottle(sess: FfmpegSession) {
    try {
      const { readdirSync, existsSync } = require('fs');
      if (!existsSync(sess.hlsDir)) return;
      const files = readdirSync(sess.hlsDir) as string[];
      let maxSeg = -1;
      for (const f of files) {
        if (f.startsWith('seg-') && f.endsWith('.ts')) {
          const num = parseInt(f.slice(4, -3), 10);
          if (!isNaN(num) && num > maxSeg) {
            maxSeg = num;
          }
        }
      }

      if (maxSeg < 0) return;

      const ahead = maxSeg - sess.lastRequestedSeg;
      // Buffer target: maintain ~32s buffer (8 segments of 4s).
      // If FFmpeg has produced 8+ segments ahead of the player, suspend it to save 100% CPU.
      // If buffer drops below 4 segments (<16s), resume FFmpeg to generate more.
      if (ahead >= 8) {
        pauseFfmpeg(sess);
      } else if (ahead < 4) {
        resumeFfmpeg(sess);
      }
    } catch {}
  }

  function cleanupSession(sessionId: string) {
    const sess = activeSessions.get(sessionId);
    if (!sess) return;
    if (sess.timer) clearInterval(sess.timer);
    try { process.kill(sess.pid, 'SIGKILL'); } catch {}
    activeSessions.delete(sessionId);
    try {
      const { rmSync } = require('fs');
      rmSync(sess.hlsDir, { recursive: true, force: true });
    } catch {}
  }

  const handleHls = async (req: any, reply: any) => {
    const { link, index, audio, start, vcodec } = req.query as { link?: string; index?: string; audio?: string; start?: string; vcodec?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    if (!isFfmpegAvailable()) {
      return reply.redirect(`/api/torrents/proxy?link=${encodeURIComponent(link)}&index=${index || 0}`);
    }

    const audioIndex = parseInt(audio || '0', 10) || 0;
    const seekTime = parseFloat(start || '0') || 0;
    const isVideoTranscode = vcodec === 'h264';
    const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
    const { createHash } = await import('crypto');
    // Include audio index, seek time, and vcodec in session ID for isolation
    const sessionId = createHash('sha256').update(`${link}-${index}-a${audioIndex}-s${seekTime}-v${isVideoTranscode ? 'h264' : 'copy'}`).digest('hex').slice(0, 32);
    const hlsDir = getHlsDir(sessionId);

    const { mkdirSync, existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const playlistPath = join(hlsDir, 'playlist.m3u8');

    // Build absolute URL prefix for segments so Tizen/AVPlay/WebKit never fail on relative paths
    const host = req.headers.host || '192.168.1.196:3500';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const segBase = `${proto}://${host}/api/torrents/hls-seg?session=${sessionId}&id=`;

    // Check if session is already active
    const existingSession = activeSessions.get(sessionId);
    if (existingSession && existsSync(playlistPath)) {
      existingSession.lastActivity = Date.now();
      checkThrottle(existingSession);
      let manifest = readFileSync(playlistPath, 'utf-8');
      // Validate manifest is proper M3U8 before serving
      if (manifest.includes('#EXTM3U') && manifest.includes('#EXTINF')) {
        manifest = manifest.replace(/seg-(\d+)\.ts/g, `${segBase}$1`);
        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        reply.header('Access-Control-Allow-Headers', '*');
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        return reply.send(manifest);
      }
      // Manifest exists but not valid yet — fall through to wait
    }

    const streamKey = `${link}-${index || 0}`;

    // Clean up any other active transcoding sessions for the same torrent file (prevent multiple concurrent transcoders)
    for (const [sId, sess] of activeSessions.entries()) {
      if (sess.streamKey === streamKey && sId !== sessionId) {
        cleanupSession(sId);
      }
    }

    // Clean up old session and HLS directory if exists
    if (existingSession) {
      cleanupSession(sessionId);
    }
    // Clean old HLS directory for fresh start
    if (existsSync(hlsDir)) {
      const { rmSync } = await import('fs');
      try { rmSync(hlsDir, { recursive: true, force: true }); } catch {}
    }

    if (!existsSync(hlsDir)) {
      mkdirSync(hlsDir, { recursive: true });
    }

    // Start FFmpeg with selected audio track and video transcode if required
    // Uses -hls_list_size 0 (VOD playlist, no deleted segments) to prevent jumping/twitching
    const { spawn } = await import('child_process');
    const ffmpegArgs = [
      '-threads', '2',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
    ];
    // Input seek (-ss before -i) allows FFmpeg to use HTTP Range requests directly to TorrServer
    if (seekTime > 0) {
      ffmpegArgs.push('-ss', String(Math.floor(seekTime)));
    }
    ffmpegArgs.push('-i', streamUrl);
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-map', `0:a:${audioIndex}`,
    );

    if (isVideoTranscode) {
      // Samsung Tizen TVs (2018+) dropped MPEG-4 Part 2/XviD hardware decoders.
      // Transcode video to ultra-compatible H.264 Main profile at 40-50x speed.
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
      );
    } else {
      ffmpegArgs.push('-c:v', 'copy');
    }

    ffmpegArgs.push(
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_list_size', '0',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', join(hlsDir, 'seg-%d.ts'),
      '-y',
      playlistPath,
    );
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    const sess: FfmpegSession = {
      pid: ffmpeg.pid!,
      hlsDir,
      streamKey,
      paused: false,
      lastRequestedSeg: 0,
      lastActivity: Date.now(),
    };
    activeSessions.set(sessionId, sess);

    // Dynamic throttle loop: checks every 500ms to pause/resume FFmpeg and clean up after 90s idle
    sess.timer = setInterval(() => {
      if (Date.now() - sess.lastActivity > 90000) {
        cleanupSession(sessionId);
        return;
      }
      checkThrottle(sess);
    }, 500);

    ffmpeg.on('error', (err) => {
      console.error(`[FFmpeg] Session ${sessionId} spawn error:`, err.message);
      cleanupSession(sessionId);
    });
    ffmpeg.on('close', (code, signal) => {
      console.log(`[FFmpeg] Session ${sessionId} closed: code=${code}, signal=${signal}`);
      if (sess.timer) clearInterval(sess.timer);
      activeSessions.delete(sessionId);
    });
    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid') || msg.includes('failed')) {
        console.error(`[FFmpeg] ${sessionId}: ${msg.substring(0, 200)}`);
      }
    });

    // Wait for playlist
    const waitForPlaylist = () => new Promise<void>((resolve) => {
      let attempts = 0;
      const check = () => {
        if (existsSync(playlistPath)) {
          const content = readFileSync(playlistPath, 'utf-8');
          if (content.includes('.ts')) {
            resolve();
            return;
          }
        }
        if (attempts++ < 150) {
          setTimeout(check, 200);
        } else {
          resolve();
        }
      };
      check();
    });

    await waitForPlaylist();

    if (existsSync(playlistPath)) {
      let manifest = readFileSync(playlistPath, 'utf-8');
      if (!manifest.includes('#EXTM3U')) {
        reply.code(503).send({ error: 'Manifest not ready' });
        return;
      }
      manifest = manifest.replace(/seg-(\d+)\.ts/g, `${segBase}$1`);

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Access-Control-Allow-Headers', '*');
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.send(manifest);
    }

    reply.code(500);
    return { error: 'FFmpeg failed to generate manifest' };
  };

  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/hls', handler: handleHls });
  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/hls/stream.m3u8', handler: handleHls });

  // Serve pre-extracted subtitles from HLS session
  app.get('/api/torrents/hls-subs', async (req, reply) => {
    const { session } = req.query as { session?: string };

    if (!session) {
      return reply.code(400).send({ error: 'session required' });
    }

    const { readFileSync, existsSync } = await import('fs');
    const subtitlePath = join(getHlsDir(session), 'subs.vtt');

    if (!existsSync(subtitlePath)) {
      reply.code(404);
      return { error: 'Subtitles not found' };
    }

    reply.header('Content-Type', 'text/vtt');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(readFileSync(subtitlePath, 'utf-8'));
  });

  // Serve subtitle file from TorrServer (external subtitle files)
  app.get('/api/torrents/subtitle-file', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link || !index) {
      return reply.code(400).send({ error: 'link and index required' });
    }

    try {
      const url = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index}&play`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: 'TorrServer stream error' });
      }

      const content = await res.text();

      // Detect format and convert to WebVTT if needed
      let vtt = content;
      const lower = content.toLowerCase().trim();

      if (lower.startsWith('webvtt')) {
        // Already WebVTT
        vtt = content;
      } else if (lower.includes('-->') && !lower.startsWith('webvtt')) {
        // Looks like SRT - convert to WebVTT
        vtt = 'WEBVTT\n\n' + content
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          // Remove SRT sequence numbers (lines that are just digits)
          .replace(/^\d+\s*$/gm, '')
          // Fix SRT timestamp format (comma → dot)
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      reply.header('Content-Type', 'text/vtt');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(vtt);
    } catch (err: any) {
      console.error('Subtitle file error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Extract subtitles from torrent
  app.get('/api/torrents/subtitles', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link required' });
    }

    try {
      const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;

      // Probe for subtitle tracks
      const { execSync: execSyncSub } = await import('child_process');
      let subtitles: Array<{ id: number; lang: string; label: string }> = [];
      try {
        const probe = execSyncSub(
          `ffprobe -v quiet -print_format json -show_streams "${streamUrl}"`,
          { timeout: 30000, maxBuffer: 1024 * 1024 }
        ).toString();
        const streams = JSON.parse(probe).streams || [];
        subtitles = streams
          .filter((s: any) => s.codec_type === 'subtitle')
          .map((s: any, i: number) => ({
            id: i, // Use sequential index for FFmpeg -map 0:s:i
            lang: s.tags?.language || 'und',
            label: s.tags?.language || `Subtitle ${i + 1}`,
          }));
      } catch (probeErr: any) {
        console.error('FFprobe subtitle error:', probeErr.message);
      }

      return { subtitles };
    } catch (err: any) {
      console.error('Subtitle probe error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Serve extracted subtitle as WebVTT (with caching)
  const subtitleCache = new Map<string, { data: string; expires: number }>();

  app.get('/api/torrents/subtitle/:trackId', async (req, reply) => {
    const { trackId } = req.params as { trackId: string };
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link required' });
    }

    const cacheKey = `${link}-${index}-${trackId}`;
    const cached = subtitleCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      reply.header('Content-Type', 'text/vtt');
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(cached.data);
    }

    try {
      const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
      const { spawn: spawnSub } = await import('child_process');

      // Extract subtitle as WebVTT using spawn (no timeout limit)
      const vtt = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const ffmpeg = spawnSub('ffmpeg', [
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
          '-i', streamUrl,
          '-map', `0:s:${trackId}`,
          '-c:s', 'webvtt',
          '-f', 'webvtt',
          'pipe:1',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stderr.on('data', () => {}); // suppress stderr

        ffmpeg.on('close', (code) => {
          if (code === 0 && chunks.length > 0) {
            resolve(Buffer.concat(chunks).toString('utf-8'));
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpeg.on('error', reject);

        // Safety timeout: kill after 5 minutes
        setTimeout(() => {
          try { ffmpeg.kill('SIGKILL'); } catch {}
          reject(new Error('Subtitle extraction timeout'));
        }, 300000);
      });

      // Cache for 1 hour
      subtitleCache.set(cacheKey, { data: vtt, expires: Date.now() + 3600000 });

      reply.header('Content-Type', 'text/vtt');
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(vtt);
    } catch (err: any) {
      console.error('Subtitle extract error:', err.message);
      return reply.code(500).send({ error: 'Failed to extract subtitle' });
    }
  });

  // Seek endpoint — restarts FFmpeg from a specific position via unified throttled /api/torrents/hls
  app.get('/api/torrents/hls-seek', async (req, reply) => {
    const { link, index, time, audio } = req.query as { link?: string; index?: string; time?: string; audio?: string };

    if (!link || !time) {
      return reply.code(400).send({ error: 'link and time required' });
    }

    const seekTime = Math.floor(parseFloat(time) || 0);
    const audioIdx = audio || '0';
    return reply.redirect(`/api/torrents/hls?link=${encodeURIComponent(link)}&index=${index || 0}&start=${seekTime}&audio=${audioIdx}`);
  });

  // Serve HLS segments (supports subdirectories for multi-audio)
  const handleHlsSeg = async (req: any, reply: any) => {
    const { session, id, dir } = req.query as { session?: string; id?: string; dir?: string };

    if (!session || !id) {
      return reply.code(400).send({ error: 'session and id required' });
    }

    const { readFileSync, existsSync, statSync } = await import('fs');

    // Support subdirectories: video/, audio-0/, audio-1/, etc.
    const segPath = dir
      ? join(getHlsDir(session), dir, `seg-${id}.ts`)
      : join(getHlsDir(session), `seg-${id}.ts`);

    const sess = activeSessions.get(session);
    if (sess) {
      const segNum = parseInt(id, 10);
      if (!isNaN(segNum)) {
        sess.lastRequestedSeg = Math.max(sess.lastRequestedSeg, segNum);
      }
      sess.lastActivity = Date.now();
      // If segment isn't on disk yet, wake up FFmpeg right away
      if (!existsSync(segPath)) {
        resumeFfmpeg(sess);
      } else {
        checkThrottle(sess);
      }
    }

    // Wait for segment to be available
    const waitForFile = () => new Promise<boolean>((resolve) => {
      let attempts = 0;
      const check = () => {
        if (existsSync(segPath)) resolve(true);
        else if (attempts++ > 100) resolve(false);
        else setTimeout(check, 100);
      };
      check();
    });

    const ready = await waitForFile();
    if (!ready) {
      reply.code(404);
      return { error: 'Segment not found' };
    }

    if (sess) {
      checkThrottle(sess);
    }

    const stat = statSync(segPath);
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header('Access-Control-Allow-Headers', '*');
    reply.header('Content-Length', stat.size);

    if (req.method === 'HEAD') {
      return reply.send();
    }

    const data = readFileSync(segPath);
    return reply.send(data);
  };

  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/hls-seg', handler: handleHlsSeg });

  // Get TorrServer status
  app.get('/api/torrents/torrserver/status', async () => {
    try {
      const res = await fetch(`${TORRSERVER_URL}/echo`);
      const version = await res.text();
      return { online: true, version, url: TORRSERVER_URL };
    } catch {
      return { online: false, url: TORRSERVER_URL };
    }
  });

  // Proxy TorrServer /torrents API (for buffer polling from TV/browser)
  app.post('/api/torrents/torrserver/list', async () => {
    try {
      const res = await fetch(`${TORRSERVER_URL}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      return await res.json();
    } catch {
      return [];
    }
  });

  // Get JacRed status
  app.get('/api/torrents/jacred/status', async () => {
    try {
      const res = await fetch(`${jacredUrl}/api/v1.0/conf`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        return { online: true, url: jacredUrl };
      }
      return { online: false, url: jacredUrl };
    } catch {
      return { online: false, url: jacredUrl };
    }
  });

  // Update JacRed URL
  app.post('/api/torrents/jacred/config', async (req) => {
    const { url } = req.body as { url?: string };
    if (url) {
      jacredUrl = url;
      console.log(`JacRed URL updated to: ${jacredUrl}`);
    }
    return { url: jacredUrl };
  });

  // Get JacRed config
  app.get('/api/torrents/jacred/config', async () => {
    return { url: jacredUrl };
  });
}
