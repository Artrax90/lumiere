import { serverFetch } from '@/api/server';

export interface HomeShelfConfig {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const DEFAULT_SHELVES: HomeShelfConfig[] = [
  { id: 'continueWatching', label: 'Продолжить просмотр', description: 'Фильмы и сериалы с прогресс-баром воспроизведения', enabled: true },
  { id: 'top10Movies', label: 'Топ-10 фильмов сегодня', description: 'Полка в стиле Netflix с гигантскими цифрами 1–10', enabled: true },
  { id: 'nowPlaying', label: 'Новинки в кино и цифровые релизы', description: 'Свежие премьеры текущего кинопроката', enabled: true },
  { id: 'top10Tv', label: 'Топ-10 сериалов недели', description: 'Полка топовых сериалов недели с крупными номерами 1–10', enabled: true },
  { id: 'topRated', label: 'Шедевры мирового кино (Высокий рейтинг)', description: 'Фильмы с высочайшим рейтингом и золотым свечением', enabled: true },
  { id: 'action', label: 'Боевики и приключения', description: 'Динамичный экшн, блокбастеры и адреналин', enabled: true },
  { id: 'banner', label: 'Тематическая подборка (Баннер)', description: 'Широкий кинематографичный баннер коллекции', enabled: true },
  { id: 'comedy', label: 'Комедии для отличного настроения', description: 'Легкие и остроумные комедии для приятного вечера', enabled: true },
  { id: 'scifi', label: 'Фантастика и другие миры', description: 'Космос, киберпанк, магия и альтернативные вселенные', enabled: true },
  { id: 'family', label: 'Семейный вечер и анимация', description: 'Шедевры мультипликации и доброе кино для всей семьи', enabled: true },
];

export function getHomeShelves(): HomeShelfConfig[] {
  try {
    const raw = localStorage.getItem('lumiere_home_shelves');
    if (!raw) return DEFAULT_SHELVES;
    const parsed: HomeShelfConfig[] = JSON.parse(raw);
    const existingIds = new Set(parsed.map((s) => s.id));
    const merged = [...parsed];
    for (const def of DEFAULT_SHELVES) {
      if (!existingIds.has(def.id)) {
        merged.push(def);
      }
    }
    return merged;
  } catch {
    return DEFAULT_SHELVES;
  }
}

export async function syncHomeShelvesFromServer(): Promise<HomeShelfConfig[]> {
  try {
    const token = localStorage.getItem('lumiere_access');
    if (!token) return getHomeShelves();

    const res = await serverFetch('/api/user/preferences', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.preferences && Array.isArray(data.preferences.homeShelves) && data.preferences.homeShelves.length > 0) {
        const remoteShelves = data.preferences.homeShelves as HomeShelfConfig[];
        const existingIds = new Set(remoteShelves.map((s) => s.id));
        const merged = [...remoteShelves];
        for (const def of DEFAULT_SHELVES) {
          if (!existingIds.has(def.id)) {
            merged.push(def);
          }
        }
        localStorage.setItem('lumiere_home_shelves', JSON.stringify(merged));
        window.dispatchEvent(new Event('home-shelves-changed'));
        return merged;
      }
    }
  } catch (e) {
    console.warn('[HomeShelves] Error syncing from server:', e);
  }
  return getHomeShelves();
}

export function saveHomeShelves(shelves: HomeShelfConfig[]) {
  try {
    localStorage.setItem('lumiere_home_shelves', JSON.stringify(shelves));
    window.dispatchEvent(new Event('home-shelves-changed'));

    const token = localStorage.getItem('lumiere_access');
    if (token) {
      serverFetch('/api/user/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ preferences: { homeShelves: shelves } })
      }).catch((e) => {
        console.warn('[HomeShelves] Failed to sync shelves to server:', e);
      });
    }
  } catch {}
}
