import { useState, useRef, useEffect } from 'react';
import { Play, Info, Plus, Check, Star } from 'lucide-react';
import type { Title } from '@/api/client';
import SafeImg from './SafeImg';

function CardMarqueeTitle({ name, featured, hovered }: { name: string; featured?: boolean; hovered?: boolean }) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (hovered && containerRef.current && textRef.current) {
      const overflow = textRef.current.scrollWidth - containerRef.current.clientWidth;
      if (overflow > 4) {
        setShift(overflow + 8);
      } else {
        setShift(0);
      }
    } else {
      setShift(0);
    }
  }, [hovered, name]);

  const duration = Math.max(3.5, Math.min(10, (shift / 30) + 2));

  return (
    <h3
      ref={containerRef}
      className="mt-2.5 overflow-hidden whitespace-nowrap font-medium text-white/90"
      style={{
        fontSize: featured ? 14 : 13,
        textOverflow: shift > 0 ? 'clip' : 'ellipsis',
      }}
      title={name}
    >
      <span
        ref={textRef}
        className="inline-block transition-transform"
        style={{
          transform: shift > 0 ? `translateX(-${shift}px)` : 'translateX(0)',
          transition: shift > 0 ? `transform ${duration}s cubic-bezier(0.42, 0, 0.58, 1) 0.6s` : 'transform 0.3s ease-out',
        }}
      >
        {name}
      </span>
    </h3>
  );
}

interface CardProps {
  title: Title;
  variant?: 'portrait' | 'landscape' | 'collection';
  index?: number;
  featured?: boolean;
  width?: number;
  rank?: number;
  fill?: boolean;
  onSelect: (title: Title) => void;
}

const DEFAULT_WIDTHS = {
  portrait: 200,
  landscape: 380,
  collection: 380,
};

export default function Card({
  title,
  variant = 'portrait',
  featured = false,
  width,
  rank,
  fill = false,
  onSelect,
}: CardProps) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const isPortrait = variant === 'portrait';
  const isCollection = variant === 'collection';
  const isLandscape = variant === 'landscape';

  const aspectClass = isPortrait
    ? 'aspect-[2/3]'
    : isLandscape
    ? 'aspect-[16/9]'
    : 'aspect-[16/10]';

  const baseWidth = width ?? DEFAULT_WIDTHS[variant];
  const cardWidth = featured ? Math.round(baseWidth * 1.35) : baseWidth;
  const radius = featured ? 'rounded-[16px]' : 'rounded-[12px]';

  const handleMouseEnter = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  return (
    <div
      className={`group/card relative cursor-pointer active:scale-[0.98] transition-transform ${fill ? 'w-full' : 'shrink-0'}`}
      style={fill ? undefined : { width: cardWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelect(title)}
    >
      {/* Rank numeral — oversized, sits behind the card for trending rows */}
      {rank != null && (
        <div
          className="pointer-events-none absolute -left-3 top-1/2 z-0 -translate-y-1/2 select-none text-display font-medium leading-none transition-all duration-500 ease-out"
          style={{
            fontSize: 'clamp(80px, 11vw, 128px)',
            color: 'transparent',
            WebkitTextStroke: '1.5px rgba(255,255,255,0.14)',
            opacity: hovered ? 0.22 : 0.12,
            transform: hovered
              ? 'translateY(-50%) translateX(-6px) scale(1.04)'
              : 'translateY(-50%) translateX(0) scale(1)',
            textShadow: hovered ? '0 0 32px rgba(232,193,112,0.12)' : 'none',
          }}
          aria-hidden
        >
          {rank}
        </div>
      )}

      {/* Ambient elevation — the card casts light downward */}
      <div
        className="pointer-events-none absolute -inset-x-3 -bottom-5 top-0 rounded-[24px] transition-all duration-500 ease-out"
        style={{
          opacity: hovered ? 1 : 0,
          boxShadow: hovered
            ? '0 32px 64px -22px rgba(0,0,0,0.72), 0 12px 28px -14px rgba(0,0,0,0.42), 0 0 48px -20px rgba(232,193,112,0.08)'
            : 'none',
          transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        }}
      />

      {/* Artwork frame — a physical object with edges */}
      <div
        className={`relative ${aspectClass} overflow-hidden ${radius} transition-all duration-500 ease-out ${hovered ? 'card-edge-hover' : 'card-edge'}`}
        style={{
          transform: hovered ? 'scale(1.05) translateY(-3px)' : 'scale(1) translateY(0)',
          transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Skeleton */}
        {!imgLoaded && <div className={`absolute inset-0 skeleton ${radius}`} />}

        <SafeImg
          src={isPortrait ? title.poster : title.backdrop}
          alt={title.name}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: imgLoaded ? 1 : 0,
            filter: hovered
              ? 'saturate(1.12) brightness(1.05) contrast(1.03)'
              : 'saturate(0.94) brightness(0.9) contrast(1.0)',
            transition: 'opacity 600ms ease-out, filter 500ms ease-out',
          }}
        />

        {/* Top edge highlight — the "glass reflection" */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)',
            opacity: hovered ? 0.65 : 0.3,
            transition: 'opacity 500ms ease-out',
          }}
        />

        {/* Light reflection sweep — travels diagonally on focus */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 300ms ease-out' }}
        >
          <div
            className="absolute -inset-y-4 -left-1/2 w-1/2"
            style={{
              background:
                'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.0) 35%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.0) 65%, transparent 100%)',
              transform: hovered ? 'translateX(260%)' : 'translateX(0%)',
              transition: 'transform 900ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>

        {/* Gradient overlay — subtle, deepens on hover */}
        <div
          className="absolute inset-0"
          style={{
            background: isPortrait
              ? 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55) 100%)'
              : 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.72) 100%)',
            opacity: hovered ? 1 : 0.7,
            transition: 'opacity 400ms ease-out',
          }}
        />

        {/* Badges — refined, smaller, quieter */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
          {(title.badges || []).slice(0, 2).map((b) => (
            <span
              key={b}
              className="rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.04em] backdrop-blur-md"
              style={{
                background: b === 'Live' ? 'rgba(200,50,45,0.78)' : 'rgba(0,0,0,0.42)',
                color: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {b === 'Live' && (
                <span className="mr-1 inline-block h-[3px] w-[3px] rounded-full bg-white animate-pulse-soft align-middle" />
              )}
              {b}
            </span>
          ))}
        </div>

        {/* Progress indicator — thinner, more refined */}
        {title.progress != null && (
          <div className="absolute inset-x-3 bottom-3">
            <div className="mb-1.5 text-[10px] font-medium text-white/75">
              {title.episode}
            </div>
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${title.progress}%`,
                  background: 'linear-gradient(90deg, rgba(232,193,112,0.7), rgba(232,193,112,0.95))',
                }}
              />
            </div>
          </div>
        )}

        {title.liveNow && !title.progress && (
          <div className="absolute inset-x-3 bottom-3">
            <div className="h-[2px] w-1/3 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-2/3 rounded-full bg-red-400/85" />
            </div>
          </div>
        )}

        {/* Hover action overlay — premium circular buttons */}
        <div
          className="absolute inset-0 flex items-end justify-center gap-2 p-4"
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 300ms ease-out' }}
        >
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-all duration-300 hover:scale-105 active:scale-95"
            style={{ boxShadow: '0 4px 16px -4px rgba(255,255,255,0.25)' }}
            aria-label="Play"
            onClick={(e) => { e.stopPropagation(); onSelect(title); }}
          >
            <Play className="h-[14px] w-[14px] fill-current" />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full glass text-white transition-all duration-300 hover:scale-105 active:scale-95"
            aria-label="Add to library"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="h-[14px] w-[14px]" strokeWidth={1.5} />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full glass text-white transition-all duration-300 hover:scale-105 active:scale-95"
            aria-label="More info"
            onClick={(e) => { e.stopPropagation(); onSelect(title); }}
          >
            <Info className="h-[14px] w-[14px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Metadata below card — quiet, calmer */}
      <div
        className="w-full max-w-full overflow-hidden"
        style={{ opacity: hovered ? 1 : 0.62, transition: 'opacity 400ms ease-out' }}
      >
        <CardMarqueeTitle name={title.name} featured={featured} hovered={hovered} />
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/38 min-w-0">
          <span className="shrink-0">{title.year}</span>
          <span className="shrink-0 text-white/15">·</span>
          <span className="truncate">{title.genres.slice(0, 2).join(', ')}</span>
          {title.score > 0 && (
            <>
              <span className="shrink-0 text-white/15">·</span>
              <span className="shrink-0 flex items-center gap-0.5">
                <Star className="h-[9px] w-[9px] text-amber-300/55" fill="currentColor" strokeWidth={0} />
                {title.score}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
