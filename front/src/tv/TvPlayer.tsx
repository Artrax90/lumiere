import { useEffect, useRef, useState, useCallback } from 'react';
import type { Title } from '@/api/client';
import { serverUrl } from '@/api/server';

interface TvPlayerProps {
  title: Title;
  initialTime?: number;
  onExit: () => void;
  onTimeUpdate?: (time: number) => void;
}

// Samsung AVPlay API wrapper
function getAvplay(): any | null {
  try {
    const webapis = (window as any).webapis;
    return webapis?.avplay || null;
  } catch {
    return null;
  }
}

export default function TvPlayer({ title, initialTime = 0, onExit, onTimeUpdate }: TvPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [showOsd, setShowOsd] = useState(true);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avplayRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const url = serverUrl(title.videoUrl || '');
  const isHls = url.includes('.m3u8') || url.includes('/hls');

  // Show OSD then auto-hide
  const showOsdBriefly = useCallback(() => {
    setShowOsd(true);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setShowOsd(false), 3000);
  }, []);

  // Initialize AVPlay for Tizen TV
  useEffect(() => {
    const avplay = getAvplay();
    if (!avplay || !containerRef.current) return;

    avplayRef.current = avplay;

    try {
      // Create AVPlay object element
      const obj = document.createElement('object');
      obj.type = 'application/avplayer';
      obj.style.position = 'absolute';
      obj.style.top = '0';
      obj.style.left = '0';
      obj.style.width = '100%';
      obj.style.height = '100%';
      containerRef.current.appendChild(obj);

      avplay.open(url);
      avplay.setDisplayRect(0, 0, 1920, 1080);

      avplay.setListener({
        onstreamcompleted: () => {
          setPlaying(false);
        },
        onerror: (err: string) => {
          console.error('[TvPlayer] AVPlay error:', err);
        },
      });

      avplay.prepareAsync(() => {
        if (initialTime > 0) {
          avplay.seekTo(initialTime * 1000);
        }
        avplay.play();
        setPlaying(true);

        // Get duration
        const info = avplay.getStreamingProperty('DURATION_INFO');
        if (info) {
          setDuration(parseInt(info) / 1000);
        }
      });

    } catch (err) {
      console.error('[TvPlayer] Failed to init AVPlay:', err);
    }

    return () => {
      try {
        avplay.stop();
        avplay.close();
      } catch {}
    };
  }, [url, initialTime]);

  // Fallback: HLS.js for web/Android (non-Tizen)
  useEffect(() => {
    if (getAvplay()) return; // Skip if AVPlay is available

    const video = videoRef.current;
    if (!video || !url) return;

    import('hls.js').then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 120,
          maxMaxBufferLength: 300,
        });
        hlsRef.current = hls;

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (initialTime > 0) video.currentTime = initialTime;
          video.play().catch(() => {});
          setPlaying(true);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          if (initialTime > 0) video.currentTime = initialTime;
          video.play().catch(() => {});
          setPlaying(true);
        });
      }
    });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, initialTime]);

  // Handle Samsung remote keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      showOsdBriefly();

      const avplay = avplayRef.current;

      switch (e.keyCode) {
        case 10252: // MediaPlayPause
          if (playing) {
            avplay?.pause?.() || videoRef.current?.pause();
            setPlaying(false);
          } else {
            avplay?.play?.() || videoRef.current?.play();
            setPlaying(true);
          }
          e.preventDefault();
          break;

        case 412: // Rewind
          if (avplay) {
            const pos = Math.max(0, (avplay.getCurrentTime?.() || 0) - 10000);
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          }
          e.preventDefault();
          break;

        case 417: // FastForward
          if (avplay) {
            const pos = (avplay.getCurrentTime?.() || 0) + 10000;
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime += 10;
          }
          e.preventDefault();
          break;

        case 37: // ArrowLeft — seek -10s
          if (avplay) {
            const pos = Math.max(0, (avplay.getCurrentTime?.() || 0) - 10000);
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          }
          e.preventDefault();
          break;

        case 39: // ArrowRight — seek +10s
          if (avplay) {
            const pos = (avplay.getCurrentTime?.() || 0) + 10000;
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime += 10;
          }
          e.preventDefault();
          break;

        case 38: // ArrowUp — seek +60s
          if (avplay) {
            const pos = (avplay.getCurrentTime?.() || 0) + 60000;
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime += 60;
          }
          e.preventDefault();
          break;

        case 40: // ArrowDown — seek -60s
          if (avplay) {
            const pos = Math.max(0, (avplay.getCurrentTime?.() || 0) - 60000);
            avplay.seekTo(pos);
          } else if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 60);
          }
          e.preventDefault();
          break;

        case 10009: // Back — exit player
          if (avplay) {
            try { avplay.stop(); avplay.close(); } catch {}
          }
          onExit();
          e.preventDefault();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [playing, onExit, showOsdBriefly]);

  // Time update for non-Tizen (video element)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      onTimeUpdate?.(video.currentTime);
    };

    video.addEventListener('timeupdate', update);
    video.addEventListener('loadedmetadata', update);
    return () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('loadedmetadata', update);
    };
  }, [onTimeUpdate]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* AVPlay container (Tizen) */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HTML5 video fallback (web/Android) */}
      {!getAvplay() && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
        />
      )}

      {/* OSD overlay */}
      {showOsd && (
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {/* Top bar */}
          <div className="bg-gradient-to-b from-black/80 to-transparent p-8">
            <h2 className="text-display text-[28px] font-medium text-white/95">{title.name}</h2>
            {title.episode && <p className="text-[14px] text-white/55 mt-1">{title.episode}</p>}
          </div>

          {/* Bottom bar — progress */}
          <div className="bg-gradient-to-t from-black/80 to-transparent p-8">
            <div className="flex items-center gap-4">
              <span className="text-[14px] text-white/70 w-16 text-right">{formatTime(currentTime)}</span>
              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-300/80 rounded-full transition-all"
                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[14px] text-white/70 w-16">{formatTime(duration)}</span>
            </div>
            <div className="mt-3 flex items-center gap-6 text-[13px] text-white/45">
              <span>◀ ▶ перемотка ±10с</span>
              <span>▲ ▼ перемотка ±60с</span>
              <span>⏸ пауза</span>
              <span>← назад</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
