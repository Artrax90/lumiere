import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles, Film, ArrowLeft, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch } from '@/api/server';
import { useTrending } from '@/hooks/useTrending';
import { usePopular } from '@/hooks/usePopular';
import SafeImg from './SafeImg';
import Card from './Card';

interface CollectionsViewProps {
  onSelect: (title: Title) => void;
  initialCollectionId?: string | null;
  onCollectionChange?: (collectionId: string | null) => void;
}

export interface CollectionDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  endpoint: string;
  accent: string;
  bg?: string;
  featured?: boolean;
}

export const curatedCollections: CollectionDef[] = [
  {
    id: 'masterpieces',
    name: 'Шедевры мирового кино',
    subtitle: 'Высочайшие оценки и признание критиков',
    description: 'Фильмы, вошедшие в историю кинематографа и получившие максимальные баллы от зрителей и экспертов.',
    endpoint: '/api/movies/top_rated',
    accent: 'rgba(232,193,112,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg',
    featured: true,
  },
  {
    id: 'sci-fi',
    name: 'Вселенная Sci-Fi',
    subtitle: 'Космос, будущее и параллельные миры',
    description: 'Культовые научно-фантастические картины, расширяющие границы воображения и человеческого познания.',
    endpoint: '/api/movies/genre/878',
    accent: 'rgba(99,140,255,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/mXLOHHc1Zeuwsl4xYKzKhbe2L9V.jpg',
    featured: true,
  },
  {
    id: 'thrillers',
    name: 'Остросюжетные триллеры',
    subtitle: 'Напряжение до последней секунды',
    description: 'Драматические повороты, тайны и психологическое напряжение, от которых невозможно оторваться.',
    endpoint: '/api/movies/genre/53',
    accent: 'rgba(239,68,68,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
    featured: true,
  },
  {
    id: 'anime',
    name: 'Аниме и Анимация',
    subtitle: 'Шедевры восточной анимации',
    description: 'Захватывающие сюжеты, эстетика и эмоциональные путешествия от ведущих анимационных студий.',
    endpoint: '/api/movies/genre/16',
    accent: 'rgba(244,114,182,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/kGzFbGjtdaQpmfqeq35PVvlW93Y.jpg',
    featured: true,
  },
  {
    id: 'action',
    name: 'Боевики и Экшн',
    subtitle: 'Драйв, погони и масштабные баталии',
    description: 'Самые зрелищные блокбастеры с передовыми спецэффектами и безупречной хореографией экшна.',
    endpoint: '/api/movies/genre/28',
    accent: 'rgba(245,158,11,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/zOpeFTcbAQDgPebL49y0w58mfl3.jpg',
  },
  {
    id: 'comedy',
    name: 'Комедии и Юмор',
    subtitle: 'Отличное настроение и море улыбок',
    description: 'Остроумные, легкие и уморительные комедии для отдыха в компании друзей и семьи.',
    endpoint: '/api/movies/genre/35',
    accent: 'rgba(16,185,129,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/ctMserH8g2SeOAnCw5gFjd2NTL6.jpg',
  },
  {
    id: 'crime',
    name: 'Криминал и Гангстеры',
    subtitle: 'Улицы, тайны и моральные дилеммы',
    description: 'Захватывающие детективные расследования, гангстерские саги и теневая сторона большого города.',
    endpoint: '/api/movies/genre/80',
    accent: 'rgba(148,163,184,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
  },
  {
    id: 'horror',
    name: 'Ужасы и Хорроры',
    subtitle: 'Загадочные явления и леденящий страх',
    description: 'Атмосферные фильмы ужасов и мистические загадки для любителей острых ощущений.',
    endpoint: '/api/movies/genre/27',
    accent: 'rgba(168,85,247,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/t5zCBSB5xMDKcDqe91qahCOUYVV.jpg',
  },
  {
    id: 'mystery',
    name: 'Детективы и Загадки',
    subtitle: 'Запутанные тайны и поиск истины',
    description: 'Сложные головоломки, неожиданные развязки и расследования гениальных сыщиков.',
    endpoint: '/api/movies/genre/9648',
    accent: 'rgba(129,140,248,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/5mzr6AnAnnavZeMVjSGq39DJ5Ij.jpg',
  },
  {
    id: 'adventure',
    name: 'Приключения',
    subtitle: 'Опасные экспедиции и сокровища',
    description: 'Путешествия в неизведанные земли, поиски древних артефактов и испытания стихией.',
    endpoint: '/api/movies/genre/12',
    accent: 'rgba(56,189,248,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/vL5LR6WdxWPjC0vWbZ54x4vJmsa.jpg',
  },
  {
    id: 'family',
    name: 'Семейный вечер',
    subtitle: 'Добрые истории для любого возраста',
    description: 'Тёплое, вдохновляющее кино для уютного просмотра в кругу самых близких людей.',
    endpoint: '/api/movies/genre/10751',
    accent: 'rgba(52,211,153,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/7BPb7nZ6r4P2H4bSg7m64wQ2GgR.jpg',
  },
  {
    id: 'fantasy',
    name: 'Фэнтези и Магия',
    subtitle: 'Драконы, волшебство и древние легенды',
    description: 'Эпические истории о противостоянии добра и зла в сказочных и магических мирах.',
    endpoint: '/api/movies/genre/14',
    accent: 'rgba(192,132,252,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/628Dep6AxEtDxjZoGP78TsOxYbK.jpg',
  },
  {
    id: 'drama',
    name: 'Драмы',
    subtitle: 'Глубокие истории о человеческих судьбах',
    description: 'Проникновенные сюжеты, раскрывающие силу характера, любовь и сложные жизненные испытания.',
    endpoint: '/api/movies/genre/18',
    accent: 'rgba(251,113,133,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/w71a06B62Xq0U4hG7Qd8lX4z3mE.jpg',
  },
  {
    id: 'romance',
    name: 'Мелодрамы и Любовь',
    subtitle: 'Романтика, искренние чувства и страсть',
    description: 'Трогательные истории любви, способной преодолеть любые расстояния и препятствия.',
    endpoint: '/api/movies/genre/10749',
    accent: 'rgba(244,63,94,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
  },
  {
    id: 'history',
    name: 'Историческое кино',
    subtitle: 'Эпохальные события и великие личности',
    description: 'Масштабные реконструкции ключевых моментов истории человечества и судьбы правителей.',
    endpoint: '/api/movies/genre/36',
    accent: 'rgba(217,119,6,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg',
  },
  {
    id: 'war',
    name: 'Военное кино',
    subtitle: 'Мужество, баталии и подвиги',
    description: 'Суровые хроники боевых действий, героизм солдат и цена мира.',
    endpoint: '/api/movies/genre/10752',
    accent: 'rgba(120,113,108,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/yYrvNvt2CrhuESGd3UvT95ZeO7R.jpg',
  },
  {
    id: 'documentary',
    name: 'Документальные фильмы',
    subtitle: 'Реальные факты, наука и природа',
    description: 'Увлекательные исследования планеты, тайн космоса, технологий и биографий выдающихся людей.',
    endpoint: '/api/movies/genre/99',
    accent: 'rgba(6,182,212,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/h75QJgB0b3D40573e0H1jN5K1qU.jpg',
  },
  {
    id: 'music',
    name: 'Музыка и Мюзиклы',
    subtitle: 'Концерты, мюзиклы и ритм',
    description: 'Кинематографичные музыкальные шедевры, байопики музыкантов и легендарные мюзиклы.',
    endpoint: '/api/movies/genre/10402',
    accent: 'rgba(236,72,153,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/fOy2JurzKANt6DCvNs29U5i6zY5.jpg',
  },
  {
    id: 'western',
    name: 'Вестерны',
    subtitle: 'Дикий Запад, дуэли и ковбои',
    description: 'Классические и современные истории о бескрайних прериях, законе револьвера и чести.',
    endpoint: '/api/movies/genre/37',
    accent: 'rgba(180,83,9,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/x26Mw1V6d19oIq0V1rM7n4xV06p.jpg',
  },
  {
    id: 'tv-drama',
    name: 'Культовые сериалы',
    subtitle: 'Лучшие драматические саги',
    description: 'Многосерийные драмы с продуманными до мелочей сюжетами и глубоким раскрытием персонажей.',
    endpoint: '/api/tv/genre/18',
    accent: 'rgba(59,130,246,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/9faGSFi5jam6pDWGNd0id8JimmL.jpg',
  },
  {
    id: 'tv-scifi',
    name: 'Фантастические сериалы',
    subtitle: 'Эпическая фантастика и фэнтези на ТВ',
    description: 'Масштабные фантастические вселенные, разворачивающиеся на протяжении нескольких сезонов.',
    endpoint: '/api/tv/genre/10765',
    accent: 'rgba(139,92,246,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg',
  },
  {
    id: 'now-playing',
    name: 'Свежие цифровые релизы',
    subtitle: 'Самые последние фильмы в прокате и цифре',
    description: 'Горячие премьеры последних месяцев, только появившиеся на экранах и в сети.',
    endpoint: '/api/movies/now_playing',
    accent: 'rgba(34,197,94,0.75)',
    bg: 'https://image.tmdb.org/t/p/w780/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg',
  },
];

export default function CollectionsView({ onSelect, initialCollectionId, onCollectionChange }: CollectionsViewProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CollectionDef | null>(() => {
    if (initialCollectionId) {
      return curatedCollections.find((c) => c.id === initialCollectionId) || null;
    }
    return null;
  });
  const [collectionTitles, setCollectionTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(3);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: trending } = useTrending('movie');
  const { data: popular } = usePopular('movie');

  // React to initialCollectionId changes
  useEffect(() => {
    if (initialCollectionId) {
      const match = curatedCollections.find((c) => c.id === initialCollectionId);
      if (match && (!selected || selected.id !== match.id)) {
        setSelected(match);
      }
    }
  }, [initialCollectionId]);

  // When selected changes, notify parent
  const handleSelectCollection = (col: CollectionDef | null) => {
    setSelected(col);
    if (onCollectionChange) {
      onCollectionChange(col ? col.id : null);
    }
  };

  // Helper to fetch a page of titles
  const fetchPage = async (endpoint: string, p: number): Promise<Title[]> => {
    try {
      const sep = endpoint.includes('?') ? '&' : '?';
      const res = await serverFetch(`${endpoint}${sep}page=${p}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).filter((t: Title) => t.id && (t.poster || t.backdrop));
    } catch {
      return [];
    }
  };

  // Load initial batch of titles (pages 1, 2, 3)
  useEffect(() => {
    if (!selected) {
      setCollectionTitles([]);
      return;
    }

    let active = true;
    setLoading(true);
    setCurrentPage(3);
    setHasMore(true);

    const loadTitles = async () => {
      try {
        const [p1, p2, p3] = await Promise.all([
          fetchPage(selected.endpoint, 1),
          fetchPage(selected.endpoint, 2),
          fetchPage(selected.endpoint, 3),
        ]);

        if (active) {
          const combined = [...p1, ...p2, ...p3];
          const seen = new Set<number>();
          const unique = combined.filter((t) => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });

          if (unique.length < 10 && popular.length > 0) {
            for (const p of popular) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                unique.push(p);
              }
            }
          }

          setCollectionTitles(unique);
          setHasMore(combined.length >= 30);
        }
      } catch (err) {
        if (active) {
          setCollectionTitles(popular.slice(0, 30));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTitles();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    return () => {
      active = false;
    };
  }, [selected, popular]);

  // Load more handler (pages 4, 5, etc.)
  const handleLoadMore = async () => {
    if (!selected || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage1 = currentPage + 1;
    const nextPage2 = currentPage + 2;

    try {
      const [more1, more2] = await Promise.all([
        fetchPage(selected.endpoint, nextPage1),
        fetchPage(selected.endpoint, nextPage2),
      ]);
      const added = [...more1, ...more2];
      if (added.length === 0) {
        setHasMore(false);
      } else {
        const seen = new Set(collectionTitles.map((t) => t.id));
        const newUnique = added.filter((t) => !seen.has(t.id));
        setCollectionTitles((prev) => [...prev, ...newUnique]);
        setCurrentPage(nextPage2);
        if (added.length < 15) setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // Inside single collection view
  if (selected) {
    const backdrop = selected.bg || collectionTitles[0]?.backdrop || trending[0]?.backdrop || '';

    return (
      <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-14 animate-fade-in">
        <div className="mx-auto max-w-[1500px]">
          <button
            onClick={() => handleSelectCollection(null)}
            className="mb-8 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/70 transition-cinematic hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            Все подборки
          </button>

          {/* Collection Hero Banner */}
          <div className="relative mb-12 h-72 md:h-84 overflow-hidden rounded-[24px] animate-detail-rise">
            {backdrop && (
              <SafeImg
                src={backdrop}
                alt={selected.name}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'saturate(1.1) brightness(0.65)' }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${selected.accent} 0%, transparent 60%)` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/50 to-transparent" />

            <div className="absolute bottom-0 left-0 p-8 md:p-12 max-w-2xl">
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: '#e8c170' }}
              >
                {selected.subtitle}
              </span>
              <h1 className="mt-2 text-display text-[32px] font-medium tracking-tight text-white md:text-[44px]">
                {selected.name}
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-white/70 line-clamp-3">
                {selected.description}
              </p>
              <div className="mt-4 flex items-center gap-2 text-[12px] text-white/45">
                <Film className="h-3.5 w-3.5" />
                <span>{collectionTitles.length} фильмов и сериалов в подборке</span>
              </div>
            </div>
          </div>

          {/* Grid of titles — fixed responsive CSS grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5 lg:gap-6">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] w-full rounded-[14px] skeleton" />
              ))}
            </div>
          ) : collectionTitles.length === 0 ? (
            <div className="rounded-[20px] glass-panel p-12 text-center text-white/50">
              В этой подборке пока нет доступных тайтлов.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5 lg:gap-6 animate-detail-rise">
                {collectionTitles.map((t, i) => (
                  <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}>
                    <Card title={t} variant="portrait" onSelect={onSelect} fill />
                  </div>
                ))}
              </div>

              {/* Load more button */}
              {hasMore && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2.5 rounded-full px-8 py-3.5 text-[14px] font-medium transition-all duration-300 glass hover:bg-white/15 text-white/90 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                        Загрузка фильмов...
                      </>
                    ) : (
                      <>
                        <span>Показать ещё фильмы</span>
                        <ChevronRight className="h-4 w-4 text-amber-300" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const featured = curatedCollections.filter((c) => c.featured);
  const rest = curatedCollections.filter((c) => !c.featured);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-14">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-2.5 mb-2">
            <Sparkles className="h-5 w-5 text-amber-300/80" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
              Кураторские циклы
            </span>
          </div>
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[46px]">
            {t('nav.collections')}
          </h1>
          <p className="mt-2 text-[15px] text-white/55">
            Кураторские подборки, жанровые коллекции и циклы киношедевров, отобранные по настроению и темам.
          </p>
        </div>

        {/* Featured collections — large editorial banners */}
        <div className="mb-12 grid gap-6 md:grid-cols-2 animate-detail-rise">
          {featured.map((col, i) => {
            const bg = col.bg || trending[i]?.backdrop || popular[i]?.backdrop || '';
            return (
              <button
                key={col.id}
                onClick={() => handleSelectCollection(col)}
                className="group relative h-72 md:h-80 overflow-hidden rounded-[22px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {bg && (
                  <SafeImg
                    src={bg}
                    alt={col.name}
                    className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105"
                    style={{ filter: 'saturate(1.05) brightness(0.68)' }}
                    loading="lazy"
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${col.accent} 0%, transparent 60%)` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/95 via-[#08080a]/35 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8 md:p-9 max-w-lg">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: '#e8c170' }}
                  >
                    {col.subtitle}
                  </div>
                  <h2 className="mt-2 text-display text-[26px] font-medium tracking-tight text-white md:text-[32px]">
                    {col.name}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-white/65 line-clamp-2">
                    {col.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-white/80 transition-cinematic group-hover:text-amber-300">
                    Смотреть подборку
                    <ChevronRight className="h-4 w-4 transition-cinematic group-hover:translate-x-1" strokeWidth={1.5} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* All collections & genres grid */}
        <div className="mb-6">
          <h3 className="text-display text-[22px] font-medium text-white/90 mb-5">
            Все жанры и категории
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-detail-rise">
            {rest.map((col, i) => {
              const bg = col.bg || trending[4 + i]?.backdrop || popular[4 + i]?.backdrop || '';
              return (
                <button
                  key={col.id}
                  onClick={() => handleSelectCollection(col)}
                  className="group relative h-56 overflow-hidden rounded-[18px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
                  style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
                >
                  {bg && (
                    <SafeImg
                      src={bg}
                      alt={col.name}
                      className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105"
                      style={{ filter: 'saturate(1.05) brightness(0.58)' }}
                      loading="lazy"
                    />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${col.accent} 0%, transparent 60%)` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/92 via-[#08080a]/35 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                      {col.subtitle}
                    </span>
                    <h4 className="mt-1 text-display text-[20px] font-medium text-white">
                      {col.name}
                    </h4>
                    <div className="mt-3 flex items-center gap-1 text-[12px] font-medium text-white/70 transition-cinematic group-hover:text-amber-300">
                      Открыть подборку <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
