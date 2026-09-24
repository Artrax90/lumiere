import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Mic,
  MicOff,
  TrendingUp,
  Clock,
  Film,
  Tv,
  Sparkles,
  ArrowUpDown,
  Trash2,
  SlidersHorizontal,
  Star,
  Check,
} from 'lucide-react';
import type { Title } from '@/api/client';
import { useSearch } from '@/hooks/useSearch';
import { useGenres } from '@/hooks/useGenres';
import { useTrending } from '@/hooks/useTrending';
import Card from './Card';

interface SearchViewProps {
  onSelect: (title: Title) => void;
  initialQuery?: string;
}

type MediaTypeFilter = 'all' | 'movie' | 'tv' | 'anime';
type SortOption = 'relevance' | 'rating' | 'year';

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem('recent_searches') || '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  try {
    const trimmed = query.trim();
    if (!trimmed) return;
    const searches = getRecentSearches().filter(s => s.toLowerCase() !== trimmed.toLowerCase());
    searches.unshift(trimmed);
    localStorage.setItem('recent_searches', JSON.stringify(searches.slice(0, 15)));
  } catch {}
}

function removeRecentSearch(query: string) {
  try {
    const searches = getRecentSearches().filter(s => s !== query);
    localStorage.setItem('recent_searches', JSON.stringify(searches));
  } catch {}
}

function clearAllRecentSearches() {
  try {
    localStorage.removeItem('recent_searches');
  } catch {}
}

export default function SearchView({ onSelect, initialQuery = '' }: SearchViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: searchResults, loading: searchLoading } = useSearch(query, 250);
  const { data: genres } = useGenres('movie');
  const { data: trendingTitles, loading: trendingLoading } = useTrending('movie');

  const popularQueries = [
    'Начало',
    'Интерстеллар',
    'Дюна',
    'Оппенгеймер',
    'Матрица',
    'Аватар',
    'Гладиатор',
    'Во все тяжкие',
    'Пацаны',
  ];

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    inputRef.current?.focus();
  }, []);

  // Save successful search query to recent searches
  useEffect(() => {
    if (query.trim().length >= 2 && searchResults.length > 0 && !searchLoading) {
      saveRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
    }
  }, [searchResults, searchLoading, query]);

  // Handle ESC key to clear or blur
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (query) {
          setQuery('');
        } else {
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  // Voice Search Handler (Web Speech API)
  const toggleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Голосовой поиск не поддерживается вашим браузером.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ru-RU';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setQuery(transcript);
        }
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleClearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleRecentDelete = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    removeRecentSearch(item);
    setRecentSearches(getRecentSearches());
  };

  const handleClearAllRecent = () => {
    clearAllRecentSearches();
    setRecentSearches([]);
  };

  // Filter & Sort Results
  const filteredResults = useMemo(() => {
    let items = [...searchResults];

    // Filter by type
    if (typeFilter === 'movie') {
      items = items.filter(i => i.type === 'movie');
    } else if (typeFilter === 'tv') {
      items = items.filter(i => i.type === 'tv' || i.type === 'show');
    } else if (typeFilter === 'anime') {
      items = items.filter(
        i => i.type === 'anime' || i.genres?.some(g => g.toLowerCase().includes('аним') || g.toLowerCase().includes('anim'))
      );
    }

    // Sort
    if (sortBy === 'rating') {
      items.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sortBy === 'year') {
      items.sort((a, b) => (b.year || 0) - (a.year || 0));
    }

    return items;
  }, [searchResults, typeFilter, sortBy]);

  // Counts by category
  const counts = useMemo(() => {
    const movie = searchResults.filter(i => i.type === 'movie').length;
    const tv = searchResults.filter(i => i.type === 'tv' || i.type === 'show').length;
    const anime = searchResults.filter(
      i => i.type === 'anime' || i.genres?.some(g => g.toLowerCase().includes('аним') || g.toLowerCase().includes('anim'))
    ).length;
    return { all: searchResults.length, movie, tv, anime };
  }, [searchResults]);

  return (
    <div className="relative min-h-screen w-full px-4 sm:px-8 lg:px-12 pt-28 pb-24">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[360px] bg-gradient-to-b from-amber-500/[0.08] via-amber-500/[0.02] to-transparent blur-3xl -z-10" />

      <div className="mx-auto max-w-[1400px]">
        {/* Hero Search Box */}
        <div className="mx-auto max-w-3xl">
          <div
            className={`relative flex items-center rounded-2xl bg-white/[0.04] border backdrop-blur-2xl px-5 py-4 transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${
              focused
                ? 'border-amber-400/40 shadow-[0_0_35px_rgba(232,193,112,0.18),0_8px_32px_rgba(0,0,0,0.5)] bg-white/[0.06]'
                : 'border-white/[0.09] hover:border-white/20'
            }`}
          >
            <Search
              className={`h-5 w-5 transition-colors duration-200 shrink-0 ${
                focused ? 'text-amber-400' : 'text-white/40'
              }`}
              strokeWidth={1.75}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Поиск фильмов, сериалов, аниме, персон..."
              className="ml-3.5 w-full bg-transparent text-[16px] sm:text-[18px] font-medium text-white placeholder:text-white/30 focus:outline-none"
            />

            {query && (
              <button
                onClick={handleClearQuery}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white shrink-0 mr-1"
                aria-label="Clear query"
                title="Очистить (ESC)"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}

            <button
              onClick={toggleVoiceSearch}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors shrink-0 ${
                isListening
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-white/40 hover:bg-white/10 hover:text-white'
              }`}
              aria-label="Voice search"
              title={isListening ? 'Слушаю...' : 'Голосовой поиск'}
            >
              {isListening ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RESULTS VIEW (When query has text) */}
        {/* ================================================================ */}
        {query.trim() ? (
          <div className="mt-8 animate-fade-in">
            {/* Filter & Sort Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
              {/* Type Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {(
                  [
                    { key: 'all', label: 'Все', count: counts.all },
                    { key: 'movie', label: 'Фильмы', count: counts.movie },
                    { key: 'tv', label: 'Сериалы', count: counts.tv },
                    { key: 'anime', label: 'Аниме', count: counts.anime },
                  ] as const
                ).map((tab) => {
                  const isActive = typeFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setTypeFilter(tab.key)}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 shrink-0 ${
                        isActive
                          ? 'bg-amber-300 text-black shadow-[0_2px_12px_rgba(232,193,112,0.3)] font-semibold'
                          : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/[0.05]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                            isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-white/40 flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  Сортировка:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[12px] text-white/80 font-medium focus:outline-none focus:border-amber-400/40 cursor-pointer"
                >
                  <option value="relevance" className="bg-[#121216] text-white">По популярности</option>
                  <option value="rating" className="bg-[#121216] text-white">По рейтингу</option>
                  <option value="year" className="bg-[#121216] text-white">Сначала новые</option>
                </select>
              </div>
            </div>

            {/* Results Status Line */}
            <div className="py-4 text-[13px] text-white/40">
              {searchLoading ? (
                <span>Ищем результаты...</span>
              ) : (
                <span>
                  Найдено <span className="font-semibold text-white/80">{filteredResults.length}</span>{' '}
                  {filteredResults.length === 1 ? 'результат' : filteredResults.length < 5 ? 'результата' : 'результатов'}{' '}
                  по запросу «<span className="text-white/80">{query}</span>»
                </span>
              )}
            </div>

            {/* Loading Skeletons */}
            {searchLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-2.5">
                    <div className="aspect-[2/3] w-full rounded-[14px] bg-white/[0.04] border border-white/[0.06]" />
                    <div className="h-3.5 w-3/4 rounded bg-white/[0.06]" />
                    <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                  </div>
                ))}
              </div>
            ) : filteredResults.length === 0 ? (
              /* Empty State */
              <div className="py-24 text-center max-w-md mx-auto">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.08] text-white/30 mb-5">
                  <Sparkles className="h-7 w-7 text-amber-400/60" strokeWidth={1.5} />
                </div>
                <h3 className="text-[18px] font-medium text-white/90">Ничего не найдено</h3>
                <p className="mt-2 text-[13px] text-white/45 leading-relaxed">
                  По запросу «{query}» не нашлось совпадений. Проверьте правильность написания или попробуйте оригинальное название.
                </p>

                {/* Suggestions */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {popularQueries.slice(0, 5).map((pop) => (
                    <button
                      key={pop}
                      onClick={() => setQuery(pop)}
                      className="rounded-full bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
                    >
                      {pop}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Results Grid */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
                {filteredResults.map((item, i) => (
                  <div
                    key={item.id}
                    className="animate-stagger-in"
                    style={{ animationDelay: `${Math.min(i * 30, 450)}ms` }}
                  >
                    <Card title={item} variant="portrait" onSelect={onSelect} fill />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ================================================================ */
          /* INITIAL DISCOVER VIEW (When query is empty) */
          /* ================================================================ */
          <div className="mt-12 space-y-12 animate-fade-in">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-white/60 tracking-wide uppercase">
                    <Clock className="h-4 w-4 text-amber-400/70" strokeWidth={1.75} />
                    История поиска
                  </div>
                  <button
                    onClick={handleClearAllRecent}
                    className="text-[12px] text-white/35 hover:text-white/70 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Очистить всё
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((item) => (
                    <div
                      key={item}
                      onClick={() => setQuery(item)}
                      className="group flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/[0.08] pl-3.5 pr-2 py-1.5 text-[13px] text-white/75 hover:bg-white/[0.09] hover:text-white hover:border-white/20 transition-all cursor-pointer"
                    >
                      <span>{item}</span>
                      <button
                        onClick={(e) => handleRecentDelete(e, item)}
                        className="opacity-40 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded-full transition-opacity"
                        title="Удалить из истории"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Genres */}
            <div>
              <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-white/60 tracking-wide uppercase">
                <Film className="h-4 w-4 text-amber-400/70" strokeWidth={1.75} />
                Жанры и категории
              </div>
              <div className="flex flex-wrap gap-2">
                {genres.slice(0, 16).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setQuery(g.name)}
                    className="rounded-full bg-white/[0.03] border border-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-amber-400/10 hover:border-amber-400/30 hover:text-amber-300 transition-all"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Popular Search Suggestions */}
            <div>
              <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-white/60 tracking-wide uppercase">
                <TrendingUp className="h-4 w-4 text-amber-400/70" strokeWidth={1.75} />
                Часто ищут
              </div>
              <div className="flex flex-wrap gap-2">
                {popularQueries.map((pq) => (
                  <button
                    key={pq}
                    onClick={() => setQuery(pq)}
                    className="rounded-full bg-white/[0.03] border border-white/[0.06] px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/[0.08] hover:text-white transition-all"
                  >
                    {pq}
                  </button>
                ))}
              </div>
            </div>

            {/* Trending Movies Grid Preview */}
            {trendingTitles.length > 0 && (
              <div className="pt-4">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-white/90">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    Сейчас в тренде
                  </div>
                  <span className="text-[12px] text-white/40">Топ фильмов недели</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
                  {trendingTitles.slice(0, 12).map((item, idx) => (
                    <div
                      key={item.id}
                      className="animate-stagger-in"
                      style={{ animationDelay: `${Math.min(idx * 35, 450)}ms` }}
                    >
                      <Card title={item} variant="portrait" onSelect={onSelect} fill />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
