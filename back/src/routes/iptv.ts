import type { FastifyInstance } from 'fastify';
import { gunzipSync } from 'zlib';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, URL } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read pre-bundled Russian IPTV playlist as zero-dependency offline fallback
function getBundledPlaylist(): string {
  const candidates = [
    join(process.cwd(), 'dist', 'assets', 'default_playlist.m3u'),
    join(process.cwd(), 'src', 'assets', 'default_playlist.m3u'),
    join(process.cwd(), 'public', 'iptv', 'playlist.m3u'),
    join(process.cwd(), 'back', 'src', 'assets', 'default_playlist.m3u'),
    join(process.cwd(), 'back', 'public', 'iptv', 'playlist.m3u'),
    join(__dirname, 'assets', 'default_playlist.m3u'),
    join(__dirname, '..', 'assets', 'default_playlist.m3u'),
    join(__dirname, '..', 'src', 'assets', 'default_playlist.m3u'),
    join(__dirname, '..', '..', 'src', 'assets', 'default_playlist.m3u'),
    join(__dirname, '..', 'public', 'iptv', 'playlist.m3u'),
    join(__dirname, '..', '..', 'public', 'iptv', 'playlist.m3u'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const text = readFileSync(c, 'utf-8');
        if (text && text.includes('#EXTM3U')) {
          return text;
        }
      } catch (err: any) {
        console.warn('[IPTV] Could not read candidate bundled playlist at', c, err.message);
      }
    }
  }
  return '';
}

interface IptvChannel {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  tvgId: string;
  tvgName: string;
  epgUrl?: string;
}

interface EpgProgram {
  channel: string;
  title: string;
  start: string;
  stop: string;
  desc?: string;
}

// Parse M3U8 playlist with flexible EXTINF matching and encoding tolerance
function parseM3U(content: string): { channels: IptvChannel[]; epgUrl?: string } {
  const channels: IptvChannel[] = [];
  const lines = content.split(/\r?\n/);
  let epgUrl: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTM3U')) {
      const epgMatch = line.match(/(?:url-tvg|x-tvg-url)="([^"]*)"/i);
      if (epgMatch) {
        epgUrl = epgMatch[1].trim();
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Parse channel info from EXTINF line
      // Handles all variations:
      // #EXTINF:-1,Первый канал
      // #EXTINF:0,Первый канал
      // #EXTINF:-1 tvg-id="id1" tvg-name="One" group-title="Общие",Первый канал
      // #EXTINF:10.5 tvg-name="Channel",Channel
      const infoMatch = line.match(/#EXTINF:(-?\d+(?:\.\d+)?)\s*(.*?),(.*)$/);
      let attrsStr = '';
      let name = '';

      if (infoMatch) {
        attrsStr = infoMatch[2];
        name = infoMatch[3].trim();
      } else {
        const fallbackMatch = line.match(/#EXTINF:[^,]*,(.*)/);
        if (fallbackMatch) {
          name = fallbackMatch[1].trim();
          attrsStr = line.slice(8, line.lastIndexOf(','));
        } else {
          name = line.replace(/^#EXTINF:[^,]*/, '').trim() || `Канал ${channels.length + 1}`;
        }
      }

      // Extract attributes (case-insensitive)
      const logoMatch = attrsStr.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = attrsStr.match(/group-title="([^"]*)"/i);
      const tvgIdMatch = attrsStr.match(/tvg-id="([^"]*)"/i);
      const tvgNameMatch = attrsStr.match(/tvg-name="([^"]*)"/i);

      // Get URL from next non-comment line (handles #EXTVLCOPT etc.)
      let url = '';
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          url = nextLine;
          break;
        }
        if (nextLine.startsWith('#EXTINF:')) break;
      }

      if (url) {
        // Skip promo / telegram links that are not streamable
        if (url.startsWith('https://t.me/') || url.startsWith('http://t.me/')) {
          continue;
        }
        channels.push({
          id: `ch-${channels.length + 1}`,
          name: name || `Канал ${channels.length + 1}`,
          url,
          logo: logoMatch?.[1] || '',
          group: groupMatch?.[1] || 'Общие',
          tvgId: tvgIdMatch?.[1] || '',
          tvgName: tvgNameMatch?.[1] || name,
        });
      }
    }
  }

  return { channels, epgUrl };
}

function parseXmltvDate(str: string): number {
  const m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return 0;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const sec = parseInt(m[6], 10);
  let utcMs = Date.UTC(year, month, day, hour, min, sec);
  if (m[7]) {
    const tzSign = m[7] === '-' ? -1 : 1;
    const tzHours = parseInt(m[8], 10);
    const tzMins = parseInt(m[9], 10);
    const tzOffsetMs = tzSign * (tzHours * 60 + tzMins) * 60 * 1000;
    utcMs -= tzOffsetMs;
  }
  return utcMs;
}

// Parse EPG XML — returns programs by channel ID, channel name→ID mapping, and icons
function parseEpg(xmlContent: string): { programs: Map<string, EpgProgram[]>; channelMap: Map<string, string>; iconMap: Map<string, string> } {
  const programs = new Map<string, EpgProgram[]>();
  const channelMap = new Map<string, string>(); // name → id mapping
  const iconMap = new Map<string, string>(); // id → icon URL

  // Parse channel definitions: <channel id="123"><display-name>Channel Name</display-name><icon src="..."/></channel>
  const channelRegex = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g;
  const displayNameRegex = /<display-name[^>]*>([^<]*)<\/display-name>/g;
  const iconRegex = /<icon\s+src="([^"]*)"[^>]*\/?>/;

  let channelMatch;
  while ((channelMatch = channelRegex.exec(xmlContent)) !== null) {
    const channelId = channelMatch[1];
    const channelContent = channelMatch[2];

    // Extract icon
    const iconMatch = iconRegex.exec(channelContent);
    if (iconMatch) {
      iconMap.set(channelId, iconMatch[1]);
    }

    let nameMatch;
    while ((nameMatch = displayNameRegex.exec(channelContent)) !== null) {
      const name = nameMatch[1].trim();
      if (name) {
        channelMap.set(name.toLowerCase(), channelId);
      }
    }
  }

  // Parse programmes with smart cutoff: current program + upcoming programs for next 10 hours
  const nowMs = Date.now();
  const cutoffMs = nowMs - 45 * 60 * 1000; // Ended less than 45m ago or currently airing
  const maxFutureMs = nowMs + 10 * 3600 * 1000; // Next 10 hours (covers 8h grid + margin)

  const programmeRegex = /<programme\s+start="([^"]*)"\s+stop="([^"]*)"\s+channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
  const titleRegex = /<title[^>]*>([^<]*)<\/title>/;

  let match;
  while ((match = programmeRegex.exec(xmlContent)) !== null) {
    const start = match[1];
    const stop = match[2];
    const channel = match[3];

    const stopMs = parseXmltvDate(stop);
    const startMs = parseXmltvDate(start);

    // Skip programs that ended more than 45 min ago or start beyond 10h in future
    if (stopMs < cutoffMs || startMs > maxFutureMs) continue;

    if (!programs.has(channel)) {
      programs.set(channel, []);
    }
    const channelList = programs.get(channel)!;
    if (channelList.length >= 8) continue; // Current + up to 7 upcoming programs

    const content = match[4];
    const titleMatch = titleRegex.exec(content);

    const program: EpgProgram = {
      channel,
      title: titleMatch?.[1] || 'Unknown Program',
      start,
      stop,
    };

    channelList.push(program);
  }

  return { programs, channelMap, iconMap };
}

// Format EPG time (20240101120000 +0000) to readable format
function formatEpgTime(timeStr: string): { time: string; date: string } {
  // Parse YYYYMMDDHHMMSS format
  const match = timeStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return { time: '00:00', date: '' };

  const [_, year, month, day, hours, minutes] = match;
  return {
    time: `${hours}:${minutes}`,
    date: `${day}.${month}.${year}`,
  };
}

// Rewrite M3U8 playlist manifests so all sub-playlists and media segments route through /api/iptv/stream proxy
export function rewriteM3U8(manifestText: string, baseUrlStr: string): string {
  const lines = manifestText.split(/\r?\n/);
  const rewritten: string[] = [];

  let baseParsed: URL | null = null;
  try {
    baseParsed = new URL(baseUrlStr);
  } catch {}

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) {
      rewritten.push(rawLine);
      continue;
    }

    if (trimmed.startsWith('#')) {
      // Rewrite URIs inside tags like #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
      const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
        try {
          if (uri.startsWith('/api/iptv/stream')) return match;
          const resolved = new URL(uri, baseUrlStr);
          if (baseParsed?.search && !resolved.search) {
            resolved.search = baseParsed.search;
          }
          return `URI="/api/iptv/stream?url=${encodeURIComponent(resolved.toString())}"`;
        } catch {
          return match;
        }
      });
      rewritten.push(rewrittenTag);
    } else {
      // Media segment (.ts, .m4s) or sub-playlist (.m3u8)
      if (trimmed.startsWith('/api/iptv/stream')) {
        rewritten.push(rawLine);
        continue;
      }
      try {
        const resolved = new URL(trimmed, baseUrlStr);
        if (baseParsed?.search && !resolved.search) {
          resolved.search = baseParsed.search;
        }
        rewritten.push(`/api/iptv/stream?url=${encodeURIComponent(resolved.toString())}`);
      } catch {
        rewritten.push(rawLine);
      }
    }
  }

  return rewritten.join('\n');
}

export function iptvRoutes(app: FastifyInstance) {
  // CORS Preflight for IPTV stream proxy
  app.options('/api/iptv/stream', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header('Access-Control-Allow-Headers', '*');
    reply.header('Access-Control-Max-Age', '86400');
    return reply.code(204).send();
  });

  // Dedicated IPTV stream proxy: rewrites manifests, forwards headers/CORS, and pipes media segments
  app.get('/api/iptv/stream', async (req, reply) => {
    const { url: rawUrl } = req.query as { url?: string };
    if (!rawUrl || typeof rawUrl !== 'string') {
      return reply.code(400).send({ error: 'Missing stream url' });
    }

    let targetUrl = rawUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'http://' + targetUrl;
    }

    // Determine appropriate User-Agent based on stream host
    let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    if (targetUrl.includes('zabava') || targetUrl.includes('wink') || targetUrl.includes('ngenix')) {
      userAgent = 'WINK/1.40.1 (AndroidTV/9) HlsWinkPlayer';
    } else if (targetUrl.includes('trkcrimea') || targetUrl.includes('bonus-tv') || targetUrl.includes('tvzvezda')) {
      userAgent = 'VLC/3.0.18 LibVLC/3.0.18';
    }

    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      'Accept': '*/*',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range as string;
    }

    try {
      const upstreamRes = await axios.get(targetUrl, {
        headers,
        responseType: 'stream',
        validateStatus: () => true,
        maxRedirects: 5,
        timeout: 25000,
      });

      // Forward CORS headers
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Access-Control-Allow-Headers', '*');

      const contentType = String(upstreamRes.headers['content-type'] || '').toLowerCase();
      const isM3U8 = targetUrl.toLowerCase().includes('.m3u8') ||
                    targetUrl.toLowerCase().includes('.m3u') ||
                    contentType.includes('mpegurl');

      if (isM3U8) {
        // Collect manifest body
        const chunks: Buffer[] = [];
        for await (const chunk of upstreamRes.data) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const text = Buffer.concat(chunks).toString('utf-8');

        if (upstreamRes.status >= 400 || (!text.includes('#EXTM3U') && upstreamRes.status !== 200)) {
          return reply.code(upstreamRes.status).send(text);
        }

        const finalUrl = (upstreamRes.request as any)?.res?.responseUrl || targetUrl;
        const rewritten = rewriteM3U8(text, finalUrl);

        reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        return reply.code(upstreamRes.status).send(rewritten);
      }

      // Binary media segments (TS, MP4, AAC, M4S, keys)
      reply.status(upstreamRes.status);
      if (upstreamRes.headers['content-type']) {
        reply.header('Content-Type', upstreamRes.headers['content-type']);
      } else if (targetUrl.endsWith('.ts')) {
        reply.header('Content-Type', 'video/mp2t');
      }
      if (upstreamRes.headers['content-length']) {
        reply.header('Content-Length', upstreamRes.headers['content-length']);
      }
      if (upstreamRes.headers['content-range']) {
        reply.header('Content-Range', upstreamRes.headers['content-range']);
      }
      if (upstreamRes.headers['accept-ranges']) {
        reply.header('Accept-Ranges', upstreamRes.headers['accept-ranges']);
      }

      // Cleanup upstream stream if client disconnects early
      req.raw.on('close', () => {
        try {
          upstreamRes.data.destroy();
        } catch {}
      });

      return reply.send(upstreamRes.data);
    } catch (err: any) {
      if (!reply.raw.headersSent) {
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.code(502).send({ error: `Ошибка прокси потока: ${err.message}` });
      }
    }
  });

  // Dedicated endpoint for default pre-bundled playlist
  app.get('/api/iptv/default', async (_req, reply) => {
    const bundled = getBundledPlaylist();
    if (!bundled) {
      return reply.code(404).send({ error: 'Плейлист по умолчанию не найден на сервере' });
    }
    const { channels, epgUrl } = parseM3U(bundled);
    const groups = [...new Set(channels.map(ch => ch.group))];
    return {
      channels,
      groups,
      epgUrl: epgUrl || '',
      total: channels.length,
      source: 'bundled',
    };
  });

  // Serve raw default playlist file
  app.get('/iptv/playlist.m3u', async (_req, reply) => {
    const bundled = getBundledPlaylist();
    if (!bundled) {
      return reply.code(404).send('#EXTM3U\n');
    }
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(bundled);
  });

  // Parse M3U8 playlist from URL
  app.post('/api/iptv/parse', async (req, reply) => {
    let { url } = req.body as { url?: string };

    const rawUrl = (url || '').trim();
    const isDefaultRequest =
      !rawUrl ||
      rawUrl === 'default' ||
      rawUrl === 'local' ||
      rawUrl.includes('loganettv.github.io') ||
      rawUrl.includes('default_playlist') ||
      rawUrl.includes('/iptv/playlist.m3u');

    // If it's the default playlist, serve pre-bundled playlist instantly without hitting external/blocked networks
    if (isDefaultRequest) {
      const bundled = getBundledPlaylist();
      if (bundled) {
        console.log('[IPTV] Serving bundled default playlist directly (0 network requests)');
        const { channels, epgUrl } = parseM3U(bundled);
        const groups = [...new Set(channels.map(ch => ch.group))];
        return {
          channels,
          groups,
          epgUrl: epgUrl || '',
          total: channels.length,
          source: 'bundled',
        };
      }
    }

    if (!rawUrl) {
      return reply.code(400).send({ error: 'Не указан URL плейлиста' });
    }

    url = rawUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
          },
          signal: AbortSignal.timeout(30000),
        });
      } catch (fetchErr: any) {
        // If initial fetch failed, try fallback with VLC User-Agent
        res = await fetch(url, {
          headers: {
            'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
            'Accept': '*/*',
          },
          signal: AbortSignal.timeout(30000),
        });
      }

      // If blocked by User-Agent (401, 403, 406), retry with VLC User-Agent
      if (res.status === 401 || res.status === 403 || res.status === 406) {
        try {
          const vlcRes = await fetch(url, {
            headers: {
              'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
              'Accept': '*/*',
            },
            signal: AbortSignal.timeout(20000),
          });
          if (vlcRes.ok) {
            res = vlcRes;
          }
        } catch {}
      }

      if (!res.ok) {
        // If remote server failed (403, 404, 500) and we have bundled fallback, use it
        const bundled = getBundledPlaylist();
        if (bundled && (url.includes('github') || url.includes('loganettv') || url.includes('iptv-org'))) {
          console.log('[IPTV] Remote returned HTTP', res.status, '— using bundled playlist fallback');
          const { channels, epgUrl } = parseM3U(bundled);
          const groups = [...new Set(channels.map(ch => ch.group))];
          return {
            channels,
            groups,
            epgUrl: epgUrl || '',
            total: channels.length,
            source: 'bundled-fallback',
          };
        }
        return reply.code(res.status).send({
          error: `Сервер плейлиста вернул ошибку: HTTP ${res.status} (${res.statusText || 'Forbidden/Not Found'})`,
        });
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      let content = '';

      // Auto-detect GZIP (magic bytes 0x1f, 0x8b)
      if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        try {
          content = gunzipSync(buffer).toString('utf-8');
        } catch {
          content = buffer.toString('utf-8');
        }
      } else {
        // Handle UTF-8 with Windows-1251 fallback
        const utf8Text = buffer.toString('utf-8');
        if (utf8Text.includes('\uFFFD')) {
          try {
            const cp1251 = new TextDecoder('windows-1251').decode(buffer);
            if (!cp1251.includes('\uFFFD')) {
              content = cp1251;
            } else {
              content = utf8Text;
            }
          } catch {
            content = utf8Text;
          }
        } else {
          content = utf8Text;
        }
      }

      const { channels, epgUrl } = parseM3U(content);

      if (channels.length === 0) {
        const bundled = getBundledPlaylist();
        if (bundled) {
          console.log('[IPTV] 0 channels parsed from remote, recovering with bundled playlist');
          const b = parseM3U(bundled);
          const groups = [...new Set(b.channels.map(ch => ch.group))];
          return {
            channels: b.channels,
            groups,
            epgUrl: b.epgUrl || '',
            total: b.channels.length,
            source: 'bundled-fallback',
          };
        }
        return reply.code(422).send({
          error: 'В плейлисте не найдено доступных каналов (неверный формат или пустой файл)',
        });
      }

      // Extract unique groups
      const groups = [...new Set(channels.map(ch => ch.group))];

      return {
        channels,
        groups,
        epgUrl: epgUrl || '',
        total: channels.length,
      };
    } catch (err: any) {
      console.warn('[IPTV] Remote playlist fetch error for', url, ':', err.message);
      // Auto-fallback: If remote fetch failed (e.g. RKN block, timeout, DNS error)
      const bundled = getBundledPlaylist();
      if (bundled) {
        console.log('[IPTV] Recovering with bundled default playlist');
        const { channels, epgUrl } = parseM3U(bundled);
        const groups = [...new Set(channels.map(ch => ch.group))];
        return {
          channels,
          groups,
          epgUrl: epgUrl || '',
          total: channels.length,
          source: 'bundled-fallback',
        };
      }
      return reply.code(500).send({ error: `Ошибка загрузки плейлиста: ${err.message}` });
    } finally {
      if (prevTls !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
      }
    }
  });

interface CachedEpg {
  data: { epg: Record<string, any>; channelMap: Record<string, string>; iconMap: Record<string, string>; channels: number };
  timestamp: number;
}
const epgCache = new Map<string, CachedEpg>();
const EPG_CACHE_TTL = 3600 * 4 * 1000; // 4 hours

  // Parse EPG from URL
  app.post('/api/iptv/epg', async (req, reply) => {
    let { url } = req.body as { url?: string };

    if (!url) {
      return reply.code(400).send({ error: 'URL required' });
    }

    // Rewrite iptvx.one/EPG to official lite version to prevent exceeding V8 512MB string buffer
    if (/iptvx\.one\/(epg)?$/i.test(url)) {
      url = 'https://iptvx.one/epg/epg_lite.xml.gz';
    }

    // Check cache
    const cached = epgCache.get(url);
    if (cached && (Date.now() - cached.timestamp < EPG_CACHE_TTL)) {
      return cached.data;
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Encoding': 'identity',
        },
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: 'Failed to fetch EPG' });
      }

      // Get content as buffer, handle gzip
      const buffer = await res.arrayBuffer();
      let content: string;

      // Check if gzipped (magic bytes 1f 8b)
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const { gunzipSync } = await import('zlib');
        content = gunzipSync(Buffer.from(buffer)).toString('utf-8');
      } else {
        content = Buffer.from(buffer).toString('utf-8');
      }

      const { programs, channelMap, iconMap } = parseEpg(content);

      // Convert Maps to objects for JSON response (lightweight payload for fast UI rendering)
      const epgObject: Record<string, Array<{ title: string; start: string; stop: string; startTime: string; stopTime: string }>> = {};

      for (const [channel, channelPrograms] of programs.entries()) {
        epgObject[channel] = channelPrograms.map(p => {
          const startFormatted = formatEpgTime(p.start);
          const stopFormatted = formatEpgTime(p.stop);
          return {
            title: p.title,
            start: p.start,
            stop: p.stop,
            startTime: startFormatted.time,
            stopTime: stopFormatted.time,
          };
        });
      }

      // Convert channelMap to object (name → id)
      const channelMapObject: Record<string, string> = {};
      for (const [name, id] of channelMap.entries()) {
        channelMapObject[name] = id;
      }

      // Convert iconMap to object (id → icon URL)
      const iconMapObject: Record<string, string> = {};
      for (const [id, icon] of iconMap.entries()) {
        iconMapObject[id] = icon;
      }

      const result = {
        epg: epgObject,
        channelMap: channelMapObject,
        iconMap: iconMapObject,
        channels: Object.keys(epgObject).length,
      };

      epgCache.set(url, { data: result, timestamp: Date.now() });

      return result;
    } catch (err: any) {
      console.error('EPG parse error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Get current program for channel
  app.post('/api/iptv/now', async (req, reply) => {
    const { epgUrl, channelId } = req.body as { epgUrl?: string; channelId?: string };

    if (!epgUrl || !channelId) {
      return reply.code(400).send({ error: 'EPG URL and channel ID required' });
    }

    try {
      const res = await fetch(epgUrl, {
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        return { current: null, next: null };
      }

      const content = await res.text();
      const { programs } = parseEpg(content);
      const channelPrograms = programs.get(channelId) || [];

      const now = new Date();
      const nowStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '00';

      let current: EpgProgram | null = null;
      let next: EpgProgram | null = null;

      for (let i = 0; i < channelPrograms.length; i++) {
        const p = channelPrograms[i];
        if (p.start <= nowStr && p.stop > nowStr) {
          current = p;
          if (i + 1 < channelPrograms.length) {
            next = channelPrograms[i + 1];
          }
          break;
        }
      }

      return {
        current: current ? {
          title: current.title,
          start: formatEpgTime(current.start).time,
          stop: formatEpgTime(current.stop).time,
          desc: current.desc,
        } : null,
        next: next ? {
          title: next.title,
          start: formatEpgTime(next.start).time,
          stop: formatEpgTime(next.stop).time,
        } : null,
      };
    } catch (err: any) {
      return { current: null, next: null };
    }
  });
}
