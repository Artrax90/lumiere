import { useState } from 'react';
import { Play, Info, Plus, Star, Check } from 'lucide-react';
import type { Title } from '@/api/client';
type Mood = 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';

const typeLabel = (type: Title['type']) =>
  type === 'movie' ? 'Feature Film' : type === 'show' ? 'Series' : type === 'anime' ? 'Anime' : type === 'documentary' ? 'Documentary' : 'Live';

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
  const [inLibrary, setInLibrary] = useState<Record<string, boolean>>({});
  const grade = moodGrade[current.mood || 'warm'];

  return (
    <div className="absolute left-0 right-0 top-0 z-20 h-[32vh] min-h-[320px] w-full overflow-hidden">
      {/* ── Artwork layers — masked so the final 50px dissolves to
            transparency. No added background; the app surface shows
            through naturally. ── */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 calc(100% - 50px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 calc(100% - 50px), transparent 100%)',
        }}
      >
        {/* The single featured artwork — exists only inside the Hero */}
        <div
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-out"
          style={{
            backgroundImage: `url(${current.backdrop})`,
            backgroundSize: 'cover',
            backgroundPosition: '72% center',
            opacity: imgLoaded ? 1 : 0,
            filter: 'saturate(1.0) contrast(1.03) brightness(1.0)',
          }}
        />

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
          className="absolute inset-x-0 top-0 h-20"
          style={{ background: 'linear-gradient(180deg, rgba(5,5,6,0.46) 0%, transparent 100%)' }}
        />
      </div>

      {/* ── Content — transparent, sitting on the artwork ── */}
      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-[1600px] px-8 pb-10 lg:px-16 lg:pb-12">
          <div key={current.id} className="max-w-xl">
            {/* Type label */}
            <div className="mb-2.5 flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: '0ms' }}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/70">
                {typeLabel(current.type)}
              </span>
              <span className="h-px w-5 bg-amber-200/25" />
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
                {current.genres[0]}
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-display text-balance text-[26px] font-medium leading-[1.06] tracking-tight text-white animate-fade-up md:text-[34px] lg:text-[38px]"
              style={{
                animationDelay: '100ms',
                textShadow: '0 2px 20px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.28)',
              }}
            >
              {current.logoText}
            </h1>

            {/* Metadata */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] animate-fade-up" style={{ animationDelay: '160ms' }}>
              <span className="flex items-center gap-1.5 font-semibold text-amber-200/85">
                <Star className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                {current.score}
              </span>
              <span className="text-white/18">·</span>
              <span className="text-white/55">{current.year}</span>
              <span className="text-white/18">·</span>
              <span className="text-white/55">{current.runtime}</span>
              <span className="text-white/18">·</span>
              <span className="rounded-[5px] border border-white/10 px-2 py-[2px] text-[10px] font-medium text-white/45">
                {current.rating}
              </span>
              {(current.badges || []).slice(0, 2).map((b) => (
                <span key={b} className="rounded-[5px] border border-white/[0.07] px-2 py-[2px] text-[10px] font-medium text-white/38">
                  {b}
                </span>
              ))}
            </div>

            {/* Description */}
            <p
              className="mt-2.5 max-w-lg text-balance text-[13px] leading-[1.6] text-white/64 animate-fade-up md:text-[14px]"
              style={{ animationDelay: '220ms', textShadow: '0 1px 10px rgba(0,0,0,0.36)' }}
            >
              {current.description}
            </p>

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: '280ms' }}>
              <button
                onClick={() => onPlay(current)}
                className="group flex items-center gap-2.5 rounded-full bg-white px-6 py-2.5 text-[13px] font-semibold text-black transition-lux hover:scale-[1.025] active:scale-95"
                style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}
              >
                <Play className="h-[14px] w-[14px] fill-current" />
                Play
              </button>
              <button
                onClick={() => onSelect(current)}
                className="flex items-center gap-2 rounded-full glass px-5 py-2.5 text-[13px] font-medium text-white/88 transition-lux hover:bg-white/[0.1] active:scale-95"
              >
                <Info className="h-[14px] w-[14px]" strokeWidth={1.5} />
                More Info
              </button>
              <button
                onClick={() => setInLibrary((p) => ({ ...p, [current.id]: !p[current.id] }))}
                className="flex h-[40px] w-[40px] items-center justify-center rounded-full glass text-white/75 transition-lux hover:bg-white/[0.1] active:scale-95"
                aria-label="Add to library"
              >
                {inLibrary[current.id] ? (
                  <Check className="h-[14px] w-[14px] text-amber-200" strokeWidth={2} />
                ) : (
                  <Plus className="h-[14px] w-[14px]" strokeWidth={1.5} />
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
