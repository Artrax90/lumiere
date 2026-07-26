import type { FastifyInstance } from 'fastify';

let jacredUrl = process.env.jacredUrl || 'http://ns3bg91xvuqfvq9h.cfhttp.top';
const TORRSERVER_URL = process.env.TORRSERVER_URL || 'http://localhost:8090';

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

export function torrentRoutes(app: FastifyInstance) {
  // Search torrents via JacRed
  app.get('/api/torrents/search', async (req, reply) => {
    const { q, category } = req.query as { q?: string; category?: string };

    if (!q) {
      return reply.code(400).send({ error: 'Query required' });
    }

    try {
      const catParam = category ? `&category[]=${category}` : '';
      const url = `${jacredUrl}/api/v2.0/indexers/all/results?query=${encodeURIComponent(q)}${catParam}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: 'JacRed error' });
      }

      const data = await res.json() as { Results?: JacRedResult[] };
      const results: TorrentItem[] = (data.Results || [])
        .filter((r) => r.MagnetUri || r.Link)
        .map((r) => ({
          id: r.Guid,
          title: r.Title,
          tracker: Array.isArray(r.Tracker) ? r.Tracker.join(', ') : r.Tracker,
          category: r.CategoryDesc || 'Unknown',
          size: r.Size,
          sizeFormatted: formatSize(r.Size),
          seeders: r.Seeders,
          peers: r.Peers,
          magnet: r.MagnetUri || '',
          link: r.Link || '',
          details: r.Details || '',
          date: r.PublishDate,
        }))
        .sort((a, b) => b.seeders - a.seeders);

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
      });

      if (!addRes.ok) {
        const errText = await addRes.text();
        return reply.code(500).send({ error: `TorrServer add error: ${errText}` });
      }

      const addData = await addRes.json() as { hash?: string };
      const hash = addData.hash;

      if (!hash) {
        return reply.code(500).send({ error: 'No hash returned from TorrServer' });
      }

      // Step 2: Get file list via stat endpoint
      // Use hash directly (not magnet) for stat
      const statRes = await fetch(`${TORRSERVER_URL}/stream?link=${hash}&index=-1&stat`);
      if (!statRes.ok) {
        return reply.code(500).send({ error: 'TorrServer stat error' });
      }

      const stat = await statRes.json() as {
        file_stats?: Array<{ id: number; path: string; length: number }>;
        hash?: string;
        name?: string;
        stat?: number;
      };

      if (!stat.file_stats?.length) {
        return reply.code(200).send({
          hash,
          name: title,
          files: [],
          error: 'Torrent is loading. Try again in a few seconds.',
        });
      }

      // Filter out non-video files
      const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m4v'];
      const files: TorrentFile[] = stat.file_stats
        .filter((f) => {
          const ext = f.path.toLowerCase().split('.').pop();
          return ext && videoExtensions.some((ve) => ext.endsWith(ve.replace('.', '')));
        })
        .map((f) => ({
          id: f.id,
          name: f.path.split('/').pop() || f.path,
          path: f.path,
          size: f.length,
          sizeFormatted: formatSize(f.length),
          // Stream URL goes through our proxy
          streamUrl: `/api/torrents/hls?link=${encodeURIComponent(magnet)}&index=${f.id}`,
        }));

      return {
        hash,
        name: stat.name || title,
        files,
      };
    } catch (err: any) {
      console.error('TorrServer error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Proxy TorrServer streams (direct)
  app.get('/api/torrents/proxy', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    try {
      const url = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: 'TorrServer stream error' });
      }

      // Forward the response headers with CORS
      const contentType = res.headers.get('content-type') || 'video/mp4';
      const contentLength = res.headers.get('content-length');
      reply.header('Content-Type', contentType);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Range');
      reply.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      if (contentLength) reply.header('Content-Length', contentLength);

      // Pipe the response body directly
      return reply.send(res.body);
    } catch (err: any) {
      console.error('TorrServer proxy error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

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
        `ffprobe -v quiet -print_format json -show_streams "${streamUrl}"`,
        { timeout: 30000, maxBuffer: 1024 * 1024 }
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
      console.error('Track probe error:', err.message);
      return reply.code(500).send({ error: err.message });
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
      const result = execSync(
        `ffprobe -v quiet -print_format json -show_format "${streamUrl}"`,
        { timeout: 15000 }
      ).toString();

      const data = JSON.parse(result);
      const duration = parseFloat(data.format?.duration || '0');

      return { duration, formatted: formatTime(duration) };
    } catch (err: any) {
      console.error('FFprobe error:', err.message);
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

  // HLS transcoding endpoint — remuxes MKV/AVI to HLS via FFmpeg
  // Track active FFmpeg sessions
  const activeSessions = new Map<string, { pid: number; hlsDir: string }>();

  app.get('/api/torrents/hls', async (req, reply) => {
    const { link, index, audio } = req.query as { link?: string; index?: string; audio?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    const audioIndex = parseInt(audio || '0', 10) || 0;
    const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
    const { createHash } = await import('crypto');
    // Include audio index in session ID so different audio tracks get different sessions
    const sessionId = createHash('sha256').update(`${link}-${index}-a${audioIndex}`).digest('hex').slice(0, 32);
    const hlsDir = `/tmp/hls-${sessionId}`;

    const { mkdirSync, existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const playlistPath = join(hlsDir, 'playlist.m3u8');

    // Check if session is already active
    const existingSession = activeSessions.get(sessionId);
    if (existingSession && existsSync(playlistPath)) {
      let manifest = readFileSync(playlistPath, 'utf-8');
      manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/torrents/hls-seg?session=${sessionId}&id=$1`);
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(manifest);
    }

    // Clean up old session if exists
    if (existingSession) {
      try { process.kill(existingSession.pid, 'SIGKILL'); } catch {}
      activeSessions.delete(sessionId);
    }

    if (!existsSync(hlsDir)) {
      mkdirSync(hlsDir, { recursive: true });
    }

    // Start FFmpeg with selected audio track
    const { spawn } = await import('child_process');
    const ffmpeg = spawn('ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', streamUrl,
      '-ss', '0',
      '-map', '0:v:0',
      '-map', `0:a:${audioIndex}`,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_flags', 'append_list',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', join(hlsDir, 'seg-%d.ts'),
      '-y',
      playlistPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    activeSessions.set(sessionId, { pid: ffmpeg.pid!, hlsDir });
    ffmpeg.on('close', () => activeSessions.delete(sessionId));

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
      manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/torrents/hls-seg?session=${sessionId}&id=$1`);

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(manifest);
    }

    reply.code(500);
    return { error: 'FFmpeg failed to generate manifest' };
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
      const { execSync: execSyncSub } = await import('child_process');

      // Extract subtitle as WebVTT (timeout 60s for large files)
      const vtt = execSyncSub(
        `ffmpeg -i "${streamUrl}" -map 0:s:${trackId} -c:s webvtt -f webvtt pipe:1 2>/dev/null`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      ).toString();

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

  // Seek endpoint — restarts FFmpeg from a specific position
  app.get('/api/torrents/hls-seek', async (req, reply) => {
    const { link, index, time } = req.query as { link?: string; index?: string; time?: string };

    if (!link || !time) {
      return reply.code(400).send({ error: 'link and time required' });
    }

    try {
      const seekTime = parseFloat(time);
      const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
      // Use random session ID - each seek gets a fresh directory, no cleanup needed
      const sessionId = Math.random().toString(36).slice(2, 15) + Date.now().toString(36);
      const hlsDir = `/tmp/hls-${sessionId}`;

      const { mkdirSync, readFileSync } = await import('fs');
      const { join } = await import('path');

      mkdirSync(hlsDir, { recursive: true });

      const playlistPath = join(hlsDir, 'playlist.m3u8');

      // Start FFmpeg from the seek position
      const { spawn } = await import('child_process');
      const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '10',
        '-ss', String(seekTime),
        '-i', streamUrl,
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '0',
        '-hls_flags', 'append_list',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', join(hlsDir, 'seg-%d.ts'),
        '-y',
        playlistPath,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      activeSessions.set(sessionId, { pid: ffmpeg.pid!, hlsDir });

      ffmpeg.on('close', () => {
        activeSessions.delete(sessionId);
      });

      // Wait for first segments (up to 60 seconds)
      const { existsSync } = await import('fs');
      const waitForSegments = () => new Promise<void>((resolve) => {
        let attempts = 0;
        const check = () => {
          try {
            if (existsSync(playlistPath)) {
              const content = readFileSync(playlistPath, 'utf-8');
              if ((content.match(/\.ts/g) || []).length >= 1) {
                resolve();
                return;
              }
            }
          } catch {}
          if (attempts++ < 300) { // 60 seconds
            setTimeout(check, 200);
          } else {
            resolve();
          }
        };
        check();
      });

      await waitForSegments();

      // Return manifest
      let manifest = readFileSync(playlistPath, 'utf-8');
      manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/torrents/hls-seg?session=${sessionId}&id=$1`);

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(manifest);
    } catch (err: any) {
      console.error('Seek error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Serve HLS segments (supports subdirectories for multi-audio)
  app.get('/api/torrents/hls-seg', async (req, reply) => {
    const { session, id, dir } = req.query as { session?: string; id?: string; dir?: string };

    if (!session || !id) {
      return reply.code(400).send({ error: 'session and id required' });
    }

    const { readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');

    // Support subdirectories: video/, audio-0/, audio-1/, etc.
    const segPath = dir
      ? join(`/tmp/hls-${session}`, dir, `seg-${id}.ts`)
      : join(`/tmp/hls-${session}`, `seg-${id}.ts`);

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

    const data = readFileSync(segPath);
    reply.header('Content-Type', 'video/mp2t');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Content-Length', data.length);
    return reply.send(data);
  });

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
