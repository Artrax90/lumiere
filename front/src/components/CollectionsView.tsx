import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles, Film, ArrowLeft } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch } from '@/api/server';
import { useTrending } from '@/hooks/useTrending';
import { usePopular } from '@/hooks/usePopular';
import SafeImg from './SafeImg';
import Card from './Card';

interface CollectionsViewProps {
  onSelect: (title: Title) => void;
}

interface CollectionDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  searchQuery: string;
  accent: string;
  featured?: boolean;
}

const curatedCollections: CollectionDef[] = [
  {
    id: 'sci-fi',
    name: 'Вселенная Sci-Fi',
    subtitle: 'Космос, будущее и параллельные миры',
    description: 'Культовые научно-фантастические картины, расширяющие границы воображения и человеческого познания.',
    searchQuery: 'фантастика',
    accent: 'rgba(99,140,255,0.6)',
    featured: true,
  },
  {
    id: 'masterpieces',
    name: 'Шедевры мирового кино',
    subtitle: 'Высочайшие оценки и признание критиков',
    description: 'Фильмы, вошедшие в историю кинематографа и получившие максимальные баллы от зрителей и экспертов.',
    searchQuery: 'шедевр',
    accent: 'rgba(232,193,112,0.6)',
    featured: true,
  },
  {
    id: 'anime',
    name: 'Аниме и Анимация',
    subtitle: 'Шедевры восточной анимации',
    description: 'Захватывающие сюжеты, эстетика и эмоциональные путешествия от ведущих анимационных студий.',
    searchQuery: 'аниме',
    accent: 'rgba(244,114,182,0.6)',
    featured: true,
  },
  {
    id: 'thrillers',
    name: 'Остросюжетные триллеры',
    subtitle: 'Напряжение до последней секунды',
    description: 'Драматические повороты, тайны и психологическое напряжение, от которых невозможно оторваться.',
    searchQuery: 'триллер',
    accent: 'rgba(239,68,68,0.6)',
    featured: true,
  },
  {
    id: 'action',
    name: 'Кинематографичный экшн',
    subtitle: 'Драйв, погони и масштабные баталии',
    description: 'Самые зрелищные блокбастеры с передовыми спецэффектами и безупречной хореографией экшна.',
    searchQuery: 'боевик',
    accent: 'rgba(245,158,11,0.6)',
  },
  {
    id: 'crime',
    name: 'Криминал и Нео-нуар',
    subtitle: 'Улицы, тайны и моральные дилеммы',
    description: 'Захватывающие детективные расследования, гангстерские саги и теневая сторона большого города.',
    searchQuery: 'криминал',
    accent: 'rgba(148,163,184,0.6)',
  },
  {
    id: 'family',
    name: 'Семейный вечер',
    subtitle: 'Добрые истории для любого возраста',
    description: 'Тёплое, вдохновляющее кино для уютного просмотра в кругу самых близких людей.',
    searchQuery: 'приключения',
    accent: 'rgba(52,211,153,0.6)',
  },
  {
    id: 'mystery',
    name: 'Мистика и Хоррор',
    subtitle: 'Загадочные явления и леденящий страх',
    description: 'Атмосферные фильмы ужасов и мистические загадки для любителей острых ощущений.',
    searchQuery: 'ужасы',
    accent: 'rgba(168,85,247,0.6)',
  },
];

export default function CollectionsView({ onSelect }: CollectionsViewProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CollectionDef | null>(null);
  const [collectionTitles, setCollectionTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: trending } = useTrending('movie');
  const { data: popular } = usePopular('movie');

  // When a collection is selected, load real titles via API
  useEffect(() => {
    if (!selected) {
      setCollectionTitles([]);
      return;
    }

    let active = true;
    setLoading(true);

    const loadTitles = async () => {
      try {
        const res = await serverFetch(`/api/search?q=${encodeURIComponent(selected.searchQuery)}`);
        if (!res.ok) throw new Error('Failed to load collection');
        const data = await res.json();
        if (active) {
          const list = (data.results || []).filter((t: Title) => t.poster && t.backdrop);
          if (list.length < 6 && popular.length > 0) {
            const combined = [...list];
            for (const p of popular) {
              if (!combined.some((c) => c.id === p.id)) {
                combined.push(p);
              }
              if (combined.length >= 18) break;
            }
            setCollectionTitles(combined);
          } else {
            setCollectionTitles(list);
          }
        }
      } catch (err) {
        if (active) {
          setCollectionTitles(popular.slice(0, 18));
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

  // Inside single collection view
  if (selected) {
    const backdrop = collectionTitles[0]?.backdrop || trending[0]?.backdrop || '';

    return (
      <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-14 animate-fade-in">
        <div className="mx-auto max-w-[1500px]">
          <button
            onClick={() => setSelected(null)}
            className="mb-8 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/70 transition-cinematic hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            Все коллекции
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/80 to-transparent" />

            <div className="absolute bottom-0 left-0 p-8 lg:p-12 max-w-3xl">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: 'rgba(232,193,112,0.95)' }}
              >
                {selected.subtitle}
              </div>
              <h1 className="mt-2 text-display text-[34px] font-medium tracking-tight text-white md:text-[46px]">
                {selected.name}
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-white/70 md:text-[15px]">
                {selected.description}
              </p>
              <div className="mt-4 flex items-center gap-3 text-[13px] text-white/50">
                <Film className="h-4 w-4 text-amber-300/70" />
                <span>{loading ? 'Загрузка...' : `${collectionTitles.length} тайтлов`}</span>
              </div>
            </div>
          </div>

          {/* Grid of titles — fixed responsive CSS grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5 lg:gap-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] w-full rounded-[14px] skeleton" />
              ))}
            </div>
          ) : collectionTitles.length === 0 ? (
            <div className="rounded-[20px] glass-panel p-12 text-center text-white/50">
              В этой коллекции пока нет доступных тайтлов.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-5 lg:gap-6 animate-detail-rise">
              {collectionTitles.map((t, i) => (
                <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 40, 500)}ms` }}>
                  <Card title={t} variant="portrait" onSelect={onSelect} fill />
                </div>
              ))}
            </div>
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
              Тематические подборки
            </span>
          </div>
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[46px]">
            {t('nav.collections')}
          </h1>
          <p className="mt-2 text-[15px] text-white/55">
            Кураторские коллекции и циклы киношедевров, отобранные по настроению и жанрам.
          </p>
        </div>

        {/* Featured collections — large editorial banners */}
        <div className="mb-10 grid gap-6 md:grid-cols-2 animate-detail-rise">
          {featured.map((col, i) => {
            const bg = trending[i]?.backdrop || popular[i]?.backdrop || '';
            return (
              <button
                key={col.id}
                onClick={() => setSelected(col)}
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
                    style={{ color: 'rgba(232,193,112,0.9)' }}
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

        {/* Secondary collections grid */}
        <div className="mb-6">
          <h3 className="text-display text-[22px] font-medium text-white/90 mb-5">
            Больше коллекций
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 animate-detail-rise">
            {rest.map((col, i) => {
              const bg = trending[4 + i]?.backdrop || popular[4 + i]?.backdrop || '';
              return (
                <button
                  key={col.id}
                  onClick={() => setSelected(col)}
                  className="group relative h-56 overflow-hidden rounded-[18px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
                  style={{ animationDelay: `${200 + i * 80}ms` }}
                >
                  {bg && (
                    <SafeImg
                      src={bg}
                      alt={col.name}
                      className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105"
                      style={{ filter: 'saturate(1.05) brightness(0.6)' }}
                      loading="lazy"
                    />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${col.accent} 0%, transparent 60%)` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08080a]/90 via-[#08080a]/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                      {col.subtitle}
                    </span>
                    <h4 className="mt-1 text-display text-[20px] font-medium text-white">
                      {col.name}
                    </h4>
                    <div className="mt-3 flex items-center gap-1 text-[12px] font-medium text-white/70 transition-cinematic group-hover:text-amber-300">
                      Открыть <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
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
