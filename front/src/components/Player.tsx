import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, ChevronLeft, Maximize2, Minimize2, Settings, Loader2, Subtitles, ChevronRight } from 'lucide-react';
import type { Title } from '@/api/client';

interface PlayerProps {
  title: Title;
  onExit: () => void;
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
}

type SettingsPanel = 'none' | 'quality' | 'audio' | 'subtitles';

export default function Player({ title, onExit, initialTime, onTimeUpdate }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const audioSwitchRef = useRef(false); // true during audio switch
  const [error, setError] = useState('');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [subtitleText, setSubtitleText] = useState('');
  const subtitleCuesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const realDurationRef = useRef<number>(0); // Duration from FFprobe (for torrents)

  // HLS-specific state
  const [qualityLevels, setQualityLevels] = useState<Array<{ height: number; index: number }>>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string; lang: string }>>([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string; lang: string }>>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState(-1); // -1 = off

  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('none');

  const hasVideo = !!title.videoUrl;
  const isHls = hasVideo && (title.videoUrl!.includes('.m3u') || title.videoUrl!.includes('m3u8') || title.videoUrl!.includes('/hls'));

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 4000);
  }, [playing]);

  // Fetch duration, audio tracks, and subtitles from backend for torrent streams
  useEffect(() => {
    if (!title.videoUrl?.includes('/api/torrents/hls')) return;

    const urlObj = new URL(title.videoUrl, window.location.origin);
    const link = urlObj.searchParams.get('link');
    const index = urlObj.searchParams.get('index');

    if (!link) return;

    const encodedLink = encodeURIComponent(link);
    const idx = index || '0';

    // Fetch duration
    fetch(`/api/torrents/duration?link=${encodedLink}&index=${idx}`)
      .then(res => res.json())
      .then(data => {
        if (data.duration && data.duration > 0) {
          realDurationRef.current = data.duration;
          setDuration(data.duration);
        }
      })
      .catch(() => {});

    // Fetch track info (audio + subtitles)
    fetch(`/api/torrents/tracks?link=${encodedLink}&index=${idx}`)
      .then(res => res.json())
      .then(data => {
        // Audio tracks — use backend name directly (already descriptive like "Русский DTS 5.1")
        if (data.audioTracks?.length > 0) {
          const tracks = data.audioTracks.map((t: any) => ({
            id: t.id,
            name: t.name,
            lang: t.lang,
          }));
          setAudioTracks(tracks);
        }
        // Subtitle tracks
        if (data.subtitleTracks?.length > 0) {
          const subs = data.subtitleTracks.map((t: any) => ({
            id: t.id,
            name: t.name,
            lang: t.lang,
            url: `/api/torrents/subtitle/${t.id}?link=${encodedLink}&index=${idx}`,
          }));
          setSubtitleTracks(subs);
        }
      })
      .catch(() => {});
  }, [title.videoUrl]);

  // Seek to initial time when video is ready (but NOT during audio switch)
  useEffect(() => {
    if (!initialTime || initialTime <= 0) return;
    const video = videoRef.current;
    if (!video) return;

    const seekToInitial = () => {
      // Skip if we're in the middle of an audio switch
      if (audioSwitchRef.current) return;
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        video.currentTime = initialTime;
      }
    };

    video.addEventListener('loadeddata', seekToInitial);
    return () => video.removeEventListener('loadeddata', seekToInitial);
  }, [initialTime]);

  // Initialize video (only on mount — audio switching is handled separately)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;

    const url = title.videoUrl!;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 120,
        maxMaxBufferLength: 300,
        startLevel: -1,
        debug: false,
        fragLoadingTimeOut: 30000,
        manifestLoadingTimeOut: 30000,
        levelLoadingTimeOut: 30000,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLoading(false);
        // Extract quality levels
        const levels = data.levels.map((level, index) => ({
          height: level.height,
          index,
        })).filter(l => l.height > 0);
        setQualityLevels(levels);
        // Seek to initial time if provided
        if (initialTime && initialTime > 0) {
          video.currentTime = initialTime;
        }
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        const tracks = data.audioTracks.map((track, id) => ({
          id,
          name: track.name || `Track ${id}`,
          lang: track.lang || 'unknown',
        }));
        setAudioTracks(tracks);
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setCurrentAudio(data.id);
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_event, data) => {
        const tracks = data.subtitleTracks.map((track, id) => ({
          id,
          name: track.name || `Track ${id}`,
          lang: track.lang || 'unknown',
        }));
        setSubtitleTracks(tracks);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data);
          setError('Ошибка загрузки видео');
          setLoading(false);
        }
      });
    } else {
      // Direct video (MP4, MKV, etc.)
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        // Seek to initial time if provided
        if (initialTime && initialTime > 0) {
          video.currentTime = initialTime;
        }
        video.play().catch(() => {});
      });
      video.addEventListener('canplay', () => setLoading(false));
      video.addEventListener('error', () => {
        setError('Не удалось загрузить видео');
        setLoading(false);
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [title.videoUrl, hasVideo, isHls]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
        // Only update duration from video if we don't have a real duration from FFprobe
        if (video.duration && isFinite(video.duration) && realDurationRef.current === 0) {
          setDuration(video.duration);
        }
        // Save playback position (throttled by parent)
        if (onTimeUpdate) {
          onTimeUpdate(video.currentTime);
        }
      }
    };
    const onProgress = () => {
      const dur = realDurationRef.current > 0 ? realDurationRef.current : video.duration;
      if (video.buffered.length > 0 && dur && isFinite(dur)) {
        setBuffered(video.buffered.end(video.buffered.length - 1) / dur);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onLoadedMetadata = () => {
      // Only update duration from video if we don't have a real duration from FFprobe
      if (isFinite(video.duration) && realDurationRef.current === 0) {
        setDuration(video.duration);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [isDragging, onTimeUpdate]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      resetHideTimer();
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          playing ? video.pause() : video.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (isFinite(video.duration)) {
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          setVolume(video.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          setVolume(video.volume);
          break;
        case 'm':
          video.muted = !video.muted;
          setMuted(video.muted);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'Escape':
          if (settingsPanel !== 'none') {
            setSettingsPanel('none');
          } else if (isFullscreen) {
            toggleFullscreen();
          } else {
            onExit();
          }
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, isFullscreen, resetHideTimer, onExit, settingsPanel]);

  // Fullscreen change detection
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    playing ? video.pause() : video.play();
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (video && isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration));
    }
  };

  const seek = (fraction: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(duration) || duration <= 0) return;

    const targetTime = fraction * duration;
    // Simple seek — hls.js handles buffering within the transcoded range
    video.currentTime = targetTime;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // Update UI immediately
    setCurrentTime(fraction * duration);

    const onMouseMove = (me: MouseEvent) => {
      const f = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      // Just update UI during drag
      setCurrentTime(f * duration);
    };
    const onMouseUp = (me: MouseEvent) => {
      setIsDragging(false);
      const f = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      // Actually seek when mouse is released
      seek(f);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setHoverTime(isFinite(duration) ? x * duration : 0);
    setHoverX(e.clientX - rect.left);
  };

  const setQuality = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentQuality(index);
    }
    setSettingsPanel('none');
  };

  const setAudio = (id: number) => {
    if (!title.videoUrl?.includes('/api/torrents/hls')) {
      // For non-torrent HLS, use built-in switching
      if (hlsRef.current) {
        hlsRef.current.audioTrack = id;
        setCurrentAudio(id);
      }
      setSettingsPanel('none');
      return;
    }

    // For torrent HLS: reload with new audio track
    const video = videoRef.current;
    if (!video) return;

    // Save current position and playing state
    const saveTime = video.currentTime;
    const wasPlaying = !video.paused;
    audioSwitchRef.current = true;
    setCurrentAudioIndex(id);
    setCurrentAudio(id);
    setSettingsPanel('none');
    setLoading(true);

    // Pause video during switch
    video.pause();

    // Destroy current HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Build new URL with audio parameter
    const urlObj = new URL(title.videoUrl, window.location.origin);
    urlObj.searchParams.set('audio', String(id));
    const newUrl = urlObj.pathname + urlObj.search;

    // Create new HLS instance
    const hls = new Hls({
      maxBufferLength: 120,
      maxMaxBufferLength: 300,
      startLevel: -1,
      debug: false,
      fragLoadingTimeOut: 30000,
      manifestLoadingTimeOut: 30000,
      levelLoadingTimeOut: 30000,
    });
    hlsRef.current = hls;

    hls.loadSource(newUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setLoading(false);
      // Restore position
      if (saveTime > 0) {
        video.currentTime = saveTime;
      }
      // Resume playback if it was playing before
      if (wasPlaying) {
        video.play().catch(() => {});
      }
      // Reset audio switch flag after a short delay
      setTimeout(() => { audioSwitchRef.current = false; }, 500);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        console.error('HLS fatal error:', data);
        setError('Ошибка загрузки видео');
        setLoading(false);
      }
    });
  };

  const setSubtitle = async (id: number) => {
    const track = subtitleTracks.find(t => t.id === id);
    if (!track) {
      setCurrentSubtitle(-1);
      subtitleCuesRef.current = [];
      setSubtitleText('');
      setSettingsPanel('none');
      return;
    }

    // If it's an external subtitle (has url), fetch and parse it
    if ((track as any).url) {
      setCurrentSubtitle(id);
      setLoading(true);
      try {
        const res = await fetch((track as any).url);
        if (!res.ok) {
          console.error('Subtitle fetch failed:', res.status, res.statusText);
          subtitleCuesRef.current = [];
          setLoading(false);
          setSettingsPanel('none');
          return;
        }
        const vtt = await res.text();
        console.log('Subtitle VTT received:', vtt.length, 'bytes');
        // Parse WebVTT cues
        const cues: Array<{ start: number; end: number; text: string }> = [];
        const blocks = vtt.split(/\n\s*\n/);
        for (const block of blocks) {
          const lines = block.trim().split('\n');
          if (lines.length < 2) continue;
          const timeMatch = lines[0].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
          if (!timeMatch) continue;
          const start = parseVttTime(timeMatch[1]);
          const end = parseVttTime(timeMatch[2]);
          const text = lines.slice(1).join('\n');
          cues.push({ start, end, text });
        }
        console.log('Parsed subtitle cues:', cues.length);
        subtitleCuesRef.current = cues;
        setLoading(false);
      } catch (err) {
        console.error('Failed to load subtitles:', err);
        subtitleCuesRef.current = [];
        setLoading(false);
      }
    } else if (hlsRef.current) {
      // HLS embedded subtitle
      hlsRef.current.subtitleTrack = id;
      setCurrentSubtitle(id);
    }

    setSettingsPanel('none');
  };

  const parseVttTime = (time: string): number => {
    const parts = time.split(':');
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  };

  // Update subtitle display
  useEffect(() => {
    if (subtitleCuesRef.current.length === 0) {
      setSubtitleText('');
      return;
    }

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const t = video.currentTime;
      const cue = subtitleCuesRef.current.find(c => t >= c.start && t <= c.end);
      setSubtitleText(cue?.text || '');
    }, 100);

    return () => clearInterval(interval);
  }, [currentSubtitle]);

  const fmtTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black select-none"
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
      />

      {/* Subtitle overlay */}
      {subtitleText && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center max-w-[80%]">
          <div className="inline-block px-4 py-2 rounded-lg bg-black/80 backdrop-blur-sm text-white text-[18px] leading-relaxed shadow-lg">
            {subtitleText}
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <Loader2 className="h-12 w-12 text-white animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center">
            <div className="text-[16px] text-red-400 mb-4">{error}</div>
            <button onClick={onExit} className="px-6 py-2 rounded-full bg-white/10 text-white text-[14px]">Назад</button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 z-30 transition-all duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(-100%)',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <button
            onClick={onExit}
            className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-4 py-2 text-[13px] font-medium text-white/85 hover:bg-white/20 transition"
          >
            <ChevronLeft className="h-4 w-4" />Назад
          </button>
          <div className="text-center">
            <div className="text-[15px] font-medium text-white">
              {title.episode ? `${title.name} — ${title.episode}` : title.name}
            </div>
            <div className="text-[11px] text-white/50">{title.year} · {title.runtime}</div>
          </div>
          <div className="text-[12px] text-white/50">{fmtTime(currentTime)}</div>
        </div>
      </div>

      {/* Center play/pause */}
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
            <Play className="h-10 w-10 text-white ml-1" fill="currentColor" />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 transition-all duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(100%)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Timeline */}
        <div className="px-6 mb-2">
          <div
            ref={progressRef}
            className="group relative h-8 flex items-center cursor-pointer"
            onMouseMove={handleTimelineHover}
            onMouseLeave={() => setHoverTime(null)}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* Hover time tooltip */}
            {hoverTime !== null && !isDragging && (
              <div
                className="absolute -top-8 px-2 py-1 rounded bg-black/80 text-[11px] text-white whitespace-nowrap pointer-events-none"
                style={{ left: hoverX, transform: 'translateX(-50%)' }}
              >
                {fmtTime(hoverTime)}
              </div>
            )}
            {/* Track */}
            <div className="relative w-full h-1.5 rounded-full bg-white/20 group-hover:h-2 transition-all">
              {/* Buffered range */}
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${buffered * 100}%` }} />
              {/* Played range */}
              <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-4 w-4 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            {/* Buffer indicator */}
            {buffered < 0.9 && buffered > 0 && (
              <div className="text-[10px] text-white/30 mt-1">
                Буфер: {fmtTime(buffered * duration)}
              </div>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-4">
            <button onClick={() => skip(-10)} className="text-white/70 hover:text-white transition">
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={togglePlay} className="text-white hover:scale-110 transition">
              {playing ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7" fill="currentColor" />}
            </button>
            <button onClick={() => skip(10)} className="text-white/70 hover:text-white transition">
              <SkipForward className="h-5 w-5" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/vol">
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (video) { video.muted = !video.muted; setMuted(video.muted); }
                }}
                className="text-white/70 hover:text-white transition"
              >
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
                  setMuted(v === 0);
                }}
                className="w-0 group-hover/vol:w-20 transition-all appearance-none bg-white/30 h-1 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>

            <span className="text-[12px] text-white/50">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio track button */}
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel === 'audio' ? 'none' : 'audio'); }}
              className="text-white/70 hover:text-white transition"
              title="Аудио"
            >
              <Volume2 className="h-5 w-5" />
            </button>

            {/* Subtitles button */}
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel === 'subtitles' ? 'none' : 'subtitles'); }}
              className={`text-white/70 hover:text-white transition ${currentSubtitle >= 0 ? 'text-amber-300' : ''}`}
              title="Субтитры"
            >
              <Subtitles className="h-5 w-5" />
            </button>

            {/* Settings button */}
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel === 'none' ? 'quality' : 'none'); }}
              className="text-white/70 hover:text-white transition"
              title="Качество"
            >
              <Settings className="h-5 w-5" />
            </button>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition">
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {settingsPanel !== 'none' && (
        <div
          className="absolute bottom-20 right-6 z-40 w-64 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Quality */}
          {settingsPanel === 'quality' && (
            <div>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Settings className="h-4 w-4 text-white/50" />
                <span className="text-[13px] font-medium text-white">Качество</span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setQuality(-1)}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                >
                  <span>Авто</span>
                  {currentQuality === -1 && <span className="text-amber-300">✓</span>}
                </button>
                {qualityLevels.map((level) => (
                  <button
                    key={level.index}
                    onClick={() => setQuality(level.index)}
                    className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                  >
                    <span>{level.height}p</span>
                    {currentQuality === level.index && <span className="text-amber-300">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Audio */}
          {settingsPanel === 'audio' && (
            <div>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-white/50" />
                <span className="text-[13px] font-medium text-white">Аудио</span>
              </div>
              <div className="py-1">
                {audioTracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => setAudio(track.id)}
                    className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                  >
                    <span>{track.name} ({track.lang})</span>
                    {currentAudio === track.id && <span className="text-amber-300">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subtitles */}
          {settingsPanel === 'subtitles' && (
            <div>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Subtitles className="h-4 w-4 text-white/50" />
                <span className="text-[13px] font-medium text-white">Субтитры</span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setSubtitle(-1)}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                >
                  <span>Выключены</span>
                  {currentSubtitle === -1 && <span className="text-amber-300">✓</span>}
                </button>
                {subtitleTracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => setSubtitle(track.id)}
                    className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                  >
                    <span>{track.name} ({track.lang})</span>
                    {currentSubtitle === track.id && <span className="text-amber-300">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
