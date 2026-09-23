import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star, Play, Plus, Check } from 'lucide-react';
import type { Title } from '@/api/client';
import SafeImg from './SafeImg';

interface Top10RowProps {
  label: string;
  subtitle?: string;
  titles: Title[];
  onSelect: (title: Title) => void;
  onPlay?: (title: Title) => void;
}

// Stylized SVG numbers for Netflix-style Top 10
function RankNumber({ rank }: { rank: number }) {
  // SVG path definitions for numbers 1-10 with Netflix aesthetic
  const isTen = rank === 10;

  return (
    <div
      className="pointer-events-none relative select-none flex items-center justify-end z-0 -mr-6 lg:-mr-8 transition-transform duration-500 group-hover/item:scale-105"
      style={{ width: isTen ? 130 : 100, height: 180 }}
      aria-hidden="true"
    >
      <svg
        viewBox={isTen ? "0 0 130 180" : "0 0 100 180"}
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={`rankGrad-${rank}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2c2c36" />
            <stop offset="50%" stopColor="#141419" />
            <stop offset="100%" stopColor="#08080a" />
          </linearGradient>
          <linearGradient id={`strokeGrad-${rank}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#c5c5d0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4a4a58" stopOpacity="0.4" />
          </linearGradient>
          <filter id={`glow-${rank}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.8" />
          </filter>
        </defs>

        <text
          x={isTen ? "65" : "50"}
          y="150"
          textAnchor="middle"
          fontSize="175"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={`url(#rankGrad-${rank})`}
          stroke={`url(#strokeGrad-${rank})`}
          strokeWidth="4.5"
          strokeLinejoin="round"
          filter={`url(#glow-${rank})`}
          letterSpacing="-0.08em"
        >
          {rank}
        </text>
      </svg>
    </div>
  );
}

export default function Top10Row({ label, subtitle, titles, onSelect, onPlay }: Top10RowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const top10 = titles.slice(0, 10);

  const updateScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    updateScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    return () => {
      el.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, [titles]);

  const scroll = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.75), behavior: 'smooth' });
  };

  if (top10.length === 0) return null;

  return (
    <section className="group/row relative py-10 animate-row-reveal">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between px-8 lg:px-14">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 shadow-md shadow-amber-500/20">
            <span className="text-[11px] font-black text-black">10</span>
          </div>
          <div>
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/95 md:text-[23px]">
              {label}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12px] text-white/40">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Scroll Controls */}
        <div className="hidden items-center gap-1.5 md:flex">
          <button
            onClick={() => scroll(-1)}
            disabled={!canLeft}
            aria-label="Назад"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/60 transition-cinematic hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            onClick={() => scroll(1)}
            disabled={!canRight}
            aria-label="Вперёд"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/60 transition-cinematic hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-2 overflow-x-auto px-8 lg:px-14 pb-4 pt-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {top10.map((title, i) => {
          const rank = i + 1;
          const isHighQuality = (title.score || 0) >= 7.5;
          const is4K = i % 2 === 0;

          return (
            <div
              key={title.id}
              className="group/item relative flex shrink-0 items-center cursor-pointer"
              style={{ scrollSnapAlign: 'start' }}
              onClick={() => onSelect(title)}
            >
              {/* Giant Stylized Rank Number */}
              <RankNumber rank={rank} />

              {/* Portrait Poster Card */}
              <div
                className="relative z-10 w-[165px] md:w-[190px] lg:w-[210px] shrink-0 overflow-hidden rounded-[14px] card-edge transition-cinematic group-hover/item:card-edge-hover group-hover/item:scale-[1.04] group-hover/item:shadow-2xl group-hover/item:shadow-black/70"
                style={{
                  aspectRatio: '2/3',
                  transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <SafeImg
                  src={title.poster}
                  alt={title.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/item:scale-105"
                />

                {/* Subtle vignette gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                {/* Netflix-style Top-10 badge & Quality Badges */}
                <div className="absolute left-2.5 top-2.5 flex flex-col gap-1 z-10">
                  <span className="flex items-center gap-1 rounded-[5px] bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-md">
                    ТОП {rank}
                  </span>
                  {is4K && (
                    <span className="rounded-[4px] border border-white/20 bg-black/60 px-1.5 py-0.5 text-[8px] font-semibold text-white/90 backdrop-blur-md">
                      4K UHD
                    </span>
                  )}
                </div>

                {/* Rating Badge */}
                {title.score > 0 && (
                  <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur-md border border-amber-300/20">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    <span>{title.score}</span>
                  </div>
                )}

                {/* Bottom Card Info on Hover / Static */}
                <div className="absolute inset-x-0 bottom-0 p-3 z-10">
                  <h3 className="truncate text-[13px] font-medium text-white/95 leading-snug">
                    {title.name}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45">
                    {title.year > 0 && <span>{title.year}</span>}
                    {title.year > 0 && title.genres?.[0] && <span className="text-white/20">·</span>}
                    {title.genres?.[0] && <span className="truncate">{title.genres[0]}</span>}
                  </div>
                </div>

                {/* Play hover overlay button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover/item:opacity-100 bg-black/30 backdrop-blur-[1px]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 group-hover/item:scale-110">
                    <Play className="h-5 w-5 fill-current ml-0.5" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
