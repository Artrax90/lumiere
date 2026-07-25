import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Card from './Card';
import type { Title } from '@/api/client';

type Personality = 'default' | 'trending' | 'awards' | 'hidden' | 'editorial';

interface ContentRowProps {
  label: string;
  subtitle?: string;
  titles: Title[];
  variant?: 'portrait' | 'landscape' | 'collection';
  featuredFirst?: boolean;
  cardWidth?: number;
  personality?: Personality;
  onSelect: (title: Title) => void;
}

export default function ContentRow({
  label,
  subtitle,
  titles,
  variant = 'portrait',
  featuredFirst = false,
  cardWidth,
  personality = 'default',
  onSelect,
}: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  const scrollBy = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.82), behavior: 'smooth' });
  };

  const headerAccent =
    personality === 'awards'
      ? 'text-amber-200/90'
      : personality === 'hidden'
      ? 'text-white/72'
      : 'text-white/88';

  const subtitleColor =
    personality === 'awards'
      ? 'text-amber-200/35'
      : personality === 'hidden'
      ? 'text-white/25'
      : 'text-white/35';

  return (
    <section className="group/row relative py-12 animate-row-reveal">
      {/* Section header */}
      <div className="mb-6 flex items-end justify-between px-8 lg:px-14">
        <div className="flex items-center gap-3">
          {personality === 'awards' && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200/20 bg-amber-200/[0.06]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'rgba(232,193,112,0.7)' }}>
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
              </svg>
            </div>
          )}
          {personality === 'hidden' && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 bg-white/[0.02]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'rgba(180,180,190,0.5)' }}>
                <circle cx="12" cy="12" r="9" />
                <path d="M9 10c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3" />
                <path d="M12 13v3" />
              </svg>
            </div>
          )}
          <div>
            <h2
              className={`text-display text-[21px] font-medium tracking-tight ${headerAccent} md:text-[23px]`}
              style={{ letterSpacing: personality === 'editorial' ? '-0.01em' : '-0.02em' }}
            >
              {label}
            </h2>
            {subtitle && (
              <p className={`mt-1.5 text-[13px] ${subtitleColor}`}>{subtitle}</p>
            )}
          </div>
        </div>

        {/* Scroll arrows */}
        <div
          className="flex gap-1.5 transition-opacity duration-400"
          style={{ opacity: canLeft || canRight ? 1 : 0 }}
        >
          <button
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            className="flex h-8 w-8 items-center justify-center rounded-full glass text-white/55 transition-lux hover:text-white/90 disabled:opacity-15 disabled:hover:text-white/55"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            className="flex h-8 w-8 items-center justify-center rounded-full glass text-white/55 transition-lux hover:text-white/90 disabled:opacity-15 disabled:hover:text-white/55"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Scrollable row */}
      <div className="relative">
        {/* Edge fades */}
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{
            opacity: canLeft ? 1 : 0,
            background:
              personality === 'hidden'
                ? 'linear-gradient(to right, rgba(4,4,5,0.92) 0%, rgba(4,4,5,0.4) 50%, transparent 100%)'
                : 'linear-gradient(to right, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{
            opacity: canRight ? 1 : 0,
            background:
              personality === 'hidden'
                ? 'linear-gradient(to left, rgba(4,4,5,0.92) 0%, rgba(4,4,5,0.4) 50%, transparent 100%)'
                : 'linear-gradient(to left, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)',
          }}
        />

        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-5 overflow-x-auto scroll-smooth px-8 pb-4 lg:px-14"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {titles.map((title, i) => (
            <div
              key={title.id}
              style={{
                scrollSnapAlign: 'start',
                animation: `stagger-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both`,
                animationDelay: `${Math.min(i * 60, 600)}ms`,
              }}
            >
              <Card
                title={title}
                variant={variant}
                index={i}
                onSelect={onSelect}
                featured={featuredFirst && i === 0}
                width={cardWidth}
                rank={personality === 'trending' ? i + 1 : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
