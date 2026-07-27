import { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Title } from '@/api/client';
import TvCard from './TvCard';

interface TvContentRowProps {
  label: string;
  subtitle?: string;
  titles: Title[];
  onSelect: (title: Title) => void;
  focusedId: string | null;
  rowIndex: number;
}

export default function TvContentRow({ label, subtitle, titles, onSelect, focusedId, rowIndex }: TvContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 400;
    const newPos = direction === 'left'
      ? Math.max(0, scrollPos - amount)
      : scrollPos + amount;
    scrollRef.current.scrollTo({ left: newPos, behavior: 'smooth' });
    setScrollPos(newPos);
  }, [scrollPos]);

  // Check if any card in this row is focused
  const hasFocused = titles.some((_, i) => focusedId === `card-${titles[i]?.id}-${i}`);

  // Auto-scroll when a card in this row is focused
  useEffect(() => {
    if (!hasFocused || !scrollRef.current) return;
    const focusedIndex = titles.findIndex((t, i) => focusedId === `card-${t.id}-${i}`);
    if (focusedIndex < 0) return;

    const cardWidth = 220; // 200px card + 20px gap
    const targetScroll = Math.max(0, focusedIndex * cardWidth - 200);
    scrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
    setScrollPos(targetScroll);
  }, [focusedId, hasFocused, titles]);

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center gap-3 px-8">
        <h2 className="text-display text-[21px] font-medium tracking-tight text-white/85">{label}</h2>
        {subtitle && <span className="text-[13px] text-white/35">{subtitle}</span>}
        <div className="h-px flex-1 bg-white/[0.06]" />

        {/* Scroll arrows */}
        {scrollPos > 0 && (
          <button onClick={() => scroll('left')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/40 hover:text-white/70">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => scroll('right')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/40 hover:text-white/70">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar flex gap-5 overflow-x-auto px-8 pb-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {titles.map((title, i) => (
          <TvCard
            key={title.id}
            title={title}
            focusedId={focusedId}
            onSelect={onSelect}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
