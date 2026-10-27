import type { Title, TitleResult } from './types.js';

export interface KinopoiskSearchFilm {
  filmId: number;
  nameRu?: string;
  nameEn?: string;
  type?: string;
  year?: string;
  description?: string;
  filmLength?: string;
  countries?: Array<{ country: string }>;
  genres?: Array<{ genre: string }>;
  rating?: string;
  ratingVoteCount?: number;
  posterUrl?: string;
  posterUrlPreview?: string;
}

export interface KinopoiskV22Film {
  kinopoiskId: number;
  imdbId?: string;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  countries?: Array<{ country: string }>;
  genres?: Array<{ genre: string }>;
  ratingKinopoisk?: number;
  ratingImdb?: number;
  year?: number;
  type?: string;
  posterUrl?: string;
  posterUrlPreview?: string;
}

export interface KinopoiskFilmDetails {
  kinopoiskId: number;
  nameRu?: string;
  nameEn?: string;
  nameOriginal?: string;
  posterUrl?: string;
  posterUrlPreview?: string;
  coverUrl?: string;
  logoUrl?: string;
  reviewsCount?: number;
  ratingGoodReview?: number;
  ratingKinopoisk?: number;
  ratingImdb?: number;
  year?: number;
  filmLength?: number;
  slogan?: string;
  description?: string;
  shortDescription?: string;
  type?: string;
  ratingMpaa?: string;
  ratingAgeLimits?: string;
  countries?: Array<{ country: string }>;
  genres?: Array<{ genre: string }>;
  startYear?: number;
  endYear?: number;
  serial?: boolean;
  shortFilm?: boolean;
  completed?: boolean;
}

export class KinopoiskProvider {
  private token: string;
  private baseUrl = 'https://kinopoiskapiunofficial.tech';
  private cache = new Map<string, { data: any; expires: number }>();

  constructor(token: string) {
    this.token = token.trim();
  }

  updateToken(token: string) {
    this.token = token.trim();
  }

  private async fetchApi<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    if (!this.token) return null;
    const cacheKey = `${endpoint}?${new URLSearchParams(params).toString()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-API-KEY': this.token,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        console.warn(`[Kinopoisk] HTTP ${res.status} for ${endpoint}`);
        return null;
      }

      const json = (await res.json()) as T;
      // Cache responses for 10 minutes
      this.cache.set(cacheKey, { data: json, expires: Date.now() + 10 * 60 * 1000 });
      return json;
    } catch (e: any) {
      console.warn(`[Kinopoisk] fetch error for ${endpoint}:`, e?.message || e);
      return null;
    }
  }

  private mapType(rawType?: string): 'movie' | 'tv' {
    if (!rawType) return 'movie';
    const upper = rawType.toUpperCase();
    if (upper === 'TV_SERIES' || upper === 'MINI_SERIES' || upper === 'TV_SHOW') {
      return 'tv';
    }
    return 'movie';
  }

  private proxyImage(url?: string): string {
    if (!url || url.includes('no-poster.png')) return '';
    return `/api/image?url=${encodeURIComponent(url)}`;
  }

  mapV22Film(film: KinopoiskV22Film): Title {
    const isTv = this.mapType(film.type) === 'tv';
    const parsedYear = film.year || 0;
    const score = film.ratingKinopoisk || film.ratingImdb || 0;
    const poster = this.proxyImage(film.posterUrlPreview || film.posterUrl);

    return {
      id: film.kinopoiskId,
      tmdbId: 0,
      source: 'kp',
      kpId: film.kinopoiskId,
      name: film.nameRu || film.nameOriginal || film.nameEn || '',
      originalTitle: film.nameOriginal || film.nameEn || '',
      type: isTv ? 'tv' : 'movie',
      year: parsedYear,
      runtime: '—',
      rating: '',
      score: score > 0 ? parseFloat(score.toFixed(1)) : 0,
      genres: (film.genres || []).map((g) => g.genre).filter(Boolean),
      description: '',
      backdrop: poster,
      poster: poster,
      logoText: film.nameRu || film.nameOriginal || film.nameEn || '',
    };
  }

  mapSearchFilm(film: KinopoiskSearchFilm): Title {
    const isTv = this.mapType(film.type) === 'tv';
    const parsedYear = parseInt(film.year || '0', 10) || 0;
    const score = parseFloat(film.rating || '0') || 0;
    const poster = this.proxyImage(film.posterUrlPreview || film.posterUrl);

    return {
      id: film.filmId,
      tmdbId: 0,
      source: 'kp',
      kpId: film.filmId,
      name: film.nameRu || film.nameEn || '',
      originalTitle: film.nameEn || '',
      type: isTv ? 'tv' : 'movie',
      year: parsedYear,
      runtime: film.filmLength || '—',
      rating: '',
      score: score > 0 ? parseFloat(score.toFixed(1)) : 0,
      genres: (film.genres || []).map((g) => g.genre).filter(Boolean),
      description: film.description || '',
      backdrop: poster,
      poster: poster,
      logoText: film.nameRu || film.nameEn || '',
    };
  }

  async search(query: string, page = 1): Promise<TitleResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    }

    // 1. Primary: Use v2.2/films which searches specifically by title keyword
    const data = await this.fetchApi<{
      total?: number;
      totalPages?: number;
      items?: KinopoiskV22Film[];
    }>('/api/v2.2/films', {
      keyword: trimmed,
      page: String(page),
    });

    if (data && Array.isArray(data.items) && data.items.length > 0) {
      const results = data.items.map((f) => this.mapV22Film(f));

      // Sort by relevance to title query
      const qLower = trimmed.toLowerCase();
      results.sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const aExact = aName === qLower ? 1 : 0;
        const bExact = bName === qLower ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        const aStarts = aName.startsWith(qLower) ? 1 : 0;
        const bStarts = bName.startsWith(qLower) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;

        const aIncludes = aName.includes(qLower) ? 1 : 0;
        const bIncludes = bName.includes(qLower) ? 1 : 0;
        if (aIncludes !== bIncludes) return bIncludes - aIncludes;

        return (b.score || 0) - (a.score || 0);
      });

      return {
        results,
        page,
        totalPages: data.totalPages || 1,
        totalResults: data.total || results.length,
      };
    }

    // 2. Fallback to v2.1 if v2.2 returned nothing, but strictly filter by title matching
    // (Prevents unrelated movies like "Вверх" where keyword only appears in plot description)
    const v21Data = await this.fetchApi<{
      pagesCount?: number;
      searchFilmsCountResult?: number;
      films?: KinopoiskSearchFilm[];
    }>('/api/v2.1/films/search-by-keyword', {
      keyword: trimmed,
      page: String(page),
    });

    if (!v21Data || !Array.isArray(v21Data.films)) {
      return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    }

    const qLower = trimmed.toLowerCase();
    const matchedFilms = v21Data.films.filter((f) => {
      const ru = (f.nameRu || '').toLowerCase();
      const en = (f.nameEn || '').toLowerCase();
      return ru.includes(qLower) || en.includes(qLower);
    });

    const results = matchedFilms.map((f) => this.mapSearchFilm(f));
    return {
      results,
      page,
      totalPages: 1,
      totalResults: results.length,
    };
  }

  async details(id: number): Promise<Title | null> {
    const [film, seasonsData] = await Promise.all([
      this.fetchApi<KinopoiskFilmDetails>(`/api/v2.2/films/${id}`),
      this.fetchApi<{ total?: number; items?: Array<{ number: number; episodes: Array<any> }> }>(
        `/api/v2.2/films/${id}/seasons`
      ),
    ]);

    if (!film) return null;

    const isTv = film.serial || this.mapType(film.type) === 'tv';
    const score = film.ratingKinopoisk || film.ratingImdb || 0;
    const poster = this.proxyImage(film.posterUrl || film.posterUrlPreview);
    const backdrop = this.proxyImage(film.coverUrl || film.posterUrl);

    const title: Title = {
      id: film.kinopoiskId,
      tmdbId: 0,
      source: 'kp',
      kpId: film.kinopoiskId,
      name: film.nameRu || film.nameEn || film.nameOriginal || '',
      originalTitle: film.nameOriginal || film.nameEn || '',
      type: isTv ? 'tv' : 'movie',
      year: film.year || film.startYear || 0,
      runtime: film.filmLength ? `${film.filmLength}m` : '—',
      rating: film.ratingAgeLimits ? `${film.ratingAgeLimits.replace('age', '')}+` : '',
      score: score > 0 ? parseFloat(score.toFixed(1)) : 0,
      genres: (film.genres || []).map((g) => g.genre).filter(Boolean),
      description: film.description || film.shortDescription || '',
      backdrop: backdrop || poster,
      poster: poster,
      logoText: film.nameRu || film.nameEn || '',
      countries: (film.countries || []).map((c) => c.country).filter(Boolean),
      tagline: film.slogan || '',
    };

    if (isTv && seasonsData && Array.isArray(seasonsData.items)) {
      title.seasonsCount = seasonsData.items.length;
      title.seasons = seasonsData.items.map((s) => ({
        season_number: s.number,
        name: `${s.number} сезон`,
        episode_count: Array.isArray(s.episodes) ? s.episodes.length : 0,
      }));
    }

    return title;
  }

  async seasonEpisodes(id: number, seasonNumber: number): Promise<any[]> {
    const data = await this.fetchApi<{
      total?: number;
      items?: Array<{ number: number; episodes: Array<any> }>;
    }>(`/api/v2.2/films/${id}/seasons`);

    if (!data || !Array.isArray(data.items)) return [];
    const season = data.items.find((s) => s.number === seasonNumber);
    if (!season || !Array.isArray(season.episodes)) return [];

    return season.episodes.map((ep: any) => ({
      id: `${id}_s${seasonNumber}_e${ep.episodeNumber}`,
      name: ep.nameRu || ep.nameEn || `Серия ${ep.episodeNumber}`,
      title: ep.nameRu || ep.nameEn || `Серия ${ep.episodeNumber}`,
      episode: ep.episodeNumber,
      episode_number: ep.episodeNumber,
      season: seasonNumber,
      season_number: seasonNumber,
      synopsis: ep.synopsis || '',
      aired: ep.releaseDate || '—',
      runtime: '',
      thumbnail: '',
    }));
  }
}
