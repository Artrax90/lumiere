export type Lang = 'ru' | 'en';

export interface Title {
  id: number;
  tmdbId: number;
  name: string;
  type: 'movie' | 'tv' | 'anime';
  year: number;
  runtime: string;
  rating: string;
  score: number;
  genres: string[];
  description: string;
  backdrop: string;
  poster: string;
  logoText: string;
  mood?: 'warm' | 'cool' | 'neutral' | 'tension' | 'playful' | 'organic';
  badges?: string[];
  director?: string;
  cast?: { name: string; role: string; image: string }[];
  related?: number[];
  progress?: number;
  videoUrl?: string;
  episode?: string;
  channel?: string;
  liveNow?: boolean;
  startsAt?: string;
}

export interface Episode {
  id: string;
  seriesId: number;
  season: number;
  episode: number;
  title: string;
  synopsis: string;
  runtime: string;
  thumbnail: string;
  aired: string;
  progress?: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface TitleResult {
  results: Title[];
  page: number;
  totalPages: number;
  totalResults: number;
}

let currentLang: Lang = 'ru';

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('lang', currentLang);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {};
  const token = localStorage.getItem('lumiere_access');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function apiPost<T>(path: string, body: Record<string, any>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('lumiere_access');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('lumiere_access');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}
