import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Info, Plus, Star, Check, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { apiPost, apiDelete } from '@/api/client';
import { serverFetch } from '@/api/server';
import SafeImg from './SafeImg';
type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

const typeLabel = (type: Title['type']) =>
  type === 'movie' ? 'Feature Film' : (type === 'show' || type === 'tv') ? 'Series' : type === 'anime' ? 'Anime' : type === 'documentary' ? 'Documentary' : 'Live';

// Mood-driven color grade — tints the haze, shadows, and ambient bleed.
// Tinted darks (not pure black) keep the image feeling like film, not a website.
export const moodGrade: Record<Mood, { haze: string; shadow: string; ambient: string; grade: string }> = {
  warm: {
    haze: 'rgba(28,18,10,',
    shadow: 'rgba(20,12,6,',
    ambient: 'rgba(232,170,90,',
    grade: 'linear-gradient(135deg, rgba(40,24,8,0.16) 0%, transparent 40%, rgba(180,120,50,0.1) 100%)',
  },
  cool: {
    haze: 'rgba(10,16,26,',
    shadow: 'rgba(6,12,22,',
    ambient: 'rgba(90,140,220,',
    grade: 'linear-gradient(135deg, rgba(10,22,40,0.18) 0%, transparent 42%, rgba(60,110,190,0.1) 100%)',
  },
  neutral: {
    haze: 'rgba(16,16,20,',
    shadow: 'rgba(10,10,14,',
    ambient: 'rgba(200,200,210,',
    grade: 'linear-gradient(135deg, rgba(18,18,22,0.14) 0%, transparent 42%, rgba(140,140,150,0.06) 100%)',
  },
  tension: {
    haze: 'rgba(24,10,12,',
    shadow: 'rgba(18,6,8,',
    ambient: 'rgba(200,70,70,',
    grade: 'linear-gradient(135deg, rgba(34,12,14,0.16) 0%, transparent 40%, rgba(150,40,40,0.1) 100%)',
  },
  playful: {
    haze: 'rgba(26,18,10,',
    shadow: 'rgba(18,12,6,',
    ambient: 'rgba(230,160,80,',
    grade: 'linear-gradient(135deg, rgba(36,22,10,0.14) 0%, transparent 42%, rgba(200,130,60,0.09) 100%)',
  },
  organic: {
    haze: 'rgba(12,18,14,',
    shadow: 'rgba(8,14,10,',
    ambient: 'rgba(110,180,130,',
    grade: 'linear-gradient(135deg, rgba(12,22,16,0.16) 0%, transparent 42%, rgba(60,130,90,0.09) 100%)',
  },
};

interface HeroProps {
  current: Title;
  titles: Title[];
  active: number;
  setActive: (i: number) => void;
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
  imgLoaded: boolean;
}

export default function Hero({ current, titles, active, setActive, onSelect, onPlay, imgLoaded }: HeroProps) {
  const { t } = useTranslation();
  const [inLibrary, setInLibrary] = useState<Record<string, boolean>>({});
  const [resuming, setResuming] = useState(false);
  const grade = moodGrade[current.mood || 'warm'];

  const typeLabel = (type: Title['type']) =>
    type === 'movie' ? t('movie.movie') : (type === 'show' || type === 'tv') ? t('movie.series') : type === 'anime' ? t('movie.anime') : t('movie.documentary');

  // Check if there is a saved torrent to resume
  const savedTorrent = (() => {
    try {
      const last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
      return last[current.id] || null;
    } catch {
      return null;
    }
  })();

  const handleHeroWatch = async () => {
    if (savedTorrent?.magnet) {
      setResuming(true);
      try {
        const res = await serverFetch('/api/torrents/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnet: savedTorrent.magnet, title: savedTorrent.title }),
        });
        const data = await res.json();
        if (data.files?.length > 0) {
          const file = data.files[0];
          onPlay({ ...current, videoUrl: file.streamUrl });
          return;
        }
      } catch (err) {
        console.error('Hero resume error:', err);
      } finally {
        setResuming(false);
      }
    }
    // If no saved torrent exists, open movie details where torrents list is ready!
    onSelect(current);
  };

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const isFav = !!inLibrary[current.id];
    try {
      if (isFav) {
        await apiDelete(`/api/user/favorites/${current.id}`);
        setInLibrary((p) => ({ ...p, [current.id]: false }));
      } else {
        await apiPost('/api/user/favorites', {
          tmdbId: current.id,
          mediaType: current.type,
          titleName: current.name,
          poster: current.poster,
        });
        setInLibrary((p) => ({ ...p, [current.id]: true }));
      }
    } catch (err) {
      console.error('Favorite error:', err);
    }
  };

  return (
    <div className="absolute left-0 right-0 top-0 z-20 h-[68vh] min-h-[520px] max-h-[760px] w-full overflow-hidden">
      {/* ── Artwork layers — masked so the final 140px dissolves to
            transparency. No added background; the app surface shows
            through naturally. ── */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 calc(100% - 140px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 calc(100% - 140px), transparent 100%)',
        }}
      >
        {/* The single featured artwork — exists only inside the Hero */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent"
        />
        <div
          className="absolute inset-0 transition-opacity duration-1000 ease-out"
          style={{
            opacity: imgLoaded ? 1 : 0.7,
          }}
        >
          <SafeImg
            src={current.backdrop}
            alt={current.name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: '72% center',
              filter: 'saturate(1.05) contrast(1.03) brightness(1.0)',
            }}
          />
        </div>

        {/* Subtle color grade */}
        <div
          className="absolute inset-0 mix-blend-soft-light"
          style={{ background: grade.grade, opacity: 0.45 }}
        />

        {/* Left haze for text legibility */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(94deg, ${grade.haze}0.7) 0%, ${grade.haze}0.36) 26%, ${grade.haze}0.12) 50%, transparent 74%)`,
          }}
        />

        {/* Local shadowing behind the Hero text */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 56% 72% at 18% 86%, ${grade.shadow}0.36) 0%, transparent 60%)`,
          }}
        />

        {/* Edge vignette for depth */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 120% 92% at 42% 28%, transparent 56%, rgba(0,0,0,0.26) 100%)',
          }}
        />

        {/* Top vignette for nav legibility */}
        <div
          className="absolute inset-x-0 top-0 h-28"
          style={{ background: 'linear-gradient(180deg, rgba(5,5,6,0.65) 0%, transparent 100%)' }}
        />
      </div>

      {/* ── Content — transparent, sitting on the artwork ── */}
      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-[1600px] px-8 pb-14 lg:px-16 lg:pb-16">
          <div key={current.id} className="max-w-2xl">
            {/* Type label */}
            <div className="mb-2.5 flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: '0ms' }}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
                {typeLabel(current.type)}
              </span>
              <span className="h-px w-5 bg-amber-200/25" />
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">
                {current.genres[0]}
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-display text-balance text-[32px] font-medium leading-[1.06] tracking-tight text-white animate-fade-up md:text-[44px] lg:text-[52px]"
              style={{
                animationDelay: '100ms',
                textShadow: '0 2px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {current.logoText}
            </h1>

            {/* Metadata */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] animate-fade-up" style={{ animationDelay: '160ms' }}>
              <span className="flex items-center gap-1.5 font-semibold text-amber-200/90">
                <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                {current.score}
              </span>
              <span className="text-white/20">·</span>
              <span className="text-white/65">{current.year}</span>
              <span className="text-white/20">·</span>
              <span className="text-white/65">{current.runtime}</span>
              {current.rating && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="rounded-[5px] border border-white/15 px-2 py-[2px] text-[10px] font-medium text-white/50">
                    {current.rating}
                  </span>
                </>
              )}
              {(current.badges || []).slice(0, 2).map((b) => (
                <span key={b} className="rounded-[5px] border border-white/[0.08] px-2 py-[2px] text-[10px] font-medium text-white/45">
                  {b}
                </span>
              ))}
            </div>

            {/* Description */}
            <p
              className="mt-3 max-w-xl text-balance text-[14px] leading-[1.65] text-white/70 animate-fade-up md:text-[15px]"
              style={{ animationDelay: '220ms', textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}
            >
              {current.description}
            </p>

            {/* Actions */}
            <div className="mt-6 flex items-center gap-3 animate-fade-up" style={{ animationDelay: '280ms' }}>
              <button
                onClick={handleHeroWatch}
                disabled={resuming}
                className="group flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-black transition-lux hover:scale-[1.03] active:scale-95 disabled:opacity-50"
                style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.28)' }}
              >
                {resuming ? (
                  <Loader2 className="h-[15px] w-[15px] animate-spin" />
                ) : (
                  <Play className="h-[15px] w-[15px] fill-current" />
                )}
                {savedTorrent ? t('common.continue') : t('common.watch')}
              </button>
              <button
                onClick={() => onSelect(current)}
                className="flex items-center gap-2 rounded-full glass px-6 py-3 text-[14px] font-medium text-white/90 transition-lux hover:bg-white/[0.12] active:scale-95"
              >
                <Info className="h-[15px] w-[15px]" strokeWidth={1.5} />
                {t('common.details')}
              </button>
              <button
                onClick={toggleFavorite}
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full glass text-white/80 transition-lux hover:bg-white/[0.12] active:scale-95"
                aria-label="Add to library"
              >
                {inLibrary[current.id] ? (
                  <Check className="h-5 w-5 text-amber-200" strokeWidth={2} />
                ) : (
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                )}
              </button>
            </div>

            {/* Rotation indicators */}
            <div className="mt-5 flex items-center gap-2.5">
              {titles.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className="group/dot relative h-[2px] overflow-hidden rounded-full bg-white/10 transition-all duration-700 ease-out"
                  style={{ width: i === active ? 32 : 16 }}
                  aria-label={`Hero ${i + 1}`}
                >
                  {i === active && (
                    <span
                      className="absolute left-0 top-0 h-full rounded-full bg-white/55"
                      style={{
                        width: '100%',
                        transformOrigin: 'left',
                        animation: `shrink 11s linear forwards`,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
