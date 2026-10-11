import { useEffect, useRef, useState, useCallback } from 'react';
import type { Title } from '@/api/client';
import { serverUrl, serverFetch } from '@/api/server';
import Hls, { type HlsConfig } from 'hls.js';

export interface ExternalSub {
  id: number;
  name: string;
  url: string;
  lang: string;
}

interface TvPlayerProps {
  title: Title;
  initialTime?: number;
  onExit: () => void;
  onTimeUpdate?: (time: number) => void;
  externalSubs?: ExternalSub[];
}

interface AudioTrack {
  id: number;
  name: string;
  lang: string;
  codec?: string;
}

interface SubtitleTrack {
  id: number;
  name: string;
  lang: string;
  url?: string;
  isExternal?: boolean;
}

type TvZone = 'neutral' | 'top' | 'timeline' | 'bottom' | 'popup';

// Samsung AVPlay API wrapper
function getAvplay(): any | null {
  try {
    const webapis = (window as any).webapis;
    return webapis?.avplay || null;
  } catch {
    return null;
  }
}

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${rem < 10 ? '0' : ''}${rem}`;
  }
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

// Parse string runtime ("124 мин", "2ч 15м", "2h 15m", "142 min", "2:15:00") into total seconds
function parseRuntime(runtimeStr?: string): number {
  if (!runtimeStr) return 0;
  const str = String(runtimeStr).trim().toLowerCase();
  const hMatch = str.match(/(\d+)\s*(?:ч|h|hour|hours)/);
  const mMatch = str.match(/(\d+)\s*(?:мин|m|min|minutes)/);
  if (hMatch || mMatch) {
    const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
    const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
    return hours * 3600 + mins * 60;
  }
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseInt(p, 10));
    if (parts.length === 3 && !isNaN(parts[0])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2 && !isNaN(parts[0])) return parts[0] * 60 + parts[1];
  }
  const num = parseInt(str, 10);
  if (!isNaN(num) && num > 0) {
    return num > 600 ? num : num * 60;
  }
  return 0;
}

// Clean release names from raw filenames (e.g. .mkv, .avi, WEB-DL, 1080p, ExKinoRay)
function cleanReleaseTitle(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/\.(mkv|avi|mp4|mov|webm)$/i, '')
    .replace(/[._](2160p|1080p|720p|480p|uhd|fhd|hd)[._].*$/i, '')
    .replace(/[._](web-dl|webrip|bluray|bdrip|hdtv)[._].*$/i, '')
    .replace(/\./g, ' ')
    .trim();
}

function parseVttTime(s: string): number {
  if (!s) return 0;
  const cleaned = s.trim().replace(',', '.');
  const p = cleaned.split(':');
  if (p.length === 3) {
    const sp = p[2].split('.');
    return parseInt(p[0], 10) * 3600 + parseInt(p[1], 10) * 60 + parseInt(sp[0], 10) + (sp[1] ? parseFloat('0.' + sp[1]) : 0);
  } else if (p.length === 2) {
    const sp2 = p[1].split('.');
    return parseInt(p[0], 10) * 60 + parseInt(sp2[0], 10) + (sp2[1] ? parseFloat('0.' + sp2[1]) : 0);
  }
  return 0;
}

function parseVtt(text: string): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  if (!text) return cues;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  for (let b = 0; b < blocks.length; b++) {
    const lines = blocks[b].trim().split('\n');
    if (lines.length === 0) continue;
    let arrowIndex = -1;
    for (let l = 0; l < lines.length; l++) {
      if (lines[l].includes('-->')) {
        arrowIndex = l;
        break;
      }
    }
    if (arrowIndex === -1) continue;

    const parts = lines[arrowIndex].split('-->');
    if (parts.length < 2) continue;
    const start = parseVttTime(parts[0].trim());
    const end = parseVttTime(parts[1].trim().split(' ')[0]);
    const textLines = lines.slice(arrowIndex + 1)
      .map(t => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const txt = textLines.join('\n');
    if (txt && end > start) {
      cues.push({ start, end, text: txt });
    }
  }
  return cues;
}

export default function TvPlayer({ title, initialTime = 0, onExit, onTimeUpdate, externalSubs = [] }: TvPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avplayRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Playback & Seeking offsets
  const seekOffsetRef = useRef<number>(0);
  const realDurationRef = useRef<number>(parseRuntime(title.runtime));
  const userPausedRef = useRef<boolean>(false);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const [currentTime, setCurrentTime] = useState(initialTime);
  const currentTimeRef = useRef(initialTime);
  currentTimeRef.current = currentTime;

  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(realDurationRef.current || 0);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // TV Navigation Zones: 'neutral' | 'top' | 'timeline' | 'bottom' | 'popup'
  const [tvZone, setTvZone] = useState<TvZone>('neutral');
  const tvZoneRef = useRef<TvZone>('neutral');
  tvZoneRef.current = tvZone;

  const changeTvZone = useCallback((zone: TvZone) => {
    tvZoneRef.current = zone;
    setTvZone(zone);
  }, []);

  const [bottomBtnIndex, setBottomBtnIndex] = useState(2); // 0=restart, 1=rewind, 2=play-pause, 3=forward, 4=next, 5=audio, 6=cc
  const bottomBtnIndexRef = useRef(2);
  bottomBtnIndexRef.current = bottomBtnIndex;

  const changeBottomBtnIndex = useCallback((idx: number) => {
    bottomBtnIndexRef.current = idx;
    setBottomBtnIndex(idx);
  }, []);

  // OSD visibility
  const [osdVisible, setOsdVisible] = useState(true);
  const osdVisibleRef = useRef(true);
  osdVisibleRef.current = osdVisible;
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Center Flash HUD indicator
  const [centerFlash, setCenterFlash] = useState<{ icon: string; text: string } | null>(null);
  const centerFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Popup track chooser
  const [popupOpen, setPopupOpen] = useState(false);
  const popupOpenRef = useRef(false);
  popupOpenRef.current = popupOpen;

  const [popupType, setPopupType] = useState<'audio' | 'cc'>('audio');
  const [popupIndex, setPopupIndex] = useState(0);
  const popupIndexRef = useRef(0);
  popupIndexRef.current = popupIndex;

  const changePopupIndex = useCallback((idx: number) => {
    popupIndexRef.current = idx;
    setPopupIndex(idx);
  }, []);

  // Tracks
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const currentAudioRef = useRef(0);
  currentAudioRef.current = currentAudio;

  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState(-1);
  const currentSubtitleRef = useRef(-1);
  currentSubtitleRef.current = currentSubtitle;

  const subtitleCuesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);
  const [currentSubText, setCurrentSubText] = useState('');
  const isSubFetchingRef = useRef(false);
  const subAbortControllerRef = useRef<AbortController | null>(null);
  const lastPrefetchTimeRef = useRef(0);

  // Seeking & Debounce
  const isSeekingRef = useRef(false);
  const seekDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekKeyTime = useRef(0);
  const lastSeekDirection = useRef(0);
  const seekHoldCount = useRef(0);

  // Session & Polling
  const sessionIdRef = useRef<string>(`tv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const [stats, setStats] = useState({
    resBadge: '1080p',
    peers: '-- / -- • -- подкл.',
    speed: '-- Мбит/с',
    bufferText: 'Буфер: --%',
    bufferPct: 0,
    activeDots: 0,
  });

  const showFlash = useCallback((icon: string, text: string) => {
    setCenterFlash({ icon, text });
    if (centerFlashTimer.current) clearTimeout(centerFlashTimer.current);
    centerFlashTimer.current = setTimeout(() => {
      setCenterFlash(null);
    }, 1200);
  }, []);

  const lastBackActionTime = useRef(0);

  const showOsd = useCallback((autoHide = true) => {
    setOsdVisible(true);
    osdVisibleRef.current = true;
    if (osdTimer.current) {
      clearTimeout(osdTimer.current);
      osdTimer.current = null;
    }
    if (autoHide && !popupOpenRef.current) {
      const timeoutMs = (tvZoneRef.current === 'timeline' || tvZoneRef.current === 'bottom' || tvZoneRef.current === 'top') ? 6000 : 3500;
      osdTimer.current = setTimeout(() => {
        if (!popupOpenRef.current) {
          setTvZone('neutral');
          tvZoneRef.current = 'neutral';
          setOsdVisible(false);
          osdVisibleRef.current = false;
        }
      }, timeoutMs);
    }
  }, []);

  const hideOsd = useCallback(() => {
    if (popupOpenRef.current) return;
    setOsdVisible(false);
    osdVisibleRef.current = false;
    setTvZone('neutral');
    tvZoneRef.current = 'neutral';
    if (osdTimer.current) {
      clearTimeout(osdTimer.current);
      osdTimer.current = null;
    }
  }, []);

  // Compute playback stream URL
  const isAvplay = Boolean(getAvplay());
  const isWebSafeFormat = Boolean(
    title.videoUrl?.endsWith('.mp4') ||
    title.videoUrl?.endsWith('.webm') ||
    title.directUrl?.endsWith('.mp4') ||
    title.directUrl?.endsWith('.webm')
  );

  const isTorrent = Boolean(
    title.videoUrl?.includes('/api/torrents/') ||
    title.directUrl?.includes('/api/torrents/') ||
    title.hlsUrl?.includes('/api/torrents/')
  );

  let rawStreamPath = '';
  if (isAvplay) {
    rawStreamPath = title.directUrl || (title.videoUrl?.includes('/api/torrents/hls')
      ? title.videoUrl.replace('/api/torrents/hls', '/api/torrents/proxy')
      : title.videoUrl || '');
  } else {
    // Android TV: use HLS for torrents and non-web-safe formats so Chromium decodes audio & video cleanly
    if (isTorrent && !isWebSafeFormat) {
      rawStreamPath = title.hlsUrl || (title.videoUrl?.includes('/api/torrents/proxy')
        ? title.videoUrl.replace('/api/torrents/proxy', '/api/torrents/hls')
        : title.videoUrl || '');
    } else {
      rawStreamPath = title.directUrl || title.videoUrl || title.hlsUrl || '';
    }
  }

  const isHls = !isAvplay && (
    rawStreamPath.includes('.m3u8') ||
    rawStreamPath.includes('/hls') ||
    (isTorrent && !isWebSafeFormat)
  );

  // Resolution detection
  useEffect(() => {
    const rawName = title.name || '';
    let res = '1080p';
    if (/4k|2160p|uhd/i.test(rawName)) res = '4K UHD';
    else if (/1080p|fhd/i.test(rawName)) res = '1080p';
    else if (/720p|hd/i.test(rawName)) res = '720p';
    setStats(prev => ({ ...prev, resBadge: res }));
  }, [title.name]);

  // Fetch duration via FFprobe from server for accurate full movie timeline
  useEffect(() => {
    const url = title.videoUrl || title.directUrl || '';
    const linkMatch = url.match(/link=([^&]+)/);
    const indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    const link = decodeURIComponent(linkMatch[1]);
    const index = indexMatch ? indexMatch[1] : '0';

    serverFetch(`/api/torrents/duration?link=${encodeURIComponent(link)}&index=${index}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.duration && data.duration > 0) {
          realDurationRef.current = data.duration;
          setDuration(data.duration);
        }
      })
      .catch(() => {});
  }, [title.videoUrl, title.directUrl]);

  // Fetch track information (audio & internal subtitles)
  useEffect(() => {
    const url = title.videoUrl || title.directUrl || '';
    const linkMatch = url.match(/link=([^&]+)/);
    const indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    const link = decodeURIComponent(linkMatch[1]);
    const index = indexMatch ? indexMatch[1] : '0';

    serverFetch(`/api/torrents/tracks?link=${encodeURIComponent(link)}&index=${index}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.audioTracks && data.audioTracks.length > 0) {
          setAudioTracks(data.audioTracks);
        }
        const combinedSubs: SubtitleTrack[] = [];
        if (data && data.subtitleTracks && data.subtitleTracks.length > 0) {
          data.subtitleTracks.forEach((st: any, i: number) => {
            const trackId = st.id !== undefined ? st.id : i;
            combinedSubs.push({
              id: trackId,
              name: st.name || st.lang || `Субтитры ${i + 1}`,
              lang: st.lang || '',
              url: `/api/torrents/subtitle/${trackId}?link=${encodeURIComponent(link)}&index=${index}`,
              isExternal: false,
            });
          });
        }
        if (externalSubs && externalSubs.length > 0) {
          externalSubs.forEach(es => {
            combinedSubs.push({
              id: 5000 + es.id,
              name: es.name || es.lang || 'Внешние субтитры',
              lang: es.lang,
              url: es.url,
              isExternal: true,
            });
          });
        }
        setSubtitleTracks(combinedSubs);
      })
      .catch(() => {});
  }, [title.videoUrl, title.directUrl, externalSubs]);

  // TorrServer buffer, speed, peers polling
  useEffect(() => {
    const url = title.videoUrl || title.directUrl || '';
    const linkMatch = url.match(/link=([^&]+)/);
    if (!linkMatch) return;
    const link = decodeURIComponent(linkMatch[1]);
    const btihMatch = link.match(/btih:([a-fA-F0-9]+)/i);
    const torrHash = btihMatch ? btihMatch[1].toLowerCase() : '';

    const pollTorrStats = async () => {
      try {
        const res = await serverFetch('/api/torrents/torrserver/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        }).catch(() => null);

        if (!res || !res.ok) return;
        const list = await res.json();
        if (!Array.isArray(list)) return;

        const torrent = list.find((t: any) =>
          (torrHash && t.hash && t.hash.toLowerCase() === torrHash) ||
          (t.title && title.name && t.title.toLowerCase().includes(title.name.toLowerCase().substring(0, 15)))
        );

        if (!torrent) return;

        const seeds = torrent.connected_seeders != null ? torrent.connected_seeders : (torrent.seeders || 0);
        const totalPeers = torrent.total_peers != null ? torrent.total_peers : (torrent.peers || 0);
        const activePeers = torrent.active_peers != null ? torrent.active_peers : seeds;
        const peersText = `👥 ${activePeers} / ${totalPeers} • ${seeds} сидов`;

        let speedText = '-- Мбит/с';
        if (torrent.download_speed != null) {
          const mbps = ((torrent.download_speed * 8) / (1024 * 1024)).toFixed(1);
          speedText = `⚡ ${mbps} Мбит/с`;
        }

        let pct = 0;
        let loadedMb = 0;
        let totalMb = 0;
        if (torrent.buffer_size && (torrent.preload_size || torrent.preloaded_bytes)) {
          const loaded = torrent.preload_size || torrent.preloaded_bytes || 0;
          pct = Math.min(100, Math.round((loaded / torrent.buffer_size) * 100));
          loadedMb = Math.round(loaded / (1024 * 1024));
          totalMb = Math.round(torrent.buffer_size / (1024 * 1024));
        } else if (torrent.buffer_size && torrent.loaded_size) {
          pct = Math.min(100, Math.round((torrent.loaded_size / torrent.buffer_size) * 100));
          loadedMb = Math.round(torrent.loaded_size / (1024 * 1024));
          totalMb = Math.round(torrent.buffer_size / (1024 * 1024));
        } else if (torrent.download_speed > 0) {
          pct = 85;
        }

        const bufferText = pct > 0 && totalMb > 0
          ? `Буфер: ${pct}% (${loadedMb}/${totalMb} МБ)`
          : (pct > 0 ? `Буфер: ${pct}%` : 'Буфер готов');

        const activeDots = Math.round((pct / 100) * 5);

        setStats(prev => ({
          ...prev,
          peers: peersText,
          speed: speedText,
          bufferText,
          bufferPct: pct,
          activeDots,
        }));
      } catch {}
    };

    pollTorrStats();
    const interval = setInterval(pollTorrStats, 2500);
    return () => clearInterval(interval);
  }, [title.videoUrl, title.directUrl, title.name]);

  // Subtitle loader for a given track and timestamp
  const loadSubtitlesForTrack = useCallback((sub: SubtitleTrack, targetSec?: number, isSeek?: boolean) => {
    if (!sub || !sub.url) return;

    // On seek, cancel any pending fetch immediately so the new position is retrieved without delay
    if (isSeek) {
      if (subAbortControllerRef.current) {
        subAbortControllerRef.current.abort();
      }
      isSubFetchingRef.current = false;
    } else if (isSubFetchingRef.current) {
      // Don't send parallel prefetch requests while another is in flight
      return;
    }

    const curSec = targetSec !== undefined ? targetSec : Math.floor(currentTimeRef.current);
    // Use targetSec directly without subtracting arbitrary seconds
    const fetchSec = Math.max(0, curSec);
    const baseSubUrl = sub.url.replace(/([?&])time=\d+/g, '');
    const sep = baseSubUrl.includes('?') ? '&' : '?';
    const fetchUrl = (!sub.isExternal && fetchSec > 0)
      ? `${baseSubUrl}${sep}time=${fetchSec}`
      : baseSubUrl;

    const controller = new AbortController();
    subAbortControllerRef.current = controller;
    isSubFetchingRef.current = true;

    const fullUrl = fetchUrl.startsWith('http') ? fetchUrl : serverUrl(fetchUrl);
    fetch(fullUrl, { signal: controller.signal })
      .then(r => r.text())
      .then(text => {
        const cues = parseVtt(text);
        if (cues.length > 0) {
          if (sub.isExternal) {
            subtitleCuesRef.current = cues;
          } else {
            const map = new Map<string, { start: number; end: number; text: string }>();
            for (const c of subtitleCuesRef.current) {
              map.set(`${Math.round(c.start * 10)}_${c.text}`, c);
            }
            for (const c of cues) {
              map.set(`${Math.round(c.start * 10)}_${c.text}`, c);
            }
            subtitleCuesRef.current = Array.from(map.values()).sort((a, b) => a.start - b.start);
          }
          const t = currentTimeRef.current;
          const match = subtitleCuesRef.current.find(c => t >= c.start && t <= c.end);
          setCurrentSubText(match ? match.text : '');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[TvPlayer] Subtitle fetch error:', err);
        }
      })
      .finally(() => {
        if (subAbortControllerRef.current === controller) {
          isSubFetchingRef.current = false;
        }
      });
  }, []);

  // Real-time subtitle cue matching interval (runs every 100ms)
  useEffect(() => {
    if (currentSubtitle < 0) {
      setCurrentSubText('');
      return;
    }

    const interval = setInterval(() => {
      const activeSub = subtitleTracks[currentSubtitleRef.current];
      if (!activeSub) return;

      const t = currentTimeRef.current;
      const cues = subtitleCuesRef.current;

      // 1. Match active subtitle cue with exact millisecond bounds
      if (cues.length > 0) {
        const match = cues.find(c => t >= c.start && t <= c.end);
        setCurrentSubText(match ? match.text : '');
      } else {
        setCurrentSubText('');
      }

      // 2. Prefetch next window rate-limited and without duplicate requests
      if (!activeSub.isExternal && !isSubFetchingRef.current) {
        const now = Date.now();
        if (now - lastPrefetchTimeRef.current > 4000) {
          const lastCue = cues[cues.length - 1];
          if (lastCue && t > lastCue.end - 20 && t <= lastCue.end + 60) {
            lastPrefetchTimeRef.current = now;
            loadSubtitlesForTrack(activeSub, Math.floor(lastCue.end + 1));
          } else if (cues.length === 0) {
            lastPrefetchTimeRef.current = now;
            loadSubtitlesForTrack(activeSub, Math.floor(t));
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [currentSubtitle, subtitleTracks, loadSubtitlesForTrack]);

  // Load or Seek HLS Stream at specific offset with auto-play guarantees
  const loadHlsSource = useCallback((urlToLoad: string, startOffsetSec: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    seekOffsetRef.current = startOffsetSec;

    // Reset video.currentTime to 0 so HTML5 video engine plays instantly from start of new stream
    try {
      video.currentTime = 0;
    } catch {}

    const attemptAutoPlay = () => {
      if (userPausedRef.current) return;
      const p = video.play();
      if (p !== undefined) {
        p.then(() => {
          setPlaying(true);
          playingRef.current = true;
        }).catch(() => {
          // Buffering or policy, will trigger on next fragment
        });
      }
    };

    if (isHls && Hls.isSupported()) {
      const hlsConfig: Partial<HlsConfig> = {
        startPosition: 0,
        progressive: false,
        startFragPrefetch: true,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 30,
        maxBufferSize: 80 * 1000 * 1000,
      };
      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      hls.loadSource(urlToLoad);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        try { video.currentTime = 0; } catch {}
        attemptAutoPlay();
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (video.paused && !userPausedRef.current) {
          attemptAutoPlay();
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
        // Never overwrite full duration with partial live-transcoding segments!
        if (realDurationRef.current <= 0 && !data.details.live && data.details.totalduration && data.details.totalduration > 0) {
          setDuration(data.details.totalduration);
        }
      });
    } else {
      video.src = urlToLoad;
      try { video.currentTime = 0; } catch {}
      attemptAutoPlay();
    }
  }, [isHls]);

  // Video playback engine initialization (AVPlay for Tizen, HLS.js / HTML5 for Android TV)
  useEffect(() => {
    const avplay = getAvplay();
    if (avplay && containerRef.current) {
      avplayRef.current = avplay;
      try {
        const obj = document.createElement('object');
        obj.type = 'application/avplayer';
        obj.style.position = 'absolute';
        obj.style.top = '0';
        obj.style.left = '0';
        obj.style.width = '100%';
        obj.style.height = '100%';
        containerRef.current.appendChild(obj);

        const initialStreamUrl = serverUrl(rawStreamPath);
        avplay.open(initialStreamUrl);
        avplay.setDisplayRect(0, 0, 1920, 1080);
        avplay.setListener({
          onstreamcompleted: () => setPlaying(false),
          onerror: (err: string) => console.error('[TvPlayer] AVPlay error:', err),
          oncurrentplaytime: (timeMs: number) => {
            const sec = timeMs / 1000;
            if (!isSeekingRef.current) {
              setCurrentTime(sec);
              onTimeUpdate?.(sec);
            }
          },
        });

        avplay.prepareAsync(() => {
          if (initialTime > 0) {
            avplay.seekTo(initialTime * 1000);
          }
          avplay.play();
          setPlaying(true);
          const durInfo = avplay.getStreamingProperty('DURATION_INFO');
          if (durInfo) {
            const d = parseInt(durInfo, 10) / 1000;
            if (d > 0 && realDurationRef.current <= 0) {
              realDurationRef.current = d;
              setDuration(d);
            }
          }
        });
      } catch (err) {
        console.error('[TvPlayer] AVPlay init failed:', err);
      }

      return () => {
        try {
          avplay.stop();
          avplay.close();
        } catch {}
      };
    }

    // HTML5 Video & HLS.js
    const video = videoRef.current;
    if (!video || !rawStreamPath) return;

    // Start with initial offset if specified
    const startSec = initialTime > 0 ? Math.floor(initialTime) : 0;
    let initialUrl = rawStreamPath;
    if (isHls && isTorrent && startSec > 0) {
      const sep = initialUrl.includes('?') ? '&' : '?';
      initialUrl = `${initialUrl}${sep}start=${startSec}&audio=0`;
    }

    loadHlsSource(serverUrl(initialUrl), startSec);

    const onTimeUpdateHandler = () => {
      if (!isSeekingRef.current && video) {
        const eff = (seekOffsetRef.current || 0) + video.currentTime;
        setCurrentTime(eff);
        onTimeUpdate?.(eff);

        // Subtitle cue matching
        if (currentSubtitleRef.current >= 0 && subtitleCuesRef.current.length > 0) {
          const match = subtitleCuesRef.current.find(c => eff >= c.start && eff <= c.end);
          setCurrentSubText(match ? match.text : '');
        } else {
          setCurrentSubText('');
        }
      }
    };

    const onPlayHandler = () => setPlaying(true);
    const onPauseHandler = () => setPlaying(false);
    const onCanPlayHandler = () => {
      if (video.paused && !userPausedRef.current) {
        video.play().catch(() => {});
        setPlaying(true);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdateHandler);
    video.addEventListener('play', onPlayHandler);
    video.addEventListener('pause', onPauseHandler);
    video.addEventListener('canplay', onCanPlayHandler);
    video.addEventListener('loadeddata', onCanPlayHandler);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeEventListener('timeupdate', onTimeUpdateHandler);
      video.removeEventListener('play', onPlayHandler);
      video.removeEventListener('pause', onPauseHandler);
      video.removeEventListener('canplay', onCanPlayHandler);
      video.removeEventListener('loadeddata', onCanPlayHandler);
    };
  }, [rawStreamPath, isAvplay, isHls, initialTime, onTimeUpdate, loadHlsSource, isTorrent]);

  // Session heartbeats and progress sync
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        const payload = {
          sessionId: sessionIdRef.current,
          deviceType: 'tv',
          deviceName: 'Android TV (Lumiere)',
          mediaType: title.type || 'movie',
          mediaId: title.id || 0,
          mediaTitle: title.name || 'ТВ Воспроизведение',
          mediaPoster: title.poster || '',
          currentTime: Math.round(currentTimeRef.current || 0),
          duration: Math.round(durationRef.current || 0),
          isPaused: !playingRef.current,
        };
        await serverFetch('/api/sessions/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => {
      clearInterval(interval);
      serverFetch('/api/sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    };
  }, [title]);

  // Toggle Play / Pause
  const togglePlay = useCallback(() => {
    const avplay = avplayRef.current;
    const video = videoRef.current;
    if (playingRef.current) {
      userPausedRef.current = true;
      if (avplay) avplay.pause();
      else if (video) video.pause();
      setPlaying(false);
      showFlash('❚❚', 'Пауза');
      showOsd(false); // keep OSD visible on pause
    } else {
      userPausedRef.current = false;
      if (avplay) avplay.play();
      else if (video) video.play().catch(() => {});
      setPlaying(true);
      showFlash('▶', 'Воспроизведение');
      showOsd(true);
    }
  }, [showFlash, showOsd]);

  // Seeking execution across entire film
  const executeSeek = useCallback((targetSec: number) => {
    const maxDur = realDurationRef.current || durationRef.current || 999999;
    const safeTarget = Math.max(0, Math.min(targetSec, maxDur));
    const avplay = avplayRef.current;
    const video = videoRef.current;

    userPausedRef.current = false;

    if (avplay) {
      avplay.seekTo(safeTarget * 1000);
      setCurrentTime(safeTarget);
    } else if (isHls && isTorrent) {
      // Check if target is inside the currently loaded buffer range of HTML5 video
      const offset = seekOffsetRef.current || 0;
      const relTarget = safeTarget - offset;
      let inBuffer = false;
      if (video && video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (relTarget >= video.buffered.start(i) && relTarget <= video.buffered.end(i) - 0.5) {
            inBuffer = true;
            break;
          }
        }
      }

      if (inBuffer && video) {
        video.currentTime = relTarget;
        setCurrentTime(safeTarget);
      } else {
        // Outside buffer: server seek via HLS start parameter
        const newOffset = Math.floor(safeTarget);
        let cleanUrl = rawStreamPath.replace(/([?&])start=\d+(&|$)/g, '$1').replace(/[?&]$/, '');
        const sep = cleanUrl.includes('?') ? '&' : '?';
        const actualAudio = audioTracks[currentAudioRef.current]?.id ?? currentAudioRef.current;
        const newUrl = serverUrl(`${cleanUrl}${sep}start=${newOffset}&audio=${actualAudio}`);
        setCurrentTime(newOffset);
        loadHlsSource(newUrl, newOffset);
      }
    } else if (video) {
      video.currentTime = safeTarget;
      setCurrentTime(safeTarget);
    }

    // Refresh subtitles for the new seek position
    if (currentSubtitleRef.current >= 0) {
      const activeSub = subtitleTracks[currentSubtitleRef.current];
      if (activeSub) {
        setCurrentSubText('');
        loadSubtitlesForTrack(activeSub, safeTarget, true);
      }
    }

    setScrubTime(null);
    isSeekingRef.current = false;
  }, [isHls, isTorrent, rawStreamPath, audioTracks, loadHlsSource, subtitleTracks, loadSubtitlesForTrack]);

  // Adaptive timeline seeking with speed acceleration
  const handleTimelineSeek = useCallback((dir: number) => {
    const now = Date.now();
    if (lastSeekDirection.current === dir && (now - lastSeekKeyTime.current) < 420) {
      seekHoldCount.current += 1;
    } else {
      seekHoldCount.current = 1;
      lastSeekDirection.current = dir;
    }
    lastSeekKeyTime.current = now;

    let step = 10;
    let speedStr = '';
    const count = seekHoldCount.current;
    if (count >= 28) {
      step = 120;
      speedStr = 'x12';
    } else if (count >= 18) {
      step = 60;
      speedStr = 'x6';
    } else if (count >= 10) {
      step = 30;
      speedStr = 'x3';
    } else if (count >= 5) {
      step = 15;
      speedStr = 'x1.5';
    } else {
      step = 10;
      speedStr = '';
    }

    isSeekingRef.current = true;
    const base = scrubTime !== null ? scrubTime : currentTimeRef.current;
    const maxDur = realDurationRef.current || durationRef.current || 999999;
    const nextTarget = Math.max(0, Math.min(base + (dir * step), maxDur));
    setScrubTime(nextTarget);

    const icon = dir > 0 ? '►►' : '◄◄';
    const text = `${dir > 0 ? '+' : '-'}${step} сек ${speedStr}`.trim();
    showFlash(icon, text);
    showOsd(true);

    if (seekDebounceTimer.current) clearTimeout(seekDebounceTimer.current);
    seekDebounceTimer.current = setTimeout(() => {
      executeSeek(nextTarget);
    }, 450);
  }, [scrubTime, showFlash, showOsd, executeSeek]);

  // Jump seek by delta (used by bottom buttons: -30s, +30s)
  const seekBy = useCallback((delta: number) => {
    isSeekingRef.current = true;
    const maxDur = realDurationRef.current || durationRef.current || 999999;
    const nextTarget = Math.max(0, Math.min(currentTimeRef.current + delta, maxDur));
    setScrubTime(nextTarget);
    showFlash(delta > 0 ? '⏩' : '⏪', `${delta > 0 ? '+' : ''}${delta} сек`);
    showOsd(true);

    if (seekDebounceTimer.current) clearTimeout(seekDebounceTimer.current);
    seekDebounceTimer.current = setTimeout(() => {
      executeSeek(nextTarget);
    }, 300);
  }, [showFlash, showOsd, executeSeek]);

  const seekTo = useCallback((pos: number) => {
    isSeekingRef.current = true;
    setScrubTime(pos);
    showOsd(true);
    if (seekDebounceTimer.current) clearTimeout(seekDebounceTimer.current);
    seekDebounceTimer.current = setTimeout(() => {
      executeSeek(pos);
    }, 200);
  }, [showOsd, executeSeek]);

  // Exit player safely
  const goBack = useCallback(() => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    if (seekDebounceTimer.current) clearTimeout(seekDebounceTimer.current);
    onExit();
  }, [onExit]);

  // Track Chooser (Audio / Subtitles)
  const openAudioPopup = useCallback(() => {
    setPopupType('audio');
    changePopupIndex(currentAudio);
    popupOpenRef.current = true;
    setPopupOpen(true);
    changeTvZone('popup');
    showOsd(false);
  }, [currentAudio, showOsd, changePopupIndex, changeTvZone]);

  const openSubtitlePopup = useCallback(() => {
    setPopupType('cc');
    const idx = currentSubtitleRef.current === -1 ? 0 : currentSubtitleRef.current + 1;
    changePopupIndex(idx);
    popupOpenRef.current = true;
    setPopupOpen(true);
    changeTvZone('popup');
    showOsd(false);
  }, [showOsd, changePopupIndex, changeTvZone]);

  const closePopup = useCallback(() => {
    popupOpenRef.current = false;
    setPopupOpen(false);
    changeTvZone('bottom');
    showOsd(true);
  }, [showOsd, changeTvZone]);

  const selectPopupItem = useCallback((idx: number) => {
    if (popupType === 'audio') {
      setCurrentAudio(idx);
      currentAudioRef.current = idx;
      const avplay = avplayRef.current;
      if (avplay && audioTracks[idx]) {
        try { avplay.setSelectTrack('AUDIO', audioTracks[idx].id); } catch {}
      } else if (isHls && isTorrent) {
        // Preserve current playback timecode when switching audio!
        const curTime = Math.floor(currentTimeRef.current);
        const actualTrackId = audioTracks[idx]?.id ?? idx;
        let cleanUrl = rawStreamPath.replace(/([?&])start=\d+(&|$)/g, '$1').replace(/([?&])audio=\d+(&|$)/g, '$1').replace(/[?&]$/, '');
        const sep = cleanUrl.includes('?') ? '&' : '?';
        const newUrl = serverUrl(`${cleanUrl}${sep}start=${curTime}&audio=${actualTrackId}`);
        loadHlsSource(newUrl, curTime);
      } else if (hlsRef.current) {
        hlsRef.current.audioTrack = idx;
      }
      const trackName = audioTracks[idx]?.name || audioTracks[idx]?.lang || `Дорожка ${idx + 1}`;
      showFlash('🔊', trackName);
      closePopup();
    } else {
      // Subtitle
      if (idx === 0) {
        // Disabled
        setCurrentSubtitle(-1);
        currentSubtitleRef.current = -1;
        subtitleCuesRef.current = [];
        setCurrentSubText('');
        showFlash('💬', 'Субтитры выкл.');
        closePopup();
      } else {
        const subIdx = idx - 1;
        setCurrentSubtitle(subIdx);
        currentSubtitleRef.current = subIdx;
        const sub = subtitleTracks[subIdx];
        if (sub) {
          subtitleCuesRef.current = [];
          setCurrentSubText('');
          loadSubtitlesForTrack(sub, Math.floor(currentTimeRef.current), true);
        }
        showFlash('💬', sub?.name || sub?.lang || `Субтитры ${subIdx + 1}`);
        closePopup();
      }
    }
  }, [popupType, audioTracks, subtitleTracks, showFlash, closePopup, isHls, isTorrent, rawStreamPath, loadHlsSource, loadSubtitlesForTrack]);

  // Handle bottom action buttons
  const handleBottomAction = useCallback((index: number) => {
    switch (index) {
      case 0: // Restart
        seekTo(0);
        showFlash('⏮', 'В начало');
        break;
      case 1: // -30s
        seekBy(-30);
        break;
      case 2: // Play/Pause
        togglePlay();
        break;
      case 3: // +30s
        seekBy(30);
        break;
      case 4: // Next
        const maxDur = realDurationRef.current || durationRef.current;
        if (maxDur > 0) {
          seekTo(Math.max(0, maxDur - 2));
          showFlash('⏭', 'Конец');
        }
        break;
      case 5: // Audio
        openAudioPopup();
        break;
      case 6: // Subtitles
        openSubtitlePopup();
        break;
    }
  }, [seekTo, seekBy, togglePlay, showFlash, openAudioPopup, openSubtitlePopup]);

  // Listen to capacitor hardware back button dispatched from App.tsx
  useEffect(() => {
    const handlePlayerBack = (e: Event) => {
      const now = Date.now();
      if (now - lastBackActionTime.current < 450) {
        e.preventDefault();
        return;
      }

      if (popupOpenRef.current) {
        e.preventDefault();
        lastBackActionTime.current = now;
        closePopup();
      } else if (osdVisibleRef.current) {
        e.preventDefault();
        lastBackActionTime.current = now;
        hideOsd();
      } else {
        lastBackActionTime.current = now;
        // When OSD is hidden and popup is closed, do NOT preventDefault,
        // allowing App.tsx to cleanly execute handlePlayerExit()
      }
    };

    window.addEventListener('player-back', handlePlayerBack);
    return () => {
      window.removeEventListener('player-back', handlePlayerBack);
    };
  }, [closePopup, hideOsd]);

  // Master Remote Key Handler (1:1 with Samsung Tizen player.js)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;

      const isLeft = (code === 37 || code === 21 || key === 'ArrowLeft' || key === 'Left');
      const isRight = (code === 39 || code === 22 || key === 'ArrowRight' || key === 'Right');
      const isUp = (code === 38 || code === 19 || key === 'ArrowUp' || key === 'Up');
      const isDown = (code === 40 || code === 20 || key === 'ArrowDown' || key === 'Down');
      const isEnter = (code === 13 || code === 23 || code === 66 || code === 29443 || code === 65385 ||
                       key === 'Enter' || key === 'Select' || key === 'Ok' || key === 'OK');
      const isBack = (code === 10009 || code === 27 || code === 4 || key === 'Escape' || key === 'GoBack');

      // Hardware media keys
      if (code === 10252 || code === 85 || key === 'MediaPlayPause' || code === 32 || key === ' ' || key === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        return;
      }
      if (code === 415 || code === 126 || key === 'MediaPlay') {
        e.preventDefault();
        e.stopPropagation();
        if (!playingRef.current) togglePlay();
        return;
      }
      if (code === 19 || code === 127 || key === 'MediaPause') {
        e.preventDefault();
        e.stopPropagation();
        if (playingRef.current) togglePlay();
        return;
      }
      if (code === 417 || code === 90 || key === 'MediaFastForward') {
        e.preventDefault();
        e.stopPropagation();
        seekBy(15);
        return;
      }
      if (code === 412 || code === 89 || key === 'MediaRewind') {
        e.preventDefault();
        e.stopPropagation();
        seekBy(-15);
        return;
      }

      // 1. Back Key Handling
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastBackActionTime.current < 450) {
          return;
        }

        if (popupOpenRef.current) {
          lastBackActionTime.current = now;
          closePopup();
        } else if (osdVisibleRef.current) {
          lastBackActionTime.current = now;
          hideOsd();
        } else {
          lastBackActionTime.current = now;
          goBack();
        }
        return;
      }

      // 2. Track Chooser Popup Modal Navigation
      if (popupOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const maxItems = popupType === 'audio'
          ? (audioTracks.length > 0 ? audioTracks.length : 1)
          : (subtitleTracks.length + 1);

        if (isUp) {
          changePopupIndex(Math.max(0, popupIndexRef.current - 1));
          return;
        }
        if (isDown) {
          changePopupIndex(Math.min(maxItems - 1, popupIndexRef.current + 1));
          return;
        }
        if (isEnter) {
          selectPopupItem(popupIndexRef.current);
          return;
        }
        if (isLeft || isRight) {
          closePopup();
          return;
        }
        return;
      }

      // 3. When OSD is Hidden: Wake up in neutral zone!
      if (!osdVisibleRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (isEnter) {
          togglePlay();
          return;
        }
        // Any arrow key wakes up OSD in neutral zone
        changeTvZone('neutral');
        showOsd(true);
        return;
      }

      // 4. State: Top Menu Focused ('top')
      if (tvZoneRef.current === 'top') {
        e.preventDefault();
        e.stopPropagation();
        showOsd(true);
        if (isDown) {
          // Down from top menu moves to Timeline track!
          changeTvZone('timeline');
          return;
        }
        if (isUp) {
          hideOsd();
          return;
        }
        if (isEnter) {
          goBack();
          return;
        }
        return;
      }

      // 5. State: Timeline Track Focused ('timeline')
      if (tvZoneRef.current === 'timeline') {
        e.preventDefault();
        e.stopPropagation();
        showOsd(true);
        if (isLeft || isRight) {
          handleTimelineSeek(isLeft ? -1 : 1);
          return;
        }
        if (isDown) {
          // Down from timeline moves focus into Bottom Controls row!
          changeTvZone('bottom');
          changeBottomBtnIndex(2); // Play/pause button centered
          return;
        }
        if (isUp) {
          // Up from timeline moves focus to Top Menu (Back button)
          changeTvZone('top');
          return;
        }
        if (isEnter) {
          togglePlay();
          return;
        }
        return;
      }

      // 6. State: Bottom Transport Controls Focused ('bottom')
      if (tvZoneRef.current === 'bottom') {
        e.preventDefault();
        e.stopPropagation();
        showOsd(true);
        if (isLeft) {
          changeBottomBtnIndex(Math.max(0, bottomBtnIndexRef.current - 1));
          return;
        }
        if (isRight) {
          changeBottomBtnIndex(Math.min(6, bottomBtnIndexRef.current + 1));
          return;
        }
        if (isUp) {
          // Up from bottom controls moves back onto Timeline Track!
          changeTvZone('timeline');
          return;
        }
        if (isDown) {
          // Down from bottom controls cleanly hides the OSD
          hideOsd();
          return;
        }
        if (isEnter) {
          handleBottomAction(bottomBtnIndexRef.current);
          return;
        }
        return;
      }

      // 7. State: Neutral Visible OSD ('neutral')
      e.preventDefault();
      e.stopPropagation();
      showOsd(true);

      if (isEnter) {
        togglePlay();
        return;
      }
      if (isDown || isUp) {
        // Pressing Down or Up focuses the Timeline Track!
        changeTvZone('timeline');
        return;
      }
      if (isLeft || isRight) {
        // Pressing Left or Right focuses timeline track and scrubs immediately!
        changeTvZone('timeline');
        handleTimelineSeek(isLeft ? -1 : 1);
        return;
      }
    };

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [togglePlay, seekBy, handleTimelineSeek, handleBottomAction, selectPopupItem, openAudioPopup, openSubtitlePopup, closePopup, hideOsd, showOsd, goBack, popupType, audioTracks, subtitleTracks, changeTvZone, changeBottomBtnIndex, changePopupIndex]);

  // Display values
  const displayTime = scrubTime !== null ? scrubTime : currentTime;
  const totalDur = realDurationRef.current || duration || 0;
  const progressPct = totalDur > 0 ? Math.min(100, Math.max(0, (displayTime / totalDur) * 100)) : 0;
  
  const cleanTitle = cleanReleaseTitle(title.name) || title.name;
  const displayTitle = cleanTitle + (title.year ? ` (${title.year})` : '') + (title.episode ? ` · ${title.episode}` : '');

  // Render popup items
  const popupItems: Array<{ label: string; active: boolean }> = [];
  if (popupType === 'audio') {
    if (audioTracks.length === 0) {
      popupItems.push({ label: 'Основная дорожка', active: true });
    } else {
      audioTracks.forEach((t, i) => {
        const lbl = t.name || (t.lang ? `${t.lang}${t.codec ? ' ' + t.codec : ''}` : `Дорожка ${i + 1}`);
        popupItems.push({ label: lbl, active: currentAudio === i });
      });
    }
  } else {
    popupItems.push({ label: 'Отключены', active: currentSubtitle === -1 });
    subtitleTracks.forEach((t, i) => {
      const lbl = t.name || (t.lang ? `Субтитры: ${t.lang}` : `Субтитры ${i + 1}`);
      popupItems.push({ label: lbl, active: currentSubtitle === i });
    });
  }

  return (
    <div className="tv-player-root">
      {/* AVPlay container (Samsung Tizen) */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* HTML5 Video element (Android TV / Web) */}
      {!isAvplay && (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}

      {/* OSD Overlay */}
      <div id="osd" className={osdVisible ? '' : 'hide'}>
        {/* Top bar */}
        <div id="osd-top">
          <div className="osd-top-left">
            <button
              id="btn-back"
              className={`osd-btn osd-top-btn ${tvZone === 'top' ? 'focused' : ''}`}
              onClick={goBack}
            >
              ← Назад
            </button>
            <div id="osd-title-wrap">
              <div id="osd-title">
                {displayTitle}
              </div>
              <div id="osd-stats" className="osd-stats">
                <span id="osd-res-badge" className="osd-badge">
                  {stats.resBadge}
                </span>
                <span id="osd-peers" className="osd-stat-text">
                  {stats.peers}
                </span>
                <span id="osd-speed" className="osd-stat-speed">
                  {stats.speed}
                </span>
                <div className="osd-buffer-wrap">
                  <span id="osd-buffer-text" className="osd-buffer-text">
                    {stats.bufferText}
                  </span>
                  <div id="osd-dots" className="osd-dots">
                    {[0, 1, 2, 3, 4].map(idx => (
                      <span
                        key={idx}
                        className={`osd-dot ${idx < stats.activeDots ? 'active' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center Action Flash Indicator */}
        <div id="center-indicator" className={centerFlash ? 'show' : ''}>
          <span id="center-indicator-icon">{centerFlash?.icon || '▶'}</span>
          <span id="center-indicator-text">{centerFlash?.text || 'Воспроизведение'}</span>
        </div>

        {/* Bottom Controls */}
        <div id="osd-bottom">
          <div id="timeline-row" className={tvZone === 'timeline' ? 'focused' : ''}>
            <span id="time-current">{fmtTime(displayTime)}</span>
            <div id="timeline-wrap" className={tvZone === 'timeline' ? 'focused' : ''}>
              <div id="timeline-bar">
                <div id="timeline-buffer" style={{ width: `${stats.bufferPct}%` }} />
                <div id="timeline-fill" style={{ width: `${progressPct}%` }} />
                <div id="timeline-thumb" style={{ left: `${progressPct}%` }} />
              </div>
            </div>
            <span id="time-total">{fmtTime(totalDur)}</span>
          </div>

          {/* Controls Row (Transport Centered, Audio/Subs on Bottom Right) */}
          <div id="osd-controls" className="osd-controls-row">
            <div className="osd-controls-center">
              <button
                id="btn-restart"
                className={`osd-ctrl-btn ${tvZone === 'bottom' && bottomBtnIndex === 0 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(0)}
                title="В начало"
              >
                ⏮ В начало
              </button>
              <button
                id="btn-rewind"
                className={`osd-ctrl-btn ${tvZone === 'bottom' && bottomBtnIndex === 1 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(1)}
                title="Назад 30 сек"
              >
                ⏪ -30с
              </button>
              <button
                id="btn-play-pause"
                className={`osd-ctrl-btn osd-ctrl-primary ${tvZone === 'bottom' && bottomBtnIndex === 2 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(2)}
                title="Пауза / Пуск"
              >
                {playing ? '❚❚ Пауза' : '▶ Пуск'}
              </button>
              <button
                id="btn-forward"
                className={`osd-ctrl-btn ${tvZone === 'bottom' && bottomBtnIndex === 3 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(3)}
                title="Вперёд 30 сек"
              >
                ⏩ +30с
              </button>
              <button
                id="btn-next"
                className={`osd-ctrl-btn ${tvZone === 'bottom' && bottomBtnIndex === 4 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(4)}
                title="След. серия / В конец"
              >
                ⏭ Далее
              </button>
            </div>
            <div className="osd-controls-right">
              <button
                id="btn-audio"
                className={`osd-ctrl-btn osd-extra-btn ${tvZone === 'bottom' && bottomBtnIndex === 5 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(5)}
                title="Аудиодорожки"
              >
                🔊 Звук
              </button>
              <button
                id="btn-cc"
                className={`osd-ctrl-btn osd-extra-btn ${tvZone === 'bottom' && bottomBtnIndex === 6 ? 'focused' : ''}`}
                onClick={() => handleBottomAction(6)}
                title="Субтитры"
              >
                💬 Субтитры
              </button>
            </div>
          </div>

          <div className="osd-hint-row">
            <div className="osd-hint-item"><span className="osd-hint-key">OK</span> Пауза / Выбор</div>
            <div className="osd-hint-item"><span className="osd-hint-key">◄ / ►</span> Перемотка / Дорожки</div>
            <div className="osd-hint-item"><span className="osd-hint-key">▲</span> Ползунок дорожки</div>
            <div className="osd-hint-item"><span className="osd-hint-key">▼</span> Скрыть плеер</div>
            <div className="osd-hint-item"><span className="osd-hint-key">Назад</span> Скрыть / Выход</div>
          </div>
        </div>
      </div>

      {/* Popup Track Chooser */}
      <div id="popup" className={popupOpen ? '' : 'hidden'}>
        <div id="popup-header">{popupType === 'audio' ? 'Аудио дорожки' : 'Субтитры'}</div>
        <div id="popup-list">
          {popupItems.map((item, idx) => (
            <div
              key={idx}
              className={`popup-item ${idx === popupIndex ? 'focused' : ''} ${item.active ? 'active' : ''}`}
              onClick={() => selectPopupItem(idx)}
            >
              {item.label}
              {item.active && <span className="check">✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Subtitle Overlay */}
      <div id="subtitle-overlay">
        {currentSubText && <span className="sub-text">{currentSubText}</span>}
      </div>
    </div>
  );
}
