import { useState, useEffect } from 'react';
import { Play, Plus, Check, Star, ChevronLeft, Heart, Share2, Download, Clock, Calendar, Award, Film, Loader2 } from 'lucide-react';
import type { Title } from '@/api/client';
import { useDetails } from '@/hooks/useDetails';
import { apiPost, apiDelete } from '@/api/client';
import Card from './Card';
import SourceSelector from './SourceSelector';
import TorrentSearch from './TorrentSearch';

interface MovieDetailsProps {
  title: Title;
  onBack: () => void;
  onPlay: (title: Title) => void;
  onSelect: (title: Title) => void;
}

const typeLabel = (type: Title['type']) =>
  type === 'movie' ? 'Фильм' : type === 'tv' ? 'Сериал' : type === 'anime' ? 'Аниме' : 'Документальный';

export default function MovieDetails({ title, onBack, onPlay, onSelect }: MovieDetailsProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'torrents'>('torrents');
  const [resumingTorrent, setResumingTorrent] = useState(false);

  // Check if there's a saved torrent for resume
  const savedTorrent = (() => {
    try {
      const last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
      return last[title.id] || null;
    } catch { return null; }
  })();

  const savedPosition = (() => {
    try {
      const positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      return positions[title.id] || 0;
    } catch { return 0; }
  })();

  const hasSavedProgress = savedTorrent && savedPosition > 30; // At least 30 seconds watched

  const { data: details } = useDetails(title.id, title.type === 'tv' ? 'tv' : 'movie');
  const displayTitle = details || title;

  useEffect(() => {
    setImgLoaded(false);
    setExpanded(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [title.id]);

  return (
    <div className="min-h-screen w-full animate-fade-in">
      <div className="relative h-[72vh] min-h-[520px] w-full overflow-hidden">
        {!imgLoaded && <div className="absolute inset-0 skeleton" />}
        <img
          src={displayTitle.backdrop}
          alt={displayTitle.name}
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            opacity: imgLoaded ? 1 : 0,
            filter: 'saturate(1.05) contrast(1.05)',
            transform: 'scale(1.06)',
            transition: 'opacity 800ms ease-out, transform 8s ease-out',
          }}
        />

        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,6,0.85) 0%, rgba(5,5,6,0.35) 40%, transparent 70%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(5,5,6,1) 0%, rgba(5,5,6,0.15) 55%, transparent 80%)' }} />
        <div className="absolute inset-x-0 top-0 h-24" style={{ background: 'linear-gradient(180deg, rgba(5,5,6,0.5) 0%, transparent 100%)' }} />

        <button
          onClick={onBack}
          className="absolute left-8 top-24 z-20 flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] font-medium text-white/80 transition-cinematic hover:text-white lg:left-12"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Назад
        </button>

        <div className="absolute inset-x-0 bottom-0 px-8 pb-10 lg:px-12 lg:pb-14">
          <div className="max-w-2xl animate-detail-rise" style={{ animationDelay: '100ms' }}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">{typeLabel(displayTitle.type)}</span>
              <span className="h-px w-5 bg-amber-200/20" />
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">{displayTitle.genres[0]}</span>
            </div>
            <h1
              className="text-display text-balance text-[40px] font-medium leading-[1.04] tracking-tight text-white md:text-[54px] lg:text-[64px]"
              style={{ textShadow: '0 2px 24px rgba(0,0,0,0.4)' }}
            >
              {displayTitle.logoText}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <span className="flex items-center gap-1 font-semibold text-amber-300/90">
                <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />{displayTitle.score}
              </span>
              <span className="text-white/25">·</span>
              <span className="flex items-center gap-1 text-white/72"><Calendar className="h-3 w-3" strokeWidth={1.5} />{displayTitle.year}</span>
              <span className="text-white/25">·</span>
              <span className="flex items-center gap-1 text-white/72"><Clock className="h-3 w-3" strokeWidth={1.5} />{displayTitle.runtime}</span>
              {displayTitle.rating && (
                <>
                  <span className="text-white/25">·</span>
                  <span className="rounded-[5px] border border-white/15 px-2 py-[2px] text-[10px] font-medium text-white/55">{displayTitle.rating}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1200px] px-8 lg:px-12">
        <div className="-mt-6 flex flex-wrap items-center gap-3 animate-detail-rise" style={{ animationDelay: '150ms' }}>
          {hasSavedProgress ? (
            <button
              onClick={async () => {
                setResumingTorrent(true);
                try {
                  const res = await fetch('/api/torrents/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ magnet: savedTorrent.magnet, title: savedTorrent.title }),
                  });
                  const data = await res.json();
                  if (data.files?.length > 0) {
                    const file = data.files[0];
                    onPlay({ ...displayTitle, videoUrl: file.streamUrl });
                  }
                } catch (err) {
                  console.error('Resume error:', err);
                } finally {
                  setResumingTorrent(false);
                }
              }}
              disabled={resumingTorrent}
              className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black transition-cinematic hover:scale-[1.03] active:scale-95 disabled:opacity-50"
              style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}
            >
              {resumingTorrent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              Продолжить
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('torrents')}
              className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-black transition-cinematic hover:scale-[1.03] active:scale-95"
              style={{ boxShadow: '0 6px 28px -8px rgba(255,255,255,0.22)' }}
            >
              <Play className="h-4 w-4 fill-current" />Смотреть
            </button>
          )}
          <button onClick={() => setInLibrary(!inLibrary)} className="flex h-12 w-12 items-center justify-center rounded-full glass text-white/80 transition-cinematic hover:bg-white/12" aria-label="Watchlist">
            {inLibrary ? <Check className="h-4 w-4 text-amber-300" strokeWidth={2} /> : <Plus className="h-4 w-4" strokeWidth={1.5} />}
          </button>
          <button onClick={async () => {
            try {
              if (favorited) {
                await apiDelete(`/api/user/favorites/${displayTitle.id}`);
                setFavorited(false);
              } else {
                await apiPost('/api/user/favorites', {
                  tmdbId: displayTitle.id,
                  mediaType: displayTitle.type,
                  titleName: displayTitle.name,
                  poster: displayTitle.poster,
                });
                setFavorited(true);
              }
            } catch (err) {
              console.error('Favorite error:', err);
            }
          }} className="flex h-12 w-12 items-center justify-center rounded-full glass text-white/80 transition-cinematic hover:bg-white/12" aria-label="Favorite">
            <Heart className={`h-4 w-4 transition-cinematic ${favorited ? 'fill-amber-300 text-amber-300' : ''}`} strokeWidth={1.5} />
          </button>
          <button className="flex h-12 w-12 items-center justify-center rounded-full glass text-white/80 transition-cinematic hover:bg-white/12" aria-label="Download">
            <Download className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button className="flex h-12 w-12 items-center justify-center rounded-full glass text-white/80 transition-cinematic hover:bg-white/12" aria-label="Share">
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Description - visible in all tabs */}
        <div className="mt-10 max-w-2xl animate-detail-rise" style={{ animationDelay: '170ms' }}>
          <p className={`text-balance text-[16px] leading-[1.75] text-white/75 ${expanded ? '' : 'line-clamp-3'}`}>{displayTitle.description}</p>
          {displayTitle.description.length > 180 && (
            <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[13px] font-medium text-amber-300/80 transition-cinematic hover:text-amber-200">
              {expanded ? 'Свернуть' : 'Читать далее'}
            </button>
          )}
        </div>

        {/* Tabs: Sources / Torrents */}
        <div className="mt-10 animate-detail-rise" style={{ animationDelay: '180ms' }}>
          <div className="flex gap-1 mb-6">
            <button
              onClick={() => setActiveTab('sources')}
              className="rounded-full px-5 py-2.5 text-[13px] font-medium transition-cinematic"
              style={{
                background: activeTab === 'sources' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeTab === 'sources' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: activeTab === 'sources' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              Источники
            </button>
            <button
              onClick={() => setActiveTab('torrents')}
              className="rounded-full px-5 py-2.5 text-[13px] font-medium transition-cinematic"
              style={{
                background: activeTab === 'torrents' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                color: activeTab === 'torrents' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                border: activeTab === 'torrents' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              Торренты
            </button>
          </div>

          {activeTab === 'sources' && (
            <SourceSelector
              title={displayTitle}
              onPlay={(url) => onPlay({ ...displayTitle, videoUrl: url })}
            />
          )}
          {activeTab === 'torrents' && (
            <TorrentSearch
              title={displayTitle}
              onPlay={(url, episodeName) => onPlay({ ...displayTitle, videoUrl: url, episode: episodeName })}
            />
          )}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-white/[0.06] pt-8 md:grid-cols-4 animate-detail-rise" style={{ animationDelay: '250ms' }}>
          <MetaItem label="Режиссёр" value={displayTitle.director || '—'} />
          <MetaItem label="Жанры" value={displayTitle.genres.join(', ')} />
          <MetaItem label="Длительность" value={displayTitle.runtime} />
          <MetaItem label="Год" value={String(displayTitle.year)} />
        </div>

        {displayTitle.cast && displayTitle.cast.length > 0 && (
          <section className="mt-12 border-t border-white/[0.06] pt-8 animate-detail-rise" style={{ animationDelay: '300ms' }}>
            <SectionHeader title="Актёры" count={displayTitle.cast.length} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {displayTitle.cast.map((member, i) => (
                <div key={member.name} className="group/cast flex items-center gap-3 rounded-2xl p-2 transition-cinematic hover:bg-white/[0.04] animate-stagger-in" style={{ animationDelay: `${300 + i * 80}ms` }}>
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/5 transition-cinematic group-hover/cast:ring-amber-200/20">
                    <img src={member.image} alt={member.name} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-white/85">{member.name}</div>
                    <div className="truncate text-[11px] text-white/40">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">{label}</div>
      <div className="mt-1.5 text-[14px] font-medium text-white/85">{value}</div>
    </div>
  );
}

function SectionHeader({ title, count, icon }: { title: string; count?: number; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {icon}
      <h3 className="text-display text-[20px] font-medium tracking-tight text-white/90">{title}</h3>
      {count != null && <span className="text-[12px] text-white/30">{count}</span>}
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}
