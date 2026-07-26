import type { FastifyInstance } from 'fastify';

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

// Parse M3U8 playlist
function parseM3U(content: string): IptvChannel[] {
  const channels: IptvChannel[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      // Parse channel info from EXTINF line
      const infoMatch = line.match(/#EXTINF:-?\d+\s+(.*),(.*)/);
      if (!infoMatch) continue;

      const attrsStr = infoMatch[1];
      const name = infoMatch[2].trim();

      // Extract attributes
      const logoMatch = attrsStr.match(/tvg-logo="([^"]*)"/);
      const groupMatch = attrsStr.match(/group-title="([^"]*)"/);
      const tvgIdMatch = attrsStr.match(/tvg-id="([^"]*)"/);
      const tvgNameMatch = attrsStr.match(/tvg-name="([^"]*)"/);

      // Get URL from next line
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
        channels.push({
          id: `ch-${channels.length + 1}`,
          name: name || 'Unknown Channel',
          url,
          logo: logoMatch?.[1] || '',
          group: groupMatch?.[1] || 'Uncategorized',
          tvgId: tvgIdMatch?.[1] || '',
          tvgName: tvgNameMatch?.[1] || name,
        });
      }
    }
  }

  return channels;
}

// Parse EPG XML
function parseEpg(xmlContent: string): Map<string, EpgProgram[]> {
  const programs = new Map<string, EpgProgram[]>();

  // Simple XML parser for EPG
  const programmeRegex = /<programme\s+start="([^"]*)"\s+stop="([^"]*)"\s+channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
  const titleRegex = /<title[^>]*>([^<]*)<\/title>/;
  const descRegex = /<desc[^>]*>([^<]*)<\/desc>/;

  let match;
  while ((match = programmeRegex.exec(xmlContent)) !== null) {
    const start = match[1];
    const stop = match[2];
    const channel = match[3];
    const content = match[4];

    const titleMatch = titleRegex.exec(content);
    const descMatch = descRegex.exec(content);

    const program: EpgProgram = {
      channel,
      title: titleMatch?.[1] || 'Unknown Program',
      start,
      stop,
      desc: descMatch?.[1],
    };

    if (!programs.has(channel)) {
      programs.set(channel, []);
    }
    programs.get(channel)!.push(program);
  }

  return programs;
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

export function iptvRoutes(app: FastifyInstance) {
  // Parse M3U8 playlist from URL
  app.post('/api/iptv/parse', async (req, reply) => {
    const { url } = req.body as { url?: string };

    if (!url) {
      return reply.code(400).send({ error: 'URL required' });
    }

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: 'Failed to fetch playlist' });
      }

      const content = await res.text();
      const channels = parseM3U(content);

      // Extract unique groups
      const groups = [...new Set(channels.map(ch => ch.group))];

      return {
        channels,
        groups,
        total: channels.length,
      };
    } catch (err: any) {
      console.error('IPTV parse error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Parse EPG from URL
  app.post('/api/iptv/epg', async (req, reply) => {
    const { url } = req.body as { url?: string };

    if (!url) {
      return reply.code(400).send({ error: 'URL required' });
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

      const epgData = parseEpg(content);

      // Convert Map to object for JSON response
      const epgObject: Record<string, Array<{ title: string; start: string; stop: string; desc?: string; startTime: string; startDate: string; stopTime: string; stopDate: string }>> = {};

      for (const [channel, programs] of epgData.entries()) {
        epgObject[channel] = programs.map(p => {
          const startFormatted = formatEpgTime(p.start);
          const stopFormatted = formatEpgTime(p.stop);
          return {
            title: p.title,
            start: p.start,
            stop: p.stop,
            desc: p.desc,
            startTime: startFormatted.time,
            startDate: startFormatted.date,
            stopTime: stopFormatted.time,
            stopDate: stopFormatted.date,
          };
        });
      }

      return {
        epg: epgObject,
        channels: Object.keys(epgObject).length,
      };
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
      const epgData = parseEpg(content);
      const programs = epgData.get(channelId) || [];

      const now = new Date();
      const nowStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '00';

      let current: EpgProgram | null = null;
      let next: EpgProgram | null = null;

      for (let i = 0; i < programs.length; i++) {
        const p = programs[i];
        if (p.start <= nowStr && p.stop > nowStr) {
          current = p;
          if (i + 1 < programs.length) {
            next = programs[i + 1];
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
