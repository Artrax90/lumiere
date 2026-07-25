import type { Lang } from '../tmdb-client.js';

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
  director?: string;
  cast?: { name: string; role: string; image: string }[];
  related?: number[];
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

export interface MetadataProvider {
  name: string;
  trending(mediaType: 'movie' | 'tv', timeWindow: 'day' | 'week', lang?: Lang): Promise<Title[]>;
  popular(mediaType: 'movie' | 'tv', page?: number, lang?: Lang): Promise<TitleResult>;
  search(query: string, page?: number, lang?: Lang): Promise<TitleResult>;
  details(id: number, mediaType: 'movie' | 'tv', lang?: Lang): Promise<Title>;
  similar(id: number, mediaType: 'movie' | 'tv', lang?: Lang): Promise<Title[]>;
  seasonDetails(tvId: number, seasonNumber: number, lang?: Lang): Promise<Episode[]>;
  genres(mediaType: 'movie' | 'tv', lang?: Lang): Promise<Genre[]>;
}
