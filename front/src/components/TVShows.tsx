import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { apiFetch } from '@/api/client';
import { usePopular } from '@/hooks/usePopular';
import SafeImg from './SafeImg';
import MovieDetails from './MovieDetails';

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
  selectedShow: controlledShow,
  onSelectShow,
}: TVShowsProps) {
  const [page, setPage] = useState(1);
  const [allShows, setAllShows] = useState<Title[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { data: initialShows } = usePopular('tv', 1);
  const [internalSelectedShow, setInternalSelectedShow] = useState<Title | null>(null);

  const selectedShow = controlledShow !== undefined ? controlledShow : internalSelectedShow;
  const setSelectedShow = onSelectShow || setInternalSelectedShow;

  useEffect(() => {
    if (initialShows && initialShows.length > 0) {
      setAllShows(initialShows);
    }
  }, [initialShows]);

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

  if (selectedShow) {
    return (
      <MovieDetails
        title={selectedShow}
        onBack={() => setSelectedShow(null)}
        onPlay={onPlay}
        onSelect={onSelect}
      />
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
