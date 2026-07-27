import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Title } from '@/api/client';
import { useTrending } from '@/hooks/useTrending';
import SafeImg from './SafeImg';

interface CollectionBannerProps {
  onSelect: (title: Title) => void;
  onPlay?: (title: Title) => void;
}

const collections = [
  { id: 'sci-fi', name: 'Научная фантастика', subtitle: 'Путешествия сквозь время и пространство' },
  { id: 'thriller', name: 'Триллеры', subtitle: 'Истории, которые держат в напряжении' },
  { id: 'drama', name: 'Драмы', subtitle: 'Глубокие истории о жизни' },
  { id: 'anime', name: 'Аниме', subtitle: 'Японская анимация нового поколения' },
];

export default function CollectionBanner({ onSelect }: CollectionBannerProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { data: trending } = useTrending('movie');

  return (
    <section className="px-8 py-14 lg:px-14 animate-row-reveal">
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h2 className="text-display text-[23px] font-medium tracking-tight text-white/88 md:text-[26px]">Подборки</h2>
          <p className="mt-2 text-[13px] text-white/35">Тщательно отобранные коллекции</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {collections.map((col, i) => {
          const isHovered = hovered === i;
          const bgImage = trending[i]?.backdrop || trending[0]?.backdrop || '';
          return (
            <button
              key={col.id}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => trending[i] && onSelect(trending[i])}
              className={`group relative h-52 overflow-hidden rounded-[16px] text-left transition-all duration-500 ease-out animate-stagger-in ${isHovered ? 'card-edge-hover' : 'card-edge'}`}
              style={{ transform: isHovered ? 'translateY(-3px)' : 'translateY(0)', animationDelay: `${i * 100}ms` }}
            >
              {bgImage && (
                <SafeImg
                  src={bgImage}
                  alt={col.name}
                  className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out"
                  style={{
                    filter: isHovered ? 'saturate(1.1) brightness(1.04) contrast(1.02)' : 'saturate(0.88) brightness(0.76) contrast(0.98)',
                    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  }}
                  loading="lazy"
                />
              )}

              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-1/3 transition-opacity duration-500"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
                  opacity: isHovered ? 0.5 : 0.25,
                }}
              />

              <div
                className="absolute inset-0 transition-opacity duration-400"
                style={{
                  background: 'linear-gradient(135deg, rgba(5,5,6,0.78) 0%, rgba(5,5,6,0.22) 52%, transparent 100%)',
                  opacity: isHovered ? 1 : 0.86,
                }}
              />

              <div className="absolute inset-0 flex flex-col justify-between p-6">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/55">
                    Подборка {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full glass text-white/55 transition-lux group-hover:bg-white/[0.12] group-hover:text-white/90">
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.5} />
                  </span>
                </div>
                <div>
                  <h3 className="text-display text-[21px] font-medium leading-tight text-white">{col.name}</h3>
                  <p className="mt-1.5 text-[13px] text-white/52">{col.subtitle}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
