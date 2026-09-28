// Sync API client for cross-device synchronization

import { serverFetch, getServerUrl } from './server';

interface WatchHistoryItem {
  tmdbId: number;
  mediaType: string;
  titleName: string;
  poster?: string;
  progress?: number;
  timestamp?: number;
}

interface FavoriteItem {
  tmdbId: number;
  mediaType: string;
  titleName: string;
  poster?: string;
}

export interface IPTVPlaylist {
  name: string;
  url: string;
  epgUrl?: string;
}

interface SyncData {
  watchHistory: WatchHistoryItem[];
  favorites: FavoriteItem[];
  iptvPlaylists: IPTVPlaylist[];
  syncedAt: string;
}

const IPTV_STORAGE_KEY = 'lumiere_iptv';

class SyncClient {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pendingChanges: {
    watchHistory: WatchHistoryItem[];
    favorites: FavoriteItem[];
  } = { watchHistory: [], favorites: [] };
  private authFailed = false;
  private refreshAttempts = 0;
  private serverWasEmpty = false;

  start(intervalMs: number = 30000) {
    if (this.syncInterval) return;
    this.authFailed = false;
    this.refreshAttempts = 0;
    this.serverWasEmpty = false;

    // Initial merge with server
    this.mergeWithServer().then(() => {
      this.push().catch(() => {});
    }).catch(() => {});

    this.syncInterval = setInterval(() => {
      if (this.authFailed) {
        if (this.refreshAttempts >= 3) {
          this.stop();
          return;
        }
        this.refreshAttempts++;
        this.tryRefresh();
        return;
      }
      this.push().catch(() => {});
      this.mergeWithServer().catch(() => {});
    }, intervalMs);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async tryRefresh() {
    const refreshToken = localStorage.getItem('lumiere_refresh');
    if (refreshToken) {
      try {
        const base = getServerUrl();
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('lumiere_access', data.accessToken);
          localStorage.setItem('lumiere_refresh', data.refreshToken);
          this.authFailed = false;
          this.refreshAttempts = 0;
          return;
        }
      } catch {}
    }

    try {
      const base = getServerUrl();
      const lanRes = await fetch(`${base}/api/auth/lan-login`, { method: 'POST' });
      if (lanRes.ok) {
        const data = await lanRes.json();
        localStorage.setItem('lumiere_access', data.accessToken);
        localStorage.setItem('lumiere_refresh', data.refreshToken);
        this.authFailed = false;
        this.refreshAttempts = 0;
        return;
      }
    } catch {}
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('lumiere_access');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private handleAuthError(res: Response): boolean {
    if (res.status === 401) {
      this.authFailed = true;
      return true;
    }
    return false;
  }

  async pull(): Promise<SyncData | null> {
    try {
      const res = await serverFetch('/api/sync', {
        headers: this.getAuthHeaders(),
      });
      if (this.handleAuthError(res)) return null;
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }

  async push(): Promise<boolean> {
    const localHistory = this.getLocalWatchHistory();
    const localFavorites = this.getLocalFavorites();
    const localIptv = this.getLocalIptvPlaylists();

    if (localHistory.length === 0 && localFavorites.length === 0 && localIptv.length === 0) return true;

    try {
      const res = await serverFetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({
          watchHistory: localHistory,
          favorites: localFavorites,
          iptvPlaylists: localIptv,
        }),
      });

      if (res.ok) {
        this.pendingChanges = { watchHistory: [], favorites: [] };
        return true;
      }
      this.handleAuthError(res);
      return false;
    } catch {
      return false;
    }
  }

  saveWatchProgress(item: WatchHistoryItem) {
    const positions = this.getLocalWatchHistory();
    const existingIndex = positions.findIndex(p => p.tmdbId === item.tmdbId && p.mediaType === item.mediaType);

    if (existingIndex >= 0) {
      positions[existingIndex] = {
        ...positions[existingIndex],
        progress: Math.max(positions[existingIndex].progress || 0, item.progress || 0),
        timestamp: Math.max(positions[existingIndex].timestamp || 0, item.timestamp || 0),
        titleName: item.titleName || positions[existingIndex].titleName,
        poster: item.poster || positions[existingIndex].poster,
      };
    } else {
      positions.push(item);
    }

    localStorage.setItem('lumiere_watch_history', JSON.stringify(positions));

    // Also ensure playback_positions has this entry
    try {
      const pos = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      pos[item.tmdbId] = {
        time: item.progress || 0,
        timestamp: item.timestamp || Date.now(),
        title: {
          id: item.tmdbId,
          name: item.titleName || '',
          poster: item.poster || '',
          type: item.mediaType || 'movie',
        },
      };
      localStorage.setItem('playback_positions', JSON.stringify(pos));
      window.dispatchEvent(new CustomEvent('playback-positions-synced'));
    } catch {}

    this.pendingChanges.watchHistory.push(item);
  }

  addFavorite(item: FavoriteItem) {
    const favorites = this.getLocalFavorites();
    const existingIndex = favorites.findIndex(f => f.tmdbId === item.tmdbId && f.mediaType === item.mediaType);

    if (existingIndex < 0) {
      favorites.push(item);
      localStorage.setItem('lumiere_favorites', JSON.stringify(favorites));
      this.pendingChanges.favorites.push(item);
    }
  }

  removeFavorite(tmdbId: number, mediaType: string) {
    const favorites = this.getLocalFavorites();
    const filtered = favorites.filter(f => !(f.tmdbId === tmdbId && f.mediaType === mediaType));
    localStorage.setItem('lumiere_favorites', JSON.stringify(filtered));
  }

  getLocalWatchHistory(): WatchHistoryItem[] {
    const list: WatchHistoryItem[] = [];
    const seen = new Set<string>();

    try {
      const data = localStorage.getItem('lumiere_watch_history');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.tmdbId) {
              const k = `${item.tmdbId}-${item.mediaType || 'movie'}`;
              seen.add(k);
              list.push(item);
            }
          }
        }
      }
    } catch {}

    try {
      const posRaw = localStorage.getItem('playback_positions');
      if (posRaw) {
        const pos = JSON.parse(posRaw);
        for (const [idStr, val] of Object.entries(pos)) {
          const id = Number(idStr);
          if (!id || isNaN(id) || id <= 0) continue;
          const time = typeof val === 'object' ? (val as any).time : (val as number);
          if (!time || time < 2) continue;
          const titleObj = typeof val === 'object' ? (val as any).title : null;
          const mediaType = (titleObj && titleObj.type) || 'movie';
          const k = `${id}-${mediaType}`;
          if (!seen.has(k)) {
            seen.add(k);
            list.push({
              tmdbId: id,
              mediaType: mediaType,
              titleName: (titleObj && titleObj.name) || '',
              poster: (titleObj && titleObj.poster) || '',
              progress: Math.floor(time),
              timestamp: (typeof val === 'object' && (val as any).timestamp) || Date.now(),
            });
          }
        }
      }
    } catch {}

    return list;
  }

  getLocalFavorites(): FavoriteItem[] {
    try {
      const data = localStorage.getItem('lumiere_favorites');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  getLocalIptvPlaylists(): IPTVPlaylist[] {
    try {
      const data = localStorage.getItem(IPTV_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const defaultPlaylists: IPTVPlaylist[] = [
      { name: 'Основной', url: 'https://loganettv.github.io/playlists/all.m3u', epgUrl: '' }
    ];
    this.saveLocalIptvPlaylists(defaultPlaylists);
    return defaultPlaylists;
  }

  saveLocalIptvPlaylists(playlists: IPTVPlaylist[]) {
    localStorage.setItem(IPTV_STORAGE_KEY, JSON.stringify(playlists));
  }

  async mergeWithServer(): Promise<void> {
    const serverData = await this.pull();
    if (!serverData) return;

    // Merge watch history
    const localHistory = this.getLocalWatchHistory();
    const mergedHistory = new Map<string, WatchHistoryItem>();
    for (const item of localHistory) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      mergedHistory.set(key, item);
    }
    for (const item of serverData.watchHistory || []) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      const existing = mergedHistory.get(key);
      if (!existing || (item.progress || 0) > (existing.progress || 0) || (item.timestamp || 0) > (existing.timestamp || 0)) {
        mergedHistory.set(key, item);
      }
    }
    if (mergedHistory.size > 0) {
      localStorage.setItem('lumiere_watch_history', JSON.stringify(Array.from(mergedHistory.values())));
    }

    // Crucial: Also merge server watch history into playback_positions for Home & UI components
    try {
      const rawPositions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      let changed = false;
      for (const item of serverData.watchHistory || []) {
        const id = item.tmdbId;
        if (!id) continue;
        const serverTime = item.timestamp || new Date((item as any).updatedAt || 0).getTime() || Date.now();
        const local = rawPositions[id];
        const localTime = typeof local === 'object' ? (local.timestamp || 0) : 0;
        if (!local || serverTime >= localTime) {
          rawPositions[id] = {
            time: item.progress || 0,
            timestamp: serverTime,
            title: {
              id: id,
              name: item.titleName || (typeof local === 'object' && local.title?.name) || '',
              poster: item.poster || (typeof local === 'object' && local.title?.poster) || '',
              type: item.mediaType || 'movie',
            },
          };
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem('playback_positions', JSON.stringify(rawPositions));
        window.dispatchEvent(new CustomEvent('playback-positions-synced'));
      }
    } catch (e) {
      console.error('[Sync] Error merging into playback_positions:', e);
    }

    // Merge favorites
    const localFavorites = this.getLocalFavorites();
    const mergedFavorites = new Map<string, FavoriteItem>();
    for (const item of localFavorites) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      mergedFavorites.set(key, item);
    }
    for (const item of serverData.favorites || []) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      const existing = mergedFavorites.get(key);
      if (!existing) {
        mergedFavorites.set(key, item);
      }
    }
    if (mergedFavorites.size > 0) {
      localStorage.setItem('lumiere_favorites', JSON.stringify(Array.from(mergedFavorites.values())));
    }

    // Merge IPTV playlists
    const localIptv = this.getLocalIptvPlaylists();
    const mergedIptv = new Map<string, IPTVPlaylist>();
    for (const item of localIptv) {
      mergedIptv.set(item.url, item);
    }
    for (const item of serverData.iptvPlaylists || []) {
      mergedIptv.set(item.url, item);
    }
    if (mergedIptv.size === 0) {
      mergedIptv.set('https://loganettv.github.io/playlists/all.m3u', {
        name: 'Основной',
        url: 'https://loganettv.github.io/playlists/all.m3u',
        epgUrl: '',
      });
    }
    this.saveLocalIptvPlaylists(Array.from(mergedIptv.values()));
  }
}

export const syncClient = new SyncClient();
