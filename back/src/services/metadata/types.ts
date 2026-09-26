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
  originalTitle?: string;
  countries?: string[];
  releaseDate?: string;
  tagline?: string;
  productionCompanies?: string[];
  cast?: { id?: number; name: string; role: string; image: string }[];
  related?: number[];
  seasonsCount?: number;
}

export interface PersonCredit {
  id: number;
  title: string;
  type: 'movie' | 'tv';
  poster: string;
  backdrop: string;
  year: number;
  score: number;
  character?: string;
  job?: string;
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  profile: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownForDepartment?: string;
  credits: PersonCredit[];
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
  isAired?: boolean;
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
  person?(id: number, lang?: Lang): Promise<PersonDetails>;
}
