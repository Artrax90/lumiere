import { useState, useEffect, useRef } from 'react';
import { Search, X, Mic, TrendingUp, Clock, Film, Sparkles } from 'lucide-react';
import type { Title } from '@/api/client';
import { useSearch } from '@/hooks/useSearch';
import { useGenres } from '@/hooks/useGenres';
import Card from './Card';

interface SearchViewProps {
  onSelect: (title: Title) => void;
}

const trendingSearches = ['Фантастика', 'Оскар', 'Драма', 'Аниме 2024', 'Документалки', 'Триллеры'];
const recentSearches = ['Интерстеллар', 'Мыслительное кино', '4K Dolby Vision', 'Severance'];

export default function SearchView({ onSelect }: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results, loading } = useSearch(query);
  const { data: genres } = useGenres('movie');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <div className={`relative transition-cinematic ${focused ? 'scale-[1.01]' : ''}`}>
          <div className="relative flex items-center glass-panel rounded-[20px] px-6 py-5">
            <Search className="h-5 w-5 text-white/40" strokeWidth={1.5} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Поиск фильмов, сериалов, людей..."
              className="ml-4 w-full bg-transparent text-[18px] font-medium text-white placeholder:text-white/35 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-cinematic hover:bg-white/10 hover:text-white/80" aria-label="Clear">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
            <button className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-cinematic hover:bg-white/10 hover:text-white/80" aria-label="Voice search">
              <Mic className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {!query.trim() && (
          <div className="mt-10 animate-fade-in">
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-white/40">
                <Film className="h-4 w-4" strokeWidth={1.5} />Жанры
              </div>
              <div className="flex flex-wrap gap-2">
                {genres.slice(0, 14).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setActiveGenre(activeGenre === g.name ? null : g.name);
                      setQuery(g.name);
                    }}
                    className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
                    style={{
                      background: activeGenre === g.name ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                      color: activeGenre === g.name ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.7)',
                      border: activeGenre === g.name ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-white/40">
                <TrendingUp className="h-4 w-4" strokeWidth={1.5} />Популярные запросы
              </div>
              <div className="flex flex-wrap gap-2">
                {trendingSearches.map((s) => (
                  <button key={s} onClick={() => setQuery(s)} className="rounded-full glass px-4 py-2 text-[13px] font-medium text-white/75 transition-cinematic hover:bg-white/12 hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.12em] text-white/40">
                <Clock className="h-4 w-4" strokeWidth={1.5} />Недавние
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((s) => (
                  <button key={s} onClick={() => setQuery(s)} className="rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-[13px] text-white/55 transition-cinematic hover:bg-white/8 hover:text-white/85">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {query.trim() && (
          <div className="mt-10 animate-fade-in">
            {loading ? (
              <div className="py-20 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <p className="mt-4 text-[14px] text-white/45">Поиск...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="py-20 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-white/15" strokeWidth={1} />
                <p className="mt-4 text-display text-[24px] font-medium text-white/70">Ничего не найдено "{query}"</p>
                <p className="mt-2 text-[14px] text-white/45">Попробуйте другой запрос.</p>
              </div>
            ) : (
              <>
                <p className="mb-5 text-[13px] text-white/45">{results.length} результатов для "{query}"</p>
                <div className="no-scrollbar flex flex-wrap gap-4">
                  {results.map((t) => (
                    <Card key={t.id} title={t} variant="portrait" onSelect={onSelect} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
