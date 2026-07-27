import { useState, useMemo } from 'react';
import { Play, Star, Clock, ChevronRight } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { usePopular } from '@/hooks/usePopular';
import { useSeason } from '@/hooks/useSeason';
import SafeImg from './SafeImg';

interface TVShowsProps {
  onSelect: (title: Title) => void;
  onPlay: (title: Title) => void;
  onEpisodeSelect?: (episode: Episode) => void;
}

export default function TVShows({ onSelect, onPlay }: TVShowsProps) {
  const { data: shows } = usePopular('tv');
  const [selectedShow, setSelectedShow] = useState<Title | null>(null);
  const [season, setSeason] = useState(1);
  const { data: showEpisodes } = useSeason(selectedShow?.id || null, selectedShow ? season : null);

  if (selectedShow) {
    return (
      <div className="min-h-screen w-full animate-fade-in">
        <div className="relative h-[50vh] min-h-[360px] w-full overflow-hidden">
          <SafeImg src={selectedShow.backdrop} alt={selectedShow.name} className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(1.05)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/80 to-transparent" />
          <button onClick={() => setSelectedShow(null)} className="absolute left-8 top-24 z-20 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/80 transition-cinematic hover:text-white lg:left-12">
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={1.5} />Сериалы
          </button>
          <div className="absolute bottom-0 left-0 p-8 lg:p-12">
            <div className="animate-detail-rise">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">Сериал</div>
              <h1 className="text-display text-[36px] font-medium tracking-tight text-white md:text-[48px]">{selectedShow.logoText}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                <span className="flex items-center gap-1 font-semibold text-amber-300/90"><Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />{selectedShow.score}</span>
                <span className="text-white/25">·</span>
                <span className="text-white/72">{selectedShow.runtime}</span>
                <span className="text-white/25">·</span>
                <span className="text-white/72">{selectedShow.genres.join(', ')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] px-8 lg:px-12">
          <div className="-mt-4 flex items-center gap-3 animate-detail-rise" style={{ animationDelay: '100ms' }}>
            <button onClick={() => onPlay(selectedShow)} className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black transition-cinematic hover:scale-[1.03] active:scale-95" style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}>
              <Play className="h-4 w-4 fill-current" />{selectedShow.progress ? 'Продолжить' : 'Смотреть'}
            </button>
          </div>

          <p className="mt-8 max-w-2xl text-[15px] leading-[1.7] text-white/70 animate-detail-rise" style={{ animationDelay: '150ms' }}>{selectedShow.description}</p>

          <div className="mt-10 animate-detail-rise" style={{ animationDelay: '200ms' }}>
            <div className="mb-5 flex items-center gap-3">
              <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">Эпизоды</h3>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="mb-6 flex gap-2 overflow-x-auto no-scrollbar">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSeason(s)}
                  className="rounded-full px-5 py-2 text-[13px] font-medium transition-cinematic"
                  style={{
                    background: season === s ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                    color: season === s ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                    border: season === s ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Сезон {s}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {showEpisodes.map((ep, i) => (
                <button
                  key={ep.id}
                  onClick={() => onSelect(selectedShow)}
                  className="group/ep flex w-full items-center gap-4 rounded-[14px] glass-panel p-3 text-left transition-cinematic hover:bg-white/[0.06] animate-stagger-in"
                  style={{ animationDelay: `${250 + i * 50}ms` }}
                >
                  <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-[10px]">
                    <img src={ep.thumbnail} alt={ep.title} className="absolute inset-0 h-full w-full object-cover transition-cinematic group-hover/ep:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-cinematic group-hover/ep:opacity-100">
                      <Play className="h-6 w-6 fill-white text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-white/40">{ep.episode}</span>
                      <h4 className="truncate text-[14px] font-medium text-white/90">{ep.title}</h4>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/45">{ep.synopsis}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/35">
                      <Clock className="h-3 w-3" strokeWidth={1.5} />{ep.runtime}
                      <span className="text-white/15">·</span>{ep.aired}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-10 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">Сериалы</h1>
          <p className="mt-2 text-[15px] text-white/50">Продолжайте истории или откройте новые.</p>
        </div>

        <section className="animate-row-reveal">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="text-display text-[21px] font-medium tracking-tight text-white/88">Популярные сериалы</h2>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shows.map((show, i) => (
              <button key={show.id} onClick={() => setSelectedShow(show)} className="group text-left animate-stagger-in" style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}>
                <div className="relative aspect-[2/3] overflow-hidden rounded-[12px] card-edge transition-cinematic group-hover:card-edge-hover group-hover:scale-[1.04]" style={{ transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <SafeImg src={show.poster} alt={show.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <h3 className="mt-2.5 truncate text-[13px] font-medium text-white/85">{show.name}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/38">
                  <span>{show.runtime}</span><span className="text-white/15">·</span>
                  <span className="flex items-center gap-0.5"><Star className="h-[9px] w-[9px] text-amber-300/55" fill="currentColor" strokeWidth={0} />{show.score}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
