import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Magnet, Users, HardDrive, Calendar, ExternalLink, Play, Folder, ArrowUpDown, Filter, Check } from 'lucide-react';
import type { Title } from '@/api/client';

// Simple hash for magnet link
function hashMagnet(magnet: string): string {
  let hash = 0;
  for (let i = 0; i < magnet.length; i++) {
    const char = magnet.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// Save last played torrent for a movie
function saveLastTorrent(movieId: number, magnetHash: string, magnet: string, title: string) {
  try {
    const last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
    last[movieId] = { hash: magnetHash, magnet, title };
    localStorage.setItem('last_torrents', JSON.stringify(last));
  } catch {}
}

function getLastTorrent(movieId: number): { hash: string; magnet: string; title: string } | null {
  try {
    const last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
    return last[movieId] || null;
  } catch {
    return null;
  }
}

// Save watched episode
function saveWatchedEpisode(movieId: number, fileId: number) {
  try {
    const watched = JSON.parse(localStorage.getItem('watched_episodes') || '{}');
    if (!watched[movieId]) watched[movieId] = [];
    if (!watched[movieId].includes(fileId)) {
      watched[movieId].push(fileId);
    }
    localStorage.setItem('watched_episodes', JSON.stringify(watched));
  } catch {}
}

function getWatchedEpisodes(movieId: number): number[] {
  try {
    const watched = JSON.parse(localStorage.getItem('watched_episodes') || '{}');
    return watched[movieId] || [];
  } catch {
    return [];
  }
}

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
}

interface TorrentSearchProps {
  title: Title;
  onPlay: (url: string, episodeName?: string, externalSubs?: any[]) => void;
}

type SortKey = 'seeders' | 'size' | 'date';

export default function TorrentSearch({ title, onPlay }: TorrentSearchProps) {
  const { t } = useTranslation();
  const [results, setResults] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [lastTorrentId, setLastTorrentId] = useState<string | null>(null);
  const [files, setFiles] = useState<TorrentFile[] | null>(null);
  const [streamError, setStreamError] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('seeders');
  const [seasonFilter, setSeasonFilter] = useState<number | null>(null);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentItem | null>(null);

  const search = async () => {
    setLoading(true);
    setSearched(true);
    setFiles(null);
    try {
      const res = await fetch(`/api/torrents/search?q=${encodeURIComponent(title.name)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const last = getLastTorrent(title.id);
    setLastTorrentId(last?.hash || null);
    // Auto-search on mount
    search();
  }, [title.id]);

  const sortedResults = useMemo(() => {
    let filtered = [...results];

    // Filter by season if selected
    if (seasonFilter !== null) {
      filtered = filtered.filter((r) => {
        const t = r.title.toLowerCase();
        return t.includes(`s${seasonFilter}`) || t.includes(`сезон ${seasonFilter}`) || t.includes(`сезон${seasonFilter}`) || t.includes(`season ${seasonFilter}`);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'seeders') return b.seeders - a.seeders;
      if (sortBy === 'size') return b.size - a.size;
      if (sortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      return 0;
    });

    return filtered;
  }, [results, sortBy, seasonFilter]);

  // Extract available seasons from results
  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    for (const r of results) {
      const t = r.title.toLowerCase();
      // Match S01, S1, Season 1, Сезон 1 patterns
      const matches = t.match(/s(\d{1,2})|сезон\s*(\d{1,2})|season\s*(\d{1,2})/gi);
      if (matches) {
        for (const m of matches) {
          const num = m.match(/\d+/);
          if (num) seasons.add(parseInt(num[0]));
        }
      }
    }
    return Array.from(seasons).sort((a, b) => a - b);
  }, [results]);

  const streamTorrent = async (item: TorrentItem) => {
    setStreamingId(item.id);
    setStreamError('');
    setFiles(null);
    setSelectedTorrent(item);
    // Save as last played torrent (using magnet hash for uniqueness)
    const magnetHash = hashMagnet(item.magnet);
    saveLastTorrent(title.id, magnetHash, item.magnet, item.title);
    setLastTorrentId(magnetHash);
    try {
      const res = await fetch('/api/torrents/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: item.magnet, title: item.title }),
      });
      const data = await res.json();
      if (data.error) {
        setStreamError(data.error);
      } else if (data.files?.length > 0) {
        // Auto-play if only one file
        if (data.files.length === 1) {
          saveWatchedEpisode(title.id, data.files[0].id);
          const episodeMatch = data.files[0].name.match(/S(\d{1,2})E(\d{1,2})/i);
          const episodeName = episodeMatch ? `S${episodeMatch[1]}E${episodeMatch[2]}` : data.files[0].name;
          onPlay(data.files[0].streamUrl, episodeName, data.files[0].externalSubs || []);
        } else {
          setFiles(data.files);
        }
      } else {
        setStreamError(t('torrents.notFound'));
      }
    } catch (err: any) {
      setStreamError(err.message);
    } finally {
      setStreamingId(null);
    }
  };

  const playFile = (file: TorrentFile) => {
    saveWatchedEpisode(title.id, file.id);
    // Extract episode name from filename (e.g., "S01E05 - Episode Name.mkv" → "S01E05")
    const episodeMatch = file.name.match(/S(\d{1,2})E(\d{1,2})/i);
    const episodeName = episodeMatch ? `S${episodeMatch[1]}E${episodeMatch[2]}` : file.name;
    onPlay(file.streamUrl, episodeName, (file as any).externalSubs || []);
  };

  // File list view
  if (files) {
    const watchedEpisodes = getWatchedEpisodes(title.id);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-medium text-white/85 flex items-center gap-2">
            <Folder className="h-4 w-4 text-amber-300/70" strokeWidth={1.5} />
            {selectedTorrent?.title || t('torrents.files')}
          </h3>
          <button
            onClick={() => { setFiles(null); setSelectedTorrent(null); }}
            className="text-[12px] text-white/40 hover:text-white/70 transition-cinematic"
          >
            {t('torrents.backToResults')}
          </button>
        </div>
        {files.map((file) => {
          const isWatched = watchedEpisodes.includes(file.id);
          return (
            <div
              key={file.id}
              className={`flex items-center justify-between rounded-[12px] p-4 transition-cinematic ${isWatched ? 'bg-amber-300/[0.06] border border-amber-300/20' : 'bg-white/[0.03] border border-white/[0.06]'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-medium text-white/85 truncate">{file.name}</div>
                  {isWatched && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-300/80 shrink-0">
                      <Check className="h-3 w-3" /> {t('torrents.watched')}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">{file.sizeFormatted}</div>
              </div>
              <button
                onClick={() => playFile(file)}
                className="flex items-center gap-2 rounded-full bg-amber-300/90 px-4 py-2 text-[12px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90"
              >
                <Play className="h-3 w-3 fill-current" />{t('common.watch')}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-white/85 flex items-center gap-2">
          <Magnet className="h-4 w-4 text-amber-300/70" strokeWidth={1.5} />
          {t('movie.torrents')}
        </h3>
        {!searched && (
          <button
            onClick={search}
            className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/[0.08] px-4 py-2 text-[12px] font-medium text-white/70 transition-cinematic hover:bg-white/[0.1] hover:text-white"
          >
            <Download className="h-3 w-3" strokeWidth={1.5} />
            {t('torrents.search')}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-[13px] text-white/50 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('torrents.searching')}
        </div>
      )}

      {streamError && (
        <div className="text-[12px] text-red-400/80 py-2 rounded-lg bg-red-400/10 px-4">{streamError}</div>
      )}

      {/* Sort and filter controls */}
      {!loading && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 py-2">
          {/* Sort buttons */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-white/40" />
            {(['seeders', 'size', 'date'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-cinematic"
                style={{
                  background: sortBy === key ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                  color: sortBy === key ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.5)',
                  border: sortBy === key ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {key === 'seeders' ? t('torrents.seeders') : key === 'size' ? t('torrents.size') : t('torrents.date')}
              </button>
            ))}
          </div>

          {/* Season filter */}
          {availableSeasons.length > 0 && (
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-white/40" />
              <button
                onClick={() => setSeasonFilter(null)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-cinematic"
                style={{
                  background: seasonFilter === null ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                  color: seasonFilter === null ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.5)',
                  border: seasonFilter === null ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {t('torrents.all')}
              </button>
              {availableSeasons.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeasonFilter(s)}
                  className="rounded-full px-3 py-1 text-[11px] font-medium transition-cinematic"
                  style={{
                    background: seasonFilter === s ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                    color: seasonFilter === s ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.5)',
                    border: seasonFilter === s ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  S{s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && searched && sortedResults.length === 0 && (
        <div className="text-[13px] text-white/40 py-4">
          {results.length > 0 && seasonFilter !== null
            ? `${t('torrents.notFound')} ${seasonFilter}`
            : t('torrents.notFound')}
        </div>
      )}

      {!loading && sortedResults.map((item, idx) => {
        const isStreaming = streamingId === item.id;
        const magnetHash = hashMagnet(item.magnet);
        const isLastPlayed = lastTorrentId === magnetHash;
        return (
          <div
            key={`${item.tracker}-${item.id}-${idx}`}
            onClick={() => streamTorrent(item)}
            className={`rounded-[12px] p-4 transition-cinematic cursor-pointer ${isLastPlayed ? 'bg-amber-300/[0.06] border border-amber-300/20' : 'bg-white/[0.03] border border-white/[0.06]'} ${isStreaming ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-medium text-white/85 line-clamp-2">{item.title}</div>
                  {isLastPlayed && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-300/80 shrink-0">
                      <Check className="h-3 w-3" /> {t('torrents.watched')}
                    </span>
                  )}
                  {isStreaming && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-300/80 shrink-0">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t('torrents.loading')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{item.tracker}</span>
                  <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{item.sizeFormatted}</span>
                  <span className="flex items-center gap-1 text-green-400/70"><Users className="h-3 w-3" />{item.seeders}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{item.peers}</span>
                  {item.date && (
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(item.date).toLocaleDateString('ru')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.details && (
                  <a
                    href={item.details}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:text-white/70 transition-cinematic"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
