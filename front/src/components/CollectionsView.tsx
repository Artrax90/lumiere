import { useState } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import type { Title } from '@/api/client';

const mockTitles: Title[] = [
  { id: 1, tmdbId: 1, name: 'Интерстеллар', type: 'movie', year: 2014, runtime: '2h 49m', rating: 'PG-13', score: 8.6, genres: ['Sci-Fi', 'Drama'], description: 'Команда исследователей.', backdrop: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Интерстеллар' },
  { id: 2, tmdbId: 2, name: 'Дюна', type: 'movie', year: 2024, runtime: '2h 46m', rating: 'PG-13', score: 8.7, genres: ['Sci-Fi', 'Epic'], description: 'Пол Атрейдес.', backdrop: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/3026904/pexels-photo-3026904.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Дюна' },
  { id: 3, tmdbId: 3, name: 'Бегущий по лезвию 2049', type: 'movie', year: 2017, runtime: '2h 44m', rating: 'R', score: 8.0, genres: ['Sci-Fi', 'Neo-Noir'], description: 'Молодой Бегущий.', backdrop: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Бегущий по лезвию 2049' },
  { id: 4, tmdbId: 4, name: 'Прибытие', type: 'movie', year: 2016, runtime: '1h 56m', rating: 'PG-13', score: 7.9, genres: ['Sci-Fi', 'Drama'], description: 'Лингвист работает с военными.', backdrop: 'https://images.pexels.com/photos/2387872/pexels-photo-2387872.jpeg?auto=compress&cs=tinysrgb&w=1600', poster: 'https://images.pexels.com/photos/2387872/pexels-photo-2387872.jpeg?auto=compress&cs=tinysrgb&w=800&h=1200&fit=crop', logoText: 'Прибытие' },
];
import Card from './Card';

interface CollectionsViewProps {
  onSelect: (title: Title) => void;
}

interface Collection {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  titleIds: string[];
  cover: string;
  accent: string;
  featured?: boolean;
}

const collections: Collection[] = [
  {
    id: 'mind-bending',
    name: 'Mind-Bending Sci-Fi',
    subtitle: '12 films',
    description: 'Stories that bend reality and question what we know about the universe.',
    titleIds: ['interstellar', 'arrival', 'blade-runner', 'dune'],
    cover: 'https://images.pexels.com/photos/733047/pexels-photo-733047.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(110,150,255,0.5)',
    featured: true,
  },
  {
    id: 'award-winners',
    name: 'Award Winners',
    subtitle: '8 films',
    description: 'The most celebrated films of the last decade.',
    titleIds: ['oppenheimer', 'parasite', 'the-grand-budapest'],
    cover: 'https://images.pexels.com/photos/753935/pexels-photo-753935.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(232,193,112,0.5)',
    featured: true,
  },
  {
    id: 'slow-cinema',
    name: 'Slow Cinema',
    subtitle: '6 films',
    description: 'Patient, contemplative films that reward stillness.',
    titleIds: ['arrival', 'the-crown', 'foundation'],
    cover: 'https://images.pexels.com/photos/2387872/pexels-photo-2387872.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(180,200,220,0.4)',
  },
  {
    id: 'neo-noir',
    name: 'Neo Noir',
    subtitle: '5 films',
    description: 'Shadows, moral ambiguity, and rain-slicked streets.',
    titleIds: ['blade-runner', 'parasite'],
    cover: 'https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(100,120,160,0.4)',
  },
  {
    id: 'sunday-evening',
    name: 'Sunday Evening',
    subtitle: '10 films',
    description: 'Comfort watches for the quiet hours before the week begins.',
    titleIds: ['the-grand-budapest', 'the-crown', 'amsterdam'],
    cover: 'https://images.pexels.com/photos/261101/pexels-photo-261101.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(232,180,120,0.4)',
  },
  {
    id: 'hidden-gems',
    name: 'Hidden Gems',
    subtitle: '7 films',
    description: 'Overlooked masterpieces waiting to be found.',
    titleIds: ['amsterdam', 'arrival'],
    cover: 'https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(140,140,150,0.4)',
  },
  {
    id: 'classic-horror',
    name: 'Classic Horror',
    subtitle: '4 films',
    description: 'The films that taught us fear.',
    titleIds: ['blade-runner'],
    cover: 'https://images.pexels.com/photos/1648572/pexels-photo-1648572.jpeg?auto=compress&cs=tinysrgb&w=1600',
    accent: 'rgba(180,60,60,0.4)',
  },
];

export default function CollectionsView({ onSelect }: CollectionsViewProps) {
  const [selected, setSelected] = useState<Collection | null>(null);

  if (selected) {
    const titles = mockTitles.slice(0, 3);
    return (
      <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12 animate-fade-in">
        <div className="mx-auto max-w-[1400px]">
          <button onClick={() => setSelected(null)} className="mb-8 flex items-center gap-2 text-[13px] font-medium text-white/55 transition-cinematic hover:text-white/90">
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={1.5} />All Collections
          </button>

          {/* Collection hero */}
          <div className="relative mb-12 h-64 overflow-hidden rounded-[24px] animate-detail-rise">
            <img src={selected.cover} alt={selected.name} className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.1) brightness(0.6)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${selected.accent} 0%, transparent 60%)` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-0 left-0 p-10">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: selected.accent }}>{selected.subtitle}</div>
              <h1 className="mt-2 text-display text-[36px] font-medium tracking-tight text-white md:text-[44px]">{selected.name}</h1>
              <p className="mt-3 max-w-xl text-[15px] text-white/65">{selected.description}</p>
            </div>
          </div>

          {/* Titles */}
          <div className="no-scrollbar flex flex-wrap gap-5 animate-detail-rise" style={{ animationDelay: '100ms' }}>
            {titles.map((t) => (
              <Card key={t.id} title={t} variant="portrait" onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const featured = collections.filter((c) => c.featured);
  const rest = collections.filter((c) => !c.featured);

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Collections</h1>
          <p className="mt-2 text-[15px] text-white/50">Curated journeys through cinema, handpicked by our editors.</p>
        </div>

        {/* Featured collections — large editorial banners */}
        <div className="mb-8 grid gap-5 md:grid-cols-2">
          {featured.map((col, i) => (
            <button
              key={col.id}
              onClick={() => setSelected(col)}
              className="group relative h-72 overflow-hidden rounded-[20px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
              style={{ transform: 'scale(1)', animationDelay: `${i * 120}ms` }}
            >
              <img src={col.cover} alt={col.name} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${col.accent} 0%, transparent 55%)` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: col.accent }}>{col.subtitle}</div>
                <h2 className="mt-2 text-display text-[28px] font-medium tracking-tight text-white">{col.name}</h2>
                <p className="mt-2 max-w-sm text-[13px] text-white/60">{col.description}</p>
                <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-white/80 transition-cinematic group-hover:text-amber-300">
                  Explore <ChevronRight className="h-4 w-4 transition-cinematic group-hover:translate-x-1" strokeWidth={1.5} />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Rest — smaller editorial cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((col, i) => {
            const colTitles = mockTitles.slice(0, 3);
            return (
              <button
                key={col.id}
                onClick={() => setSelected(col)}
                className="group relative h-44 overflow-hidden rounded-[16px] text-left transition-all duration-500 ease-out animate-stagger-in card-edge hover:card-edge-hover"
                style={{ animationDelay: `${200 + i * 80}ms` }}
              >
                <img src={col.cover} alt={col.name} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${col.accent} 0%, transparent 60%)` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-0 left-0 p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">{col.subtitle}</div>
                  <h3 className="mt-1 text-display text-[19px] font-medium tracking-tight text-white">{col.name}</h3>
                  <div className="mt-1.5 flex -space-x-2">
                    {colTitles.slice(0, 3).map((t) => (
                      <div key={t.id} className="h-8 w-8 overflow-hidden rounded-full border-2 border-black/40">
                        <img src={t.poster} alt={t.name} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
