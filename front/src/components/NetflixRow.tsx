import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Flame, Trophy } from 'lucide-react';
import Card from './Card';
import type { Title } from '@/api/client';
import { useNetflixCatalog } from '@/hooks/useCatalog';

interface NetflixRowProps {
  type: 'movie' | 'tv';
  onSelect: (title: Title) => void;
}

export default function NetflixRow({ type, onSelect }: NetflixRowProps) {
  const [period, setPeriod] = useState<'week' | 'all_time'>('week');
  const { data: titles, loading } = useNetflixCatalog(type, period, 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const isTv = type === 'tv';
  const label = isTv ? 'Топ сериалы Netflix' : 'Топ фильмы Netflix';
  const subtitle =
    period === 'week'
      ? isTv
        ? 'Горячие тренды и самые обсуждаемые сериалы прямо сейчас'
        : 'Главные кинохиты и оригинальные премьеры этой недели'
      : isTv
      ? 'Легендарные рекордсмены по просмотрам и рейтингу за всё время'
      : 'Культовые шедевры мирового кино с признанием зрителей';

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
  }, [titles]);

  const scrollBy = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.82), behavior: 'smooth' });
  };

  const handlePeriodChange = (newPeriod: 'week' | 'all_time') => {
    if (newPeriod === period) return;
    setPeriod(newPeriod);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  if (!loading && titles.length === 0) {
    return null;
  }

  return (
    <section className="group/row relative py-12 animate-row-reveal overflow-hidden">
      {/* Subtle Netflix ambient red glow */}
      <div
        className="pointer-events-none absolute -top-12 left-10 h-36 w-96 rounded-full blur-3xl transition-opacity duration-700"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(229,9,20,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Section header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 px-8 lg:px-14">
        {/* Left: Netflix Badge + Title + Subtitle */}
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-7 px-2.5 items-center justify-center rounded-md font-black tracking-wider text-[11px] text-white shadow-lg transition-transform duration-300 hover:scale-105 select-none"
            style={{
              backgroundColor: '#E50914',
              boxShadow: '0 4px 14px rgba(229, 9, 20, 0.4)',
              letterSpacing: '0.08em',
            }}
          >
            NETFLIX
          </div>
          <div>
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/90 md:text-[23px]">
              {label}
            </h2>
            <p className="mt-1.5 text-[13px] text-white/40 transition-colors duration-300">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Interactive Pill Switcher + Scroll Arrows */}
        <div className="flex items-center gap-3">
          {/* Option 2: Pill Tabs */}
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md shadow-inner">
            <button
              onClick={() => handlePeriodChange('week')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300 ${
                period === 'week'
                  ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/40 font-semibold'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>На этой неделе</span>
            </button>
            <button
              onClick={() => handlePeriodChange('all_time')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-300 ${
                period === 'all_time'
                  ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/40 font-semibold'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>За всё время</span>
            </button>
          </div>

          {/* Scroll arrows */}
          <div
            className="hidden sm:flex gap-1.5 transition-opacity duration-300"
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
      </div>

      {/* Scrollable row with smooth cross-fade */}
      <div className="relative">
        {/* Edge fades */}
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{
            opacity: canLeft ? 1 : 0,
            background: 'linear-gradient(to right, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{
            opacity: canRight ? 1 : 0,
            background: 'linear-gradient(to left, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)',
          }}
        />

        <div
          ref={scrollRef}
          className={`no-scrollbar flex gap-5 overflow-x-auto scroll-smooth px-8 pb-4 lg:px-14 scroll-pl-8 lg:scroll-pl-14 transition-opacity duration-300 ${
            loading ? 'opacity-40 pointer-events-none' : 'opacity-100'
          }`}
          style={{ scrollSnapType: 'x proximity' }}
        >
          {titles.map((title, i) => (
            <div
              key={`${title.id}-${period}`}
              className="shrink-0"
              style={{
                scrollSnapAlign: 'start',
                animation: `stagger-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both`,
                animationDelay: `${Math.min(i * 45, 500)}ms`,
              }}
            >
              <Card
                title={title}
                variant={isTv ? 'landscape' : 'portrait'}
                index={i}
                onSelect={onSelect}
                rank={i + 1}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
