import { TmdbClient, type Lang } from '../tmdb-client.js';
import type {
  MetadataProvider,
  Title,
  TitleResult,
  Episode,
  Genre,
} from './types.js';

interface TmdbTitle {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  overview: string;
  backdrop_path: string | null;
  poster_path: string | null;
  media_type?: string;
}

interface TmdbDetails extends TmdbTitle {
  production_companies?: { id: number; name: string }[];
  created_by?: { id: number; name: string }[];
  seasons?: { season_number: number; episode_count: number }[];
  belongs_to_collection?: { id: number; name: string };
}

interface TmdbCredits {
  crew: { id: number; job: string; name: string }[];
  cast: { id: number; name: string; character: string; profile_path: string | null; order: number }[];
}

interface TmdbSeason {
  episodes: {
    id: number;
    episode_number: number;
    season_number: number;
    name: string;
    overview: string;
    runtime: number | null;
    still_path: string | null;
    air_date: string | null;
  }[];
}

export class TmdbProvider implements MetadataProvider {
  name = 'tmdb';

  constructor(private client: TmdbClient) {}

  async trending(mediaType: 'movie' | 'tv', timeWindow: 'day' | 'week', lang?: Lang): Promise<Title[]> {
    const data = await this.client.get(`/trending/${mediaType}/${timeWindow}`, {
      language: this.client.lang(lang),
    });
    return data.results.map((t: TmdbTitle) => this.mapTitle(t, mediaType));
  }

  async popular(mediaType: 'movie' | 'tv', page = 1, lang?: Lang): Promise<TitleResult> {
    const data = await this.client.get(`/${mediaType}/popular`, {
      page: String(page),
      language: this.client.lang(lang),
    });
    return {
      results: data.results.map((t: TmdbTitle) => this.mapTitle(t, mediaType)),
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async search(query: string, page = 1, lang?: Lang): Promise<TitleResult> {
    const data = await this.client.get('/search/multi', {
      query,
      page: String(page),
      language: this.client.lang(lang),
    });
    const results = data.results
      .filter((t: TmdbTitle) => t.media_type === 'movie' || t.media_type === 'tv')
      .map((t: TmdbTitle) => this.mapTitle(t, t.media_type as 'movie' | 'tv'));
    return {
      results,
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  async details(id: number, mediaType: 'movie' | 'tv', lang?: Lang): Promise<Title> {
    const [details, credits, similar] = await Promise.all([
      this.client.get(`/${mediaType}/${id}`, { language: this.client.lang(lang) }),
      this.client.get(`/${mediaType}/${id}/credits`, { language: this.client.lang(lang) }),
      this.client.get(`/${mediaType}/${id}/similar`, { language: this.client.lang(lang) }),
    ]);

    return this.mapDetails(details, credits, similar, mediaType);
  }

  async similar(id: number, mediaType: 'movie' | 'tv', lang?: Lang): Promise<Title[]> {
    const data = await this.client.get(`/${mediaType}/${id}/similar`, {
      language: this.client.lang(lang),
    });
    return data.results.map((t: TmdbTitle) => this.mapTitle(t, mediaType));
  }

  async seasonDetails(tvId: number, seasonNumber: number, lang?: Lang): Promise<Episode[]> {
    const data: TmdbSeason = await this.client.get(`/tv/${tvId}/season/${seasonNumber}`, {
      language: this.client.lang(lang),
    });
    return data.episodes.map((ep) => ({
      id: `tv-${tvId}-s${seasonNumber}e${ep.episode_number}`,
      seriesId: tvId,
      season: ep.season_number,
      episode: ep.episode_number,
      title: ep.name,
      synopsis: ep.overview,
      runtime: ep.runtime ? `${ep.runtime}m` : '—',
      thumbnail: this.client.backdropUrl(ep.still_path),
      aired: ep.air_date || '—',
    }));
  }

  async genres(mediaType: 'movie' | 'tv', lang?: Lang): Promise<Genre[]> {
    const data = await this.client.get(`/genre/${mediaType}/list`, {
      language: this.client.lang(lang),
    });
    return data.genres;
  }

  private mapTitle(tmdb: TmdbTitle, mediaType: 'movie' | 'tv'): Title {
    const date = tmdb.release_date || tmdb.first_air_date || '';
    const year = date ? parseInt(date.slice(0, 4)) : 0;
    const runtime = tmdb.runtime
      ? `${Math.floor(tmdb.runtime / 60)}h ${tmdb.runtime % 60}m`
      : tmdb.episode_run_time?.[0]
        ? `${tmdb.episode_run_time[0]}m`
        : '—';

    return {
      id: tmdb.id,
      tmdbId: tmdb.id,
      name: tmdb.title || tmdb.name || '',
      type: mediaType === 'tv' ? 'tv' : 'movie',
      year,
      runtime,
      rating: '',
      score: Math.round(tmdb.vote_average * 10) / 10,
      genres: [],
      description: tmdb.overview || '',
      backdrop: this.client.backdropUrl(tmdb.backdrop_path),
      poster: this.client.posterUrl(tmdb.poster_path),
      logoText: tmdb.title || tmdb.name || '',
    };
  }

  private mapDetails(
    details: TmdbDetails,
    credits: TmdbCredits,
    similar: { results: TmdbTitle[] },
    mediaType: 'movie' | 'tv',
  ): Title {
    const base = this.mapTitle(details, mediaType);
    const date = details.release_date || details.first_air_date || '';
    const year = date ? parseInt(date.slice(0, 4)) : 0;

    base.year = year;
    base.genres = (details.genres || []).map((g) => g.name);
    base.rating = (details as any).certification || '';

    if (mediaType === 'tv' && details.episode_run_time?.[0]) {
      base.runtime = `${details.episode_run_time[0]}m`;
    } else if (details.runtime) {
      base.runtime = `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`;
    }

    const director = credits.crew.find((c) => c.job === 'Director');
    if (director) base.director = director.name;

    base.cast = credits.cast.slice(0, 6).map((c) => ({
      name: c.name,
      role: c.character,
      image: this.client.profileUrl(c.profile_path),
    }));

    base.related = similar.results.slice(0, 6).map((t) => t.id);

    return base;
  }
}
