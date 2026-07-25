export interface SearchOptions {
  year?: number;
  type?: 'movie' | 'series';
}

export interface SearchResult {
  id: string;
  title: string;
  year: number;
  poster: string;
  type: 'movie' | 'series';
  provider: string;
}

export interface StreamResult {
  url: string;
  quality: string;
  type: 'hls' | 'mp4' | 'dash';
  headers?: Record<string, string>;
}

export interface EpisodeResult {
  id: string;
  season: number;
  episode: number;
  title: string;
  streams: StreamResult[];
}

export interface ContentProvider {
  name: string;
  displayName: string;
  enabled: boolean;

  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  stream(id: string): Promise<StreamResult[]>;
  episodes?(id: string): Promise<EpisodeResult[]>;
}
