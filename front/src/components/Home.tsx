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
    if (!current) {
      console.log('[Hero] current is null/undefined, heroTitles empty?');
      return;
    }

    const url = serverUrl(current.backdrop);
    console.log('[Hero] preload URL:', url, 'current:', current.name, 'backdrop raw:', current.backdrop);

    // Show Hero after 2s even if image hasn't loaded (fallback)
    const fallback = setTimeout(() => {
      console.log('[Hero] fallback timeout — showing anyway');
      setImgLoaded(true);
    }, 2000);

    const img = new Image();
    img.src = url;
    img.onload = () => {
      console.log('[Hero] preload OK');
      clearTimeout(fallback);
      setImgLoaded(true);
    };
    img.onerror = (e) => {
      console.warn('[Hero] preload FAILED:', url, e);
      clearTimeout(fallback);
      setImgLoaded(true);
    };

    return () => clearTimeout(fallback);
  }, [current]);

  // Get continue watching from playback positions, sorted by most recent
  const continueWatching = useMemo(() => {
    const positions = getPlaybackPositions();
    const entries = Object.entries(positions);
    if (entries.length === 0) return popularMovies.slice(0, 6);

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
        watched.push({
          id: saved.id || Number(id),
          tmdbId: saved.tmdbId || saved.id || Number(id),
          name: saved.name || 'Unknown',
          type: saved.type || 'movie',
          year: saved.year || 0,
          runtime: saved.runtime || '',
          rating: saved.rating || '',
          score: saved.score || 0,
          genres: saved.genres || [],
          description: saved.description || '',
          backdrop: saved.backdrop || '',
          poster: saved.poster || '',
          logoText: saved.logoText || saved.name || '',
        } as Title);
      }
      if (watched.length >= 6) break;
    }

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
          label={t('home.continueWatching')}
          subtitle={t('home.continueWatchingDesc')}
          titles={continueWatching}
          variant="landscape"
          onSelect={onSelect}
        />

        <ContentRow
          label={t('home.popular')}
          subtitle={t('home.popularDesc')}
          titles={becauseYouWatched}
          variant="portrait"
          featuredFirst
          personality="editorial"
          onSelect={onSelect}
        />

        <ContentRow
          label={t('home.tonight')}
          subtitle={t('home.tonightDesc')}
          titles={tonightForYou}
          variant="landscape"
          featuredFirst
          personality="trending"
          onSelect={onSelect}
        />

        <CollectionBanner onSelect={onSelect} onPlay={onPlay} />

        <ShowcaseRow
          label={t('home.trending')}
          subtitle={t('home.trendingDesc')}
          titles={topRated}
          onSelect={onSelect}
          glow
        />

        <ContentRow
          label={t('home.tonight')}
          subtitle={t('home.tonightDesc')}
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
