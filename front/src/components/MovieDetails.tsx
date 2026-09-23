import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Check, Star, ChevronLeft, ChevronRight, Heart, Share2, Download, Clock, Calendar, Award, Film, Loader2, Bell, Bookmark, RotateCcw, X } from 'lucide-react';
import type { Title } from '@/api/client';
import { useDetails } from '@/hooks/useDetails';
import { serverFetch, serverUrl } from '@/api/server';
import SafeImg from './SafeImg';
import { apiPost, apiDelete } from '@/api/client';
import Card from './Card';
import SourceSelector from './SourceSelector';
import TorrentSearch from './TorrentSearch';
import PersonModal from './PersonModal';

interface MovieDetailsProps {
  title: Title;
  onBack: () => void;
  onPlay: (title: Title, externalSubs?: any[]) => void;
  onSelect: (title: Title) => void;
}

export default function MovieDetails({ title, onBack, onPlay, onSelect }: MovieDetailsProps) {
  const { t } = useTranslation();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [inLibrary, setInLibrary] = useState(() => {
    try {
      const list = JSON.parse(localStorage.getItem('user_watchlist') || '[]');
      return list.some((item: any) => item.id === title.id);
    } catch { return false; }
  });
  const [copiedToast, setCopiedToast] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'torrents'>('torrents');
  const [resumingTorrent, setResumingTorrent] = useState(false);
  const [similarTitles, setSimilarTitles] = useState<Title[]>([]);
  const [showTrailer, setShowTrailer] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [showAllCastModal, setShowAllCastModal] = useState(false);
  const [isLightBg, setIsLightBg] = useState(false);

  const typeLabel = (type: Title['type']) =>
    type === 'movie' ? t('movie.movie') : (type === 'tv' || type === 'show') ? t('movie.series') : type === 'anime' ? t('movie.anime') : t('movie.documentary');

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
    const bgUrl = displayTitle.backdrop || displayTitle.poster;
    if (!bgUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const sx = img.naturalWidth * 0.5;
        const sy = 0;
        const sw = img.naturalWidth * 0.5;
        const sh = img.naturalHeight * 0.6;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;
        let sum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          count++;
        }
        const avg = count > 0 ? (sum / count) / 255 : 0;
        setIsLightBg(avg > 0.45);
      } catch {
        setIsLightBg(false);
      }
    };
    img.onerror = () => setIsLightBg(false);
    img.src = bgUrl;
  }, [displayTitle.backdrop, displayTitle.poster]);

  useEffect(() => {
    setImgLoaded(false);
    setExpanded(false);
    setShowTrailer(false);
    window.scrollTo({ top: 0, behavior: 'instant' });

    let active = true;
    // Check initial favorite status
    serverFetch('/api/user/favorites')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.favorites?.some((f: any) => f.tmdbId === title.id)) {
          setFavorited(true);
        }
      })
    const token = localStorage.getItem('lumiere_access');
    if (token && (title.type === 'tv' || title.type === 'show')) {
      serverFetch(`/api/notifications/is-subscribed/${title.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data && data.isSubscribed) {
            setIsSubscribed(true);
          }
        })
        .catch(() => {});
    }

    const mediaType = title.type === 'tv' ? 'tv' : 'movies';
    serverFetch(`/api/${mediaType}/${title.id}/similar`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.results?.length > 0) {
          setSimilarTitles(data.results.filter((t: Title) => t.poster && t.backdrop).slice(0, 12));
        }
      })
      .catch(() => {});

    serverFetch('/api/user/watchlist')
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data.watchlist) return;
        const exists = data.watchlist.some((w: any) => Number(w.tmdbId) === Number(title.id));
        if (exists) setInLibrary(true);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [title.id, title.type]);

  const toggleLibrary = async () => {
    try {
      const list = JSON.parse(localStorage.getItem('user_watchlist') || '[]');
      let updated;
      if (inLibrary) {
        updated = list.filter((item: any) => item.id !== displayTitle.id);
        setInLibrary(false);
        serverFetch(`/api/user/watchlist/${displayTitle.id}`, { method: 'DELETE' }).catch(() => {});
      } else {
        updated = [...list, {
          id: displayTitle.id,
          name: displayTitle.name,
          poster: displayTitle.poster,
          type: displayTitle.type,
          year: displayTitle.year,
          score: displayTitle.score,
        }];
        setInLibrary(true);
        serverFetch('/api/user/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId: displayTitle.id,
            mediaType: displayTitle.type || 'movie',
            titleName: displayTitle.logoText || displayTitle.name,
            poster: displayTitle.poster || '',
          }),
        }).catch(() => {});
      }
      localStorage.setItem('user_watchlist', JSON.stringify(updated));
    } catch {
      setInLibrary(!inLibrary);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: displayTitle.name,
      text: `Смотри «${displayTitle.name}» на Lumiere`,
      url: window.location.href,
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2200);
      } catch (err) {
        console.error('Share/copy failed:', err);
      }
    }
  };

  return (
    <div className="min-h-screen w-full animate-fade-in">
      {/* Hero with backdrop */}
      <div className="relative w-full overflow-hidden pb-10 pt-20 md:pt-24">
        <div className="absolute inset-0 -z-10">
          {!imgLoaded && <div className="absolute inset-0 skeleton" />}
          <SafeImg
            src={displayTitle.backdrop}
            alt={displayTitle.name}
            onLoad={() => setImgLoaded(true)}
            className="h-full w-full object-cover"
            style={{
              opacity: imgLoaded ? 1 : 0,
              filter: 'saturate(1.05) contrast(1.05)',
              transform: 'scale(1.04)',
              transition: 'opacity 800ms ease-out, transform 8s ease-out',
            }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,5,6,0.85) 0%, rgba(5,5,6,0.35) 45%, transparent 80%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(5,5,6,1) 0%, rgba(5,5,6,0.5) 50%, transparent 100%)' }} />
          <div className="absolute inset-x-0 top-0 h-28" style={{ background: 'linear-gradient(180deg, rgba(5,5,6,0.6) 0%, transparent 100%)' }} />
        </div>

        {/* Upper Hero Grid: Left side (Back, Title, Badges, Actions, Synopsis) & Right side (Cast Header, 4x2 Grid of 8 Actor Cards) */}
        <div className="relative z-10 mx-auto max-w-[1400px] px-6 lg:px-12 pt-2 md:pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Column (col-span-12 lg:col-span-7) */}
            <div className="lg:col-span-7 flex flex-col animate-detail-rise" style={{ animationDelay: '100ms' }}>
              {/* Back button */}
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-all self-start mb-6"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{t('common.back')}</span>
              </button>

              {/* Category & Genre */}
              <div className="mb-2 flex items-center gap-2.5 text-xs">
                <span className="font-bold uppercase tracking-[0.16em] text-amber-400">{typeLabel(displayTitle.type)}</span>
                <span className="text-white/30">—</span>
                <span className="font-medium uppercase tracking-[0.12em] text-white/50">{displayTitle.genres?.[0] || ''}</span>
              </div>
              
              {/* Display Title */}
              <h1
                className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-bold text-white tracking-tight leading-[1.1] mb-3 text-balance"
                style={{ textShadow: '0 4px 28px rgba(0,0,0,0.6)' }}
              >
                {displayTitle.logoText || displayTitle.name}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs sm:text-sm text-white/80 mb-6 font-medium">
                {displayTitle.score && (
                  <span className="flex items-center gap-1 font-bold text-amber-400">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={0} />
                    <span>{displayTitle.score}</span>
                  </span>
                )}
                {displayTitle.score && displayTitle.year && <span className="text-white/25">·</span>}
                {displayTitle.year && (
                  <span className="flex items-center gap-1 text-white/70">
                    <Calendar className="h-3 w-3 text-white/50" strokeWidth={1.5} />
                    <span>{displayTitle.year}</span>
                  </span>
                )}
                {displayTitle.runtime && <span className="text-white/25">·</span>}
                {displayTitle.runtime && (
                  <span className="flex items-center gap-1 text-white/70">
                    <Clock className="h-3 w-3 text-white/50" strokeWidth={1.5} />
                    <span>{displayTitle.runtime}</span>
                  </span>
                )}
                {displayTitle.rating && (
                  <>
                    <span className="text-white/25">·</span>
                    <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white/60">
                      {displayTitle.rating}
                    </span>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mb-6">
                {hasSavedProgress ? (
                  <button
                    onClick={async () => {
                      setResumingTorrent(true);
                      try {
                        const res = await serverFetch('/api/torrents/stream', {
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
                    className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black shadow-lg transition-all hover:bg-white/90 hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {resumingTorrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>{t('common.continue')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('torrents')}
                    className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black shadow-lg transition-all hover:bg-white/90 hover:scale-105 active:scale-95"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>{t('common.watch')}</span>
                  </button>
                )}

                {/* Watchlist [+] circular button */}
                <button
                  onClick={toggleLibrary}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 shadow-md ${
                    inLibrary
                      ? 'bg-amber-400 text-black border border-amber-300'
                      : 'bg-white/10 hover:bg-white/20 text-white/90 border border-white/15'
                  }`}
                  title={inLibrary ? "Удалить из списка к просмотру" : "Буду смотреть"}
                >
                  {inLibrary ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
                </button>

                {/* Favorites [♡] circular button */}
                <button
                  onClick={async () => {
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
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 shadow-md ${
                    favorited
                      ? 'bg-rose-500/25 text-rose-400 border border-rose-500/50'
                      : 'bg-white/10 hover:bg-white/20 text-white/90 border border-white/15'
                  }`}
                  title={favorited ? "Удалить из закладок" : "В закладки"}
                >
                  <Heart className={`h-4 w-4 ${favorited ? 'fill-rose-400 text-rose-400' : ''}`} strokeWidth={1.8} />
                </button>

                {/* Download [📥] circular button */}
                <button
                  onClick={async () => {
                    const lastTorrent = (() => {
                      try {
                        const last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
                        return last[displayTitle.id] || null;
                      } catch { return null; }
                    })();

                    if (!lastTorrent?.magnet) {
                      setActiveTab('torrents');
                      return;
                    }

                    try {
                      const res = await serverFetch('/api/torrents/stream', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ magnet: lastTorrent.magnet, title: lastTorrent.title }),
                      });
                      const data = await res.json();
                      if (data.files?.length > 0) {
                        const file = data.files[0];
                        const link = document.createElement('a');
                        link.href = `/api/torrents/proxy?link=${encodeURIComponent(lastTorrent.magnet)}&index=${file.id}`;
                        link.download = file.name;
                        link.click();
                      }
                    } catch (err) {
                      console.error('Download error:', err);
                    }
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 transition-all active:scale-95 shadow-md"
                  aria-label="Download"
                  title="Скачать через торрент"
                >
                  <Download className="h-4 w-4" strokeWidth={1.8} />
                </button>

                {/* Share [↗] circular button */}
                <button
                  onClick={handleShare}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 transition-all active:scale-95 shadow-md"
                  aria-label="Share"
                  title="Поделиться ссылкой"
                >
                  <Share2 className="h-4 w-4" strokeWidth={1.8} />
                </button>

                {/* Trailer pill button */}
                <button
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-all active:scale-95 shadow-md"
                  title="Смотреть трейлер"
                >
                  <Film className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />
                  <span>Трейлер</span>
                </button>

                {/* TV Series notification bell button */}
                {(displayTitle.type === 'tv' || displayTitle.type === 'show') && (
                  <button
                    onClick={async () => {
                      const token = localStorage.getItem('lumiere_access');
                      if (!token) return;
                      try {
                        if (isSubscribed) {
                          await serverFetch(`/api/notifications/subscribe/${displayTitle.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          setIsSubscribed(false);
                        } else {
                          await serverFetch('/api/notifications/subscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              tmdbId: displayTitle.id,
                              title: displayTitle.name,
                              poster: displayTitle.poster,
                              lastSeason: details?.seasons?.length || 1,
                              lastEpisode: 1
                            })
                          });
                          setIsSubscribed(true);
                        }
                      } catch (e) {
                        console.error('Subscription error:', e);
                      }
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-95 shadow-md ${
                      isSubscribed
                        ? 'bg-amber-400/25 text-amber-300 border border-amber-400/50'
                        : 'bg-white/10 hover:bg-white/20 text-white/90 border border-white/15'
                    }`}
                    title={isSubscribed ? "Отслеживается" : "Следить за новыми сериями"}
                  >
                    <Bell className={`h-4 w-4 ${isSubscribed ? 'fill-amber-300 text-amber-300' : ''}`} strokeWidth={1.8} />
                  </button>
                )}
              </div>

              {/* Description / Synopsis below actions */}
              {displayTitle.description && (
                <div className="max-w-2xl text-white/75 text-sm leading-relaxed">
                  <p className={expanded ? '' : 'line-clamp-3'}>
                    {displayTitle.description}
                  </p>
                  {displayTitle.description.length > 180 && (
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="mt-1.5 text-xs font-semibold text-amber-300/90 hover:text-amber-200 transition-colors"
                    >
                      {expanded ? t('common.close') : t('movie.description')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Cast Section with 4x2 Grid of 8 Actor Cards (col-span-12 lg:col-span-5) */}
            <div className="lg:col-span-5 w-full animate-detail-rise" style={{ animationDelay: '150ms' }}>
              {displayTitle.cast && displayTitle.cast.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 px-0.5">
                    <h2 className="font-serif text-xl sm:text-2xl font-medium text-white tracking-tight">В главных ролях</h2>
                    {displayTitle.cast.length > 8 && (
                      <button
                        onClick={() => setShowAllCastModal(true)}
                        className="text-xs sm:text-sm text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <span>Все актеры</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 4 columns x 2 rows = 8 cards */}
                  <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                    {displayTitle.cast.slice(0, 8).map((actor) => (
                      <div
                        key={actor.name}
                        onClick={() => actor.id && setSelectedPersonId(actor.id)}
                        className="group flex flex-col rounded-2xl p-2.5 bg-[#10141f]/75 hover:bg-[#181e2e]/90 border border-white/12 hover:border-amber-400/40 transition-all duration-200 cursor-pointer text-left shadow-xl backdrop-blur-md"
                        title="Посмотреть фильмографию"
                      >
                        <div className="w-full aspect-[4/5] rounded-xl overflow-hidden bg-black/40 mb-2 relative">
                          <SafeImg
                            src={actor.image}
                            alt={actor.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <div className="text-xs font-bold text-white truncate leading-snug drop-shadow-sm">
                          {actor.name}
                        </div>
                        <div className="text-[11px] text-white/60 truncate leading-snug mt-0.5">
                          {actor.role ? actor.role.split('/')[0].trim() : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 lg:px-12">
        {copiedToast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-[13px] font-semibold text-black shadow-2xl animate-fade-in">
            <Check className="h-4 w-4 text-black" strokeWidth={2.5} />
            <span>Ссылка скопирована в буфер обмена</span>
          </div>
        )}

        {/* Tabs: Sources / Torrents */}
        <div className="mt-6 animate-detail-rise" style={{ animationDelay: '180ms' }}>
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
              {t('movie.sources')}
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
              {t('movie.torrents')}
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
              onPlay={(url, episodeName, externalSubs) => onPlay({ ...displayTitle, videoUrl: url, episode: episodeName }, externalSubs)}
            />
          )}
        </div>



        {similarTitles.length > 0 && (
          <section className="mt-14 border-t border-white/[0.06] pt-8 animate-detail-rise" style={{ animationDelay: '350ms' }}>
            <SectionHeader title="Похожие фильмы и сериалы" count={similarTitles.length} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-5">
              {similarTitles.map((sim) => (
                <div key={sim.id} className="animate-stagger-in">
                  <Card title={sim} variant="portrait" onSelect={onSelect} fill />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="h-20" />
      </div>

      {showTrailer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="relative w-full max-w-4xl aspect-video overflow-hidden rounded-[20px] bg-black shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(displayTitle.name + ' ' + (displayTitle.year || '') + ' русский трейлер')}&autoplay=1`}
              title="Трейлер"
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <button
              onClick={() => setShowTrailer(false)}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white/80 transition-cinematic hover:bg-black hover:text-white backdrop-blur-md"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Person Filmography Modal */}
      <PersonModal
        personId={selectedPersonId}
        onClose={() => setSelectedPersonId(null)}
        onSelectMovie={onSelect}
      />

      {/* All Cast Modal */}
      {showAllCastModal && displayTitle.cast && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in"
          onClick={() => setShowAllCastModal(false)}
        >
          <div
            className="relative flex flex-col w-full max-w-4xl max-h-[85vh] rounded-3xl bg-[#10121a]/95 border border-white/15 shadow-2xl overflow-hidden backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg font-medium text-white">В главных ролях</span>
                <span className="text-xs text-white/40">({displayTitle.cast.length})</span>
              </div>
              <button
                onClick={() => setShowAllCastModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-6 overflow-y-auto">
              {displayTitle.cast.map((actor) => (
                <div
                  key={actor.name}
                  onClick={() => {
                    setShowAllCastModal(false);
                    if (actor.id) setSelectedPersonId(actor.id);
                  }}
                  className="group flex flex-col rounded-2xl p-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer text-left shadow-md"
                >
                  <div className="w-full aspect-[4/5] rounded-xl overflow-hidden bg-white/5 mb-2 relative">
                    <SafeImg src={actor.image} alt={actor.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  </div>
                  <div className="text-xs font-semibold text-white truncate leading-snug">{actor.name}</div>
                  <div className="text-[11px] text-white/50 truncate leading-snug mt-0.5">{actor.role || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
