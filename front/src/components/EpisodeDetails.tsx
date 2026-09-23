import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, ChevronLeft, ChevronRight, Clock, Calendar, Star, Magnet, Loader2, Sparkles } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { useDetails } from '@/hooks/useDetails';
import { useSeason } from '@/hooks/useSeason';
import TorrentSearch from './TorrentSearch';

interface EpisodeDetailsProps {
  episode: Episode;
  series?: Title;
  onBack: () => void;
  onPlay: (title: Title, externalSubs?: any[]) => void;
  onSelectEpisode: (ep: Episode) => void;
}

export default function EpisodeDetails({ episode, series: initialSeries, onBack, onPlay, onSelectEpisode }: EpisodeDetailsProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const { data: fetchedSeries, loading: seriesLoading } = useDetails(initialSeries ? null : episode.seriesId, 'tv');
  const series = initialSeries || fetchedSeries;
  const { data: seasonEpisodes } = useSeason(episode.seriesId, episode.season);
  const currentIdx = seasonEpisodes.findIndex((e) => e.id === episode.id);
  const prevEp = currentIdx > 0 ? seasonEpisodes[currentIdx - 1] : null;
  const nextEp = currentIdx < seasonEpisodes.length - 1 ? seasonEpisodes[currentIdx + 1] : null;

  useEffect(() => {
    setImgLoaded(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [episode.id]);

  if (!series) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 text-center animate-fade-in text-white/80">
        <Loader2 className="h-10 w-10 animate-spin text-amber-300 mb-4" />
        <h2 className="text-[18px] font-medium text-white/90">Загрузка информации об эпизоде...</h2>
        <p className="mt-1 text-[13px] text-white/45">Сезон {episode.season}, Серия {episode.episode}</p>
        <button
          onClick={onBack}
          className="mt-6 rounded-full glass px-6 py-2.5 text-[13px] font-medium text-white/80 hover:text-white"
        >
          Назад к сериалу
        </button>
      </div>
    );
  }

  const torrentsRef = useRef<HTMLDivElement>(null);
  const episodeQuery = `${series.name} S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}`;
  const episodeTitle: Title = {
    ...series,
    name: episodeQuery,
    logoText: `${series.name} — ${t('episode.season')}${episode.season} ${t('episode.episode')}${episode.episode}`,
  };

  const backdropSrc = episode.thumbnail || series.backdrop || series.poster;

  const scrollToTorrents = () => {
    torrentsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen w-full animate-fade-in">
      <div className="relative h-[60vh] min-h-[440px] w-full overflow-hidden">
        {!imgLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={backdropSrc}
          alt={episode.title}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: imgLoaded ? 1 : 0.4, filter: 'saturate(1.05) contrast(1.05)', transform: 'scale(1.06)', transition: 'opacity 800ms ease-out, transform 8s ease-out' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/80 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#08080a]/50 to-transparent" />

        <button onClick={onBack} className="absolute left-8 top-24 z-20 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/80 transition-cinematic hover:text-white lg:left-12">
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />{series.name}
        </button>

        <div className="absolute inset-x-0 bottom-0 p-8 lg:p-12">
          <div className="max-w-2xl animate-detail-rise">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">{t('episode.season')}{episode.season} · {t('episode.episode')}{episode.episode}</span>
              <span className="h-px w-5 bg-amber-200/20" />
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">{series.name}</span>
            </div>
            <h1 className="text-display text-[36px] font-medium leading-[1.05] tracking-tight text-white md:text-[48px] lg:text-[56px]" style={{ textShadow: '0 2px 24px rgba(0,0,0,0.4)' }}>
              {episode.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <span className="flex items-center gap-1 text-white/72"><Clock className="h-3.5 w-3.5" strokeWidth={1.5} />{episode.runtime}</span>
              <span className="text-white/25">·</span>
              <span className="flex items-center gap-1 text-white/72"><Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />{episode.aired}</span>
              {series.score > 0 && (
                <>
                  <span className="text-white/25">·</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-300/90"><Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />{series.score}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1100px] px-8 lg:px-12">
        <div className="-mt-6 flex items-center gap-3 animate-detail-rise" style={{ animationDelay: '100ms' }}>
          <button
            onClick={scrollToTorrents}
            className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black transition-cinematic hover:scale-[1.03] active:scale-95"
            style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}
          >
            <Play className="h-4 w-4 fill-current" />{episode.progress ? t('common.continue') : 'Выбрать торрент и смотреть'}
          </button>
        </div>

        {/* Torrents section right at the top for instant access */}
        <div ref={torrentsRef} className="mt-8 border-t border-white/[0.06] pt-6 animate-detail-rise" style={{ animationDelay: '150ms' }}>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">
              Торренты и файлы серии
            </h3>
            <span className="text-[12px] text-amber-300/80 bg-amber-400/10 px-2.5 py-0.5 rounded-full font-medium">
              S{String(episode.season).padStart(2, '0')}E{String(episode.episode).padStart(2, '0')}
            </span>
          </div>
          <TorrentSearch
            title={episodeTitle}
            onPlay={(url, epName, extSubs) =>
              onPlay(
                {
                  ...series,
                  name: `${series.name} — ${epName || `S${episode.season}E${episode.episode}`}`,
                  videoUrl: url,
                  episode: epName || `S${episode.season}E${episode.episode}`,
                },
                extSubs
              )
            }
          />
        </div>

        {/* Episode description */}
        {episode.synopsis && (
          <div className="mt-10 max-w-3xl rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6 animate-detail-rise" style={{ animationDelay: '200ms' }}>
            <h3 className="mb-2 text-display text-[16px] font-medium text-white/85">{t('episode.description')}</h3>
            <p className="text-[14px] leading-[1.7] text-white/70">{episode.synopsis}</p>
          </div>
        )}

        {/* Previous / Next episode nav */}
        <div className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-6 animate-detail-rise" style={{ animationDelay: '220ms' }}>
          {prevEp ? (
            <button onClick={() => onSelectEpisode(prevEp)} className="group flex items-center gap-3 rounded-[14px] glass-panel p-3 text-left transition-cinematic hover:bg-white/[0.06]">
              <ChevronLeft className="h-5 w-5 text-white/40 transition-cinematic group-hover:text-white/80" strokeWidth={1.5} />
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">{t('episode.previous')}</div>
                <div className="text-[13px] font-medium text-white/80">{t('episode.episode')}{prevEp.episode} · {prevEp.title}</div>
              </div>
            </button>
          ) : <div />}
          {nextEp ? (
            <button onClick={() => onSelectEpisode(nextEp)} className="group flex items-center gap-3 rounded-[14px] glass-panel p-3 text-right transition-cinematic hover:bg-white/[0.06]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">{t('episode.next')}</div>
                <div className="text-[13px] font-medium text-white/80">{t('episode.episode')}{nextEp.episode} · {nextEp.title}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-white/40 transition-cinematic group-hover:text-white/80" strokeWidth={1.5} />
            </button>
          ) : <div />}
        </div>

        <section className="mt-12 animate-detail-rise" style={{ animationDelay: '250ms' }}>
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">Сезон {episode.season}</h3>
            <span className="text-[12px] text-white/30">{seasonEpisodes.length} эпизодов</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
            {seasonEpisodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => onSelectEpisode(ep)}
                className="group/ep shrink-0 text-left"
                style={{ width: 240 }}
              >
                <div className="relative aspect-video overflow-hidden rounded-[12px] transition-cinematic group-hover/ep:scale-[1.03] card-edge group-hover/ep:card-edge-hover">
                  <img src={ep.thumbnail} alt={ep.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 backdrop-blur-md">Э{ep.episode}</div>
                  {ep.id === episode.id && (
                    <div className="absolute inset-0 ring-2 ring-amber-300/40 rounded-[12px]" />
                  )}
                </div>
                <h4 className="mt-2 truncate text-[13px] font-medium text-white/80">{ep.title}</h4>
                <div className="mt-0.5 text-[11px] text-white/35">{ep.runtime}</div>
              </button>
            ))}
          </div>
        </section>

        <div className="h-20" />
      </div>
    </div>
  );
}
