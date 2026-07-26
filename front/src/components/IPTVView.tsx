import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tv, Search, Play, ChevronDown, ChevronRight, Clock, Loader2, Settings, Plus, Trash2, RefreshCw } from 'lucide-react';
import type { Title } from '@/api/client';

interface IPTVChannel {
  id: string;
  name: string;
  url: string;
  logo: string;
  group: string;
  tvgId: string;
  tvgName: string;
}

interface EpgProgram {
  title: string;
  start: string;
  stop: string;
  desc?: string;
  startTime: string;
  stopTime: string;
}

interface IPTVViewProps {
  onPlay: (title: Title) => void;
}

const IPTV_STORAGE_KEY = 'lumiere_iptv';

function getSavedPlaylists(): Array<{ name: string; url: string; epgUrl?: string }> {
  try {
    const data = localStorage.getItem(IPTV_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function savePlaylists(playlists: Array<{ name: string; url: string; epgUrl?: string }>) {
  localStorage.setItem(IPTV_STORAGE_KEY, JSON.stringify(playlists));
}

export default function IPTVView({ onPlay }: IPTVViewProps) {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState<Array<{ name: string; url: string; epgUrl?: string }>>(getSavedPlaylists);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [epgData, setEpgData] = useState<Record<string, EpgProgram[]>>({});
  const [epgLoading, setEpgLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newEpgUrl, setNewEpgUrl] = useState('');

  // Load channels from selected playlist
  const loadPlaylist = async (index: number) => {
    const playlist = playlists[index];
    if (!playlist) return;

    setLoading(true);
    setError('');
    setSelectedPlaylist(index);

    try {
      const res = await fetch('/api/iptv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playlist.url }),
      });

      if (!res.ok) {
        throw new Error('Failed to load playlist');
      }

      const data = await res.json();
      setChannels(data.channels || []);
      setGroups(data.groups || []);
      setSelectedGroup(null);

      // Load EPG if available
      if (playlist.epgUrl) {
        loadEpg(playlist.epgUrl);
      }
    } catch (err: any) {
      setError(err.message);
      setChannels([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // Load EPG data
  const loadEpg = async (epgUrl: string) => {
    setEpgLoading(true);
    try {
      const res = await fetch('/api/iptv/epg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: epgUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setEpgData(data.epg || {});
      }
    } catch {
      // EPG loading failed, continue without it
    } finally {
      setEpgLoading(false);
    }
  };

  // Add new playlist
  const addPlaylist = () => {
    if (!newPlaylistUrl.trim()) return;

    const newPlaylists = [...playlists, {
      name: newPlaylistName.trim() || `Playlist ${playlists.length + 1}`,
      url: newPlaylistUrl.trim(),
      epgUrl: newEpgUrl.trim() || undefined,
    }];

    setPlaylists(newPlaylists);
    savePlaylists(newPlaylists);
    setNewPlaylistUrl('');
    setNewPlaylistName('');
    setNewEpgUrl('');
    setShowAddForm(false);
  };

  // Remove playlist
  const removePlaylist = (index: number) => {
    const newPlaylists = playlists.filter((_, i) => i !== index);
    setPlaylists(newPlaylists);
    savePlaylists(newPlaylists);
    if (selectedPlaylist === index) {
      setSelectedPlaylist(null);
      setChannels([]);
      setGroups([]);
    }
  };

  // Filter channels by group and search
  const filteredChannels = useMemo(() => {
    let filtered = channels;

    if (selectedGroup) {
      filtered = filtered.filter(ch => ch.group === selectedGroup);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ch =>
        ch.name.toLowerCase().includes(query) ||
        ch.group.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [channels, selectedGroup, searchQuery]);

  // Get current program for channel
  const getCurrentProgram = (channelId: string): EpgProgram | null => {
    const programs = epgData[channelId] || [];
    if (programs.length === 0) return null;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Find current program based on time
    for (const program of programs) {
      if (program.startTime <= currentTime && program.stopTime > currentTime) {
        return program;
      }
    }

    return programs[0]; // Return first program if no current found
  };

  // Play channel
  const playChannel = (channel: IPTVChannel) => {
    const program = getCurrentProgram(channel.id);

    const title: Title = {
      id: 0,
      name: channel.name,
      overview: program ? `Сейчас: ${program.title}` : '',
      poster: channel.logo,
      backdrop: channel.logo,
      year: 0,
      runtime: '',
      rating: 0,
      genres: [],
      type: 'live',
      videoUrl: channel.url,
    };

    onPlay(title);
  };

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="mb-8 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">
            IPTV
          </h1>
          <p className="mt-2 text-[15px] text-white/50">
            Телевидение через интернет
          </p>
        </div>

        {/* Playlist selector */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {playlists.map((playlist, index) => (
            <button
              key={index}
              onClick={() => loadPlaylist(index)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic ${
                selectedPlaylist === index
                  ? 'bg-amber-300/15 text-amber-300 border border-amber-300/25'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              <Tv className="h-4 w-4" />
              {playlist.name}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removePlaylist(index);
                }}
                className="ml-2 text-white/30 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-cinematic"
          >
            <Plus className="h-4 w-4" />
            Добавить плейлист
          </button>
        </div>

        {/* Add playlist form */}
        {showAddForm && (
          <div className="mb-6 rounded-[16px] bg-white/5 border border-white/10 p-6 animate-row-reveal">
            <h3 className="text-[15px] font-medium text-white/85 mb-4">Новый плейлист</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-[12px] text-white/50 mb-2">Название</label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Мой плейлист"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">URL плейлиста (m3u/m3u8)</label>
                <input
                  type="text"
                  value={newPlaylistUrl}
                  onChange={(e) => setNewPlaylistUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u8"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">URL EPG (опционально)</label>
                <input
                  type="text"
                  value={newEpgUrl}
                  onChange={(e) => setNewEpgUrl(e.target.value)}
                  placeholder="https://example.com/epg.xml"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={addPlaylist}
                disabled={!newPlaylistUrl.trim()}
                className="rounded-lg bg-amber-300/15 text-amber-300 px-6 py-2.5 text-[13px] font-medium border border-amber-300/25 hover:bg-amber-300/25 transition-cinematic disabled:opacity-50"
              >
                Добавить
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg bg-white/5 text-white/60 px-6 py-2.5 text-[13px] font-medium border border-white/10 hover:bg-white/10 transition-cinematic"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Search and filters */}
        {channels.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск каналов..."
                className="w-full rounded-full bg-white/5 border border-white/10 pl-11 pr-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-cinematic ${
                  selectedGroup === null
                    ? 'bg-amber-300/15 text-amber-300 border border-amber-300/25'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                Все
              </button>
              {groups.map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-cinematic ${
                    selectedGroup === group
                      ? 'bg-amber-300/15 text-amber-300 border border-amber-300/25'
                      : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-amber-300 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-[16px] bg-red-500/10 border border-red-500/20 p-6 text-center">
            <p className="text-[14px] text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && channels.length === 0 && (
          <div className="rounded-[16px] bg-white/5 border border-white/10 p-12 text-center">
            <Tv className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <p className="text-[15px] text-white/50">
              {playlists.length === 0
                ? 'Добавьте плейлист для начала'
                : 'Выберите плейлист для загрузки каналов'}
            </p>
          </div>
        )}

        {/* Channel grid */}
        {!loading && filteredChannels.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredChannels.map((channel) => {
              const program = getCurrentProgram(channel.id);

              return (
                <button
                  key={channel.id}
                  onClick={() => playChannel(channel)}
                  className="group rounded-[16px] bg-white/5 border border-white/10 p-4 text-left transition-cinematic hover:bg-white/10 hover:border-amber-300/20"
                >
                  <div className="flex items-center gap-3">
                    {channel.logo ? (
                      <img
                        src={channel.logo}
                        alt={channel.name}
                        className="h-12 w-12 rounded-lg object-cover bg-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center">
                        <Tv className="h-6 w-6 text-white/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white/90 truncate">
                        {channel.name}
                      </div>
                      <div className="text-[11px] text-white/40 truncate">
                        {channel.group}
                      </div>
                    </div>
                  </div>

                  {program && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2 text-[11px] text-white/50">
                        <Clock className="h-3 w-3" />
                        <span>{program.startTime} - {program.stopTime}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-white/70 truncate">
                        {program.title}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-cinematic">
                    <div className="rounded-full bg-amber-300/20 p-2">
                      <Play className="h-4 w-4 text-amber-300" fill="currentColor" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Channel count */}
        {channels.length > 0 && (
          <div className="mt-6 text-center text-[12px] text-white/30">
            {filteredChannels.length} из {channels.length} каналов
          </div>
        )}
      </div>
    </div>
  );
}
