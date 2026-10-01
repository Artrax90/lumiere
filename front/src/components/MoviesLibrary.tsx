import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, Star, ArrowUpDown, ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { apiFetch } from '@/api/client';
import { usePopular } from '@/hooks/usePopular';
import { useGenres } from '@/hooks/useGenres';
import SafeImg from './SafeImg';
import Card from './Card';

interface MoviesLibraryProps {
  onSelect: (title: Title) => void;
}

const sortOptions = [
  { id: 'rating', label: 'Рейтинг' },
  { id: 'year', label: 'Год' },
  { id: 'title', label: 'А-Я' },
];

export default function MoviesLibrary({ onSelect }: MoviesLibraryProps) {
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('rating');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showSort, setShowSort] = useState(false);
  const [page, setPage] = useState(1);
  const [allMovies, setAllMovies] = useState<Title[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { data: initialMovies } = usePopular('movie', 1);
  const { data: genres } = useGenres('movie');

  useEffect(() => {
    if (initialMovies && initialMovies.length > 0) {
      setAllMovies(initialMovies);
    }
  }, [initialMovies]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await apiFetch<{ results: Title[] }>('/api/movies/popular', { page: String(nextPage) });
      if (res.results && res.results.length > 0) {
        setAllMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newItems = res.results.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more movies:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredMovies = useMemo(() => {
    let list = allMovies.length > 0 ? allMovies : initialMovies;
    if (activeGenre) list = list.filter((t) => t.genres.includes(activeGenre));
    const mult = sortOrder === 'desc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'rating') diff = b.score - a.score;
      else if (sortBy === 'year') diff = b.year - a.year;
      else if (sortBy === 'title') diff = a.name.localeCompare(b.name);
      return diff * mult;
    });
    return list;
  }, [allMovies, initialMovies, activeGenre, sortBy, sortOrder]);

  const featured = filteredMovies[0];
  const rest = filteredMovies.slice(1);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Фильмы</h1>
          <p className="mt-2 text-[15px] text-white/50">{filteredMovies.length} фильмов</p>
        </div>

        {featured && (
          <div className="mb-12 animate-detail-rise">
            <div className="mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-300/70" fill="currentColor" strokeWidth={0} />
              <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/50">Выбор редакции</span>
            </div>
            <button onClick={() => onSelect(featured)} className="group relative h-72 w-full overflow-hidden rounded-[20px] text-left md:h-80">
              <SafeImg src={featured.backdrop} alt={featured.name} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 lg:p-10">
                <div className="mb-2 flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-amber-300/90" fill="currentColor" strokeWidth={0} />
                  <span className="text-[12px] font-semibold text-amber-300/90">{featured.score}</span>
                  <span className="text-white/25">·</span>
                  <span className="text-[12px] text-white/60">{featured.genres.join(', ')}</span>
                </div>
                <h2 className="text-display text-[32px] font-medium tracking-tight text-white md:text-[40px]">{featured.logoText}</h2>
                <p className="mt-2 max-w-xl text-[14px] text-white/60">{featured.description.slice(0, 120)}...</p>
              </div>
            </button>
          </div>
        )}

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveGenre(null)}
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
              style={{
                background: !activeGenre ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: !activeGenre ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: !activeGenre ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              Все
            </button>
            {genres.slice(0, 10).map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGenre(activeGenre === g.name ? null : g.name)}
                className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
                style={{
                  background: activeGenre === g.name ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                  color: activeGenre === g.name ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                  border: activeGenre === g.name ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center justify-center h-8 w-8 rounded-full glass text-white/70 hover:text-white transition-cinematic active:scale-95"
              title={sortOrder === 'desc' ? 'По убыванию (нажмите для переключения)' : 'По возрастанию (нажмите для переключения)'}
            >
              {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5 text-amber-300" /> : <ArrowUp className="h-3.5 w-3.5 text-amber-300" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSort(!showSort)}
                className="flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/70 transition-cinematic hover:text-white"
              >
                <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                {sortOptions.find((s) => s.id === sortBy)?.label}
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-[14px] glass-panel p-2 animate-fade-in">
                  {sortOptions.map((s) => {
                    const isSelected = sortBy === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (sortBy === s.id) {
                            setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                          } else {
                            setSortBy(s.id);
                            setSortOrder('desc');
                          }
                          setShowSort(false);
                        }}
                        className="flex items-center justify-between w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-cinematic"
                        style={{ color: isSelected ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)', background: isSelected ? 'rgba(232,193,112,0.08)' : 'transparent' }}
                      >
                        <span>{s.label}</span>
                        {isSelected && (
                          sortOrder === 'desc' ? <ArrowDown className="h-3 w-3 text-amber-300" /> : <ArrowUp className="h-3 w-3 text-amber-300" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rest.map((t, i) => (
            <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 40, 600)}ms` }}>
              <Card title={t} variant="portrait" onSelect={onSelect} fill />
            </div>
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
      </div>
    </div>
  );
}
