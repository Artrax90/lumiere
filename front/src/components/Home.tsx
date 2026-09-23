import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Title } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import { usePopular } from '@/hooks/usePopular';
import { serverUrl } from '@/api/server';
import Hero, { moodGrade } from './Hero';
import ContentRow from './ContentRow';
import ShowcaseRow from './ShowcaseRow';
import CollectionBanner from './CollectionBanner';
import Top10Row from './Top10Row';
import { useTopRated, useNowPlaying, useGenreCatalog } from '@/hooks/useCatalog';
import { getHomeShelves, syncHomeShelvesFromServer, type HomeShelfConfig } from '@/utils/homeShelves';

// Get playback positions from localStorage with timestamps and title info
function getPlaybackPositions(): Record<number, { time: number; timestamp: number; title?: Title }> {
  try {
    const raw = JSON.parse(localStorage.getItem('playback_positions') || '{}');
    const result: Record<number, { time: number; timestamp: number; title?: Title }> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        result[Number(id)] = value as { time: number; timestamp: number; title?: Title };
      } else {
        result[Number(id)] = { time: value as number, timestamp: 0 };
      }
    }
    return result;
  } catch {
    return {};
  }
}

const ROTATION_MS = 11000;

type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

interface HomeProps {
  heroTitles: Title[];
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
  onMoodChange: (mood: Mood, image: string) => void;
  mood: Mood;
}

export default function Home({ heroTitles, onSelect, onPlay, onMoodChange, mood }: HomeProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [shelves, setShelves] = useState<HomeShelfConfig[]>(getHomeShelves);

  useEffect(() => {
    syncHomeShelvesFromServer();
    const onShelvesChanged = () => {
      setShelves(getHomeShelves());
    };
    window.addEventListener('home-shelves-changed', onShelvesChanged);
    return () => window.removeEventListener('home-shelves-changed', onShelvesChanged);
  }, []);

  const { data: trendingMovies } = useTrending('movie');
  const { data: popularMovies } = usePopular('movie', 1);
  const { data: popularMovies2 } = usePopular('movie', 2);
  const { data: popularTv } = usePopular('tv', 1);
  const { data: trendingTv } = useTrending('tv');
  const { data: nowPlayingMovies } = useNowPlaying(1);
  const { data: topRatedMovies } = useTopRated('movie', 1);
  const { data: actionMovies } = useGenreCatalog('movie', 28, 1);
  const { data: comedyMovies } = useGenreCatalog('movie', 35, 1);
  const { data: scifiMovies } = useGenreCatalog('movie', 878, 1);
  const { data: familyMovies } = useGenreCatalog('movie', 16, 1);

  const availableHeroTitles = heroTitles.length > 0 ? heroTitles : popularMovies.length > 0 ? popularMovies : trendingTv;
  const current = availableHeroTitles[active] || availableHeroTitles[0] || null;

  useEffect(() => {
    if (availableHeroTitles.length === 0) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % availableHeroTitles.length);
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [availableHeroTitles.length]);

  useEffect(() => {
    if (current) {
      onMoodChange('warm', serverUrl(current.backdrop));
    }
  }, [active, current, onMoodChange]);

  useEffect(() => {
    setImgLoaded(false);
    if (!current) {
      return;
    }

    const url = serverUrl(current.backdrop);

    // Show Hero after 1s even if image hasn't loaded (fallback)
    const fallback = setTimeout(() => {
      setImgLoaded(true);
    }, 1000);

    const img = new Image();
    img.src = url;
    img.onload = () => {
      clearTimeout(fallback);
      setImgLoaded(true);
    };
    img.onerror = () => {
      clearTimeout(fallback);
      setImgLoaded(true);
    };

    return () => clearTimeout(fallback);
  }, [current]);

  // Get continue watching from playback positions, sorted by most recent
  const continueWatching = useMemo(() => {
    const positions = getPlaybackPositions();
    const entries = Object.entries(positions);
    if (entries.length === 0) return popularMovies.slice(0, 10);

    // Sort by timestamp (most recent first)
    const sortedEntries = entries
      .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));

    // Find titles that have been watched
    const allTitles = [...trendingMovies, ...popularMovies];
    const watched: Title[] = [];

    for (const [id, entry] of sortedEntries) {
      // First try to find in trending/popular
      const found = allTitles.find(t => t.id === Number(id));
      if (found) {
        watched.push(found);
      } else if (entry.title) {
        // Use saved title info (from search results) with defaults for missing fields
        const saved = entry.title as any;
        const cleanSavedName = saved.name
          ? saved.name.replace(/\s*—\s*Сезон.*$/i, '').replace(/\s*—\s*S\d+.*$/i, '').trim()
          : 'Unknown';
        watched.push({
          id: saved.id || Number(id),
          tmdbId: saved.tmdbId || saved.id || Number(id),
          name: cleanSavedName,
          type: saved.type || 'movie',
          year: saved.year || 0,
          runtime: saved.runtime || '',
          rating: saved.rating || '',
          score: saved.score || 0,
          genres: saved.genres || [],
          description: saved.description || '',
          backdrop: saved.backdrop || '',
          poster: saved.poster || '',
          logoText: saved.logoText ? saved.logoText.replace(/\s*—\s*Сезон.*$/i, '').trim() : cleanSavedName,
        } as Title);
      }
      if (watched.length >= 12) break;
    }

    return watched.length > 0 ? watched : popularMovies.slice(0, 10);
  }, [trendingMovies, popularMovies]);

  const becauseYouWatched = trendingMovies;
  const tonightForYou = popularMovies;
  const newThisWeek = trendingTv;
  const topRated = useMemo(() => {
    const combined = [...popularMovies, ...popularMovies2];
    const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
    return unique.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [popularMovies, popularMovies2]);

  const grade = current ? moodGrade['warm'] : null;

  const renderShelf = (shelfId: string) => {
    switch (shelfId) {
      case 'continueWatching':
        return continueWatching.length > 0 ? (
          <ContentRow
            key="continueWatching"
            label={t('home.continueWatching')}
            subtitle={t('home.continueWatchingDesc')}
            titles={continueWatching}
            variant="landscape"
            onSelect={onSelect}
          />
        ) : null;
      case 'top10Movies':
        return (
          <Top10Row
            key="top10Movies"
            label="Топ-10 фильмов сегодня"
            subtitle="Самые просматриваемые кинокартины прямо сейчас"
            titles={popularMovies.length > 0 ? popularMovies : trendingMovies}
            onSelect={onSelect}
            onPlay={onPlay}
          />
        );
      case 'nowPlaying':
        return nowPlayingMovies.length > 0 ? (
          <ContentRow
            key="nowPlaying"
            label="Новинки в кино и цифровые релизы"
            subtitle="Свежие премьеры в наилучшем качестве"
            titles={nowPlayingMovies}
            variant="landscape"
            personality="trending"
            onSelect={onSelect}
          />
        ) : null;
      case 'top10Tv':
        return (
          <Top10Row
            key="top10Tv"
            label="Топ-10 сериалов недели"
            subtitle="Главные многосерийные хиты и продолжения историй"
            titles={popularTv.length > 0 ? popularTv : trendingTv}
            onSelect={onSelect}
            onPlay={onPlay}
          />
        );
      case 'topRated':
        return (
          <ShowcaseRow
            key="topRated"
            label="Шедевры мирового кино"
            subtitle="Фильмы с высочайшими оценками критиков и зрителей"
            titles={topRatedMovies.length > 0 ? topRatedMovies : topRated}
            onSelect={onSelect}
            glow
          />
        );
      case 'action':
        return actionMovies.length > 0 ? (
          <ContentRow
            key="action"
            label="Боевики и приключения"
            subtitle="Динамичные блокбастеры, захватывающие сюжеты и экшн"
            titles={actionMovies}
            variant="portrait"
            personality="editorial"
            onSelect={onSelect}
          />
        ) : null;
      case 'banner':
        return <CollectionBanner key="banner" onSelect={onSelect} onPlay={onPlay} />;
      case 'comedy':
        return comedyMovies.length > 0 ? (
          <ContentRow
            key="comedy"
            label="Комедии для отличного настроения"
            subtitle="Легкие и остроумные истории для приятного вечера"
            titles={comedyMovies}
            variant="portrait"
            onSelect={onSelect}
          />
        ) : null;
      case 'scifi':
        return scifiMovies.length > 0 ? (
          <ContentRow
            key="scifi"
            label="Фантастика и другие миры"
            subtitle="Космос, киберпанк, магия и альтернативные вселенные"
            titles={scifiMovies}
            variant="landscape"
            personality="trending"
            onSelect={onSelect}
          />
        ) : null;
      case 'family':
        return familyMovies.length > 0 ? (
          <ContentRow
            key="family"
            label="Семейный вечер и анимация"
            subtitle="Красочные шедевры мультипликации и доброе кино"
            titles={familyMovies}
            variant="portrait"
            personality="awards"
            onSelect={onSelect}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden" style={{ height: '150vh' }}>
        {current && (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${serverUrl(current.backdrop)})`,
                backgroundSize: 'cover',
                backgroundPosition: '72% center',
                filter: 'blur(70px) saturate(1.4) brightness(0.72)',
                opacity: imgLoaded ? 0.5 : 0,
                transition: 'opacity 2000ms ease-out',
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, transparent 42vh, #000 56vh, #000 68vh, rgba(0,0,0,0.45) 82vh, transparent 110vh)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, transparent 42vh, #000 56vh, #000 68vh, rgba(0,0,0,0.45) 82vh, transparent 110vh)',
                transform: 'scale(1.2)',
              }}
            />
            {grade && (
              <div
                className="absolute inset-0"
                style={{
                  background: grade.grade,
                  mixBlendMode: 'soft-light',
                  opacity: imgLoaded ? 0.4 : 0,
                  transition: 'opacity 2000ms ease-out',
                  maskImage:
                    'linear-gradient(to bottom, transparent 42vh, #000 56vh, rgba(0,0,0,0.4) 75vh, transparent 95vh)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 42vh, #000 56vh, rgba(0,0,0,0.4) 75vh, transparent 95vh)',
                }}
              />
            )}
          </>
        )}
      </div>

      {current ? (
        <Hero
          current={current}
          titles={availableHeroTitles}
          active={active}
          setActive={setActive}
          onSelect={onSelect}
          onPlay={onPlay}
          imgLoaded={imgLoaded}
        />
      ) : (
        <div className="absolute left-0 right-0 top-0 z-20 h-[68vh] min-h-[520px] max-h-[760px] w-full overflow-hidden animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-white/[0.02] to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="w-full max-w-[1600px] px-8 pb-14 lg:px-16 lg:pb-16 space-y-4">
              <div className="h-4 w-32 rounded-full bg-white/10" />
              <div className="h-10 w-96 max-w-full rounded-2xl bg-white/15" />
              <div className="h-4 w-48 rounded-full bg-white/10" />
              <div className="h-16 w-full max-w-lg rounded-2xl bg-white/10" />
              <div className="flex gap-4 pt-2">
                <div className="h-12 w-36 rounded-full bg-white/20" />
                <div className="h-12 w-32 rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 pb-10" style={{ paddingTop: 'calc(min(68vh, 760px) - 90px)' }}>
        {shelves.filter((s) => s.enabled).map((s) => renderShelf(s.id))}

        <footer className="px-8 py-16 lg:px-14">
          <div className="flex items-center justify-between border-t border-white/[0.035] pt-10">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-5 w-5 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[3px] opacity-50" />
                <div className="relative h-2 w-2 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
              </div>
              <span className="text-display text-[16px] font-medium text-white/55">Lumière</span>
            </div>
            <p className="text-[12px] text-white/22">Медиацентр нового поколения</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
