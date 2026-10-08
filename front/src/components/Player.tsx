import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Hls, { type HlsConfig } from 'hls.js';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, ChevronLeft, Maximize2, Minimize2, Settings, Loader2, Subtitles, ChevronRight, ExternalLink, Check } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch, serverUrl } from '@/api/server';
import { Capacitor } from '@capacitor/core';

interface ExternalSub {
  id: number;
  name: string;
  url: string;
  lang: string;
}

interface PlayerProps {
  title: Title;
  onExit: () => void;
  initialTime?: number;
  onTimeUpdate?: (time: number) => void;
  externalSubs?: ExternalSub[];
}

type SettingsPanel = 'none' | 'quality' | 'audio' | 'subtitles';

function getHlsPlayerConfig(overrides?: Partial<HlsConfig>): Partial<HlsConfig> {
  const isMobileOrTv = Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tizen|SmartTV|SMART-TV/i.test(navigator.userAgent));

  return {
    progressive: false,
    startFragPrefetch: true,
    maxBufferLength: isMobileOrTv ? 60 : 90,
    maxMaxBufferLength: isMobileOrTv ? 120 : 180,
    backBufferLength: isMobileOrTv ? 30 : 60,
    maxBufferSize: isMobileOrTv ? 100 * 1000 * 1000 : 250 * 1000 * 1000,
    highBufferWatchdogPeriod: 2,
    nudgeMaxRetry: 5,
    nudgeOnVideoHole: true,
    startLevel: -1,
    debug: false,
    fragLoadingTimeOut: 30000,
    manifestLoadingTimeOut: 30000,
    levelLoadingTimeOut: 30000,
    ...overrides,
  };
}

export default function Player({ title, onExit, initialTime, onTimeUpdate, externalSubs }: PlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const progressRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  playingRef.current = playing;
  const [buffered, setBuffered] = useState(0);
  const [bufferedRange, setBufferedRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [currentTime, setCurrentTime] = useState(initialTime || 0);
  const [duration, setDuration] = useState(0);
  const seekOffsetRef = useRef<number>(initialTime && initialTime > 30 && (title.videoUrl?.includes('/api/torrents/hls') || title.videoUrl?.includes('/api/downloads/server/hls') || Boolean(title.hlsUrl)) ? Math.floor(initialTime) : 0);
  const [showControls, setShowControls] = useState(true);
  const showControlsRef = useRef(true);
  showControlsRef.current = showControls;
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const audioSwitchRef = useRef(false); // true during audio switch
  const [copiedStreamLink, setCopiedStreamLink] = useState(false);
  const [error, setError] = useState('');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [subtitleText, setSubtitleText] = useState('');
  const subtitleCuesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);
  const loadedRangesRef = useRef<Array<{ start: number; end: number }>>([]);
  const [subtitleCuesVersion, setSubtitleCuesVersion] = useState(0);
  const subPrefetchingRef = useRef(false);
  const subFetchingRef = useRef(false);
  const lastPrefetchTimeRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;
  const playedBarRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const seekDebounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const controlsJustOpenedRef = useRef<number>(0);
  const touchFractionRef = useRef<number>(0);
  const realDurationRef = useRef<number>(0); // Duration from FFprobe (for torrents)
  const lastTouchTimeRef = useRef<number>(0);

  // HLS-specific state
  const [qualityLevels, setQualityLevels] = useState<Array<{ height: number; index: number }>>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; name: string; lang: string }>>([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ id: number; name: string; lang: string }>>([]);
  const subtitleTracksRef = useRef<Array<{ id: number; name: string; lang: string }>>([]);
  subtitleTracksRef.current = subtitleTracks;
  const [currentSubtitle, setCurrentSubtitle] = useState(-1); // -1 = off
  const currentSubtitleRef = useRef(currentSubtitle);
  currentSubtitleRef.current = currentSubtitle;
  const subAbortControllerRef = useRef<AbortController | null>(null);

  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('none');
  const settingsPanelRef = useRef<SettingsPanel>('none');
  settingsPanelRef.current = settingsPanel;

  // Check if media source is a torrent stream
  const isTorrent = Boolean(
    title.videoUrl?.includes('/api/torrents/') ||
    title.directUrl?.includes('/api/torrents/') ||
    title.hlsUrl?.includes('/api/torrents/')
  );

  // Check if file is native HTML5 web safe container (only MP4 and WebM)
  const isWebSafeFormat = Boolean(
    title.videoUrl?.endsWith('.mp4') ||
    title.videoUrl?.endsWith('.webm') ||
    title.directUrl?.endsWith('.mp4') ||
    title.directUrl?.endsWith('.webm')
  );

  const isServerDownload = Boolean(
    title.videoUrl?.includes('/api/downloads/server/stream') ||
    title.directUrl?.includes('/api/downloads/server/stream') ||
    title.videoUrl?.includes('/api/downloads/server/hls') ||
    title.hlsUrl?.includes('/api/downloads/server/hls')
  );

  // Direct play is only allowed for verified web-safe containers or non-torrents with directUrl or server downloads (when not using HLS)
  const canPlayDirect = (!title.hlsUrl && !title.videoUrl?.includes('m3u8') && isServerDownload) || (isTorrent
    ? isWebSafeFormat
    : Boolean(title.directUrl || isWebSafeFormat));

  const hasVideo = !!(title.videoUrl || title.directUrl || title.hlsUrl);
  const isHls = hasVideo && (
    Boolean(
      title.hlsUrl ||
      title.videoUrl?.includes('.m3u') ||
      title.videoUrl?.includes('m3u8') ||
      title.videoUrl?.includes('/hls') ||
      title.videoUrl?.includes('/api/iptv/stream') ||
      title.type === 'live'
    ) || (!canPlayDirect)
  );

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    showControlsRef.current = true;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
    // Only auto-hide if playing, not dragging, and no settings modal is open
    if (playingRef.current && settingsPanelRef.current === 'none' && !isDraggingRef.current) {
      hideTimer.current = setTimeout(() => {
        if (playingRef.current && settingsPanelRef.current === 'none' && !isDraggingRef.current) {
          setShowControls(false);
          showControlsRef.current = false;
        }
      }, 3500);
    }
  }, []);

  // When playback pauses or settings modal opens, keep controls visible without hiding
  useEffect(() => {
    if (!playing || settingsPanel !== 'none') {
      setShowControls(true);
      showControlsRef.current = true;
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = undefined;
      }
    } else {
      resetHideTimer();
    }
  }, [playing, settingsPanel, resetHideTimer]);

  // Jellyfin-style active session heartbeat
  const sessionIdRef = useRef<string>('web-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
  const currentProgressRef = useRef({ time: 0, dur: 0, paused: false });
  currentProgressRef.current = { time: currentTime, dur: duration || realDurationRef.current, paused: !playing };

  useEffect(() => {
    let seasonNum = 0;
    let epNum = 0;
    if (title.episode) {
      const match = String(title.episode).match(/s(\d+)e(\d+)/i) || String(title.episode).match(/(\d+)[x-](\d+)/i);
      if (match) {
        seasonNum = parseInt(match[1], 10);
        epNum = parseInt(match[2], 10);
      }
    }

    const sendHeartbeat = async () => {
      try {
        const res = await serverFetch('/api/sessions/heartbeat', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            deviceType: Capacitor.isNativePlatform() ? 'mobile' : 'web',
            deviceName: Capacitor.isNativePlatform() ? 'Mobile App' : 'Web Browser',
            mediaType: (title.type === 'live' ? 'iptv' : title.type) || 'movie',
            mediaId: title.id,
            mediaTitle: (title as any).titleName || title.name || 'Видео',
            mediaPoster: title.poster || '',
            season: seasonNum,
            episode: epNum,
            currentTime: Math.round(currentProgressRef.current.time || 0),
            duration: Math.round(currentProgressRef.current.dur || 0),
            isPaused: currentProgressRef.current.paused,
          }),
        });
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.terminate) {
            onExit();
          }
        } else if (res) {
          console.warn('[Player] Heartbeat response not OK:', res.status);
        }
      } catch (err) {
        console.warn('[Player] Heartbeat network error:', err);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => {
      clearInterval(interval);
      serverFetch('/api/sessions/stop', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    };
  }, [title, onExit]);

  const parseVttTime = (time: string): number => {
    const parts = time.split(':');
    if (parts.length === 3) {
      const h = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const s = parseFloat(parts[2].replace(',', '.'));
      return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
      const m = parseInt(parts[0]);
      const s = parseFloat(parts[1].replace(',', '.'));
      return m * 60 + s;
    }
    return 0;
  };

  // Load external subtitle files from torrent
  useEffect(() => {
    if (!externalSubs || externalSubs.length === 0) return;

    const langMap: Record<string, string> = { rus: 'Русский', eng: 'English', ukr: 'Украинский', und: 'Неизвестно' };
    const subs = externalSubs.map((s) => ({
      id: s.id,
      name: (langMap[s.lang] || s.name) + ' (.srt)',
      lang: s.lang,
      url: s.url,
      isExternal: true,
    }));
    setSubtitleTracks(prev => {
      const embedded = prev.filter((p: any) => !p.isExternal);
      return [...subs, ...embedded];
    });
  }, [externalSubs]);

  // Fetch duration, audio tracks, and subtitles from backend for torrent streams
  useEffect(() => {
    const rawUrl = title.hlsUrl || title.videoUrl || title.directUrl || '';
    if (rawUrl.includes('/api/downloads/server/')) {
      const match = rawUrl.match(/\/api\/downloads\/server\/(?:hls|stream)\/([^\/\?]+)/);
      if (match) {
        const dlId = match[1];
        serverFetch(`/api/downloads/server/info/${encodeURIComponent(dlId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.duration && data.duration > 0) {
              setDuration(data.duration);
              realDurationRef.current = data.duration;
            }
            if (data?.audioTracks && data.audioTracks.length > 0) {
              setAudioTracks(data.audioTracks);
            }
            if (data?.subtitleTracks && data.subtitleTracks.length > 0) {
              setSubtitleTracks(data.subtitleTracks);
            }
          })
          .catch(() => {});
      }
      return;
    }
    if (!rawUrl.includes('/api/torrents/')) return;

    let link: string | null = null;
    let index: string | null = null;
    try {
      const fullUrl = serverUrl(rawUrl);
      const urlObj = new URL(fullUrl, window.location.origin);
      link = urlObj.searchParams.get('link');
      index = urlObj.searchParams.get('index');
    } catch {}

    if (!link) return;

    const encodedLink = encodeURIComponent(link);
    const idx = index || '0';

    // Fetch duration
    serverFetch(`/api/torrents/duration?link=${encodedLink}&index=${idx}`)
      .then(res => res.json())
      .then(data => {
        if (data.duration && data.duration > 0) {
          realDurationRef.current = data.duration;
          setDuration(data.duration);
        }
      })
      .catch(() => {});

    // Fetch track info (audio + subtitles)
    serverFetch(`/api/torrents/tracks?link=${encodedLink}&index=${idx}`)
      .then(res => res.json())
      .then(data => {
        // Audio tracks — use backend name directly
        if (data.audioTracks?.length > 0) {
          const tracks = data.audioTracks.map((t: any) => ({
            id: t.id,
            name: t.name,
            lang: t.lang,
          }));
          setAudioTracks(tracks);
        }
        // Subtitle tracks — assign WebVTT extraction URL via backend ffmpeg
        if (data.subtitleTracks?.length > 0) {
          const subs = data.subtitleTracks.map((t: any, i: number) => {
            const trackId = t.id !== undefined ? t.id : i;
            return {
              id: 1000 + trackId,
              name: t.name || `Субтитры ${i + 1}`,
              lang: t.lang || '',
              url: `/api/torrents/subtitle/${trackId}?link=${encodedLink}&index=${idx}`,
              isExternal: false,
            };
          });
          setSubtitleTracks(prev => {
            const externals = prev.filter((p: any) => p.isExternal);
            return [...externals, ...subs];
          });
          if (currentSubtitleRef.current >= 0) {
            setSubtitle(currentSubtitleRef.current);
          }
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
        if (!isHls || (!title.hlsUrl && !title.videoUrl?.includes('/api/torrents/hls') && !title.videoUrl?.includes('/api/downloads/server/hls')) || !seekOffsetRef.current) {
          video.currentTime = initialTime;
        }
      }
    };

    video.addEventListener('loadeddata', seekToInitial);
    return () => video.removeEventListener('loadeddata', seekToInitial);
  }, [initialTime]);

  // Initialize video (only on mount — audio switching is handled separately)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;

    let rawStreamUrl = '';
    if (isHls) {
      if (title.hlsUrl) {
        rawStreamUrl = title.hlsUrl;
      } else if (title.videoUrl && (title.videoUrl.includes('.m3u') || title.videoUrl.includes('/hls') || title.videoUrl.includes('/api/iptv/stream') || title.type === 'live')) {
        rawStreamUrl = title.videoUrl;
      } else if (isTorrent) {
        const sourceUrl = title.videoUrl || title.directUrl || '';
        try {
          const parsed = new URL(sourceUrl, 'http://localhost');
          const link = parsed.searchParams.get('link') || '';
          const index = parsed.searchParams.get('index') || '0';
          const isAvi = sourceUrl.toLowerCase().includes('.avi');
          rawStreamUrl = `/api/torrents/hls/stream.m3u8?link=${encodeURIComponent(link)}&index=${index}${isAvi ? '&vcodec=h264' : ''}`;
        } catch {
          rawStreamUrl = sourceUrl;
        }
      } else {
        rawStreamUrl = title.videoUrl || title.directUrl || '';
      }
    } else {
      rawStreamUrl = (canPlayDirect && title.directUrl) ? title.directUrl : (title.videoUrl || title.directUrl || '');
    }

    let url = serverUrl(rawStreamUrl);

    // On web, if live stream is an external direct URL, ensure it routes through proxy to avoid CORS/Mixed-Content
    if (!Capacitor.isNativePlatform() && title.type === 'live' && !url.includes('/api/iptv/stream') && (url.startsWith('http://') || url.startsWith('https://'))) {
      url = serverUrl('/api/iptv/stream?url=' + encodeURIComponent(title.videoUrl!));
    }

    // Add start parameter for HLS resume — FFmpeg starts from saved position
    if (isHls && initialTime && initialTime > 30 && url.includes('/api/torrents/hls')) {
      const separator = url.includes('?') ? '&' : '?';
      url = url + separator + 'start=' + Math.floor(initialTime);
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls(getHlsPlayerConfig());
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
          if (!isHls || (!title.hlsUrl && !title.videoUrl?.includes('/api/torrents/hls') && !title.videoUrl?.includes('/api/downloads/server/hls')) || !seekOffsetRef.current) {
            video.currentTime = initialTime;
          }
        }
        video.play().catch(() => {});

        // Try to load pre-extracted subtitles from HLS session (with retry)
        const sessionMatch = url.match(/session=([a-f0-9]+)/);
        if (sessionMatch) {
          const sessionId = sessionMatch[1];
          const tryLoadSubs = (attempt: number) => {
            if (attempt > 10) return; // max 10 attempts
            serverFetch(`/api/torrents/hls-subs?session=${sessionId}`)
              .then(res => {
                if (!res.ok) return null;
                return res.text();
              })
              .then(vtt => {
                if (!vtt || vtt.length < 10) {
                  // Subtitles not ready yet, retry after delay
                  setTimeout(() => tryLoadSubs(attempt + 1), 3000);
                  return;
                }
                console.log('Subtitles loaded:', vtt.length, 'bytes');
                // Parse VTT
                const cues: Array<{ start: number; end: number; text: string }> = [];
                const normalized = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const blocks = normalized.split(/\n\n+/);
                for (const block of blocks) {
                  const lines = block.trim().split('\n');
                  if (lines.length < 2) continue;
                  if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;
                  let timeLineIndex = -1;
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('-->')) { timeLineIndex = i; break; }
                  }
                  if (timeLineIndex === -1) continue;
                  const timeMatch = lines[timeLineIndex].match(/((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3})/);
                  if (!timeMatch) continue;
                  const start = parseVttTime(timeMatch[1].replace(',', '.'));
                  const end = parseVttTime(timeMatch[2].replace(',', '.'));
                  const text = cleanSubText(lines.slice(timeLineIndex + 1).join('\n'));
                  if (text) cues.push({ start, end, text });
                }
                if (cues.length > 0) {
                  console.log('Loaded', cues.length, 'subtitle cues');
                  subtitleCuesRef.current = cues;
                  setSubtitleTracks(prev => {
                    if (prev.some((p: any) => p.url || p.isExternal)) return prev;
                    return [{ id: 0, name: 'Субтитры', lang: 'auto' }];
                  });
                  setCurrentSubtitle(0);
                }
              })
              .catch(() => {
                // Retry on error
                setTimeout(() => tryLoadSubs(attempt + 1), 3000);
              });
          };
          // Start first attempt after 2 seconds
          setTimeout(() => tryLoadSubs(0), 2000);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        if (!data.audioTracks || data.audioTracks.length === 0) return;
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
        if (isTorrent) return;
        if (!data.subtitleTracks || data.subtitleTracks.length === 0) return;
        setSubtitleTracks(prev => {
          if (prev.some((p: any) => p.url || p.isExternal)) return prev;
          return data.subtitleTracks.map((track, id) => ({
            id,
            name: track.name || `Track ${id}`,
            lang: track.lang || 'unknown',
          }));
        });
      });

      let reconnectAttempts = 0;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            reconnectAttempts++;
            if (reconnectAttempts <= 3) {
              // Try to recover network error by retrying load
              console.log(`HLS: Network error, retry ${reconnectAttempts}/3...`);
              setLoading(true);
              setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.startLoad();
                }
              }, 2000);
            } else {
              // Too many retries — create fresh session from current position
              console.log('HLS: Creating fresh session...');
              const savedTime = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
              if (hlsRef.current) hlsRef.current.destroy();
              let reconnectUrl = url;
              if (url.includes('/api/torrents/hls') && savedTime > 30) {
                const linkMatch = url.match(/link=([^&]+)/);
                const indexMatch = url.match(/index=(\d+)/);
                if (linkMatch) {
                  reconnectUrl = serverUrl(`/api/torrents/hls-seek?link=${linkMatch[1]}&index=${indexMatch ? indexMatch[1] : '0'}&time=${savedTime}`);
                }
              }
              const newHls = new Hls(getHlsPlayerConfig());
              hlsRef.current = newHls;
              reconnectAttempts = 0;
              newHls.loadSource(reconnectUrl);
              newHls.attachMedia(video);
              newHls.on(Hls.Events.MANIFEST_PARSED, () => {
                setLoading(false);
                video.play().catch(() => {});
              });
              newHls.on(Hls.Events.ERROR, (_e, d) => {
                if (d.fatal) {
                  console.error('HLS reconnect failed:', d);
                  setError(t('common.error'));
                  setLoading(false);
                }
              });
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.log('HLS: Media error, trying recovery...');
            hls.recoverMediaError();
          } else {
            setError(t('common.error'));
            setLoading(false);
          }
        } else {
          // Non-fatal error — just log
          console.warn('HLS non-fatal error:', data);
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
        // Fallback to HLS if direct play fails in browser (e.g. unsupported container or audio codec)
        let fallbackHls = title.hlsUrl;
        if (!fallbackHls && (url.includes('/api/torrents/proxy') || url.includes('/api/torrents/'))) {
          try {
            const urlObj = new URL(url, window.location.origin);
            const link = urlObj.searchParams.get('link');
            const index = urlObj.searchParams.get('index') || '0';
            const isAvi = url.toLowerCase().includes('.avi');
            if (link) {
              fallbackHls = `/api/torrents/hls/stream.m3u8?link=${encodeURIComponent(link)}&index=${index}${isAvi ? '&vcodec=h264' : ''}`;
            }
          } catch {}
        }

        if (fallbackHls && !url.includes('/api/torrents/hls')) {
          console.warn('[Player] Direct playback failed, falling back to HLS transcoding:', fallbackHls);
          const hlsUrl = serverUrl(fallbackHls);
          if (Hls.isSupported()) {
            video.removeAttribute('src');
            video.load();
            const hls = new Hls(getHlsPlayerConfig());
            hlsRef.current = hls;
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setLoading(false);
              if (initialTime && initialTime > 0 && !fallbackHls.includes('&start=')) {
                video.currentTime = initialTime;
              }
              video.play().catch(() => {});
            });
            return;
          }
        }
        setError(t('common.error'));
        setLoading(false);
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [title.videoUrl, title.directUrl, hasVideo, isHls]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isDraggingRef.current && !isSeekingRef.current) {
        const offset = seekOffsetRef.current || 0;
        const effectiveTime = offset + video.currentTime;
        setCurrentTime(effectiveTime);
        // Only update duration from video if we don't have a real duration from FFprobe
        if (video.duration && isFinite(video.duration) && realDurationRef.current === 0) {
          setDuration(offset + video.duration);
        }
        // Save playback position (throttled by parent)
        if (onTimeUpdate) {
          onTimeUpdate(effectiveTime);
        }
        if (subtitleCuesRef.current.length > 0 && currentSubtitleRef.current >= 0) {
          const cue = subtitleCuesRef.current.find(c => effectiveTime >= c.start && effectiveTime <= c.end);
          setSubtitleText(cue?.text ? cue.text.trim() : '');
        } else if (currentSubtitleRef.current < 0) {
          setSubtitleText('');
        }
      }
    };
    const onProgress = () => {
      const dur = realDurationRef.current > 0 ? realDurationRef.current : (duration > 0 ? duration : video.duration);
      if (video.buffered.length > 0 && dur && isFinite(dur) && dur > 0) {
        const offset = seekOffsetRef.current || 0;
        const cur = video.currentTime;
        let startSec = video.buffered.start(0);
        let endSec = video.buffered.end(0);
        for (let i = 0; i < video.buffered.length; i++) {
          if (cur >= video.buffered.start(i) - 0.5 && cur <= video.buffered.end(i) + 0.5) {
            startSec = video.buffered.start(i);
            endSec = video.buffered.end(i);
            break;
          }
        }
        const bStart = Math.max(0, offset + startSec);
        const bEnd = Math.min(dur, offset + endSec);
        setBufferedRange({
          start: Math.max(0, (bStart / dur) * 100),
          end: Math.min(100, (bEnd / dur) * 100),
        });
        setBuffered(Math.min(1, bEnd / dur));
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => {
      setLoading(false);
      isSeekingRef.current = false;
    };
    const onCanPlay = () => {
      setLoading(false);
      isSeekingRef.current = false;
    };
    const onLoadedMetadata = () => {
      // Only update duration from video if we don't have a real duration from FFprobe
      if (isFinite(video.duration) && realDurationRef.current === 0) {
        setDuration(video.duration);
      }
    };

    const onSeeking = () => {
      isSeekingRef.current = true;
    };
    const onSeeked = () => {
      isSeekingRef.current = false;
      setLoading(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
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
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
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
  }, [playing, isFullscreen, resetHideTimer, onExit, settingsPanel, duration]);

  // Fullscreen change detection
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    playing ? video.pause() : video.play();
    resetHideTimer();
  };

  // Double-tap seek state
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekIndicator, setSeekIndicator] = useState<{ text: string; side: 'left' | 'right' } | null>(null);
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoAreaClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const x = e.clientX;
    const screenWidth = window.innerWidth;
    const side = x < screenWidth / 2 ? 'left' : 'right';

    // Double-tap detection (within 300ms, same half of screen)
    if (now - lastTapRef.current.time < 300) {
      const prevSide = lastTapRef.current.x < screenWidth / 2 ? 'left' : 'right';
      if (side === prevSide) {
        // Cancel pending single-tap
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }

        // Double-tap confirmed → seek
        const seconds = side === 'left' ? -10 : 10;
        skip(seconds);

        // Show indicator
        setSeekIndicator({ text: `${seconds > 0 ? '+' : ''}${seconds}с`, side });
        if (seekIndicatorTimer.current) clearTimeout(seekIndicatorTimer.current);
        seekIndicatorTimer.current = setTimeout(() => setSeekIndicator(null), 800);

        lastTapRef.current = { time: 0, x: 0 };
        return;
      }
    }

    lastTapRef.current = { time: now, x };

    // Capture controls visibility state at the exact moment of the tap
    const wasVisible = showControlsRef.current;

    // Delayed single-tap (wait for possible double-tap)
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      // If a settings menu is currently open, a tap on the video dismisses the modal first
      if (settingsPanelRef.current !== 'none') {
        setSettingsPanel('none');
        resetHideTimer();
        return;
      }

      if (!wasVisible) {
        controlsJustOpenedRef.current = Date.now();
        resetHideTimer();
      } else {
        setShowControls(false);
        showControlsRef.current = false;
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
          hideTimer.current = undefined;
        }
      }
    }, 250);
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const dur = duration > 0 ? duration : (isFinite(video.duration) ? video.duration : Infinity);
    const target = Math.max(0, Math.min(currentTime + seconds, dur));
    if (dur > 0 && isFinite(dur)) {
      seek(target / dur);
    } else {
      video.currentTime = Math.max(0, video.currentTime + seconds);
    }
  };

  const seek = (fraction: number) => {
    const video = videoRef.current;
    if (!video || !isFinite(duration) || duration <= 0) return;

    const targetTime = Math.max(0, Math.min(fraction * duration, duration));
    setCurrentTime(targetTime);

    const isTorrentHls = isHls && (Boolean(title.hlsUrl) || title.videoUrl?.includes('/api/torrents/hls') || title.videoUrl?.includes('/api/downloads/server/hls') || isTorrent);
    if (isTorrentHls) {
      const offset = seekOffsetRef.current || 0;
      const localTarget = targetTime - offset;
      let isBuffered = false;

      if (video.buffered && video.buffered.length > 0 && localTarget >= 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (localTarget >= video.buffered.start(i) && localTarget <= video.buffered.end(i) - 0.5) {
            isBuffered = true;
            break;
          }
        }
      }

      if (isBuffered) {
        if (seekDebounceTimer.current) {
          clearTimeout(seekDebounceTimer.current);
          seekDebounceTimer.current = undefined;
        }
        video.currentTime = localTarget;
        video.play().catch(() => {});
        if (currentSubtitleRef.current >= 0) {
          const effTime = (seekOffsetRef.current || 0) + localTarget;
          const isCovered = loadedRangesRef.current.some(r => effTime >= r.start && effTime <= r.end - 10);
          if (!isCovered) {
            setSubtitle(currentSubtitleRef.current, Math.floor(effTime));
          } else {
            const match = subtitleCuesRef.current.find(c => effTime >= c.start && effTime <= c.end);
            setSubtitleText(match?.text ? match.text.trim() : '');
          }
        }
        return;
      }

      // Outside buffer: debounce server seek to prevent swarm thrashing on rapid taps
      const newOffset = Math.floor(targetTime);
      seekOffsetRef.current = newOffset;
      isSeekingRef.current = true;
      setLoading(true);
      setSubtitleText(''); // Instantly clear subtitle on seek to avoid ghost text

      // Instantly start prefetching subtitles for the new target time if active!
      if (currentSubtitleRef.current >= 0) {
        const isCovered = loadedRangesRef.current.some(r => newOffset >= r.start && newOffset <= r.end - 10);
        if (!isCovered) {
          setSubtitle(currentSubtitleRef.current, newOffset);
        } else {
          const match = subtitleCuesRef.current.find(c => newOffset >= c.start && newOffset <= c.end);
          setSubtitleText(match?.text ? match.text.trim() : '');
        }
      }

      // Update buffered range to start at the new position immediately
      setBufferedRange({
        start: Math.max(0, (newOffset / duration) * 100),
        end: Math.max(0, (newOffset / duration) * 100),
      });

      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
      }

      seekDebounceTimer.current = setTimeout(() => {
        let activeHlsSource = title.hlsUrl || (title.videoUrl?.includes('/api/torrents/hls') ? title.videoUrl : '');
        if (!activeHlsSource && isTorrent) {
          const sourceUrl = title.videoUrl || title.directUrl || '';
          try {
            const parsed = new URL(sourceUrl, 'http://localhost');
            const link = parsed.searchParams.get('link') || '';
            const index = parsed.searchParams.get('index') || '0';
            const isAvi = sourceUrl.toLowerCase().includes('.avi');
            activeHlsSource = `/api/torrents/hls/stream.m3u8?link=${encodeURIComponent(link)}&index=${index}${isAvi ? '&vcodec=h264' : ''}`;
          } catch {}
        }
        if (!activeHlsSource) activeHlsSource = title.videoUrl || '';

        let cleanUrl = activeHlsSource.replace(/([?&])start=\d+(&|$)/g, '$1').replace(/[?&]$/, '');
        const separator = cleanUrl.includes('?') ? '&' : '?';
        const newSeekUrl = serverUrl(`${cleanUrl}${separator}start=${newOffset}&audio=${currentAudioIndex}`);

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // Reset video.currentTime to 0 so browser doesn't stall waiting for old playhead
        video.currentTime = 0;

        if (isHls && Hls.isSupported()) {
          const newHls = new Hls(getHlsPlayerConfig({ startPosition: 0 }));
          hlsRef.current = newHls;

          newHls.loadSource(newSeekUrl);
          newHls.attachMedia(video);

          newHls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            isSeekingRef.current = false;
            video.currentTime = 0;
            video.play().catch(() => {});

            if (currentSubtitleRef.current >= 0) {
              const isCovered = loadedRangesRef.current.some(r => newOffset >= r.start && newOffset <= r.end - 10);
              if (!isCovered) {
                setSubtitle(currentSubtitleRef.current, newOffset);
              } else {
                const match = subtitleCuesRef.current.find(c => newOffset >= c.start && newOffset <= c.end);
                setSubtitleText(match?.text ? match.text.trim() : '');
              }
            }
          });

          newHls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              console.error('HLS seek error:', data);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                newHls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                newHls.recoverMediaError();
              }
            }
          });
        } else {
          video.src = newSeekUrl;
          video.load();
          video.play().catch(() => {});

          if (currentSubtitleRef.current >= 0) {
            const isCovered = loadedRangesRef.current.some(r => newOffset >= r.start && newOffset <= r.end - 10);
            if (!isCovered) {
              setSubtitle(currentSubtitleRef.current, newOffset);
            } else {
              const match = subtitleCuesRef.current.find(c => newOffset >= c.start && newOffset <= c.end);
              setSubtitleText(match?.text ? match.text.trim() : '');
            }
          }
        }

        // Safety fallback: allow timeupdate after 5s even if events are missed
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 5000);
      }, 200);
    } else {
      video.currentTime = targetTime;
    }
  };

  const toggleFullscreen = () => {
    if (Capacitor.isNativePlatform()) {
      // Android: app is always fullscreen (immersive mode in MainActivity)
      // Toggle controls visibility instead
      setShowControls(prev => !prev);
    } else {
      // Web: standard Fullscreen API
      const container = containerRef.current;
      if (!container) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (container.requestFullscreen) {
        container.requestFullscreen();
      }
    }
  };

  const dragFractionRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary mouse button or touch/pen
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    resetHideTimer();

    setIsDragging(true);
    isDraggingRef.current = true;
    isSeekingRef.current = true;

    // Prevent text selection during drag and show grabbing cursor
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const getFraction = (clientX: number) => {
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const initialFraction = getFraction(e.clientX);
    dragFractionRef.current = initialFraction;

    // Direct synchronous DOM update for zero lag
    if (playedBarRef.current) {
      playedBarRef.current.style.width = `${initialFraction * 100}%`;
    }
    setDragFraction(initialFraction);
    if (isFinite(duration) && duration > 0) {
      setCurrentTime(initialFraction * duration);
      setHoverTime(initialFraction * duration);
    }
    if (progressRef.current) {
      const r = progressRef.current.getBoundingClientRect();
      setHoverX(e.clientX - r.left);
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();
      moveEvt.stopPropagation();
      resetHideTimer();

      const fraction = getFraction(moveEvt.clientX);
      dragFractionRef.current = fraction;

      // Direct synchronous DOM update: thumb follows cursor IMMEDIATELY with 0ms lag
      if (playedBarRef.current) {
        playedBarRef.current.style.width = `${fraction * 100}%`;
      }

      // Throttle React state updates to 60fps via requestAnimationFrame
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (isDraggingRef.current) {
            const currentFraction = dragFractionRef.current;
            setDragFraction(currentFraction);
            if (isFinite(duration) && duration > 0) {
              setCurrentTime(currentFraction * duration);
              setHoverTime(currentFraction * duration);
            }
            if (progressRef.current) {
              const r = progressRef.current.getBoundingClientRect();
              setHoverX(moveEvt.clientX - r.left);
            }
          }
        });
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      upEvt.preventDefault();
      upEvt.stopPropagation();
      resetHideTimer();

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const finalFraction = getFraction(upEvt.clientX);
      dragFractionRef.current = finalFraction;

      if (playedBarRef.current) {
        playedBarRef.current.style.width = `${finalFraction * 100}%`;
      }

      setIsDragging(false);
      isDraggingRef.current = false;

      // Seek video to final position
      seek(finalFraction);

      setHoverTime(null);

      setTimeout(() => {
        if (!isDraggingRef.current) {
          setDragFraction(null);
        }
      }, 350);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerUp, { passive: false });
  };

  const handleTimelineHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(isFinite(duration) && duration > 0 ? fraction * duration : 0);
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
    const isTorrentHls = isHls && (Boolean(title.hlsUrl) || title.videoUrl?.includes('/api/torrents/hls') || isTorrent);
    if (!isTorrentHls) {
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

    let activeHlsSource = title.hlsUrl || (title.videoUrl?.includes('/api/torrents/hls') ? title.videoUrl : '');
    if (!activeHlsSource && isTorrent) {
      const sourceUrl = title.videoUrl || title.directUrl || '';
      try {
        const parsed = new URL(sourceUrl, 'http://localhost');
        const link = parsed.searchParams.get('link') || '';
        const index = parsed.searchParams.get('index') || '0';
        const isAvi = sourceUrl.toLowerCase().includes('.avi');
        activeHlsSource = `/api/torrents/hls/stream.m3u8?link=${encodeURIComponent(link)}&index=${index}${isAvi ? '&vcodec=h264' : ''}`;
      } catch {}
    }
    if (!activeHlsSource) activeHlsSource = title.videoUrl || '';

    // Build new URL with audio parameter and current offset
    const fullUrl = serverUrl(activeHlsSource);
    const urlObj = new URL(fullUrl, window.location.origin);
    urlObj.searchParams.set('audio', String(id));
    const effectiveCurTime = (seekOffsetRef.current || 0) + saveTime;
    if (effectiveCurTime > 10) {
      urlObj.searchParams.set('start', String(Math.floor(effectiveCurTime)));
      seekOffsetRef.current = Math.floor(effectiveCurTime);
    }
    const newUrl = urlObj.toString();

    // Create new HLS instance
    const hls = new Hls(getHlsPlayerConfig());
    hlsRef.current = hls;

    hls.loadSource(newUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setLoading(false);
      // Resume playback if it was playing before
      if (wasPlaying) {
        video.play().catch(() => {});
      }
      // Reset audio switch flag
      setTimeout(() => { audioSwitchRef.current = false; }, 1000);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        console.error('HLS fatal error:', data);
        setError('Ошибка загрузки видео');
        setLoading(false);
      }
    });
  };

  const cleanSubText = (text: string) => {
    if (!text) return '';
    return text.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
  };

  const setSubtitle = async (id: number, targetSec?: number) => {
    // 1. Explicitly turn off subtitles
    if (id < 0) {
      if (subAbortControllerRef.current) {
        subAbortControllerRef.current.abort();
        subAbortControllerRef.current = null;
      }
      setCurrentSubtitle(-1);
      subtitleCuesRef.current = [];
      loadedRangesRef.current = [];
      setSubtitleText('');
      setSettingsPanel('none');
      return;
    }

    // 2. Look up track using ref to avoid stale state closure!
    const track = subtitleTracksRef.current.find(t => t.id === id);
    if (!track) {
      // If tracks are still loading asynchronously, remember desired ID without resetting to -1!
      setCurrentSubtitle(id);
      return;
    }

    // 3. If external or backend-extracted subtitle, fetch and parse WebVTT
    if ((track as any).url) {
      // Abort previous in-flight fetch so TorrServer and network don't choke
      if (subAbortControllerRef.current) {
        subAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      subAbortControllerRef.current = abortController;
      subFetchingRef.current = true;

      try {
        const baseSubUrl = (track as any).url.replace(/&time=\d+/g, '');
        const curSec = targetSec !== undefined
          ? targetSec
          : Math.floor((seekOffsetRef.current || 0) + (videoRef.current ? videoRef.current.currentTime : (initialTime || 0)));
        const fetchSec = Math.max(0, curSec - 5);
        const subUrl = (!(track as any).isExternal && fetchSec > 0)
          ? `${baseSubUrl}&time=${fetchSec}`
          : baseSubUrl;

        const res = await serverFetch(subUrl, { signal: abortController.signal });
        if (!res.ok) {
          console.error('Subtitle fetch failed:', res.status, res.statusText);
          setSettingsPanel('none');
          return;
        }
        const vtt = await res.text();
        console.log('Subtitle VTT received:', vtt.length, 'bytes');

        // Parse WebVTT cues — handle both \n and \r\n, skip WEBVTT header
        const cues: Array<{ start: number; end: number; text: string }> = [];
        const normalized = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = normalized.split(/\n\n+/);
        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const lines = block.trim().split('\n');
          if (lines.length < 2) continue;
          if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;
          let timeLineIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('-->')) {
              timeLineIndex = i;
              break;
            }
          }
          if (timeLineIndex === -1) continue;
          const timeMatch = lines[timeLineIndex].match(/((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3})/);
          if (!timeMatch) continue;
          const start = parseVttTime(timeMatch[1].replace(',', '.'));
          const end = parseVttTime(timeMatch[2].replace(',', '.'));
          const text = cleanSubText(lines.slice(timeLineIndex + 1).join('\n'));
          if (text) cues.push({ start, end, text });
        }
        console.log('Parsed subtitle cues:', cues.length);

        const newRange = { start: Math.max(0, fetchSec - 5), end: fetchSec + 90 };
        if (targetSec === undefined) {
          loadedRangesRef.current = [newRange];
        } else {
          loadedRangesRef.current.push(newRange);
        }

        if (cues.length > 0) {
          const existing = (targetSec !== undefined ? subtitleCuesRef.current : []) || [];
          const map = new Map<string, { start: number; end: number; text: string }>();
          for (const c of existing) {
            map.set(`${Math.round(c.start * 10)}_${c.text}`, c);
          }
          for (const c of cues) {
            map.set(`${Math.round(c.start * 10)}_${c.text}`, c);
          }
          subtitleCuesRef.current = Array.from(map.values()).sort((a, b) => a.start - b.start);
          const video = videoRef.current;
          if (video) {
            const curT = (seekOffsetRef.current || 0) + video.currentTime;
            const match = subtitleCuesRef.current.find(c => curT >= c.start && curT <= c.end);
            setSubtitleText(match?.text ? match.text.trim() : '');
          }
        }
        setCurrentSubtitle(id);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to load subtitles:', err);
        }
      } finally {
        subFetchingRef.current = false;
      }
    } else if (hlsRef.current) {
      // HLS embedded subtitle
      hlsRef.current.subtitleTrack = id;
      setCurrentSubtitle(id);
    }

    setSettingsPanel('none');
  };

  // Update subtitle display and throttled prefetch using loadedRangesRef
  useEffect(() => {
    if (currentSubtitle < 0) {
      setSubtitleText('');
      return;
    }

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const t = (seekOffsetRef.current || 0) + video.currentTime;
      const cues = subtitleCuesRef.current;
      const cue = cues.find(c => t >= c.start && t <= c.end);
      setSubtitleText(cue?.text ? cue.text.trim() : '');

      // Check if current position is covered in loadedRangesRef
      const ranges = loadedRangesRef.current;
      const isCovered = ranges.some(r => t >= r.start && t <= r.end - 15);
      const now = Date.now();
      if (!isCovered && !subFetchingRef.current && now - lastPrefetchTimeRef.current > 1500) {
        lastPrefetchTimeRef.current = now;
        setSubtitle(currentSubtitle, Math.floor(t));
      }
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

  const progress = dragFraction !== null
    ? dragFraction * 100
    : (isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black select-none"
      onTouchStart={() => {
        lastTouchTimeRef.current = Date.now();
      }}
      onMouseMove={() => {
        // Ignore synthetic mousemove triggered by touch on Android/touch devices
        if (Date.now() - lastTouchTimeRef.current < 800) return;
        resetHideTimer();
      }}
      onClick={handleVideoAreaClick}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
      />

      {/* Double-tap seek indicator */}
      {seekIndicator && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 z-30 pointer-events-none flex items-center gap-2 rounded-full bg-black/50 px-6 py-3 text-white text-[20px] font-semibold animate-fade-in ${
            seekIndicator.side === 'left' ? 'left-[15%]' : 'right-[15%]'
          }`}
        >
          {seekIndicator.side === 'left' ? (
            <SkipBack className="h-5 w-5" />
          ) : (
            <SkipForward className="h-5 w-5" />
          )}
          {seekIndicator.text}
        </div>
      )}

      {/* Subtitle overlay */}
      {subtitleText && subtitleText.trim() && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center max-w-[80%]">
          <div className="inline-block px-4 py-2 rounded-lg bg-black/80 backdrop-blur-sm text-white text-[18px] leading-relaxed shadow-lg">
            {subtitleText.trim()}
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
            <button onClick={onExit} className="px-6 py-2 rounded-full bg-white/10 text-white text-[14px]">{t('common.back')}</button>
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
          pointerEvents: showControls ? 'auto' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={resetHideTimer}
        onTouchMove={resetHideTimer}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <button
            onClick={onExit}
            className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-4 py-2 text-[13px] font-medium text-white/85 hover:bg-white/20 transition"
          >
            <ChevronLeft className="h-4 w-4" />{t('common.back')}
          </button>
          <div className="text-center max-w-xl truncate px-4">
            <div className="text-[15px] font-semibold text-white truncate">
              {title.name}
            </div>
            {title.episode && (
              <div className="text-[12px] font-medium text-amber-300/90 truncate mt-0.5">
                {title.episode}
              </div>
            )}
            <div className="text-[11px] text-white/50 mt-0.5">
              {title.year ? `${title.year} · ` : ''}{title.runtime || ''}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(title.directUrl || title.videoUrl) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const streamLink = serverUrl(title.directUrl || title.videoUrl || '');
                  navigator.clipboard?.writeText(streamLink);
                  setCopiedStreamLink(true);
                  setTimeout(() => setCopiedStreamLink(false), 2500);
                }}
                title="Скопировать прямую ссылку на поток для VLC / PotPlayer (0% нагрузки на сервер)"
                className="hidden sm:flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 px-3 py-1.5 text-[11px] font-medium text-white/80 transition"
              >
                {copiedStreamLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ExternalLink className="h-3.5 w-3.5" />}
                <span>{copiedStreamLink ? 'Ссылка скопирована' : 'VLC / PotPlayer'}</span>
              </button>
            )}
            <div className="text-[12px] text-white/50">{fmtTime(currentTime)}</div>
          </div>
        </div>
      </div>

      {/* Center play/pause */}
      {!loading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20 transition-opacity duration-300"
          style={{
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (Date.now() - controlsJustOpenedRef.current < 350) return;
            togglePlay();
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (Date.now() - controlsJustOpenedRef.current < 350) return;
              togglePlay();
            }}
            aria-label={playing ? "Пауза" : "Воспроизведение"}
            className="h-20 w-20 rounded-full bg-black/45 hover:bg-black/65 border border-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-2xl transition-all duration-200 active:scale-90 hover:scale-110"
          >
            {playing ? (
              <Pause className="h-10 w-10 text-white" fill="currentColor" />
            ) : (
              <Play className="h-10 w-10 text-white ml-1.5" fill="currentColor" />
            )}
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 transition-all duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          transform: showControls ? 'translateY(0)' : 'translateY(100%)',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
          pointerEvents: showControls ? 'auto' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={resetHideTimer}
        onTouchMove={resetHideTimer}
      >
        {/* Timeline */}
        <div className="px-6 mb-2">
          <div
            ref={progressRef}
            className="player-timeline no-drag select-none group relative h-8 flex items-center cursor-pointer touch-none"
            role="slider"
            aria-label="Seek slider"
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handleTimelineHover}
            onPointerLeave={() => {
              if (!isDraggingRef.current) setHoverTime(null);
            }}
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
              <div
                className="absolute inset-y-0 rounded-full bg-white/40 pointer-events-none"
                style={{
                  left: `${bufferedRange.start}%`,
                  width: `${Math.max(0, bufferedRange.end - bufferedRange.start)}%`,
                }}
              />
              {/* Played range */}
              <div
                ref={playedBarRef}
                className="absolute inset-y-0 left-0 rounded-full bg-white pointer-events-none"
                style={{ width: `${progress}%`, transition: 'none' }}
              >
                <div
                  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-4 w-4 rounded-full bg-white shadow-lg pointer-events-none ${
                    isDragging ? 'opacity-100 scale-125' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                  }`}
                  style={{
                    transition: isDragging ? 'none' : 'opacity 150ms ease-out, transform 150ms ease-out',
                  }}
                />
              </div>
            </div>
            {/* Buffer indicator */}
            {bufferedRange.end > 0 && bufferedRange.end < 98 && (
              <div className="text-[10px] text-white/30 mt-1">
                {t('player.buffer')}: {fmtTime((bufferedRange.end / 100) * duration)}
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
              title={t('common.audio')}
            >
              <Volume2 className="h-5 w-5" />
            </button>

            {/* Subtitles button — only show when subtitles are available */}
            {subtitleTracks.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel === 'subtitles' ? 'none' : 'subtitles'); }}
                className={`text-white/70 hover:text-white transition ${currentSubtitle >= 0 ? 'text-amber-300' : ''}`}
                title={t('common.subtitles')}
              >
                <Subtitles className="h-5 w-5" />
              </button>
            )}

            {/* Settings button */}
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsPanel(settingsPanel === 'none' ? 'quality' : 'none'); }}
              className="text-white/70 hover:text-white transition"
              title={t('common.quality')}
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
                <span className="text-[13px] font-medium text-white">{t('common.quality')}</span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setQuality(-1)}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                >
                  <span>{t('common.auto')}</span>
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
                <span className="text-[13px] font-medium text-white">{t('common.audio')}</span>
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
                <span className="text-[13px] font-medium text-white">{t('common.subtitles')}</span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setSubtitle(-1)}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-white/80 hover:bg-white/10 flex items-center justify-between"
                >
                  <span>{t('player.off')}</span>
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
