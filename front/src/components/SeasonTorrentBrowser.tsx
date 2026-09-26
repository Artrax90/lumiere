import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Star, Check, AlertCircle } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { apiFetch } from '@/api/client';
import { serverFetch, serverUrl } from '@/api/server';
import SafeImg from './SafeImg';
import TorrentSearch from './TorrentSearch';
import SourceSelector from './SourceSelector';
import {
  matchesTorrentSeason,
  checkTorrentEpisode,
  extractEpisodeNumber,
  scoreTorrent,
  getTorrentSmartQueries,
} from '@/utils/torrentMeta';

interface SeasonTorrentBrowserProps {
  show: Title;
  season?: number;
  onSelectSeason?: (season: number) => void;
  totalSeasons?: number;
  tmdbEpisodes?: Episode[];
  onPlay: (title: Title, externalSubs?: any[]) => void;
  activeEpisodeId?: string | null;
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

export default function SeasonTorrentBrowser({
  show,
  season,
  onSelectSeason,
  totalSeasons,
  tmdbEpisodes,
  onPlay,
  activeEpisodeId,
}: SeasonTorrentBrowserProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'episodes' | 'torrents' | 'sources'>('episodes');
  const [loadingEpisodeNum, setLoadingEpisodeNum] = useState<number | null>(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [allTorrents, setAllTorrents] = useState<TorrentItem[]>([]);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const [internalSeason, setInternalSeason] = useState(() => {
    if (season !== undefined && season > 0) return season;
    try {
      const saved = localStorage.getItem(`last_season_${show.id}`);
      if (saved) {
        const s = parseInt(saved, 10);
        if (s > 0) return s;
      }
    } catch {}
    return 1;
  });

  const activeSeason = season !== undefined ? season : internalSeason;

  const handleSelectSeason = (s: number) => {
    setInternalSeason(s);
    try {
      localStorage.setItem(`last_season_${show.id}`, String(s));
    } catch {}
    onSelectSeason?.(s);
  };

  const [episodesList, setEpisodesList] = useState<Episode[]>(tmdbEpisodes || []);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  useEffect(() => {
    if (season !== undefined) {
      setInternalSeason(season);
    }
  }, [season]);

  // Sync / fetch episodes
  useEffect(() => {
    if (tmdbEpisodes && tmdbEpisodes.length > 0) {
      setEpisodesList(tmdbEpisodes);
      return;
    }
    if (!show.id) return;
    let cancelled = false;
    setLoadingEpisodes(true);
    apiFetch<{ episodes: Episode[] }>(`/api/tv/${show.id}/season/${activeSeason}`)
      .then((res) => {
        if (!cancelled) {
          setEpisodesList(res.episodes || []);
          setLoadingEpisodes(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[SeasonTorrentBrowser] Failed to fetch episodes:', err);
          setEpisodesList([]);
          setLoadingEpisodes(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [show.id, activeSeason, tmdbEpisodes]);

  const seasonsCount = show.seasonsCount || totalSeasons || (show.seasons && show.seasons.length) || Math.max(activeSeason, 1);
  const seasonList = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(seasonsCount, 40)) }, (_, i) => i + 1),
    [seasonsCount]
  );

  // Fetch all torrent releases for this show in the background
  const fetchTorrentsList = useCallback(async (queryText?: string): Promise<TorrentItem[]> => {
    const q = (queryText || show.name).trim();
    if (!q) return [];
    setLoadingTorrents(true);
    try {
      const queries = getTorrentSmartQueries({
        name: q,
        originalTitle: show.originalTitle,
        logoText: show.logoText,
      });

      const tmdbParam = show.id ? `&tmdbId=${show.id}` : '';
      const typeParam = `&type=${(show as any).type || 'tv'}`;

      const fetchPromises = queries.map(async (qStr) => {
        try {
          const res = await serverFetch(`/api/torrents/search?q=${encodeURIComponent(qStr)}${tmdbParam}${typeParam}`);
          const data = await res.json();
          return (data.results || []) as TorrentItem[];
        } catch {
          return [] as TorrentItem[];
        }
      });

      const resultsLists = await Promise.all(fetchPromises);
      const merged: TorrentItem[] = [];
      const seen = new Set<string>();
      for (const list of resultsLists) {
        for (const item of list) {
          const key = (item.magnet || item.title || item.id).toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
      }
      return merged;
    } catch {
      return [];
    } finally {
      setLoadingTorrents(false);
    }
  }, [show.id, show.name, show.originalTitle, show.logoText]);

  useEffect(() => {
    fetchTorrentsList().then((res) => {
      setAllTorrents(res);
    });
  }, [fetchTorrentsList]);

  // 1-Click Smart Episode Playback (matches Samsung TV behavior 1-in-1)
  const handlePlayEpisode = async (ep: Episode) => {
    if (loadingEpisodeNum !== null) return;
    setLoadingEpisodeNum(ep.episode);
    setLoadingStatus('Поиск серии...');

    try {
      let torrents = allTorrents;
      if (!torrents || torrents.length === 0) {
        torrents = await fetchTorrentsList();
        setAllTorrents(torrents);
      }

      if (!torrents || torrents.length === 0) {
        showToast('Торренты не найдены. Открываем источники...');
        setActiveTab('sources');
        setLoadingEpisodeNum(null);
        return;
      }

      // Filter by season
      let filtered = torrents.filter((item) => matchesTorrentSeason(item.title, activeSeason));
      if (filtered.length === 0) filtered = torrents;

      // Score torrents by episode match
      const epMatches: Array<TorrentItem & { _score: number }> = [];
      const epFallbacks: Array<TorrentItem & { _score: number }> = [];

      filtered.forEach((item) => {
        const check = checkTorrentEpisode(item.title, activeSeason, ep.episode);
        if (check.matches) {
          epMatches.push({ ...item, _score: scoreTorrent(item) + (check.score || 0) });
        } else {
          epFallbacks.push({ ...item, _score: scoreTorrent(item) - 1000 });
        }
      });

      const candidates = (epMatches.length > 0 ? epMatches : epFallbacks).sort((a, b) => b._score - a._score);

      // Check for saved preferred torrent
      const savedKey = `season_torrent_${show.id}_${activeSeason}`;
      let savedTorrent: any = null;
      try {
        savedTorrent = JSON.parse(localStorage.getItem(savedKey) || 'null');
      } catch {}

      if (savedTorrent?.magnet) {
        const sIdx = candidates.findIndex((c) => c.magnet === savedTorrent.magnet);
        if (sIdx > 0) {
          const preferred = candidates.splice(sIdx, 1)[0];
          candidates.unshift(preferred);
        }
      }

      // Loop over candidate torrents (try up to 5 best options)
      let matchedFile: any = null;
      let matchedTorrent: any = null;

      for (let i = 0; i < Math.min(candidates.length, 5); i++) {
        const cand = candidates[i];
        setLoadingStatus(i === 0 ? 'Подключение к раздаче...' : `Вариант ${i + 1}...`);

        try {
          const res = await serverFetch('/api/torrents/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet: cand.magnet, title: cand.title }),
          });
          const data = await res.json();
          if (data.files && data.files.length > 0) {
            // Find file matching episode
            for (let f = 0; f < data.files.length; f++) {
              const file = data.files[f];
              const epInFile = extractEpisodeNumber(file.name, f, activeSeason);
              if (epInFile === ep.episode) {
                matchedFile = file;
                matchedTorrent = cand;
                break;
              }
            }

            // Fallback for single-episode torrent release where cand matched exact episode
            if (!matchedFile && data.files.length === 1) {
              const check = checkTorrentEpisode(cand.title, activeSeason, ep.episode);
              if (check.exact) {
                matchedFile = data.files[0];
                matchedTorrent = cand;
              }
            }

            if (matchedFile) break;
          }
        } catch (e) {
          console.warn('[SeasonTorrentBrowser] Candidate failed:', cand.title, e);
        }
      }

      if (matchedFile && matchedTorrent) {
        setLoadingStatus('Запуск...');

        // Remember preferred torrent for this season
        try {
          localStorage.setItem(savedKey, JSON.stringify({ magnet: matchedTorrent.magnet, title: matchedTorrent.title }));
          localStorage.setItem(`last_season_${show.id}`, String(activeSeason));
        } catch {}

        const baseName = show.name;
        const epTitle = ep.title ? ` «${ep.title}»` : '';
        const episodeLabel = `Сезон ${activeSeason}, Серия ${ep.episode}${epTitle}`;
        const fullTitleName = `${baseName} · S${activeSeason} E${ep.episode}${epTitle}`;

        onPlay(
          {
            ...show,
            name: fullTitleName,
            videoUrl: matchedFile.hlsUrl || matchedFile.streamUrl,
            directUrl: matchedFile.directUrl,
            hlsUrl: matchedFile.hlsUrl,
            episode: episodeLabel,
            poster: ep.thumbnail ? serverUrl(ep.thumbnail) : show.poster,
          },
          matchedFile.externalSubs || []
        );
      } else {
        showToast(`Серия ${ep.episode} не найдена в торрентах. Переключаем на онлайн-источники...`);
        setActiveTab('sources');
      }
    } catch (err: any) {
      showToast(err.message || 'Ошибка воспроизведения');
    } finally {
      setLoadingEpisodeNum(null);
      setLoadingStatus('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast message notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-[13px] font-bold text-black shadow-2xl animate-fade-in">
          <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tabs: [Серии] | [Торренты] | [Источники] */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-5">
        <button
          onClick={() => setActiveTab('episodes')}
          className="rounded-full px-6 py-2.5 text-[14px] font-semibold transition-all duration-200 cursor-pointer"
          style={{
            background: activeTab === 'episodes' ? 'rgba(232, 193, 112, 0.18)' : 'rgba(255, 255, 255, 0.04)',
            color: activeTab === 'episodes' ? '#e8c170' : 'rgba(255, 255, 255, 0.65)',
            border: activeTab === 'episodes' ? '1px solid rgba(232, 193, 112, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: activeTab === 'episodes' ? '0 0 16px -4px rgba(232, 193, 112, 0.3)' : 'none',
          }}
        >
          Серии
        </button>

        <button
          onClick={() => setActiveTab('torrents')}
          className="rounded-full px-6 py-2.5 text-[14px] font-semibold transition-all duration-200 cursor-pointer"
          style={{
            background: activeTab === 'torrents' ? 'rgba(232, 193, 112, 0.18)' : 'rgba(255, 255, 255, 0.04)',
            color: activeTab === 'torrents' ? '#e8c170' : 'rgba(255, 255, 255, 0.65)',
            border: activeTab === 'torrents' ? '1px solid rgba(232, 193, 112, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: activeTab === 'torrents' ? '0 0 16px -4px rgba(232, 193, 112, 0.3)' : 'none',
          }}
        >
          Торренты
        </button>

        <button
          onClick={() => setActiveTab('sources')}
          className="rounded-full px-6 py-2.5 text-[14px] font-semibold transition-all duration-200 cursor-pointer"
          style={{
            background: activeTab === 'sources' ? 'rgba(232, 193, 112, 0.18)' : 'rgba(255, 255, 255, 0.04)',
            color: activeTab === 'sources' ? '#e8c170' : 'rgba(255, 255, 255, 0.65)',
            border: activeTab === 'sources' ? '1px solid rgba(232, 193, 112, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: activeTab === 'sources' ? '0 0 16px -4px rgba(232, 193, 112, 0.3)' : 'none',
          }}
        >
          Источники
        </button>
      </div>

      {/* Season Row: 1 сезон, 2 сезон, ..., 22 сезон (Shown for Episodes and Torrents tabs) */}
      {activeTab !== 'sources' && (
        <div className="flex items-center gap-3.5 mb-6">
          <span className="text-[13px] font-bold text-white/50 uppercase tracking-wider flex-shrink-0">
            Сезон:
          </span>
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {seasonList.map((s) => {
              const isAct = activeSeason === s;
              return (
                <button
                  key={s}
                  onClick={() => handleSelectSeason(s)}
                  className="flex-shrink-0 rounded-full px-5 py-2 text-[14px] font-medium transition-all duration-200 cursor-pointer"
                  style={{
                    background: isAct ? 'rgba(110, 231, 183, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                    color: isAct ? '#6ee7b7' : 'rgba(255, 255, 255, 0.75)',
                    border: isAct ? '1px solid rgba(110, 231, 183, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isAct ? '0 0 14px -3px rgba(110, 231, 183, 0.3)' : 'none',
                  }}
                >
                  {s} сезон
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1: [Серии] — Complete Episodes List from TMDB (1 в 1 как на ТВ) */}
      {activeTab === 'episodes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-[18px] font-bold text-white flex items-center gap-2">
              <span>Серии {activeSeason} сезона</span>
              {episodesList.length > 0 && (
                <span className="text-[13px] font-normal text-white/50">
                  ({episodesList.length} {episodesList.length === 1 ? 'серия' : episodesList.length < 5 ? 'серии' : 'серий'})
                </span>
              )}
            </h3>
            {loadingTorrents && (
              <span className="text-[12px] text-amber-300/80 flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Синхронизация торрентов...
              </span>
            )}
          </div>

          {loadingEpisodes ? (
            <div className="rounded-2xl p-12 bg-white/[0.03] border border-white/[0.08] flex items-center justify-center gap-3 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
              <span>Загрузка серий {activeSeason} сезона...</span>
            </div>
          ) : episodesList.length === 0 ? (
            <div className="rounded-2xl p-8 bg-white/[0.03] border border-white/[0.08] text-center space-y-3">
              <p className="text-white/60 text-[15px]">Серии {activeSeason} сезона не найдены в TMDB</p>
              <button
                onClick={() => setActiveTab('torrents')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[13px] font-semibold hover:bg-amber-400/30 transition-all cursor-pointer"
              >
                Открыть вкладку «Торренты»
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {episodesList.map((ep) => {
                const epStill = ep.thumbnail
                  ? serverUrl(ep.thumbnail)
                  : show.backdrop
                  ? serverUrl(show.backdrop)
                  : show.poster;
                const epTitle = ep.title || `Серия ${ep.episode}`;
                const duration = ep.runtime && ep.runtime !== '—' ? ep.runtime : '';
                const isLoadingThis = loadingEpisodeNum === ep.episode;

                return (
                  <div
                    key={ep.id || ep.episode}
                    id={`episode-${ep.id || ep.episode}`}
                    onClick={() => handlePlayEpisode(ep)}
                    className="group relative flex flex-col md:flex-row items-start md:items-center gap-5 p-3.5 md:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-[#e8c170]/[0.08] hover:border-[#e8c170]/40 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl hover:translate-x-1"
                  >
                    {/* Thumbnail: 16:9 still image preview with badges */}
                    <div className="relative w-full md:w-[260px] h-[146px] rounded-xl overflow-hidden bg-[#11141e] border border-white/10 flex-shrink-0">
                      <SafeImg
                        src={epStill}
                        alt={epTitle}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      {/* Top-left Season/Episode Badge */}
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-[#0a0c12]/90 border border-[#e8c170]/50 text-[#e8c170] text-[12px] font-extrabold tracking-tight">
                        S{activeSeason} E{ep.episode}
                      </div>
                      {/* Bottom-right Duration Badge */}
                      {duration && (
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/85 text-white/85 text-[11px] font-semibold">
                          {duration}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[17px] font-extrabold text-[#e8c170] flex-shrink-0">
                          {ep.episode}.
                        </span>
                        <h4 className="text-[17px] font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                          {epTitle}
                        </h4>
                      </div>

                      {ep.aired && (
                        <div className="text-[12px] text-white/40">
                          {ep.aired}
                        </div>
                      )}

                      {ep.synopsis ? (
                        <p className="text-[13px] sm:text-[14px] leading-relaxed text-white/65 line-clamp-2">
                          {ep.synopsis}
                        </p>
                      ) : (
                        <p className="text-[13px] text-white/40 italic">
                          Описание серии отсутствует
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center gap-3 self-end md:self-center flex-shrink-0 mt-2 md:mt-0">
                      {isLoadingThis ? (
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 font-semibold text-[13px] animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                          <span>{loadingStatus || 'Подключение...'}</span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayEpisode(ep);
                          }}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-[#e8c170] text-[#0a0b0f] font-bold text-[14px] transition-all shadow-md active:scale-95 group-hover:bg-[#e8c170] cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Смотреть</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: [Торренты] — Manual torrent browser with quality filter and files */}
      {activeTab === 'torrents' && (
        <div className="space-y-4">
          <TorrentSearch
            title={show}
            initialSeason={activeSeason}
            onPlay={(url, episodeName, externalSubs, directUrl, hlsUrl) =>
              onPlay(
                {
                  ...show,
                  videoUrl: hlsUrl || url,
                  directUrl: directUrl || url,
                  hlsUrl,
                  episode: episodeName,
                },
                externalSubs
              )
            }
          />
        </div>
      )}

      {/* TAB 3: [Источники] — Online Players / Balancers (Collaps, Kodik, Alloha) */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <SourceSelector
            title={show}
            onPlay={(url) =>
              onPlay({
                ...show,
                videoUrl: url,
              })
            }
          />
        </div>
      )}
    </div>
  );
}
