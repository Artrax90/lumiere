import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tv, Search, Play, Star, Plus, Trash2, Loader2 } from 'lucide-react';
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
const FAVORITES_STORAGE_KEY = 'lumiere_iptv_favorites';

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

function getSavedFavorites(): Set<string> {
  try {
    const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
}

export default function IPTVView({ onPlay }: IPTVViewProps) {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState<Array<{ name: string; url: string; epgUrl?: string }>>(getSavedPlaylists);
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | null>(null);
  const [epgData, setEpgData] = useState<Record<string, EpgProgram[]>>({});
  const [channelMap, setChannelMap] = useState<Record<string, string>>({}); // name → epgId
  const [iconMap, setIconMap] = useState<Record<string, string>>({}); // epgId → icon URL
  const [epgLoading, setEpgLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newEpgUrl, setNewEpgUrl] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<IPTVChannel | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(getSavedFavorites);
  const [showFavorites, setShowFavorites] = useState(false);

  // Load last selected playlist on mount
  useEffect(() => {
    const lastPlaylist = localStorage.getItem('lumiere_iptv_last');
    if (lastPlaylist !== null && playlists.length > 0) {
      const index = parseInt(lastPlaylist);
      if (index >= 0 && index < playlists.length) {
        loadPlaylist(index);
      }
    }
  }, []);

  // Load channels from selected playlist
  const loadPlaylist = async (index: number) => {
    const playlist = playlists[index];
    if (!playlist) return;

    setLoading(true);
    setError('');
    setSelectedPlaylist(index);
    localStorage.setItem('lumiere_iptv_last', String(index));

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
      setGroups(['All', 'Favorites', ...(data.groups || [])]);
      setSelectedGroup('All');
      setSelectedChannel(null);

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
        setChannelMap(data.channelMap || {});
        setIconMap(data.iconMap || {});
      }
    } catch {
      // EPG loading failed
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
      setSelectedChannel(null);
      localStorage.removeItem('lumiere_iptv_last');
    }
  };

  // Toggle favorite
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  };

  // Filter channels by group and search
  const filteredChannels = useMemo(() => {
    let filtered = channels;

    if (showFavorites) {
      filtered = filtered.filter(ch => favorites.has(ch.id));
    } else if (selectedGroup && selectedGroup !== 'All' && selectedGroup !== 'Favorites') {
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
  }, [channels, selectedGroup, searchQuery, showFavorites, favorites]);

  // Get logo for channel — use channel logo or EPG icon
  const getChannelLogo = (channel: IPTVChannel): string => {
    if (channel.logo) return channel.logo;

    // Try tvgId directly
    if (channel.tvgId && iconMap[channel.tvgId]) {
      return iconMap[channel.tvgId];
    }
    // Try name lookup via channelMap
    const nameKey = channel.name?.toLowerCase() || '';
    if (nameKey) {
      const epgId = channelMap[nameKey];
      if (epgId && iconMap[epgId]) {
        return iconMap[epgId];
      }
      // Partial match
      for (const [mapName, mapId] of Object.entries(channelMap)) {
        if (nameKey.includes(mapName) || mapName.includes(nameKey)) {
          if (iconMap[mapId]) {
            return iconMap[mapId];
          }
        }
      }
    }
    return '';
  };

  // Get EPG ID for channel (for matching programs)
  const getEpgId = (channel: IPTVChannel): string => {
    if (channel.tvgId && epgData[channel.tvgId]) {
      return channel.tvgId;
    }
    const nameKey = channel.name?.toLowerCase() || '';
    if (nameKey) {
      const epgId = channelMap[nameKey];
      if (epgId && epgData[epgId]) {
        return epgId;
      }
      for (const [mapName, mapId] of Object.entries(channelMap)) {
        if (nameKey.includes(mapName) || mapName.includes(nameKey)) {
          if (epgData[mapId]) {
            return mapId;
          }
        }
      }
    }
    return '';
  };

  // Get programs for channel (starting from current time)
  const getPrograms = (channel: IPTVChannel): EpgProgram[] => {
    if (!channel) return [];
    const epgId = getEpgId(channel);
    if (!epgId || !epgData[epgId]) return [];

    const allPrograms = epgData[epgId];
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Find current program index and return from there
    let startIndex = 0;
    for (let i = 0; i < allPrograms.length; i++) {
      if (allPrograms[i].startTime <= currentTime && allPrograms[i].stopTime > currentTime) {
        startIndex = i;
        break;
      }
      if (allPrograms[i].startTime > currentTime) {
        startIndex = i;
        break;
      }
    }

    return allPrograms.slice(startIndex);
  };

  // Get current program for channel
  const getCurrentProgram = (channel: IPTVChannel): EpgProgram | null => {
    const programs = getPrograms(channel);
    if (programs.length === 0) return null;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    for (const program of programs) {
      if (program.startTime <= currentTime && program.stopTime > currentTime) {
        return program;
      }
    }

    return programs[0];
  };

  // Play channel
  const playChannel = (channel: IPTVChannel) => {
    const program = getCurrentProgram(channel);

    const title: Title = {
      id: 0,
      name: channel.name,
      overview: program ? `Сейчас: ${program.title}` : '',
      poster: getChannelLogo(channel),
      backdrop: getChannelLogo(channel),
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
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-8 animate-row-reveal">
          <div className="flex items-center gap-3">
            <div className="flex h-2.5 w-2.5 items-center justify-center">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse-soft" />
            </div>
            <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">
              IPTV
            </h1>
          </div>
          <p className="mt-2 text-[15px] text-white/50">Телевидение через интернет</p>
        </div>

        {/* Playlist selector */}
        <div className="mb-6 flex flex-wrap items-center gap-3 animate-row-reveal">
          {playlists.map((playlist, index) => (
            <div
              key={index}
              onClick={() => loadPlaylist(index)}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic ${
                selectedPlaylist === index
                  ? 'bg-amber-300/15 text-amber-300 border border-amber-300/25'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2">
                <Tv className="h-4 w-4" />
                {playlist.name}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePlaylist(index);
                  }}
                  className="ml-1 text-white/30 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-cinematic"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Добавить плейлист
            </span>
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
                className="rounded-full bg-white py-2.5 px-6 text-[13px] font-semibold text-black transition-cinematic hover:scale-[1.02] disabled:opacity-50"
              >
                Добавить
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-full bg-white/5 text-white/60 py-2.5 px-6 text-[13px] font-medium border border-white/10 hover:bg-white/10 transition-cinematic"
              >
                Отмена
              </button>
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

        {/* Now Playing preview + Channel list */}
        {!loading && channels.length > 0 && (
          <>
            {/* Now Playing preview (if channel selected) */}
            {selectedChannel && (
              <div className="mb-10 animate-detail-rise">
                <div className="glass-panel overflow-hidden rounded-[20px]">
                  <div className="grid md:grid-cols-[1fr_320px]">
                    {/* Preview area */}
                    <div className="relative h-64 md:h-80">
                      {getChannelLogo(selectedChannel) ? (
                        <img
                          src={getChannelLogo(selectedChannel)}
                          alt={selectedChannel.name}
                          className="absolute inset-0 h-full w-full object-cover"
                          style={{ filter: 'saturate(1.05) brightness(0.85)' }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 to-gray-900/50" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" />On Air
                      </div>
                      <div className="absolute bottom-0 left-0 p-6">
                        <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/50">{selectedChannel.group}</div>
                        <h2 className="mt-1 text-display text-[24px] font-medium text-white md:text-[28px]">{selectedChannel.name}</h2>
                        {getCurrentProgram(selectedChannel) && (
                          <>
                            <div className="mt-1 text-[14px] text-white/70">{getCurrentProgram(selectedChannel)?.title}</div>
                            <div className="mt-0.5 text-[12px] text-white/40">
                              {getCurrentProgram(selectedChannel)?.startTime} - {getCurrentProgram(selectedChannel)?.stopTime}
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => playChannel(selectedChannel)}
                        className="absolute bottom-6 right-6 rounded-full bg-white p-4 text-black transition-cinematic hover:scale-110"
                      >
                        <Play className="h-6 w-6 fill-current" />
                      </button>
                    </div>
                    {/* Channel info sidebar */}
                    <div className="border-t border-white/[0.06] p-5 md:border-l md:border-t-0">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                        Программа · {selectedChannel.name}
                      </div>
                      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                        {getPrograms(selectedChannel).map((program, idx) => {
                          const isCurrent = idx === 0;
                          return (
                            <div key={idx} className={`rounded-[10px] px-3 py-2 transition-cinematic ${isCurrent ? 'bg-amber-300/10 border border-amber-300/20' : 'bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] font-medium text-white/40 w-24 shrink-0">{program.startTime} — {program.stopTime}</span>
                                <span className={`text-[12px] truncate ${isCurrent ? 'font-medium text-white/90' : 'text-white/55'}`}>{program.title}</span>
                              </div>
                              {isCurrent && (
                                <div className="mt-1.5 h-[2px] w-1/2 overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full w-2/3 rounded-full bg-amber-400/80" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {getPrograms(selectedChannel).length === 0 && (
                          <div className="text-[12px] text-white/30 py-4 text-center">Нет данных о программе</div>
                        )}
                      </div>
                      <button
                        onClick={() => playChannel(selectedChannel)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[13px] font-semibold text-black transition-cinematic hover:scale-[1.02]"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />Смотреть
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Horizontal program bar */}
              <div className="mt-4 no-scrollbar flex gap-2 overflow-x-auto animate-detail-rise" style={{ animationDelay: '150ms' }}>
                {getPrograms(selectedChannel).slice(0, 10).map((program, idx) => {
                  const isCurrent = idx === 0;
                  return (
                    <div
                      key={idx}
                      className={`shrink-0 rounded-[12px] px-4 py-3 min-w-[160px] transition-cinematic ${
                        isCurrent
                          ? 'bg-amber-300/10 border border-amber-300/20'
                          : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-[10px] font-medium text-white/40 mb-1">{program.startTime} — {program.stopTime}</div>
                      <div className={`text-[12px] font-medium truncate ${isCurrent ? 'text-white/90' : 'text-white/60'}`}>{program.title}</div>
                      {isCurrent && (
                        <div className="mt-2 text-[10px] text-amber-300/70 font-medium">Сейчас</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search + Favorites toggle */}
            <div className="mb-6 flex items-center gap-4 animate-row-reveal">
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
              <button
                onClick={() => { setShowFavorites(!showFavorites); setSelectedGroup('All'); }}
                className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium transition-cinematic ${
                  showFavorites
                    ? 'bg-amber-300/15 text-amber-300 border border-amber-300/25'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                }`}
              >
                <Star className={`h-4 w-4 ${showFavorites ? 'fill-amber-300' : ''}`} />
                Избранное {favorites.size > 0 && `(${favorites.size})`}
              </button>
            </div>

            {/* Channel group filters */}
            {!showFavorites && (
              <div className="mb-6 no-scrollbar flex gap-2 overflow-x-auto animate-row-reveal">
                {groups.filter(g => g !== 'Favorites').map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGroup(g)}
                    className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
                    style={{
                      background: selectedGroup === g ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                      color: selectedGroup === g ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                      border: selectedGroup === g ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* EPG Grid */}
            <div className="glass-panel overflow-hidden rounded-[20px] animate-detail-rise" style={{ animationDelay: '100ms' }}>
              {/* Time header */}
              <div className="flex items-center border-b border-white/[0.06] px-5 py-3">
                <div className="w-44 shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Канал</div>
                <div className="flex flex-1">
                  <div className="flex-[2] text-[11px] font-medium text-white/40">Сейчас</div>
                  <div className="flex-1 text-[11px] font-medium text-white/40">Далее</div>
                  <div className="flex-1" />
                  <div className="flex-1" />
                  <div className="flex-1" />
                </div>
              </div>

              {/* Channels */}
              {filteredChannels.map((ch, idx) => {
                const currentProgram = getCurrentProgram(ch);
                const isFavorite = favorites.has(ch.id);

                return (
                  <button
                    key={ch.id}
                    onClick={() => playChannel(ch)}
                    className={`flex w-full items-center px-5 py-4 text-left transition-cinematic hover:bg-white/[0.03] ${selectedChannel?.id === ch.id ? 'bg-white/[0.04]' : ''} ${idx !== filteredChannels.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                  >
                    <div className="flex w-44 shrink-0 items-center gap-3">
                      <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-white/5">
                        {getChannelLogo(ch) ? (
                          <img src={getChannelLogo(ch)} alt={ch.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Tv className="h-5 w-5 text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-white/85">{ch.name}</div>
                        <div className="text-[10px] text-white/40">{ch.group}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(ch.id); }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-cinematic"
                        aria-label="Favorite"
                      >
                        <Star
                          className={`h-3.5 w-3.5 transition-cinematic ${isFavorite ? 'fill-amber-300 text-amber-300' : 'text-white/25'}`}
                          strokeWidth={1.5}
                        />
                      </button>
                    </div>
                    <div className="flex flex-1 gap-1">
                      {currentProgram ? (
                        <>
                          <div className="flex-[2] rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
                            <div className="truncate text-[12px] font-medium text-white/85">{currentProgram.title}</div>
                            <div className="mt-1 text-[10px] text-white/40">{currentProgram.startTime} - {currentProgram.stopTime}</div>
                            <div className="mt-1 h-0.5 w-2/3 overflow-hidden rounded-full bg-white/15">
                              <div className="h-full w-1/2 rounded-full bg-amber-300/80" />
                            </div>
                          </div>
                          <div className="flex-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="truncate text-[12px] text-white/55">
                              {getPrograms(ch)[1]?.title || '—'}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                          <div className="truncate text-[12px] text-white/30">Нет программы</div>
                        </div>
                      )}
                      <div className="flex-1" />
                      <div className="flex-1" />
                      <div className="flex-1" />
                    </div>
                  </button>
                );
              })}

              {/* Empty favorites */}
              {showFavorites && filteredChannels.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Star className="h-8 w-8 text-white/20 mx-auto mb-3" />
                  <p className="text-[13px] text-white/40">Нет избранных каналов</p>
                  <p className="text-[12px] text-white/30 mt-1">Нажмите на звёздочку рядом с каналом</p>
                </div>
              )}
            </div>

            {/* Channel count */}
            <div className="mt-6 text-center text-[12px] text-white/30">
              {showFavorites
                ? `${filteredChannels.length} избранных каналов`
                : `${filteredChannels.length} из ${channels.length} каналов`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
