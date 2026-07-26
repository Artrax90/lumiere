// Sync API client for cross-device synchronization

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

interface SyncData {
  watchHistory: WatchHistoryItem[];
  favorites: FavoriteItem[];
  syncedAt: string;
}

class SyncClient {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pendingChanges: {
    watchHistory: WatchHistoryItem[];
    favorites: FavoriteItem[];
  } = { watchHistory: [], favorites: [] };

  // Start periodic sync
  start(intervalMs: number = 30000) {
    if (this.syncInterval) return;

    // Initial sync
    this.pull();

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.push();
      this.pull();
    }, intervalMs);
  }

  // Stop periodic sync
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Pull sync data from server
  async pull(): Promise<SyncData | null> {
    const token = localStorage.getItem('lumiere_access');
    if (!token) return null;

    try {
      const res = await fetch('/api/sync', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) return null;

      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }

  // Push local changes to server
  async push(): Promise<boolean> {
    const token = localStorage.getItem('lumiere_access');
    if (!token) return false;

    // Get local data
    const localHistory = this.getLocalWatchHistory();
    const localFavorites = this.getLocalFavorites();

    if (localHistory.length === 0 && localFavorites.length === 0) return true;

    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          watchHistory: localHistory,
          favorites: localFavorites,
        }),
      });

      if (res.ok) {
        // Clear pending changes after successful push
        this.pendingChanges = { watchHistory: [], favorites: [] };
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Save watch progress (local + queue for sync)
  saveWatchProgress(item: WatchHistoryItem) {
    // Save to localStorage
    const positions = this.getLocalWatchHistory();
    const existingIndex = positions.findIndex(p => p.tmdbId === item.tmdbId && p.mediaType === item.mediaType);

    if (existingIndex >= 0) {
      // Update existing entry (keep higher progress)
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

    // Queue for sync
    this.pendingChanges.watchHistory.push(item);
  }

  // Add favorite (local + queue for sync)
  addFavorite(item: FavoriteItem) {
    const favorites = this.getLocalFavorites();
    const existingIndex = favorites.findIndex(f => f.tmdbId === item.tmdbId && f.mediaType === item.mediaType);

    if (existingIndex < 0) {
      favorites.push(item);
      localStorage.setItem('lumiere_favorites', JSON.stringify(favorites));
      this.pendingChanges.favorites.push(item);
    }
  }

  // Remove favorite (local)
  removeFavorite(tmdbId: number, mediaType: string) {
    const favorites = this.getLocalFavorites();
    const filtered = favorites.filter(f => !(f.tmdbId === tmdbId && f.mediaType === mediaType));
    localStorage.setItem('lumiere_favorites', JSON.stringify(filtered));
  }

  // Get local watch history
  getLocalWatchHistory(): WatchHistoryItem[] {
    try {
      const data = localStorage.getItem('lumiere_watch_history');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Get local favorites
  getLocalFavorites(): FavoriteItem[] {
    try {
      const data = localStorage.getItem('lumiere_favorites');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Merge server data with local data
  async mergeWithServer(): Promise<void> {
    const serverData = await this.pull();
    if (!serverData) return;

    // Merge watch history (keep highest progress)
    const localHistory = this.getLocalWatchHistory();
    const mergedHistory = new Map<string, WatchHistoryItem>();

    // Add local items
    for (const item of localHistory) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      mergedHistory.set(key, item);
    }

    // Merge server items (keep higher progress)
    for (const item of serverData.watchHistory) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      const existing = mergedHistory.get(key);

      if (!existing || (item.progress || 0) > (existing.progress || 0)) {
        mergedHistory.set(key, item);
      }
    }

    localStorage.setItem('lumiere_watch_history', JSON.stringify(Array.from(mergedHistory.values())));

    // Merge favorites
    const localFavorites = this.getLocalFavorites();
    const mergedFavorites = new Map<string, FavoriteItem>();

    for (const item of localFavorites) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      mergedFavorites.set(key, item);
    }

    for (const item of serverData.favorites) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      mergedFavorites.set(key, item);
    }

    localStorage.setItem('lumiere_favorites', JSON.stringify(Array.from(mergedFavorites.values())));
  }
}

export const syncClient = new SyncClient();
