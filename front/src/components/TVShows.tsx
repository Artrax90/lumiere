import { useState, useMemo, useEffect } from 'react';
import { Star, Clock, ChevronRight, Play, Loader2 } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { apiFetch } from '@/api/client';
import { usePopular } from '@/hooks/usePopular';
import { useDetails } from '@/hooks/useDetails';
import { useSeason } from '@/hooks/useSeason';
import SafeImg from './SafeImg';
import SeasonTorrentBrowser from './SeasonTorrentBrowser';

interface TVShowsProps {
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
  onEpisodeSelect?: (episode: Episode) => void;
  selectedShow?: Title | null;
  onSelectShow?: (show: Title | null) => void;
  season?: number;
  onSelectSeason?: (season: number) => void;
  activeEpisodeId?: string | null;
}

export default function TVShows({
  onSelect,
  onPlay,
  onEpisodeSelect,
  selectedShow: controlledShow,
  onSelectShow,
  season: controlledSeason,
  onSelectSeason,
  activeEpisodeId,
}: TVShowsProps) {
  const [page, setPage] = useState(1);
  const [allShows, setAllShows] = useState<Title[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { data: initialShows } = usePopular('tv', 1);
  const [internalSelectedShow, setInternalSelectedShow] = useState<Title | null>(null);
  const [internalSeason, setInternalSeason] = useState(1);

  const selectedShow = controlledShow !== undefined ? controlledShow : internalSelectedShow;
  const setSelectedShow = onSelectShow || setInternalSelectedShow;

  const season = controlledSeason !== undefined ? controlledSeason : internalSeason;
  const setSeason = onSelectSeason || setInternalSeason;

  const { data: showDetails } = useDetails(selectedShow?.id || null, 'tv');
  const { data: showEpisodes } = useSeason(selectedShow?.id || null, selectedShow ? season : null);

  useEffect(() => {
    if (initialShows && initialShows.length > 0) {
      setAllShows(initialShows);
    }
  }, [initialShows]);

  // Scroll to active episode if present
  useEffect(() => {
    if (activeEpisodeId && showEpisodes.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`episode-${activeEpisodeId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeEpisodeId, showEpisodes]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await apiFetch<{ results: Title[] }>('/api/tv/popular', { page: String(nextPage) });
      if (res.results && res.results.length > 0) {
        setAllShows((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const newItems = res.results.filter((s) => !existingIds.has(s.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more shows:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const displayShows = allShows.length > 0 ? allShows : initialShows;

  const totalSeasons = showDetails?.seasonsCount || Math.max(season, 1);
  const seasonList = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(totalSeasons, 30)) }, (_, i) => i + 1),
    [totalSeasons]
  );

  // Only clamp if showDetails has definitively loaded with a valid seasonsCount
  useEffect(() => {
    if (showDetails?.seasonsCount && season > showDetails.seasonsCount) {
      setSeason(1);
    }
  }, [showDetails?.seasonsCount, season, setSeason]);

  // Save active season for the selected show
  useEffect(() => {
    if (selectedShow?.id && season) {
      try {
        localStorage.setItem(`last_season_${selectedShow.id}`, String(season));
      } catch {}
    }
  }, [selectedShow?.id, season]);

  // Restore saved season when show changes
  useEffect(() => {
    if (selectedShow?.id) {
      try {
        const saved = localStorage.getItem(`last_season_${selectedShow.id}`);
        if (saved) {
          const s = parseInt(saved, 10);
          if (s > 0 && s !== season) {
            setSeason(s);
          }
        }
      } catch {}
    }
  }, [selectedShow?.id]);

  if (selectedShow) {
    return (
      <div className="min-h-screen w-full animate-fade-in">
        <div className="relative h-[50vh] min-h-[360px] w-full overflow-hidden">
          <SafeImg src={selectedShow.backdrop} alt={selectedShow.name} className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.05)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/80 to-transparent" />
          <button onClick={() => setSelectedShow(null)} className="absolute left-8 top-24 z-20 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/80 transition-cinematic hover:text-white lg:left-12">
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={1.5} />Сериалы
          </button>
          <div className="absolute bottom-0 left-0 p-8 lg:p-12">
            <div className="animate-detail-rise">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">Сериал</div>
              <h1 className="text-display text-[36px] font-medium tracking-tight text-white md:text-[48px]">{selectedShow.logoText}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                <span className="flex items-center gap-1 font-semibold text-amber-300/90"><Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />{selectedShow.score}</span>
                <span className="text-white/25">·</span>
                <span className="text-white/72">{selectedShow.runtime}</span>
                <span className="text-white/25">·</span>
                <span className="text-white/72">{selectedShow.genres.join(', ')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] px-8 lg:px-12">
          <div className="-mt-4 flex items-center gap-3 animate-detail-rise" style={{ animationDelay: '100ms' }}>
            <button onClick={() => onPlay(selectedShow)} className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black transition-cinematic hover:scale-[1.03] active:scale-95" style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}>
              <Play className="h-4 w-4 fill-current" />{selectedShow.progress ? 'Продолжить' : 'Смотреть'}
            </button>
          </div>

          <p className="mt-8 max-w-2xl text-[15px] leading-[1.7] text-white/70 animate-detail-rise" style={{ animationDelay: '150ms' }}>{selectedShow.description}</p>

          <div id="episodes-section" className="mt-10 animate-detail-rise scroll-mt-20" style={{ animationDelay: '200ms' }}>
            <div className="mb-5 flex items-center gap-3">
              <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">Эпизоды</h3>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="mb-6 flex gap-2 overflow-x-auto no-scrollbar">
              {seasonList.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeason(s)}
                  className="rounded-full px-5 py-2 text-[13px] font-medium transition-cinematic"
                  style={{
                    background: season === s ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                    color: season === s ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                    border: season === s ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Сезон {s}
                </button>
              ))}
            </div>

            <SeasonTorrentBrowser
              show={selectedShow}
              season={season}
              tmdbEpisodes={showEpisodes}
              onPlay={onPlay}
              activeEpisodeId={activeEpisodeId}
            />
          </div>
          <div className="h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-10 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Сериалы</h1>
          <p className="mt-2 text-[15px] text-white/50">Продолжайте истории или откройте новые.</p>
        </div>

        <section className="animate-row-reveal">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/88">Популярные сериалы</h2>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayShows.map((show, i) => (
              <button key={show.id} onClick={() => setSelectedShow(show)} className="group text-left animate-stagger-in" style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-[12px] card-edge transition-cinematic group-hover:card-edge-hover group-hover:scale-[1.04]" style={{ transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <SafeImg src={show.poster} alt={show.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <h3 className="mt-2.5 truncate text-[13px] font-medium text-white/85">{show.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/38">
                  <span>{show.runtime}</span><span className="text-white/15">·</span>
                  <span className="flex items-center gap-0.5"><Star className="h-[9px] w-[9px] text-amber-300/55" fill="currentColor" strokeWidth={0} />{show.score}</span>
                </div>
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="mt-12 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-full glass px-8 py-3 text-[14px] font-medium text-white/80 transition-cinematic hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Загрузка...</span>
                  </>
                ) : (
                  <span>Загрузить ещё</span>
                )}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
