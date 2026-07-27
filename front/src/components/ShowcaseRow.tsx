import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Plus, Star } from 'lucide-react';
import type { Title } from '@/api/client';
import SafeImg from './SafeImg';

interface ShowcaseRowProps {
  label: string;
  subtitle?: string;
  titles: Title[];
  onSelect: (title: Title) => void;
  glow?: boolean;
}

export default function ShowcaseRow({ label, subtitle, titles, onSelect, glow = false }: ShowcaseRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [imgLoaded, setImgLoaded] = useState<Record<string, boolean>>({});

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

  return (
    <section className="relative py-14 animate-row-reveal">
      <div className="mb-7 flex items-end justify-between px-8 lg:px-14">
        <div>
          <h2 className="text-display text-[23px] font-medium tracking-tight text-white/88 md:text-[26px]">{label}</h2>
          {subtitle && <p className="mt-2 text-[13px] text-white/35">{subtitle}</p>}
        </div>
        <div className="flex gap-1.5" style={{ opacity: canLeft || canRight ? 1 : 0 }}>
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

      <div className="relative">
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{ opacity: canLeft ? 1 : 0, background: 'linear-gradient(to right, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)' }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-20 transition-opacity duration-400"
          style={{ opacity: canRight ? 1 : 0, background: 'linear-gradient(to left, rgba(5,5,6,0.9) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)' }}
        />

        <div ref={scrollRef} className="no-scrollbar flex gap-6 overflow-x-auto scroll-smooth px-8 pb-4 lg:px-14">
          {titles.map((t, i) => {
            const isHovered = hovered === t.id;
            return (
              <button
                key={t.id}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(t)}
                className="group relative w-[440px] shrink-0 text-left animate-stagger-in"
                style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
              >
                {/* Ambient elevation */}
                <div
                  className="pointer-events-none absolute -inset-x-3 -bottom-5 top-0 rounded-[24px] transition-all duration-500"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    boxShadow: isHovered
                      ? glow
                        ? '0 32px 72px -26px rgba(0,0,0,0.78), 0 0 44px -16px rgba(100,140,255,0.1)'
                        : '0 32px 64px -24px rgba(0,0,0,0.72)'
                      : 'none',
                  }}
                />
                <div
                  className={`relative aspect-[16/9] overflow-hidden rounded-[16px] transition-all duration-500 ease-out ${isHovered ? 'card-edge-hover' : 'card-edge'}`}
                  style={{ transform: isHovered ? 'scale(1.025) translateY(-2px)' : 'scale(1)' }}
                >
                  {!imgLoaded[t.id] && <div className="absolute inset-0 skeleton rounded-[16px]" />}
                  <SafeImg
                    src={t.backdrop}
                    alt={t.name}
                    loading="lazy"
                    onLoad={() => setImgLoaded((p) => ({ ...p, [t.id]: true }))}
                    className="absolute inset-0 h-full w-full object-cover transition-all duration-600"
                    style={{
                      opacity: imgLoaded[t.id] ? 1 : 0,
                      filter: isHovered
                        ? 'saturate(1.14) brightness(1.06) contrast(1.02)'
                        : glow
                        ? 'saturate(1.02) brightness(0.8) contrast(0.98)'
                        : 'saturate(0.9) brightness(0.88) contrast(0.98)',
                    }}
                  />

                  {/* Top edge highlight */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/3 transition-opacity duration-500"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
                      opacity: isHovered ? 0.55 : 0.28,
                    }}
                  />

                  <div
                    className="absolute inset-0 transition-opacity duration-400"
                    style={{
                      background: 'linear-gradient(0deg, rgba(5,5,6,0.86) 0%, rgba(5,5,6,0.1) 42%, transparent 68%)',
                      opacity: isHovered ? 1 : 0.74,
                    }}
                  />

                  {/* HDR badges — refined glow */}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    {(t.badges || []).slice(0, 3).map((b) => {
                      const isHdr = glow && (b.includes('Dolby') || b.includes('HDR') || b.includes('IMAX'));
                      return (
                        <span
                          key={b}
                          className="rounded-[5px] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] backdrop-blur-md"
                          style={{
                            background: isHdr ? 'rgba(18,26,52,0.55)' : 'rgba(0,0,0,0.42)',
                            color: isHdr ? 'rgba(170,200,255,0.92)' : 'rgba(255,255,255,0.88)',
                            border: isHdr
                              ? '1px solid rgba(110,150,255,0.22)'
                              : '1px solid rgba(255,255,255,0.1)',
                            boxShadow: isHdr ? '0 0 10px rgba(70,110,210,0.18)' : 'none',
                          }}
                        >
                          {b}
                        </span>
                      );
                    })}
                  </div>

                  {/* Hover actions */}
                  <div className="absolute right-3 top-3 flex gap-1.5 transition-opacity duration-300" style={{ opacity: isHovered ? 1 : 0 }}>
                    <span
                      onClick={(e) => { e.stopPropagation(); onSelect(t); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-all duration-300 hover:scale-105 active:scale-95"
                      style={{ boxShadow: '0 4px 16px -4px rgba(255,255,255,0.22)' }}
                    >
                      <Play className="h-[14px] w-[14px] fill-current" />
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); onSelect(t); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full glass text-white transition-all duration-300 hover:scale-105 active:scale-95"
                    >
                      <Plus className="h-[14px] w-[14px]" strokeWidth={1.5} />
                    </span>
                  </div>

                  {/* Bottom info — calmer */}
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="text-display text-[19px] font-medium text-white">{t.name}</div>
                    <div className="mt-1.5 flex items-center gap-2.5 text-[12px] text-white/48">
                      <span>{t.year}</span>
                      <span className="text-white/14">·</span>
                      <span className="truncate">{t.genres.slice(0, 2).join(', ')}</span>
                      {t.score > 0 && (
                        <>
                          <span className="text-white/14">·</span>
                          <span className="flex items-center gap-0.5 font-medium">
                            <Star className="h-[10px] w-[10px] text-amber-300/55" fill="currentColor" strokeWidth={0} />
                            {t.score}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
