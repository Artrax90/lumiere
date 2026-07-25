import { useState, useEffect, useMemo } from 'react';
import type { Title } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import { usePopular } from '@/hooks/usePopular';
import Hero, { moodGrade } from './Hero';
import ContentRow from './ContentRow';
import ShowcaseRow from './ShowcaseRow';
import CollectionBanner from './CollectionBanner';

// Get playback positions from localStorage
function getPlaybackPositions(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem('playback_positions') || '{}');
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
  const [active, setActive] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);

  const { data: trendingMovies } = useTrending('movie');
  const { data: popularMovies } = usePopular('movie');
  const { data: trendingTv } = useTrending('tv');

  const current = heroTitles[active];

  useEffect(() => {
    if (heroTitles.length === 0) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % heroTitles.length);
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [heroTitles.length]);

  useEffect(() => {
    if (current) {
      onMoodChange('warm', current.backdrop);
    }
  }, [active, current, onMoodChange]);

  useEffect(() => {
    setImgLoaded(false);
    if (!current) return;
    const img = new Image();
    img.src = current.backdrop;
    img.onload = () => setImgLoaded(true);
  }, [current]);

  // Get continue watching from playback positions
  const continueWatching = useMemo(() => {
    const positions = getPlaybackPositions();
    const watchedIds = Object.keys(positions).map(Number);
    if (watchedIds.length === 0) return popularMovies.slice(0, 6);
    
    // Find titles that have been watched
    const allTitles = [...trendingMovies, ...popularMovies];
    const watched = watchedIds
      .map(id => allTitles.find(t => t.id === id))
      .filter((t): t is Title => t !== undefined)
      .slice(0, 6);
    
    return watched.length > 0 ? watched : popularMovies.slice(0, 6);
  }, [trendingMovies, popularMovies]);

  const becauseYouWatched = trendingMovies.slice(0, 6);
  const tonightForYou = popularMovies.slice(2, 7);
  const newThisWeek = trendingTv.slice(0, 5);
  const topRated = popularMovies.slice(4, 10);

  const grade = current ? moodGrade['warm'] : null;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden" style={{ height: '150vh' }}>
        {current && (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${current.backdrop})`,
                backgroundSize: 'cover',
                backgroundPosition: '72% center',
                filter: 'blur(70px) saturate(1.4) brightness(0.72)',
                opacity: imgLoaded ? 0.5 : 0,
                transition: 'opacity 2000ms ease-out',
                maskImage:
                  'linear-gradient(to bottom, transparent 0%, transparent 26vh, #000 32vh, #000 44vh, rgba(0,0,0,0.55) 62vh, transparent 92vh)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0%, transparent 26vh, #000 32vh, #000 44vh, rgba(0,0,0,0.55) 62vh, transparent 92vh)',
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
                    'linear-gradient(to bottom, transparent 26vh, #000 32vh, rgba(0,0,0,0.4) 58vh, transparent 85vh)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, transparent 26vh, #000 32vh, rgba(0,0,0,0.4) 58vh, transparent 85vh)',
                }}
              />
            )}
          </>
        )}
      </div>

      {current && (
      <Hero
        current={current}
        titles={heroTitles}
        active={active}
        setActive={setActive}
        onSelect={onSelect}
        onPlay={onPlay}
        imgLoaded={imgLoaded}
      />
      )}

      <div className="relative z-10 pb-10" style={{ paddingTop: 'calc(max(32vh, 320px) - 28px)' }}>
        <ContentRow
          label="Продолжить просмотр"
          subtitle="Там, где вы остановились"
          titles={continueWatching}
          variant="landscape"
          onSelect={onSelect}
        />

        <ContentRow
          label="Популярное сейчас"
          subtitle="Все смотрят эти фильмы"
          titles={becauseYouWatched}
          variant="portrait"
          featuredFirst
          personality="editorial"
          onSelect={onSelect}
        />

        <ContentRow
          label="Сегодня для вас"
          subtitle="Подборка по вашим вкусам"
          titles={tonightForYou}
          variant="landscape"
          featuredFirst
          personality="trending"
          onSelect={onSelect}
        />

        <CollectionBanner onSelect={onSelect} onPlay={onPlay} />

        <ShowcaseRow
          label="Топ рейтинг"
          subtitle="Лучшие фильмы по оценкам"
          titles={topRated}
          onSelect={onSelect}
          glow
        />

        <ContentRow
          label="Новинки сериалов"
          subtitle="Свежие добавления"
          titles={newThisWeek}
          variant="portrait"
          personality="awards"
          onSelect={onSelect}
        />

        <section className="px-8 py-20 lg:px-14">
          <h2 className="mb-6 text-display text-[21px] font-medium tracking-tight text-white/85">Настроение</h2>
          <div className="flex flex-wrap gap-2">
            {[
              'Взрывное действие',
              'Истории, которые запоминаются',
              'Уютные вечера',
              'Н mind-bending Sci-Fi',
              'Все смотрят',
              'Вечера для хорошего настроения',
              'Лауреаты премий',
              'Скрытые жемчужины',
              'Семейный вечер',
            ].map((g) => (
              <button
                key={g}
                className="rounded-full border border-white/[0.05] bg-white/[0.015] px-5 py-2.5 text-[13px] font-medium text-white/45 transition-lux hover:bg-white/[0.05] hover:text-white/82"
              >
                {g}
              </button>
            ))}
          </div>
        </section>

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
