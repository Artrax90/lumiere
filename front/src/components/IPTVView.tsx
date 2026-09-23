import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tv, Search, Play, Star, Plus, Trash2, Loader2, Pencil, X } from 'lucide-react';
import type { Title } from '@/api/client';
import { serverFetch, getServerUrl } from '@/api/server';
import { syncClient } from '@/api/sync';

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

const DEFAULT_PLAYLIST = { name: 'Основной', url: 'https://loganettv.github.io/playlists/all.m3u', epgUrl: '' };

function getSavedPlaylists(): Array<{ name: string; url: string; epgUrl?: string }> {
  try {
    const data = localStorage.getItem(IPTV_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [DEFAULT_PLAYLIST];
}

function savePlaylists(playlists: Array<{ name: string; url: string; epgUrl?: string }>) {
  localStorage.setItem(IPTV_STORAGE_KEY, JSON.stringify(playlists));
  // Trigger sync push
  syncClient.push().catch(() => {});
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

function getChannelMonogram(name: string): string {
  if (!name) return 'TV';
  const clean = name.replace(/^(HD|FHD|4K|SD)\s*/i, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase();
}

function getChannelColor(name: string): string {
  const colors = [
    'from-amber-500/20 to-amber-950/50 text-amber-200 border-amber-400/25',
    'from-orange-500/20 to-stone-950/50 text-orange-200 border-orange-400/25',
    'from-yellow-600/20 to-neutral-950/50 text-yellow-200 border-yellow-400/25',
    'from-zinc-700/30 to-zinc-950/60 text-zinc-200 border-zinc-500/30',
    'from-amber-600/20 to-stone-950/50 text-amber-100 border-amber-300/25',
    'from-slate-700/30 to-neutral-950/60 text-slate-200 border-slate-500/30',
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return colors[sum % colors.length];
}

export default function IPTVView({ onPlay }: IPTVViewProps) {
  const { t } = useTranslation();
  const initialPlaylists = getSavedPlaylists();
  console.log('[IPTV] initial playlists from localStorage:', initialPlaylists.length);
  const [playlists, setPlaylists] = useState<Array<{ name: string; url: string; epgUrl?: string }>>(initialPlaylists);

  // Load IPTV playlists from sync API
  useEffect(() => {
    let active = true;

    const loadFromSync = async () => {
      try {
        const res = await serverFetch('/api/sync');
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.iptvPlaylists && data.iptvPlaylists.length > 0) {
          localStorage.setItem(IPTV_STORAGE_KEY, JSON.stringify(data.iptvPlaylists));
          setPlaylists([...data.iptvPlaylists]);
        }
      } catch (e) {
        console.warn('[IPTV] Sync load error:', e);
      }
    };

    loadFromSync();
    return () => {
      active = false;
    };
  }, []);
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState('');
  const [editPlaylistUrl, setEditPlaylistUrl] = useState('');
  const [editEpgUrl, setEditEpgUrl] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<IPTVChannel | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(getSavedFavorites);
  const [showFavorites, setShowFavorites] = useState(false);

  // Time slots for EPG grid — start from current hour, then next 8 hours
  const timeSlots = (() => {
    const now = new Date();
    const currentHour = now.getHours();
    const slots: string[] = [];
    for (let i = 0; i < 8; i++) {
      const h = (currentHour + i) % 24;
      slots.push(`${String(h).padStart(2, '0')}:00`);
    }
    return slots;
  })();

  // Auto-load playlist on mount or when playlists change
  useEffect(() => {
    if (playlists.length === 0 || selectedPlaylist !== null) return;

    const lastPlaylist = localStorage.getItem('lumiere_iptv_last');
    if (lastPlaylist !== null) {
      const index = parseInt(lastPlaylist);
      if (index >= 0 && index < playlists.length) {
        loadPlaylist(index);
        return;
      }
    }

    // No last playlist saved — auto-load first one
    loadPlaylist(0);
  }, [playlists]);

  // Load channels from selected playlist
  const loadPlaylist = async (index: number) => {
    const playlist = playlists[index];
    if (!playlist) return;

    setLoading(true);
    setError('');
    setSelectedPlaylist(index);
    localStorage.setItem('lumiere_iptv_last', String(index));

    try {
      const res = await serverFetch('/api/iptv/parse', {
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
      const res = await serverFetch('/api/iptv/epg', {
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

  // Start editing existing playlist
  const startEditPlaylist = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const pl = playlists[index];
    if (!pl) return;
    setEditingIndex(index);
    setEditPlaylistName(pl.name);
    setEditPlaylistUrl(pl.url);
    setEditEpgUrl(pl.epgUrl || '');
    setShowAddForm(false);
  };

  // Save edited playlist
  const saveEditedPlaylist = () => {
    if (editingIndex === null || !editPlaylistUrl.trim()) return;
    const oldPl = playlists[editingIndex];
    const newName = editPlaylistName.trim() || oldPl.name;
    const newUrl = editPlaylistUrl.trim();
    const newEpg = editEpgUrl.trim() || undefined;

    const updated = [...playlists];
    updated[editingIndex] = {
      name: newName,
      url: newUrl,
      epgUrl: newEpg,
    };

    setPlaylists(updated);
    savePlaylists(updated);

    // If active playlist was edited
    if (selectedPlaylist === editingIndex) {
      if (newUrl !== oldPl.url) {
        // Stream URL changed, reload whole playlist
        loadPlaylist(editingIndex);
      } else if (newEpg !== oldPl.epgUrl) {
        // Only EPG changed: load new EPG or reset
        if (newEpg) {
          loadEpg(newEpg);
        } else {
          setEpgData({});
          setChannelMap({});
          setIconMap({});
        }
      }
    }

    setEditingIndex(null);
  };

  const cancelEditPlaylist = () => {
    setEditingIndex(null);
  };

  // Remove playlist
  const removePlaylist = (index: number) => {
    if (editingIndex === index) {
      setEditingIndex(null);
    }
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
    if (!channel) return '';

    // Try tvgId directly
    if (channel.tvgId && epgData[channel.tvgId]) {
      return channel.tvgId;
    }

    const nameKey = channel.name?.toLowerCase().trim() || '';
    if (!nameKey) return '';

    // Clean channel name for matching (remove HD, SD, etc.)
    const cleanName = nameKey
      .replace(/\b(hd|sd|uhd|4k|fhd)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Exact match
    const epgId = channelMap[nameKey] || channelMap[cleanName];
    if (epgId && epgData[epgId]) return epgId;

    // Partial match (both directions)
    for (const [mapName, mapId] of Object.entries(channelMap)) {
      if (!epgData[mapId]) continue;

      // Clean EPG name too
      const cleanMapName = mapName
        .replace(/\b(hd|sd|uhd|4k|fhd)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Try various matching strategies
      if (
        nameKey.includes(mapName) ||
        mapName.includes(nameKey) ||
        cleanName.includes(cleanMapName) ||
        cleanMapName.includes(cleanName) ||
        // Word-level match (e.g., "НТВ" matches "НТВ HD")
        (cleanName.split(' ')[0] === cleanMapName.split(' ')[0] && cleanName.split(' ')[0].length > 2)
      ) {
        return mapId;
      }
    }

    return '';
  };

  const parseEpgTimestamp = (ts?: string): number => {
    if (!ts) return 0;
    const match = ts.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!match) {
      const parsed = Date.parse(ts);
      return isNaN(parsed) ? 0 : parsed;
    }
    const [, y, m, d, h, min, s] = match;
    const tzMatch = ts.match(/([+-])(\d{2})(\d{2})$/);
    if (tzMatch) {
      const sign = tzMatch[1] === '+' ? -1 : 1;
      const offsetMin = (parseInt(tzMatch[2]) * 60 + parseInt(tzMatch[3])) * sign;
      const utc = Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
      return utc + offsetMin * 60 * 1000;
    }
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s)).getTime();
  };

  // Get programs for channel (starting from current time)
  const getPrograms = (channel: IPTVChannel): EpgProgram[] => {
    if (!channel) return [];
    const epgId = getEpgId(channel);
    if (!epgId || !epgData[epgId]) return [];

    const allPrograms = epgData[epgId];
    const now = Date.now();

    let startIndex = 0;
    for (let i = 0; i < allPrograms.length; i++) {
      const p = allPrograms[i];
      const startMs = parseEpgTimestamp(p.start);
      const stopMs = parseEpgTimestamp(p.stop);

      if (startMs > 0 && stopMs > 0) {
        if (startMs <= now && stopMs > now) {
          startIndex = i;
          break;
        }
        if (startMs > now) {
          startIndex = i;
          break;
        }
      } else {
        const hours = String(new Date().getHours()).padStart(2, '0');
        const minutes = String(new Date().getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        if (p.startTime <= currentTime && p.stopTime > currentTime) {
          startIndex = i;
          break;
        }
        if (p.startTime > currentTime) {
          startIndex = i;
          break;
        }
      }
    }

    return allPrograms.slice(startIndex);
  };

  // Get current program for channel
  const getCurrentProgram = (channel: IPTVChannel): EpgProgram | null => {
    const programs = getPrograms(channel);
    if (programs.length === 0) return null;

    const now = Date.now();
    for (const program of programs) {
      const startMs = parseEpgTimestamp(program.start);
      const stopMs = parseEpgTimestamp(program.stop);
      if (startMs > 0 && stopMs > 0) {
        if (startMs <= now && stopMs > now) {
          return program;
        }
      } else {
        const hours = String(new Date().getHours()).padStart(2, '0');
        const minutes = String(new Date().getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        if (program.startTime <= currentTime && program.stopTime > currentTime) {
          return program;
        }
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
      description: program ? `${t('common.now')}: ${program.title}` : '',
      overview: program ? `${t('common.now')}: ${program.title}` : '',
      poster: getChannelLogo(channel),
      backdrop: getChannelLogo(channel),
      year: 0,
      runtime: '',
      rating: '',
      score: 0,
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
          <p className="mt-2 text-[15px] text-white/50">{t('iptv.subtitle')}</p>
        </div>

        {/* Playlist selector */}
        <div className="mb-6 flex flex-wrap items-center gap-3 animate-row-reveal">
          {playlists.length === 0 && <p className="text-white/30 text-[13px]">Нет плейлистов. Добавьте плейлист или дождитесь синхронизации.</p>}
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
                  onClick={(e) => startEditPlaylist(index, e)}
                  title="Редактировать плейлист"
                  className="ml-1.5 text-white/30 hover:text-amber-300 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePlaylist(index);
                  }}
                  title="Удалить плейлист"
                  className="ml-1 text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}

          <button
            onClick={() => {
              setEditingIndex(null);
              setShowAddForm(!showAddForm);
            }}
            className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-cinematic"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {t('iptv.addPlaylist')}
            </span>
          </button>
        </div>

        {/* Edit playlist form */}
        {editingIndex !== null && (
          <div className="mb-6 rounded-[16px] bg-white/5 border border-amber-300/30 p-6 animate-row-reveal">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-300" />
                <h3 className="text-[15px] font-medium text-amber-200">
                  Редактировать плейлист
                </h3>
              </div>
              <button
                onClick={cancelEditPlaylist}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.playlistName')}</label>
                <input
                  type="text"
                  value={editPlaylistName}
                  onChange={(e) => setEditPlaylistName(e.target.value)}
                  placeholder="Мой плейлист"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.playlistUrl')}</label>
                <input
                  type="text"
                  value={editPlaylistUrl}
                  onChange={(e) => setEditPlaylistUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u8"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.epgUrl')}</label>
                <input
                  type="text"
                  value={editEpgUrl}
                  onChange={(e) => setEditEpgUrl(e.target.value)}
                  placeholder="https://example.com/epg.xml"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={saveEditedPlaylist}
                disabled={!editPlaylistUrl.trim()}
                className="rounded-full bg-amber-300 text-black py-2.5 px-6 text-[13px] font-semibold transition-cinematic hover:scale-[1.02] disabled:opacity-50"
              >
                {t('common.save', 'Сохранить')}
              </button>
              <button
                onClick={cancelEditPlaylist}
                className="rounded-full bg-white/5 text-white/60 py-2.5 px-6 text-[13px] font-medium border border-white/10 hover:bg-white/10 transition-cinematic"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Add playlist form */}
        {showAddForm && (
          <div className="mb-6 rounded-[16px] bg-white/5 border border-white/10 p-6 animate-row-reveal">
            <h3 className="text-[15px] font-medium text-white/85 mb-4">{t('iptv.newPlaylist')}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.playlistName')}</label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Мой плейлист"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.playlistUrl')}</label>
                <input
                  type="text"
                  value={newPlaylistUrl}
                  onChange={(e) => setNewPlaylistUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u8"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/50 mb-2">{t('iptv.epgUrl')}</label>
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
                {t('common.add')}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-full bg-white/5 text-white/60 py-2.5 px-6 text-[13px] font-medium border border-white/10 hover:bg-white/10 transition-cinematic"
              >
                {t('common.cancel')}
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
                ? t('iptv.addPlaylist')
                : t('iptv.addPlaylist')}
            </p>
          </div>
        )}

        {/* Now Playing preview + Channel list */}
        {!loading && channels.length > 0 && (
          <>
            {/* Now Playing preview (if channel selected) */}
            {selectedChannel && (
              <>
              <div className="mb-6 animate-detail-rise">
                <div className="glass-panel overflow-hidden rounded-[20px]">
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
                </div>
              </div>

              {/* Program schedule */}
              <div className="mb-8 animate-detail-rise" style={{ animationDelay: '100ms' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[14px] font-medium text-white/70">{t('iptv.program')} · {selectedChannel.name}</h3>
                  <span className="text-[11px] text-white/30">{getPrograms(selectedChannel).length} {t('iptv.channels')}</span>
                </div>
                {(() => {
                  const progs = getPrograms(selectedChannel);
                  console.log('[IPTV] Rendering programs:', progs.length);
                  return (
                    <div className="glass-panel rounded-[16px] p-4 max-h-[300px] overflow-y-auto">
                      {progs.length === 0 ? (
                        <div className="text-[12px] text-white/30 text-center py-4">{t('iptv.noProgram')}</div>
                      ) : (
                        progs.map((program, idx) => (
                          <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 ${idx === 0 ? 'bg-amber-300/10' : 'hover:bg-white/[0.03]'}`}>
                            <span className="text-[11px] text-white/40 w-24 shrink-0">{program.startTime} — {program.stopTime}</span>
                            <span className={`text-[12px] ${idx === 0 ? 'font-medium text-white/90' : 'text-white/55'}`}>{program.title}</span>
                            {idx === 0 && <span className="text-[10px] text-amber-300/70 font-medium ml-auto">{t('common.now')}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
              </>
            )}

            {/* Search */}
            <div className="mb-6 animate-row-reveal">
              <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('iptv.searchChannels')}
                  className="w-full rounded-full bg-white/5 border border-white/10 pl-11 pr-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
            </div>

            {/* Channel group filters */}
            <div className="mb-6 no-scrollbar flex gap-2 overflow-x-auto animate-row-reveal">
              {/* Favorites first */}
              <button
                onClick={() => { setShowFavorites(!showFavorites); setSelectedGroup('All'); }}
                className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic flex items-center gap-1.5"
                style={{
                  background: showFavorites ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                  color: showFavorites ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                  border: showFavorites ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Star className={`h-3.5 w-3.5 ${showFavorites ? 'fill-amber-300' : ''}`} />
                {t('iptv.favorites')} {favorites.size > 0 && `(${favorites.size})`}
              </button>
              {/* Then other groups */}
              {groups.filter(g => g !== 'Favorites').map((g) => {
                const count = g === 'All' ? channels.length : channels.filter(c => c.group === g).length;
                return (
                  <button
                    key={g}
                    onClick={() => { setSelectedGroup(g); setShowFavorites(false); }}
                    className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic flex items-center gap-1.5"
                    style={{
                      background: !showFavorites && selectedGroup === g ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                      color: !showFavorites && selectedGroup === g ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                      border: !showFavorites && selectedGroup === g ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span>{g === 'All' ? 'Все' : g}</span>
                    <span className="text-[11px] opacity-50">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* EPG Grid - Full TV Guide */}
            <div className="glass-panel overflow-hidden rounded-[20px] animate-detail-rise" style={{ animationDelay: '100ms' }}>
              <div className="overflow-x-auto">
                {/* Time header */}
                <div className="flex items-center border-b border-white/[0.06] min-w-[1100px]">
                  <div className="w-64 shrink-0 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{t('iptv.title')}</div>
                  <div className="flex flex-1">
                    {timeSlots.map((time) => (
                      <div key={time} className="flex-1 px-2 py-3 text-center text-[11px] font-medium text-white/40">{time}</div>
                    ))}
                  </div>
                </div>

                {/* Channels */}
                {filteredChannels.map((ch, idx) => {
                  const isFavorite = favorites.has(ch.id);
                  const programs = getPrograms(ch);

                  return (
                    <div
                      key={ch.id}
                      onClick={() => playChannel(ch)}
                      className={`flex items-center min-w-[1100px] transition-cinematic hover:bg-white/[0.03] cursor-pointer ${selectedChannel?.id === ch.id ? 'bg-white/[0.04]' : ''} ${idx !== filteredChannels.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                    >
                      {/* Channel info */}
                      <div className="w-64 shrink-0 flex items-center gap-3 px-4 py-3">
                        <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white/5 shrink-0">
                          {getChannelLogo(ch) ? (
                            <img
                              src={getChannelLogo(ch)}
                              alt={ch.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br border font-semibold text-[11px] tracking-wider ${getChannelColor(ch.name)}`}>
                              {getChannelMonogram(ch.name)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-white/90">{ch.name}</span>
                            {/\b4k\b/i.test(ch.name) && (
                              <span className="shrink-0 rounded-[4px] bg-amber-400/20 px-1 py-0.5 text-[9px] font-bold text-amber-300">4K</span>
                            )}
                            {/\b(fhd|1080)\b/i.test(ch.name) && (
                              <span className="shrink-0 rounded-[4px] bg-blue-400/20 px-1 py-0.5 text-[9px] font-bold text-blue-300">FHD</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(ch.id); }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
                          aria-label="Favorite"
                        >
                          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-300 text-amber-300' : 'text-white/20 hover:text-white/50'}`} strokeWidth={1.5} />
                        </button>
                      </div>

                      {/* Program slots */}
                      <div className="flex flex-1 gap-px">
                        {timeSlots.map((slotTime, slotIdx) => {
                          // Find program that airs at this time slot
                          const slotProgram = programs.find(p => p.startTime <= slotTime && p.stopTime > slotTime);
                          const nextSlotTime = timeSlots[slotIdx + 1] || '24:00';
                          // Check if program spans multiple slots
                          const isCurrentSlot = slotProgram && slotIdx === 0;

                          return (
                            <div
                              key={slotTime}
                              className={`flex-1 px-2 py-2.5 min-h-[52px] ${
                                isCurrentSlot
                                  ? 'bg-amber-300/[0.06]'
                                  : slotIdx % 2 === 0 ? 'bg-white/[0.01]' : ''
                              }`}
                            >
                              {slotProgram ? (
                                <div className={`text-[11px] leading-tight ${isCurrentSlot ? 'text-white/90 font-medium' : 'text-white/50'}`}>
                                  <div className="truncate">{slotProgram.title}</div>
                                  <div className="text-[9px] text-white/30 mt-0.5">{slotProgram.startTime}</div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-white/15">—</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty favorites */}
              {showFavorites && filteredChannels.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Star className="h-8 w-8 text-white/20 mx-auto mb-3" />
                  <p className="text-[13px] text-white/40">{t('iptv.noFavorites')}</p>
                  <p className="text-[12px] text-white/30 mt-1">{t('iptv.addToFavorites')}</p>
                </div>
              )}
            </div>

            {/* Channel count */}
            <div className="mt-6 text-center text-[12px] text-white/30">
              {showFavorites
                ? `${filteredChannels.length} ${t('iptv.favorites')}`
                : `${filteredChannels.length} ${t('common.search')} ${channels.length} ${t('iptv.channels')}`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
