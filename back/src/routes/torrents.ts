import type { FastifyInstance } from 'fastify';
import os from 'os';
import http from 'http';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, statSync } from 'fs';
import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';

const execAsync = promisify(exec);

let jacredUrl = config.jacred.url;
let _cachedTorrUrl = config.torrserver.url;
let _lastTorrCheck = 0;

export async function getActiveTorrServerUrl(): Promise<string> {
  const now = Date.now();
  if (_cachedTorrUrl && now - _lastTorrCheck < 15000) {
    return _cachedTorrUrl;
  }
  const candidates = [config.torrserver.url, 'http://localhost:8090', 'http://localhost:8590', 'http://127.0.0.1:8090', 'http://127.0.0.1:8590'];
  const unique = Array.from(new Set(candidates));
  for (const url of unique) {
    try {
      const res = await fetch(`${url}/echo`, { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        _cachedTorrUrl = url;
        _lastTorrCheck = now;
        return url;
      }
    } catch {}
  }
  return config.torrserver.url;
}

export const FALLBACK_PUBLIC_TRACKERS = [
  'http://retracker.local/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'http://tracker.t-ru.org/ann',
  'http://bt2.t-ru.org/ann?magnet',
  'http://tr.kinozal.tv/announce',
];

const TORRSERVER_URL = config.torrserver.url;

function isFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let _vaapiAvailable: boolean | null = null;
function isVaapiAvailable(): boolean {
  if (_vaapiAvailable !== null) return _vaapiAvailable;
  try {
    if (!existsSync('/dev/dri/renderD128')) {
      _vaapiAvailable = false;
      return false;
    }
    // Verify that the driver can actually encode a test frame with VA-API
    execSync('ffmpeg -f lavfi -i nullsrc=s=64x64:d=0.04 -vaapi_device /dev/dri/renderD128 -vf format=nv12,hwupload -c:v h264_vaapi -f null -', {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 3000,
    });
    _vaapiAvailable = true;
    console.log('[FFmpeg] Intel QuickSync (VA-API) hardware acceleration active and verified (/dev/dri/renderD128)');
    return true;
  } catch (err: any) {
    console.warn('[FFmpeg] Intel VA-API not usable, falling back to software transcode:', err.message);
    _vaapiAvailable = false;
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
  hash?: string;
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
    const torrUrl = await getActiveTorrServerUrl();
    const res = await fetch(`${torrUrl}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get' }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const sets = (await res.json()) as any;
      if (
        !sets.CacheSize ||
        sets.CacheSize < 1073741824 ||
        !sets.TorrentDisconnectTimeout ||
        sets.TorrentDisconnectTimeout < 300 ||
        (sets.ConnectionsLimit && sets.ConnectionsLimit < 150)
      ) {
        await fetch(`${torrUrl}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set',
            sets: {
              CacheSize: 1073741824, // 1024 MB cache to support smooth streaming without underrun
              ConnectionsLimit: 150, // 150 connections
              ReaderReadAHead: 85,
              PreloadCache: 5,
              TorrentDisconnectTimeout: 300, // 5 min timeout to prevent closing on player buffer/idle
              ResponsiveMode: true,
              RetrackersMode: 1,
            },
          }),
          signal: AbortSignal.timeout(5000),
        });
        console.log('[TorrServer] Automatically optimized settings: 1024MB cache, 300s timeout, responsive mode');
      }
    }
  } catch {
    // Non-blocking if TorrServer is not yet running
  }
}

export function extractTorrentYear(title: string): number | null {
  if (!title) return null;
  // Match explicit year brackets: (2026), [2026], / 2026 /, .2026., - 2026 -
  const match = title.match(/[\(\[\/\s\.\-](\d{4})[\)\]\/\s\.\-]/);
  if (match) {
    const y = parseInt(match[1], 10);
    if (y >= 1920 && y <= 2035) return y;
  }
  // Match any 4-digit number that represents a calendar year (avoid 1080, 2160)
  const allYears = title.match(/\b(19\d{2}|20\d{2})\b/g);
  if (allYears && allYears.length > 0) {
    for (const yrStr of allYears) {
      const y = parseInt(yrStr, 10);
      if (y >= 1920 && y <= 2035 && y !== 2160) return y;
    }
  }
  return null;
}

export function torrentRoutes(app: FastifyInstance) {
  // Proactively check and optimize TorrServer cache & peer limits
  ensureTorrServerOptimized().catch(() => {});
  // Search torrents via JacRed with multi-indexer aggregation & smart fallback
  app.get('/api/torrents/search', async (req, reply) => {
    const { q, alt, category, tmdbId, type, year, season, episode } = req.query as {
      q?: string;
      alt?: string;
      category?: string;
      tmdbId?: string;
      type?: string;
      year?: string;
      season?: string;
      episode?: string;
    };

    let targetYear = year ? parseInt(year, 10) : 0;
    let targetSeason = season ? parseInt(season, 10) : 0;
    let targetEpisode = episode ? parseInt(episode, 10) : 0;

    if (!q) {
      return reply.code(400).send({ error: 'Query required' });
    }

    // Try to extract season & episode from query string if not passed explicitly
    if (!targetSeason && q) {
      const sMatch = q.match(/\bS(\d{1,2})\b/i) || q.match(/(\d{1,2})\s*сезон/i) || q.match(/сезон\s*(\d{1,2})\b/i);
      if (sMatch) targetSeason = parseInt(sMatch[1], 10);
    }
    if (!targetEpisode && q) {
      const eMatch = q.match(/\bE(\d{1,3})\b/i) || q.match(/(\d{1,3})\s*(?:сери[яий]|выпуск)/i) || q.match(/(?:сери[яий]|выпуск)\s*(\d{1,3})\b/i);
      if (eMatch) targetEpisode = parseInt(eMatch[1], 10);
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
              const fullExp = targetSeason > 0 ? `${exp} ${targetSeason} сезон` : exp;
              if (fullExp.toLowerCase() !== q.trim().toLowerCase() && !extraQueries.includes(fullExp)) {
                extraQueries.push(fullExp);
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

        // Subtitle split by colon or em-dash (e.g. "Человек-паук: Новый день")
        if (q.includes(':') || q.includes(' — ') || q.includes(' - ')) {
          const parts = q.split(/\s*[:—]\s*|\s+-\s+/);
          const mainTitle = parts[0]?.trim();
          const subTitle = parts.slice(1).join(' ').trim();
          if (mainTitle && mainTitle.length >= 3 && mainTitle !== q) {
            if (targetYear > 0) {
              extraQueries.push(`${mainTitle} ${targetYear}`);
            }
            if (subTitle && subTitle.length >= 3) {
              extraQueries.push(`${mainTitle} ${subTitle}`);
            }
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

      // Deduplicate by magnet hash or guid and filter by year relevance
      const seen = new Set<string>();
      const results: TorrentItem[] = [];

      for (const r of rawResults) {
        const link = r.MagnetUri || r.Link || '';
        if (!link) continue;
        const key = link.startsWith('magnet:') ? link.split('&')[0].toLowerCase() : (r.Guid || r.Title);
        if (seen.has(key)) continue;
        seen.add(key);

        const torrentYear = extractTorrentYear(r.Title);
        if (targetYear > 0 && torrentYear !== null) {
          if (type === 'tv') {
            // TV series span multiple years, have reboots, multi-year packs (e.g. 2005-2017)
            // and TMDB dates may not match release tracking. Never discard TV series by year.
          } else {
            // For movies: if the torrent specifies an explicit year that is > 1 year away (e.g. 1993 vs 2026),
            // it is guaranteed to be a different movie. Exclude it!
            const yearDiff = Math.abs(torrentYear - targetYear);
            if (yearDiff > 1) {
              continue;
            }
          }
        }

        const magLink = r.MagnetUri || r.Link || '';
        const hashMatch = magLink.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const torrentHash = hashMatch ? hashMatch[1].toLowerCase() : '';

        results.push({
          id: r.Guid || key,
          title: r.Title,
          tracker: Array.isArray(r.Tracker) ? r.Tracker.join(', ') : r.Tracker,
          category: r.CategoryDesc || 'Unknown',
          size: r.Size,
          sizeFormatted: formatSize(r.Size),
          seeders: r.Seeders || 0,
          peers: r.Peers || 0,
          magnet: magLink,
          link: r.Link || '',
          details: r.Details || '',
          date: r.PublishDate,
          hash: torrentHash,
        });
      }

      function scoreTorrentItem(t: TorrentItem): number {
        let score = t.seeders || 0;
        const title = (t.title || '').toUpperCase();
        const tracker = (t.tracker || '').toLowerCase();
        const hasTrackers = Boolean(t.magnet && t.magnet.includes('&tr='));

        if (targetSeason > 0) {
          // Check season range e.g. 1-25 сезон, 1-45 seasons
          const rangeMatch = t.title.match(/(\d+)\s*[-–—]\s*(\d+)\s*(сезон|season)/i) ||
                             t.title.match(/(сезон[ыа]?|seasons?)\s*[:.]?\s*(\d+)\s*[-–—]\s*(\d+)/i);
          let inRange = false;
          if (rangeMatch) {
            const s1 = parseInt(rangeMatch[1] || rangeMatch[2], 10);
            const s2 = parseInt(rangeMatch[2] || rangeMatch[3], 10);
            const minS = Math.min(s1, s2);
            const maxS = Math.max(s1, s2);
            if (targetSeason >= minS && targetSeason <= maxS) {
              inRange = true;
              score += 6000;
            }
          }

          // Exact season match: e.g. 22 сезон, сезон 22, s22, 22х.., 22x..
          const isExactSeason =
            new RegExp(`\\b${targetSeason}\\s*сезон`, 'i').test(t.title) ||
            new RegExp(`сезон[а-я]*\\s*[:.]?\\s*${targetSeason}\\b`, 'i').test(t.title) ||
            new RegExp(`s0*${targetSeason}(?![0-9])`, 'i').test(t.title) ||
            new RegExp(`\\b0*${targetSeason}[xх]\\d+`, 'i').test(t.title) ||
            new RegExp(`season\\s*0*${targetSeason}\\b`, 'i').test(t.title);

          if (isExactSeason) {
            score += 15000;
          }

          // If neither exact season nor range match, check if it explicitly mentions OTHER season(s)
          if (!isExactSeason && !inRange) {
            const otherSeasonMatch = t.title.match(/\b(\d{1,2})\s*сезон/i) ||
                                     t.title.match(/сезон[а-я]*\s*[:.]?\s*(\d{1,2})\b/i) ||
                                     t.title.match(/\bs0*(\d{1,2})(?![0-9])/i) ||
                                     t.title.match(/\b0*(\d{1,2})[xх]\d+/i);
            if (otherSeasonMatch) {
              const otherS = parseInt(otherSeasonMatch[1], 10);
              if (otherS !== targetSeason) {
                // Heavily penalize releases of wrong seasons so they drop out
                score -= 100000;
              }
            } else {
              // Unspecified season in TV series
              score -= 5000;
            }
          }

          // Episode scoring
          if (targetEpisode > 0) {
            const exactEp =
              new RegExp(`\\b0*${targetEpisode}\\s*(?:выпуск|сери[яий]|эпизод)`, 'i').test(t.title) ||
              new RegExp(`(?:выпуск|сери[яий]|эпизод)\\s*[:#№]?\\s*0*${targetEpisode}\\b`, 'i').test(t.title) ||
              new RegExp(`\\b0*${targetSeason}[xх]0*${targetEpisode}\\b`, 'i').test(t.title) ||
              new RegExp(`s0*${targetSeason}e0*${targetEpisode}\\b`, 'i').test(t.title) ||
              new RegExp(`\\bep?0*${targetEpisode}\\b`, 'i').test(t.title);

            if (exactEp) {
              score += 10000; // Best match: specific episode!
            } else {
              // Check if pack range includes the episode e.g. 1-20 выпуски
              const epRangeMatch = t.title.match(/(\d+)\s*[-–—]\s*(\d+)\s*(?:выпуск|сери)/i);
              if (epRangeMatch) {
                const e1 = parseInt(epRangeMatch[1], 10);
                const e2 = parseInt(epRangeMatch[2], 10);
                if (targetEpisode >= Math.min(e1, e2) && targetEpisode <= Math.max(e1, e2)) {
                  score += 4000; // Pack containing the episode
                } else {
                  score -= 15000; // Pack does NOT contain the episode (e.g. 1-10 when target is 13)
                }
              } else {
                const otherEpMatch = t.title.match(/\b(\d{1,3})\s*(?:выпуск|сери[яий]|эпизод)/i) ||
                                     t.title.match(/(?:выпуск|сери[яий]|эпизод)\s*[:#№]?\\s*(\d{1,3})\b/i);
                if (otherEpMatch && parseInt(otherEpMatch[1], 10) !== targetEpisode) {
                  score -= 20000;
                }
              }
            }
          }
        }

        if (targetYear > 0) {
          const torrentYear = extractTorrentYear(t.title);
          if (torrentYear !== null) {
            if (type === 'tv') {
              if (torrentYear >= targetYear) {
                score += 300;
              }
            } else {
              const diff = Math.abs(torrentYear - targetYear);
              if (diff === 0) {
                score += 2000;
              } else if (diff === 1) {
                score += 1000;
              } else {
                score -= 10000;
              }
            }
          }
        }

        if (tracker.includes('rutracker')) score += 500;
        if (tracker.includes('rutor')) score += 350;
        if (tracker.includes('nnm')) score += 300;
        if (hasTrackers) score += 200;

        if (tracker === 'kinozal' && !hasTrackers) score -= 1000;

        if (title.includes('1080P') || title.includes('WEB-DL') || title.includes('BDRIP') || title.includes('REMUX')) score += 250;
        if (title.includes('720P') || title.includes('HDTV')) score += 100;
        if (/\b\d+\s*[-–—]\s*\d+\s*(выпуск|сери)/i.test(title)) score += 150;

        // Native MKV / MP4 container bonus (direct HW playback on TV, 0% CPU on server)
        if (title.includes('.MKV') || title.includes('[MKV]') || title.includes('.MP4') || title.includes('[MP4]') || title.includes('HEVC') || title.includes('H.264') || title.includes('AVC')) score += 300;

        // SD / SATRip / AVI penalty (requires server transcoding, avoid if MKV exists)
        if (title.includes('SATRIP') || title.includes('TVRIP') || title.includes('XVID') || title.includes('DIVX') || title.includes('.AVI') || title.includes('[AVI]')) score -= 500;

        return score;
      }

      results.sort((a, b) => scoreTorrentItem(b) - scoreTorrentItem(a));

      let finalResults = results;
      if (targetSeason > 0) {
        finalResults = results.filter((r) => scoreTorrentItem(r) > 0);
      }

      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      return { results: finalResults, torrents: finalResults };
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
      // Ensure trackers are present so TorrServer is not relying solely on DHT
      let targetMagnet = magnet;
      for (const tr of FALLBACK_PUBLIC_TRACKERS) {
        if (!targetMagnet.includes(encodeURIComponent(tr)) && !targetMagnet.includes(tr)) {
          targetMagnet += `&tr=${encodeURIComponent(tr)}`;
        }
      }

      // Step 1: Add torrent to TorrServer (ephemeral, not saved to DB)
      const torrUrl = await getActiveTorrServerUrl();
      const addRes = await fetch(`${torrUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          link: targetMagnet,
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

      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const statRes = await fetch(`${torrUrl}/stream?link=${hash}&index=-1&stat`, {
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
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      if (!stat.file_stats?.length) {
        return reply.code(200).send({
          hash,
          name: title,
          files: [],
          pending: true,
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

    const baseTorrUrl = await getActiveTorrServerUrl();
    const torrUrl = new URL(`${baseTorrUrl}/stream/${encodeURIComponent(filename)}?link=${encodeURIComponent(link)}&index=${index || 0}&play`);

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
      const { stdout: probe } = await execAsync(
        `ffprobe -v quiet -print_format json -show_streams -probesize 5000000 -analyzeduration 5000000 "${streamUrl}"`,
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );
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
      // Try to get accurate duration with large probesize
      let dur = 0;

      // Method 1: format-level duration with large probesize
      try {
        const { stdout: fmtResult } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -probesize 5000000 -analyzeduration 5000000 "${streamUrl}"`,
          { timeout: 15000 }
        );
        const fmtData = JSON.parse(fmtResult);
        dur = parseFloat(fmtData.format?.duration || '0');
      } catch {}

      // Method 2: stream-level duration if format is wrong
      if (dur <= 0) {
        try {
          const { stdout: streamResult } = await execAsync(
            `ffprobe -v quiet -print_format json -show_streams -select_streams v:0 "${streamUrl}"`,
            { timeout: 30000 }
          );
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

  // Clean up stale HLS session directories older than 2 hours on startup
  try {
    const tmpDir = os.tmpdir();
    const entries = readdirSync(tmpDir);
    const now = Date.now();
    for (const entry of entries) {
      if (entry.startsWith('hls-')) {
        const fullPath = join(tmpDir, entry);
        try {
          const stat = statSync(fullPath);
          if (now - stat.mtimeMs > 2 * 60 * 60 * 1000) {
            rmSync(fullPath, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  } catch {}

  // Track active FFmpeg sessions
  interface FfmpegSession {
    pid: number;
    hlsDir: string;
    streamKey: string;
    paused: boolean;
    lastRequestedSeg: number;
    lastSegRequestTime: number;
    playbackSeconds: number;
    lastPlayheadUpdate: number;
    lastActivity: number;
    timer?: NodeJS.Timeout;
  }

  const activeSessions = new Map<string, FfmpegSession>();
  const activeSubtitles = new Map<string, { pid: number }>();

  function pauseFfmpeg(sess: FfmpegSession) {
    if (!sess.paused && sess.pid && process.platform !== 'win32') {
      try {
        process.kill(sess.pid, 'SIGSTOP');
        sess.paused = true;
      } catch (err: any) {
        console.error(`[FFmpeg] Pause error pid=${sess.pid}:`, err.message);
      }
    }
  }

  function resumeFfmpeg(sess: FfmpegSession) {
    if (sess.paused && sess.pid && process.platform !== 'win32') {
      try {
        process.kill(sess.pid, 'SIGCONT');
        sess.paused = false;
      } catch (err: any) {
        console.error(`[FFmpeg] Resume error pid=${sess.pid}:`, err.message);
      }
    }
  }

  function checkThrottle(sess: FfmpegSession) {
    try {
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

      const now = Date.now();
      const deltaSec = Math.min(2, Math.max(0, (now - (sess.lastPlayheadUpdate || now)) / 1000));
      sess.lastPlayheadUpdate = now;

      // Detection of TV pause: only trigger if TV hasn't requested any segment in > 30 seconds
      // AND we have segments on disk ready for the TV to download
      const isTvPaused = sess.lastRequestedSeg >= 0 &&
                         maxSeg > sess.lastRequestedSeg &&
                         (now - sess.lastSegRequestTime > 30000);

      if (!isTvPaused) {
        sess.playbackSeconds += deltaSec;
      }

      const effectivePlaySec = Math.max(0, sess.playbackSeconds - 2);
      const playedSeg = Math.floor(effectivePlaySec / 4);

      // Buffer ahead of current playback position
      const currentPos = Math.max(playedSeg, sess.lastRequestedSeg);
      const ahead = maxSeg - currentPos;

      // Adaptive throttling:
      // - PAUSE if TV is paused OR if buffer is >= 15 segments (60s) ahead of playhead
      // - RESUME if TV is active AND buffer drops to <= 8 segments (32s) ahead
      if (isTvPaused || ahead >= 15) {
        pauseFfmpeg(sess);
      } else if (ahead <= 8) {
        resumeFfmpeg(sess);
      }
    } catch (err: any) {
      console.error('[FFmpeg] checkThrottle error:', err.message);
    }
  }

  function retireSession(sessionId: string) {
    const sess = activeSessions.get(sessionId);
    if (!sess) return;
    if (sess.timer) clearInterval(sess.timer);
    if (sess.paused && process.platform !== 'win32') {
      try { process.kill(sess.pid, 'SIGCONT'); } catch {}
    }
    try {
      if (process.platform === 'win32') {
        try { execSync(`taskkill /F /T /PID ${sess.pid}`, { stdio: 'ignore' }); } catch {
          try { process.kill(sess.pid); } catch {}
        }
      } else {
        process.kill(sess.pid, 'SIGKILL');
      }
    } catch {}
    activeSessions.delete(sessionId);
    // Graceful delayed directory removal:
    // Keep directory on disk for 25 seconds so any in-flight segment or playlist requests
    // from the TV get served cleanly without 404 / connection reset!
    setTimeout(() => {
      try {
        rmSync(sess.hlsDir, { recursive: true, force: true });
      } catch {}
    }, 25000);
  }

  function cleanupSession(sessionId: string) {
    retireSession(sessionId);
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
    const paramFilename = (req.params?.filename || '').toLowerCase();
    const isAviRequested = paramFilename.endsWith('.avi');
    let isVideoTranscode = vcodec === 'h264' || isAviRequested;

    const torrUrl = await getActiveTorrServerUrl();

    // If transcode not explicitly requested, check if target file is .avi to prevent browser decode error
    if (!isVideoTranscode && link) {
      try {
        const statRes = await fetch(`${torrUrl}/stream?link=${encodeURIComponent(link)}&index=-1&stat`, {
          signal: AbortSignal.timeout(1000),
        });
        if (statRes.ok) {
          const statData = (await statRes.json()) as any;
          const targetFile = statData.file_stats?.find((f: any) => String(f.id) === String(index || 0));
          if (targetFile?.path?.toLowerCase().endsWith('.avi')) {
            isVideoTranscode = true;
          }
        }
      } catch {}
    }

    const streamUrl = `${torrUrl}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
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

    if (!existingSession) {
      // Clean up any other active transcoding sessions for the same torrent file (prevent multiple concurrent transcoders)
      for (const [sId, sess] of activeSessions.entries()) {
        if (sess.streamKey === streamKey && sId !== sessionId) {
          retireSession(sId);
        }
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
        '-threads', '1',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-probesize', '10000000',
        '-analyzeduration', '10000000',
      ];
      // Input seek with -accurate_seek ensures exact second seeking without keyframe undershoot
      if (seekTime > 0) {
        ffmpegArgs.push('-accurate_seek', '-ss', String(Math.floor(seekTime)));
      }
      ffmpegArgs.push('-i', streamUrl);
      ffmpegArgs.push(
        '-map', '0:v:0',
        '-map', `0:a:${audioIndex}`,
      );

      if (isVideoTranscode) {
        // Samsung Tizen TVs (2018+) dropped MPEG-4 Part 2/XviD hardware decoders.
        // If Intel QuickSync (VA-API) hardware is available, use hardware encoder (1-2% CPU).
        // Otherwise, fallback to ultrafast libx264 limited to 1 thread to protect CPU.
        if (isVaapiAvailable()) {
          ffmpegArgs.push(
            '-vaapi_device', '/dev/dri/renderD128',
            '-vf', 'format=nv12,hwupload',
            '-c:v', 'h264_vaapi',
            '-qp', '24',
          );
        } else {
          ffmpegArgs.push(
            '-threads', '1',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-crf', '22',
            '-pix_fmt', 'yuv420p',
          );
        }
      } else {
        ffmpegArgs.push('-c:v', 'copy');
      }

      ffmpegArgs.push(
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-g', '50',
        '-keyint_min', '25',
        '-force_key_frames', 'expr:gte(t,n_forced*4)',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', join(hlsDir, 'seg-%d.ts'),
        '-y',
        playlistPath,
      );
      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let ffmpegClosed = false;
      try {
        if (ffmpeg.pid && typeof os.setPriority === 'function') {
          os.setPriority(ffmpeg.pid, 15);
        }
      } catch {}

      const now = Date.now();
      const sess: FfmpegSession = {
        pid: ffmpeg.pid!,
        hlsDir,
        streamKey,
        paused: false,
        lastRequestedSeg: -1,
        lastSegRequestTime: now,
        playbackSeconds: 0,
        lastPlayheadUpdate: now,
        lastActivity: now,
      };
      activeSessions.set(sessionId, sess);

      // Inactivity & throttling loop: checks every 1000ms
      sess.timer = setInterval(() => {
        if (Date.now() - sess.lastActivity > 600000) {
          console.log(`[FFmpeg] Session ${sessionId} timed out after 10m inactivity`);
          cleanupSession(sessionId);
          return;
        }
        checkThrottle(sess);
      }, 1000);

      ffmpeg.on('error', (err) => {
        console.error(`[FFmpeg] Session ${sessionId} spawn error:`, err.message);
        cleanupSession(sessionId);
      });
      ffmpeg.on('close', (code, signal) => {
        ffmpegClosed = true;
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
    }

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
        if (activeSessions.get(sessionId)?.paused === undefined && !existsSync(playlistPath)) {
          // If session was closed or failed before producing manifest, resolve immediately
          const s = activeSessions.get(sessionId);
          if (!s && attempts > 5) {
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
  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/hls/:filename', handler: handleHls });

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
      let subtitles: Array<{ id: number; lang: string; label: string }> = [];
      try {
        const { stdout: probe } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${streamUrl}"`,
          { timeout: 30000, maxBuffer: 1024 * 1024 }
        );
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
      sess.lastSegRequestTime = Date.now();
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

    try {
      if (!existsSync(segPath)) {
        return reply.code(404).send({ error: 'Segment not found' });
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
    } catch {
      return reply.code(404).send({ error: 'Segment not found' });
    }
  };

  app.route({ method: ['GET', 'HEAD'], url: '/api/torrents/hls-seg', handler: handleHlsSeg });

  // Get TorrServer status
  app.get('/api/torrents/torrserver/status', async () => {
    try {
      const torrUrl = await getActiveTorrServerUrl();
      const res = await fetch(`${torrUrl}/echo`, { signal: AbortSignal.timeout(2000) });
      const version = await res.text();
      return { online: true, version, url: torrUrl };
    } catch {
      return { online: false, url: config.torrserver.url };
    }
  });

  // Proxy TorrServer /torrents API (for buffer polling from TV/browser)
  app.post('/api/torrents/torrserver/list', async () => {
    try {
      const torrUrl = await getActiveTorrServerUrl();
      const res = await fetch(`${torrUrl}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
        signal: AbortSignal.timeout(3000),
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
