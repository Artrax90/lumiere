import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Info, Plus, Star, Check, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { apiPost, apiDelete } from '@/api/client';
import { serverFetch } from '@/api/server';
import SafeImg from './SafeImg';
import { isTV } from '@/hooks/usePlatform';
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
  const isTvMode = isTV();

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
          onPlay({ ...current, videoUrl: file.hlsUrl || file.streamUrl, directUrl: file.directUrl, hlsUrl: file.hlsUrl });
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

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!titles.length) return;
    setActive((active - 1 + titles.length) % titles.length);
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!titles.length) return;
    setActive((active + 1) % titles.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping.current || e.changedTouches.length === 0) return;
    isSwiping.current = false;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Must be predominantly horizontal gesture (> 40px delta, > 1.2x vertical delta)
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`absolute left-0 right-0 top-0 z-20 ${
        isTvMode ? 'h-[46vh] min-h-[250px] max-h-[340px]' : 'h-[72vh] min-h-[580px] max-h-[800px]'
      } w-full overflow-hidden select-none`}
    >

      {/* ── Artwork layers — masked so the final 140px dissolves to
            transparency. No added background; the app surface shows
            through naturally. ── */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 transition-opacity duration-1000 ease-out"
          style={{
            opacity: imgLoaded ? 1 : 0.8,
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

        {/* Left and bottom gradients for maximum text legibility and smooth catalog blend */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#08080a] via-[#08080a]/75 to-transparent pointer-events-none" />

        {/* Left haze for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(94deg, ${grade.haze}0.5) 0%, ${grade.haze}0.25) 30%, transparent 65%)`,
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
        <div className={`w-full max-w-[1600px] px-6 ${isTvMode ? 'pb-6 lg:pb-8' : 'pb-28 sm:pb-22 lg:pb-18'} sm:px-8 lg:px-16`}>
          <div key={current.id} className="max-w-2xl">
            {/* Type label */}
            <div className="mb-2 flex items-center gap-2 animate-fade-up" style={{ animationDelay: '0ms' }}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
                {typeLabel(current.type)}
              </span>
              <span className="h-px w-4 bg-amber-200/25" />
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                {current.genres[0]}
              </span>
            </div>

            {/* Title */}
            <h1
              className={`text-display text-balance ${
                isTvMode ? 'text-[22px] md:text-[26px]' : 'text-[32px] md:text-[44px] lg:text-[52px]'
              } font-medium leading-[1.06] tracking-tight text-white animate-fade-up`}
              style={{
                animationDelay: '100ms',
                textShadow: '0 2px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {current.logoText || current.name}
            </h1>

            {/* Metadata */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] animate-fade-up" style={{ animationDelay: '160ms' }}>
              <span className="flex items-center gap-1 font-semibold text-amber-200/90">
                <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                {current.score}
              </span>
              <span className="text-white/20">·</span>
              <span className="text-white/65">{current.year}</span>
              <span className="text-white/20">·</span>
              <span className="text-white/65">{current.runtime}</span>
              {current.rating && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="rounded-[4px] border border-white/15 px-1.5 py-[1px] text-[9px] font-medium text-white/50">
                    {current.rating}
                  </span>
                </>
              )}
              {(current.badges || []).slice(0, 2).map((b) => (
                <span key={b} className="rounded-[4px] border border-white/[0.08] px-1.5 py-[1px] text-[9px] font-medium text-white/45">
                  {b}
                </span>
              ))}
            </div>

            {/* Description */}
            <p
              className={`mt-2 max-w-xl text-balance ${
                isTvMode ? 'text-[12px] line-clamp-2 max-w-md leading-[1.45]' : 'text-[14px] leading-[1.65] line-clamp-3 sm:line-clamp-4 md:line-clamp-5 md:text-[15px]'
              } text-white/70 animate-fade-up`}
              style={{ animationDelay: '220ms', textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}
            >
              {current.description}
            </p>

            {/* Actions */}
            <div className="mt-3.5 flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: '280ms' }}>
              <button
                type="button"
                onClick={handleHeroWatch}
                disabled={resuming}
                className={`group flex items-center gap-2 rounded-full bg-white ${
                  isTvMode ? 'px-4 py-1.5 text-[12px] h-[36px]' : 'px-7 py-3 text-[14px]'
                } font-semibold text-black transition-all hover:scale-[1.03] focus:scale-[1.05] focus:ring-4 focus:ring-amber-300 active:scale-95 disabled:opacity-50 outline-none cursor-pointer`}
                style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.28)' }}
              >
                {resuming ? (
                  <Loader2 className="h-[14px] w-[14px] animate-spin" />
                ) : (
                  <Play className="h-[14px] w-[14px] fill-current" />
                )}
                {savedTorrent ? t('common.continue') : t('common.watch')}
              </button>
              <button
                type="button"
                onClick={() => onSelect(current)}
                className={`flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 ${
                  isTvMode ? 'px-3.5 py-1.5 text-[12px] h-[36px]' : 'px-6 py-3 text-[14px]'
                } font-medium text-white transition-all hover:bg-white/[0.18] focus:scale-[1.05] focus:ring-4 focus:ring-amber-300 focus:bg-white/25 active:scale-95 outline-none cursor-pointer`}
              >
                <Info className="h-[14px] w-[14px]" strokeWidth={1.5} />
                {t('common.details')}
              </button>
              <button
                type="button"
                onClick={toggleFavorite}
                className={`flex ${
                  isTvMode ? 'h-[36px] w-[36px]' : 'h-[46px] w-[46px]'
                } items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/80 transition-all hover:bg-white/[0.18] focus:scale-[1.05] focus:ring-4 focus:ring-amber-300 focus:bg-white/25 active:scale-95 outline-none cursor-pointer`}
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
