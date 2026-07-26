import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Sparkles, TrendingUp, Award, Play } from 'lucide-react';
import type { Title } from '@/api/client';
import { useSearch } from '@/hooks/useSearch';
import Card from './Card';

interface AnimeViewProps {
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
}

export default function AnimeView({ onSelect, onPlay }: AnimeViewProps) {
  const { t } = useTranslation();
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const { data: anime } = useSearch(activeGenre || 'anime');

  const animeGenres = ['Action', 'Adventure', 'Fantasy', 'Drama', 'Sci-Fi', 'Slice of Life', 'Detective', 'Romance'];

  const featured = anime[0];

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-10 animate-row-reveal">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-rose-300/70" strokeWidth={1.5} />
            <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">{t('anime.title')}</h1>
          </div>
          <p className="mt-2 text-[15px] text-white/50">{t('anime.subtitle')}</p>
        </div>

        {featured && (
          <button
            onClick={() => onSelect(featured)}
            className="group relative mb-12 block h-64 w-full overflow-hidden rounded-[20px] text-left transition-cinematic hover:scale-[1.01] animate-detail-rise md:h-72"
          >
            <img src={featured.backdrop} alt={featured.name} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover:scale-105" style={{ filter: 'saturate(1.15) brightness(0.75)' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(200,100,150,0.15) 0%, transparent 55%)' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/70 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 lg:p-10">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-rose-300/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200/90">{t('anime.recommended')}</span>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-amber-300/90"><Star className="h-3 w-3" fill="currentColor" strokeWidth={0} />{featured.score}</span>
              </div>
              <h2 className="text-display text-[30px] font-medium tracking-tight text-white md:text-[38px]">{featured.logoText}</h2>
              <p className="mt-2 max-w-lg text-[14px] text-white/60">{featured.description.slice(0, 120)}...</p>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); onPlay(featured); }} className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition-cinematic hover:scale-105">
                  <Play className="h-3.5 w-3.5 fill-current" />{t('common.watch')}
                </button>
              </div>
            </div>
          </button>
        )}

        <div className="mb-8 no-scrollbar flex gap-2 overflow-x-auto animate-row-reveal">
          <button
            onClick={() => setActiveGenre(null)}
            className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
            style={{
              background: !activeGenre ? 'rgba(244,114,182,0.15)' : 'rgba(255,255,255,0.04)',
              color: !activeGenre ? 'rgba(244,180,210,0.95)' : 'rgba(255,255,255,0.6)',
              border: !activeGenre ? '1px solid rgba(244,114,182,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {t('anime.all')}
          </button>
          {animeGenres.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGenre(activeGenre === g ? null : g)}
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
              style={{
                background: activeGenre === g ? 'rgba(244,114,182,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeGenre === g ? 'rgba(244,180,210,0.95)' : 'rgba(255,255,255,0.6)',
                border: activeGenre === g ? '1px solid rgba(244,114,182,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {g}
            </button>
          ))}
        </div>

        <section className="mb-12 animate-row-reveal">
          <div className="mb-5 flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-rose-300/60" strokeWidth={1.5} />
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/88">{t('anime.popular')}</h2>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="no-scrollbar flex gap-5 overflow-x-auto pb-4">
            {anime.map((t, i) => (
              <div key={t.id} className="animate-stagger-in" style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}>
                <Card title={t} variant="portrait" onSelect={onSelect} rank={i + 1} />
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 animate-row-reveal">
          <div className="mb-5 flex items-center gap-3">
            <Award className="h-4 w-4 text-amber-300/60" strokeWidth={1.5} />
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/88">{t('anime.topRated')}</h2>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="no-scrollbar flex gap-5 overflow-x-auto pb-4">
            {anime.sort((a, b) => b.score - a.score).map((t) => (
              <Card key={t.id} title={t} variant="portrait" onSelect={onSelect} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
