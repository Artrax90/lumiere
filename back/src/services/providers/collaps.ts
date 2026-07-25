import type { ContentProvider, SearchResult, StreamResult, EpisodeResult } from './types.js';

const COLLAPS_API = 'https://api.bhcesh.me';
const COLLAPS_TOKEN = 'eedefb541aeba871dcfc756e6b31c02e';

interface CollapsSearchResult {
  id: number;
  name: string;
  origin_name: string;
  year: number;
  poster: string;
  iframe_url: string;
  type: string;
}

interface CollapsEmbed {
  movie?: { hls?: string; dash?: string; dasha?: string };
  seasons?: Array<{
    season: number;
    episodes: Array<{
      episode: number;
      name?: string;
      hls?: string;
      dash?: string;
      dasha?: string;
    }>;
  }>;
}

export class CollapsProvider implements ContentProvider {
  name = 'collaps';
  displayName = 'Collaps';
  enabled = true;

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${COLLAPS_API}/list?token=${COLLAPS_TOKEN}&name=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://kinokrad.my',
        },
      });

      if (!res.ok) return [];

      const json = await res.json() as { results?: CollapsSearchResult[] };
      const items = json.results || [];

      return items
        .filter((item) => item && item.id)
        .map((item) => ({
          id: String(item.id),
          title: item.name || '',
          year: item.year || 0,
          poster: item.poster || '',
          type: (item.type?.includes('series') ? 'series' : 'movie') as 'movie' | 'series',
          provider: this.name,
        }));
    } catch (err) {
      console.error('Collaps search error:', err);
      return [];
    }
  }

  async stream(id: string): Promise<StreamResult[]> {
    try {
      const url = `https://api.ortified.ws/embed/movie/${id}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://kinokrad.my',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return [];

      const html = await res.text();
      const streams: StreamResult[] = [];

      // Extract HLS URL
      const hlsMatch = html.match(/hls:\s*"(https?:\/\/[^"]+\.m3u[^"]*)"/);
      if (hlsMatch) {
        streams.push({ url: hlsMatch[1].replace(/\\\//g, '/'), quality: '720p', type: 'hls' });
      }

      // Extract DASH URL
      const dashMatch = html.match(/dash(?:a)?:\s*"(https?:\/\/[^"]+\.mp[^"]*)"/);
      if (dashMatch) {
        streams.push({ url: dashMatch[1].replace(/\\\//g, '/'), quality: '1080p', type: 'dash' });
      }

      return streams;
    } catch (err) {
      console.error('Collaps stream error:', err);
      return [];
    }
  }

  async episodes(id: string): Promise<EpisodeResult[]> {
    try {
      const url = `${COLLAPS_API}/embed/movie/${id}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://kinokrad.my',
        },
      });

      if (!res.ok) return [];

      const html = await res.text();

      // Try to extract seasons JSON
      const seasonsMatch = html.match(/seasons:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (!seasonsMatch) return [];

      try {
        const seasons = JSON.parse(seasonsMatch[1]) as Array<{
          season: number;
          episodes: Array<{
            episode: number;
            name?: string;
            hls?: string;
            dash?: string;
            dasha?: string;
          }>;
        }>;

        const results: EpisodeResult[] = [];
        for (const season of seasons) {
          for (const ep of season.episodes) {
            const streams: StreamResult[] = [];
            if (ep.hls) streams.push({ url: ep.hls, quality: '720p', type: 'hls' });
            if (ep.dash || ep.dasha) streams.push({ url: ep.dash || ep.dasha!, quality: '1080p', type: 'dash' });

            if (streams.length > 0) {
              results.push({
                id: `s${season.season}e${ep.episode}`,
                season: season.season,
                episode: ep.episode,
                title: ep.name || `S${season.season}E${ep.episode}`,
                streams,
              });
            }
          }
        }
        return results;
      } catch {
        return [];
      }
    } catch (err) {
      console.error('Collaps episodes error:', err);
      return [];
    }
  }
}
