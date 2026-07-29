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

        return {
          id: f.id,
          name: f.path.split('/').pop() || f.path,
          path: f.path,
          size: f.length,
          sizeFormatted: formatSize(f.length),
          streamUrl: `/api/torrents/hls?link=${encodeURIComponent(magnet)}&index=${f.id}`,
          directUrl: `/api/torrents/proxy?link=${encodeURIComponent(magnet)}&index=${f.id}`,
          externalSubs: matchingSubs,
        } as any;
      });

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

  // Proxy TorrServer streams (direct) — supports Range for AVPlay seeking
  app.get('/api/torrents/proxy', async (req, reply) => {
    const { link, index } = req.query as { link?: string; index?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    try {
      const url = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;

      // Forward Range header from client for seeking
      const headers: Record<string, string> = {};
      const rangeHeader = req.headers.range;
      if (rangeHeader) {
        headers['Range'] = rangeHeader;
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok && res.status !== 206) {
        return reply.code(res.status).send({ error: 'TorrServer stream error' });
      }

      // Forward the response headers with CORS
      const contentType = res.headers.get('content-type') || 'video/mp4';
      const contentLength = res.headers.get('content-length');
      const contentRange = res.headers.get('content-range');
      reply.header('Content-Type', contentType);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Range');
      reply.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      if (contentLength) reply.header('Content-Length', contentLength);
      if (contentRange) reply.header('Content-Range', contentRange);

      // Return 206 for partial content (Range requests)
      if (res.status === 206) {
        reply.code(206);
      }

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
      // Try to get accurate duration with large probesize
      let dur = 0;

      // Method 1: format-level duration with large probesize
      try {
        const fmtResult = execSync(
          `ffprobe -v quiet -print_format json -show_format -probesize 50000000 -analyzeduration 50000000 "${streamUrl}"`,
          { timeout: 30000 }
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
    const { link, index, audio, start } = req.query as { link?: string; index?: string; audio?: string; start?: string };

    if (!link) {
      return reply.code(400).send({ error: 'link parameter required' });
    }

    const audioIndex = parseInt(audio || '0', 10) || 0;
    const seekTime = parseFloat(start || '0') || 0;
    const streamUrl = `${TORRSERVER_URL}/stream?link=${encodeURIComponent(link)}&index=${index || 0}&play`;
    const { createHash } = await import('crypto');
    // Include audio index and seek time in session ID
    const sessionId = createHash('sha256').update(`${link}-${index}-a${audioIndex}-s${seekTime}`).digest('hex').slice(0, 32);
    const hlsDir = `/tmp/hls-${sessionId}`;

    const { mkdirSync, existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const playlistPath = join(hlsDir, 'playlist.m3u8');

    // Check if session is already active
    const existingSession = activeSessions.get(sessionId);
    if (existingSession && existsSync(playlistPath)) {
      let manifest = readFileSync(playlistPath, 'utf-8');
      // Validate manifest is proper M3U8 before serving
      if (manifest.includes('#EXTM3U') && manifest.includes('#EXTINF')) {
        manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/torrents/hls-seg?session=${sessionId}&id=$1`);
        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'no-cache');
        return reply.send(manifest);
      }
      // Manifest exists but not valid yet — fall through to wait
    }

    // Clean up old session and HLS directory if exists
    if (existingSession) {
      try { process.kill(existingSession.pid, 'SIGKILL'); } catch {}
      activeSessions.delete(sessionId);
    }
    // Clean old HLS directory for fresh start
    if (existsSync(hlsDir)) {
      const { rmSync } = await import('fs');
      try { rmSync(hlsDir, { recursive: true, force: true }); } catch {}
    }

    if (!existsSync(hlsDir)) {
      mkdirSync(hlsDir, { recursive: true });
    }

    // Start FFmpeg with selected audio track
    const { spawn } = await import('child_process');
    const ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', streamUrl,
    ];
    // Seek AFTER input — accurate seeking (reads stream, discards until seek point)
    // -ss before -i uses byte offsets which are wrong for VBR MKV files
    if (seekTime > 0) {
      ffmpegArgs.push('-ss', String(Math.floor(seekTime)));
    }
    ffmpegArgs.push(
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
    );
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    activeSessions.set(sessionId, { pid: ffmpeg.pid!, hlsDir });
    ffmpeg.on('close', (code, signal) => {
      console.log(`[FFmpeg] Session ${sessionId} closed: code=${code}, signal=${signal}`);
      activeSessions.delete(sessionId);
    });
    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid') || msg.includes('failed')) {
        console.error(`[FFmpeg] ${sessionId}: ${msg.substring(0, 200)}`);
      }
    });

    // Start background subtitle extraction (non-blocking)
    const subtitlePath = join(hlsDir, 'subs.vtt');
    const { existsSync: subExistsSync, statSync: subStatSync } = await import('fs');
    console.log(`Starting subtitle extraction for session ${sessionId}`);
    const subFfmpeg = spawn('ffmpeg', [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', streamUrl,
      '-map', '0:s:0',
      '-c:s', 'webvtt',
      '-y',
      subtitlePath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    subFfmpeg.on('close', (code) => {
      const size = subExistsSync(subtitlePath) ? subStatSync(subtitlePath).size : 0;
      console.log(`Subtitle extraction finished for session ${sessionId}: code=${code}, size=${size}`);
    });
    subFfmpeg.stderr.on('data', (data) => {
      // Log FFmpeg errors for debugging
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error(`Subtitle FFmpeg error: ${msg.substring(0, 200)}`);
      }
    });
    // Kill subtitle extraction after 3 minutes
    setTimeout(() => {
      try { subFfmpeg.kill('SIGKILL'); } catch {}
    }, 180000);

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
      manifest = manifest.replace(/seg-(\d+)\.ts/g, `/api/torrents/hls-seg?session=${sessionId}&id=$1`);

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(manifest);
    }

    reply.code(500);
    return { error: 'FFmpeg failed to generate manifest' };
  });

  // Serve pre-extracted subtitles from HLS session
  app.get('/api/torrents/hls-subs', async (req, reply) => {
    const { session } = req.query as { session?: string };

    if (!session) {
      return reply.code(400).send({ error: 'session required' });
    }

    const { readFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const subtitlePath = join(`/tmp/hls-${session}`, 'subs.vtt');

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
        '-i', streamUrl,
        '-ss', String(seekTime),
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
