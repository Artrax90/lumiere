import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Folder, Magnet, Users, HardDrive, ArrowUpDown, Filter, Check, RefreshCw, ChevronRight, Star, Clock, AlertCircle } from 'lucide-react';
import type { Title, Episode } from '@/api/client';
import { serverFetch, serverUrl } from '@/api/server';
import SafeImg from './SafeImg';

interface TorrentItem {
  id: string;
  title: string;
  tracker: string;
  category: string;
  size: number;
  sizeFormatted: string;
  seeders: number;
  peers: number;
  magnet: string;
  link: string;
  details: string;
  date: string;
}

interface TorrentFile {
  id: number;
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  streamUrl: string;
  externalSubs?: any[];
}

interface SeasonTorrentBrowserProps {
  show: Title;
  season: number;
  tmdbEpisodes: Episode[];
  onPlay: (title: Title, externalSubs?: any[]) => void;
  activeEpisodeId?: string | null;
}

interface SavedSeasonData {
  torrent: TorrentItem;
  files: TorrentFile[];
  lastPlayedFileId?: number;
  timestamp?: number;
}

// Helpers for localStorage persistence
function getSavedSeasonData(showId: number, season: number): SavedSeasonData | null {
  try {
    const raw = localStorage.getItem(`season_data_${showId}_${season}`);
    if (raw) return JSON.parse(raw);
    const legacyRaw = localStorage.getItem(`season_torrent_${showId}_${season}`);
    if (legacyRaw) {
      return { torrent: JSON.parse(legacyRaw), files: [] };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSeasonData(showId: number, season: number, data: SavedSeasonData | null) {
  try {
    const key = `season_data_${showId}_${season}`;
    if (data) {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem(`season_torrent_${showId}_${season}`, JSON.stringify(data.torrent));
    } else {
      localStorage.removeItem(key);
      localStorage.removeItem(`season_torrent_${showId}_${season}`);
    }
  } catch {}
}

function getBaseShowName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*—\s*Сезон.*$/i, '')
    .replace(/\s*—\s*S\d+.*$/i, '')
    .replace(/\s*-\s*Season.*$/i, '')
    .trim();
}

function extractEpisodeNumber(fileName: string, fallbackIndex: number, season?: number): number {
  if (!fileName) return fallbackIndex + 1;

  const cleanName = fileName.replace(/\.[a-z0-9]{2,4}$/i, '');

  // 1. S01E05, S1E5, s01.e05, s01_e05, s01-e05
  const sMatch = cleanName.match(/s\d{1,2}[\s._-]*e(\d{1,3})/i);
  if (sMatch) return parseInt(sMatch[1], 10);

  // 2. 01x05, 1x5
  const xMatch = cleanName.match(/\b\d{1,2}x(\d{1,3})\b/i);
  if (xMatch) return parseInt(xMatch[1], 10);

  // 3. Match season-episode pattern like "05-01", "05.01", "05_01" (e.g. "Доктор Хаус 05-01.mkv")
  if (season !== undefined) {
    const sPadded = String(season).padStart(2, '0');
    const seasonEpRegex = new RegExp(`(?:^|[^\\d])(?:0?${season}|${sPadded})[-._](\\d{1,3})(?:[^\\d]|$)`, 'i');
    const seMatch = cleanName.match(seasonEpRegex);
    if (seMatch) return parseInt(seMatch[1], 10);
  }

  // 4. Two numbers separated by delimiter: "05-01", "05_01" -> 2nd number is episode
  const seGeneric = cleanName.match(/(?:^|[^\d])\d{1,2}[-._](\d{2,3})(?:[^\d]|$)/);
  if (seGeneric) {
    const ep = parseInt(seGeneric[1], 10);
    if (ep > 0 && ep <= 100) return ep;
  }

  // 5. "ep05", "ep.5", "серия 5", "эпизод 5", "серия 05"
  const epMatch = cleanName.match(/(?:e|ep|серия|эпизод)[\s._-]*(\d{1,3})/i);
  if (epMatch) return parseInt(epMatch[1], 10);

  // 6. Standalone number at the end of the filename: "House - 01", "House_[01]"
  const endNumMatch = cleanName.match(/(?:[-_#\s\[(])(\d{1,3})[\])]?$/);
  if (endNumMatch) {
    const ep = parseInt(endNumMatch[1], 10);
    if (ep > 0 && ep <= 100) return ep;
  }

  // 7. Fallback to index + 1 (1..N sequence)
  return fallbackIndex + 1;
}

function getWatchedFiles(showId: number): number[] {
  try {
    const raw = localStorage.getItem(`watched_files_${showId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchedFile(showId: number, fileId: number) {
  try {
    const key = `watched_files_${showId}`;
    const list = getWatchedFiles(showId);
    if (!list.includes(fileId)) {
      list.push(fileId);
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch {}
}

export default function SeasonTorrentBrowser({
  show,
  season,
  tmdbEpisodes,
  onPlay,
}: SeasonTorrentBrowserProps) {
  const { t } = useTranslation();
  const initialSaved = useMemo(() => getSavedSeasonData(show.id, season), [show.id, season]);
  const [allTorrents, setAllTorrents] = useState<TorrentItem[]>([]);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentItem | null>(() => initialSaved?.torrent || null);
  const [files, setFiles] = useState<TorrentFile[] | null>(() => (initialSaved?.files && initialSaved.files.length > 0) ? initialSaved.files : null);
  const [lastPlayedFileId, setLastPlayedFileId] = useState<number | null>(() => initialSaved?.lastPlayedFileId || null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [qualityFilter, setQualityFilter] = useState<'all' | '4k' | '1080p' | '720p'>('all');
  const [watchedList, setWatchedList] = useState<number[]>(() => getWatchedFiles(show.id));
  const [customSearchQuery, setCustomSearchQuery] = useState(show.name);
  const [viewMode, setViewMode] = useState<'torrents' | 'tmdb'>('torrents');

  // Auto-scroll to selected torrent or last played episode on mount / return from player
  useEffect(() => {
    if (selectedTorrent) {
      const timer = setTimeout(() => {
        const target = lastPlayedFileId
          ? document.getElementById(`episode-file-${lastPlayedFileId}`)
          : document.getElementById('season-torrent-episodes-container');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const container = document.getElementById('season-torrent-episodes-container');
          container?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  // Load torrents for this show
  const fetchTorrents = async (queryText?: string) => {
    const q = queryText || show.name;
    if (!q.trim()) return;
    setLoadingTorrents(true);
    try {
      const res = await serverFetch(`/api/torrents/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setAllTorrents(data.results || []);
    } catch {
      setAllTorrents([]);
    } finally {
      setLoadingTorrents(false);
    }
  };

  useEffect(() => {
    setCustomSearchQuery(show.name);
    fetchTorrents(show.name);
  }, [show.id, show.name]);

  // When season changes, check for previously chosen torrent & files
  useEffect(() => {
    const saved = getSavedSeasonData(show.id, season);
    if (saved) {
      setSelectedTorrent(saved.torrent);
      if (saved.files && saved.files.length > 0) {
        setFiles(saved.files);
      } else {
        loadTorrentFiles(saved.torrent);
      }
      if (saved.lastPlayedFileId) {
        setLastPlayedFileId(saved.lastPlayedFileId);
      }
    } else {
      setSelectedTorrent(null);
      setFiles(null);
      setFileError(null);
      setLastPlayedFileId(null);
    }
  }, [show.id, season]);

  // Filter torrents matching this season
  const seasonTorrents = useMemo(() => {
    const s = season;
    const sPadded = String(s).padStart(2, '0');

    return allTorrents.filter((item) => {
      const title = item.title.toLowerCase();

      // Check season patterns
      const matchesSeason =
        title.includes(`сезон: ${s}`) ||
        title.includes(`сезон:${s}`) ||
        title.includes(`сезон ${s}`) ||
        title.includes(`${s} сезон`) ||
        title.includes(`${s}-й сезон`) ||
        title.includes(`${s}s`) ||
        title.includes(`s${sPadded}`) ||
        title.includes(`s${s}`) ||
        title.includes(`season ${s}`) ||
        title.includes(`сезоны 1-`) ||
        title.includes(`сезон 1-`);

      if (!matchesSeason) return false;

      // Quality filter
      if (qualityFilter === '4k') {
        return title.includes('2160') || title.includes('4k') || title.includes('uhd');
      }
      if (qualityFilter === '1080p') {
        return title.includes('1080');
      }
      if (qualityFilter === '720p') {
        return title.includes('720');
      }

      return true;
    });
  }, [allTorrents, season, qualityFilter]);

  // Load files from TorrServer for a selected torrent
  const loadTorrentFiles = async (torrent: TorrentItem) => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const res = await serverFetch('/api/torrents/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: torrent.magnet, title: torrent.title }),
      });
      const data = await res.json();
      if (data.error && (!data.files || data.files.length === 0)) {
        setFileError(data.error);
      } else if (data.files && data.files.length > 0) {
        setFiles(data.files);
        saveSeasonData(show.id, season, {
          torrent,
          files: data.files,
          lastPlayedFileId: lastPlayedFileId || undefined,
          timestamp: Date.now(),
        });
      } else {
        setFileError('В этой раздаче не найдено поддерживаемых видеофайлов.');
      }
    } catch (err: any) {
      setFileError(err.message || 'Ошибка подключения к TorrServer');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSelectTorrent = (torrent: TorrentItem) => {
    setSelectedTorrent(torrent);
    loadTorrentFiles(torrent);
  };

  const handleChangeTorrent = () => {
    setSelectedTorrent(null);
    setFiles(null);
    setFileError(null);
    setLastPlayedFileId(null);
    saveSeasonData(show.id, season, null);
  };

  const handlePlayFile = (file: TorrentFile, index: number, epNumber: number) => {
    saveWatchedFile(show.id, file.id);
    setWatchedList((prev) => [...prev, file.id]);
    setLastPlayedFileId(file.id);

    if (selectedTorrent && files) {
      saveSeasonData(show.id, season, {
        torrent: selectedTorrent,
        files,
        lastPlayedFileId: file.id,
        timestamp: Date.now(),
      });
    }

    // Remember season
    try {
      localStorage.setItem(`last_season_${show.id}`, String(season));
    } catch {}

    const baseName = getBaseShowName(show.name);
    const tmdbMatch = tmdbEpisodes.find((e) => e.episode === epNumber) || tmdbEpisodes[index];
    const epTitle = tmdbMatch?.title ? ` «${tmdbMatch.title}»` : '';
    const episodeLabel = `Сезон ${season}, Серия ${epNumber}${epTitle}`;

    onPlay(
      {
        ...show,
        name: baseName,
        videoUrl: file.streamUrl,
        episode: episodeLabel,
      },
      file.externalSubs || []
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('torrents')}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
            style={{
              background: viewMode === 'torrents' ? 'rgba(232,193,112,0.18)' : 'rgba(255,255,255,0.04)',
              color: viewMode === 'torrents' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
              border: viewMode === 'torrents' ? '1px solid rgba(232,193,112,0.3)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Magnet className="h-4 w-4" />
            <span>Раздачи и серии сезона</span>
            {seasonTorrents.length > 0 && (
              <span className="rounded-full bg-amber-400/20 px-2 py-0.2 text-[10px] font-bold text-amber-300">
                {seasonTorrents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode('tmdb')}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
            style={{
              background: viewMode === 'tmdb' ? 'rgba(232,193,112,0.18)' : 'rgba(255,255,255,0.04)',
              color: viewMode === 'tmdb' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
              border: viewMode === 'tmdb' ? '1px solid rgba(232,193,112,0.3)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span>Описание серий (TMDB)</span>
            <span className="text-[11px] text-white/40">({tmdbEpisodes.length})</span>
          </button>
        </div>

        {/* Selected Torrent indicator */}
        {selectedTorrent && viewMode === 'torrents' && (
          <button
            onClick={handleChangeTorrent}
            className="flex items-center gap-2 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 px-3.5 py-1.5 text-[12px] text-white/80 transition-cinematic"
          >
            <RefreshCw className="h-3.5 w-3.5 text-amber-300" />
            <span>Сменить торрент-раздачу</span>
          </button>
        )}
      </div>

      {/* MODE 1: TORRENTS & EPISODES WORKFLOW */}
      {viewMode === 'torrents' && (
        <>
          {/* STATE A: A torrent is chosen -> SHOW ITS EPISODES! */}
          {selectedTorrent ? (
            <div id="season-torrent-episodes-container" className="space-y-4 animate-fade-in scroll-mt-24">
              {/* Active Torrent Banner */}
              <div className="rounded-[16px] border border-amber-300/20 bg-amber-300/[0.04] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        Выбранная раздача для {season} сезона
                      </span>
                      <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-white/60">
                        {selectedTorrent.tracker}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                        <Users className="h-3 w-3" /> {selectedTorrent.seeders} сидов
                      </span>
                    </div>
                    <h3 className="text-[14px] font-medium text-white/95 line-clamp-2">
                      {selectedTorrent.title}
                    </h3>
                    <div className="text-[12px] text-white/45">
                      Размер: {selectedTorrent.sizeFormatted}
                    </div>
                  </div>

                  <button
                    onClick={handleChangeTorrent}
                    className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] hover:bg-white/15 px-4 py-2 text-[12px] font-medium text-white transition-cinematic shrink-0"
                  >
                    <span>Выбрать другой торрент</span>
                  </button>
                </div>
              </div>

              {/* Loading files from TorrServer */}
              {loadingFiles && (
                <div className="flex flex-col items-center justify-center p-12 text-white/60 animate-fade-in">
                  <RefreshCw className="h-8 w-8 animate-spin text-amber-300 mb-3" />
                  <p className="text-[14px] font-medium">Подключение к раздаче и получение списка серий...</p>
                  <p className="text-[12px] text-white/35 mt-1">TorrServer опрашивает пиров</p>
                </div>
              )}

              {/* Error loading files */}
              {fileError && !loadingFiles && (
                <div className="rounded-[14px] border border-rose-500/30 bg-rose-500/10 p-5 text-rose-300 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span className="font-semibold text-[13px]">Не удалось загрузить серии из этой раздачи</span>
                  </div>
                  <p className="text-[12px] text-rose-300/80 mb-4">{fileError}</p>
                  <button
                    onClick={handleChangeTorrent}
                    className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-1.5 text-[12px] font-medium text-white"
                  >
                    Выбрать другую раздачу из списка
                  </button>
                </div>
              )}

              {/* Episode Files List with Preview Thumbnails */}
              {files && files.length > 0 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <h4 className="text-[15px] font-medium text-white/90">
                      Серии {season} сезона ({files.length} серий в раздаче)
                    </h4>
                    <span className="text-[12px] text-white/40">
                      Нажмите на серию или «Смотреть» для воспроизведения
                    </span>
                  </div>

                  {files.map((file, idx) => {
                    const isWatched = watchedList.includes(file.id);
                    const isLastPlayed = lastPlayedFileId === file.id;
                    const epNumber = extractEpisodeNumber(file.name, idx, season);
                    const tmdbMatch = tmdbEpisodes.find((e) => e.episode === epNumber) || tmdbEpisodes[idx];

                    return (
                      <div
                        key={file.id}
                        id={`episode-file-${file.id}`}
                        onClick={() => handlePlayFile(file, idx, epNumber)}
                        className={`group/file relative flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-[16px] p-3.5 sm:p-4 transition-cinematic cursor-pointer ${
                          isLastPlayed
                            ? 'bg-amber-400/[0.09] border-2 border-amber-400/40 shadow-lg shadow-amber-400/5'
                            : isWatched
                            ? 'bg-white/[0.025] border border-white/[0.08] hover:bg-white/[0.06] hover:border-amber-300/30'
                            : 'bg-white/[0.035] border border-white/[0.06] hover:bg-white/[0.08] hover:border-amber-300/30'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                          {/* 16:9 Preview Thumbnail */}
                          <div className="relative h-20 w-36 sm:h-24 sm:w-44 shrink-0 overflow-hidden rounded-[10px] bg-black/50 border border-white/[0.08] group-hover/file:border-amber-300/40 transition-cinematic">
                            {tmdbMatch?.thumbnail ? (
                              <SafeImg
                                src={tmdbMatch.thumbnail}
                                alt={tmdbMatch.title || file.name}
                                className="h-full w-full object-cover transition-cinematic duration-500 group-hover/file:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-white/[0.02]">
                                <Play className="h-7 w-7 text-white/20" />
                              </div>
                            )}

                            {/* Episode number badge */}
                            <div className="absolute top-1.5 left-1.5 rounded-md bg-black/75 backdrop-blur-md px-2 py-0.5 text-[11px] font-bold text-amber-300 border border-white/10 shadow">
                              {epNumber}
                            </div>

                            {/* Runtime badge */}
                            {tmdbMatch?.runtime && tmdbMatch.runtime !== '—' && (
                              <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/75 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-medium text-white/80 border border-white/10">
                                {tmdbMatch.runtime}
                              </div>
                            )}

                            {/* Play hover overlay */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover/file:opacity-100 transition-opacity">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transform transition-transform group-hover/file:scale-110">
                                <Play className="h-4 w-4 fill-current ml-0.5" />
                              </div>
                            </div>
                          </div>

                          {/* Episode Details */}
                          <div className="min-w-0 flex-1 py-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[14px] text-amber-300">
                                Серия {epNumber}
                              </span>
                              {tmdbMatch?.title && (
                                <span className="text-[14px] font-medium text-white/95 truncate">
                                  — {tmdbMatch.title}
                                </span>
                              )}
                              {isLastPlayed && (
                                <span className="flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 animate-pulse">
                                  Текущая серия
                                </span>
                              )}
                              {isWatched && !isLastPlayed && (
                                <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                  <Check className="h-3 w-3" /> Просмотрено
                                </span>
                              )}
                            </div>

                            {/* Technical file name */}
                            <div className="mt-1 truncate font-mono text-[11px] text-white/40">
                              {file.name}
                            </div>

                            {/* TMDB Synopsis */}
                            {tmdbMatch?.synopsis && (
                              <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-white/60">
                                {tmdbMatch.synopsis}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right side size and action button */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                          <span className="text-[12px] text-white/45 font-medium">
                            {file.sizeFormatted}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayFile(file, idx, epNumber);
                            }}
                            className="flex items-center gap-2 rounded-full bg-white hover:bg-amber-300 px-5 py-2 text-[13px] font-semibold text-black transition-cinematic hover:scale-105 active:scale-95 shadow-md shadow-black/40"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>Смотреть</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* STATE B: NO TORRENT CHOSEN YET -> SHOW LIST OF TORRENTS FOR THIS SEASON */
            <div className="space-y-4 animate-fade-in">
              {/* Quality filter chips & header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-medium text-white/95">
                    Выберите раздачу для {season} сезона
                  </h3>
                  <p className="mt-0.5 text-[12px] text-white/40">
                    Выберите подходящую озвучку и качество — откроются серии для онлайн-просмотра
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-white/40 mr-1">Качество:</span>
                  {[
                    { id: 'all', label: 'Все' },
                    { id: '4k', label: '4K UHD' },
                    { id: '1080p', label: '1080p' },
                    { id: '720p', label: '720p' },
                  ].map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQualityFilter(q.id as any)}
                      className="rounded-full px-3 py-1 text-[11px] font-medium transition-cinematic"
                      style={{
                        background: qualityFilter === q.id ? 'rgba(232,193,112,0.18)' : 'rgba(255,255,255,0.04)',
                        color: qualityFilter === q.id ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.5)',
                        border: qualityFilter === q.id ? '1px solid rgba(232,193,112,0.3)' : '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Loading state */}
              {loadingTorrents && (
                <div className="flex flex-col items-center justify-center p-12 text-white/50 animate-fade-in">
                  <RefreshCw className="h-7 w-7 animate-spin text-amber-300 mb-2" />
                  <span className="text-[13px]">Поиск доступных раздач {season} сезона...</span>
                </div>
              )}

              {/* No torrents found */}
              {!loadingTorrents && seasonTorrents.length === 0 && (
                <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                  <p className="text-[14px] text-white/60">
                    Не найдено подходящих раздач для сезона {season}.
                  </p>
                  <p className="text-[12px] text-white/35 mt-1">
                    Попробуйте выбрать фильтр «Все» или найти сериал вручную.
                  </p>
                </div>
              )}

              {/* Torrents list */}
              {!loadingTorrents && seasonTorrents.length > 0 && (
                <div className="space-y-2.5">
                  {seasonTorrents.map((torrent, idx) => {
                    const is4k = torrent.title.toLowerCase().includes('2160') || torrent.title.toLowerCase().includes('4k');
                    const is1080 = torrent.title.toLowerCase().includes('1080');

                    // Detect studio/dubbing tag
                    const studioMatch = torrent.title.match(/(LostFilm|HDRezka|NewStudio|Кубик в кубе|Red Head Sound|AlexFilm|Jaskier|Дубляж|LineFilm)/i);
                    const studioTag = studioMatch ? studioMatch[0] : null;

                    return (
                      <div
                        key={`${torrent.tracker}-${torrent.id}-${idx}`}
                        onClick={() => handleSelectTorrent(torrent)}
                        className="group/item flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-4 transition-cinematic hover:border-amber-300/30 hover:bg-white/[0.06] cursor-pointer"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/70">
                              {torrent.tracker}
                            </span>
                            {is4k && (
                              <span className="rounded-full bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                4K UHD
                              </span>
                            )}
                            {is1080 && (
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                                1080p
                              </span>
                            )}
                            {studioTag && (
                              <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                {studioTag}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold ml-1">
                              <Users className="h-3 w-3" /> {torrent.seeders} сидов
                            </span>
                          </div>

                          <h4 className="text-[13px] font-medium text-white/90 line-clamp-2 leading-snug">
                            {torrent.title}
                          </h4>

                          <div className="flex items-center gap-3 text-[11px] text-white/40">
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" /> {torrent.sizeFormatted}
                            </span>
                            {torrent.date && (
                              <span>· {new Date(torrent.date).toLocaleDateString('ru')}</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTorrent(torrent);
                          }}
                          className="flex items-center gap-2 rounded-full bg-white/[0.08] group-hover/item:bg-amber-300 group-hover/item:text-black border border-white/10 px-4 py-2 text-[12px] font-semibold text-white transition-cinematic shrink-0 self-end md:self-center"
                        >
                          <Folder className="h-3.5 w-3.5" />
                          <span>Открыть серии</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODE 2: TMDB EPISODES GUIDE */}
      {viewMode === 'tmdb' && (
        <div className="space-y-3 animate-fade-in">
          {tmdbEpisodes.map((ep, i) => (
            <div
              key={ep.id}
              className="flex items-start gap-4 rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-4 text-left"
            >
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-[10px] bg-black/40">
                <img
                  src={serverUrl(ep.thumbnail || show.backdrop || show.poster || '')}
                  alt={ep.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Э{ep.episode}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-amber-300">
                    Серия {ep.episode}
                  </span>
                  <h4 className="truncate text-[14px] font-medium text-white/90">
                    {ep.title}
                  </h4>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/50">
                  {ep.synopsis || 'Описание отсутствует'}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/35">
                  <Clock className="h-3 w-3" /> {ep.runtime}
                  <span>·</span>
                  <span>{ep.aired}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
