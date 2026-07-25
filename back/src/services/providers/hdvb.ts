import type { ContentProvider, SearchResult, StreamResult, EpisodeResult } from './types.js';

const HDVB_API = 'https://apivb.com';
const HDVB_TOKEN = '5e2fe4c70bafd9a7414c4f170ee1b192';

interface HDVBVideo {
  type: string;
  iframe_url: string;
  translator: string;
  token: string;
  season_number?: number;
  serial_episodes?: Array<{ season_number: number; episodes: number[] }>;
  kinopoisk_id?: number;
  title_ru?: string;
  title_en?: string;
  year?: number;
  poster?: string;
  quality?: string;
}

export class HdvbProvider implements ContentProvider {
  name = 'hdvb';
  displayName = 'HDVB';
  enabled = true;

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${HDVB_API}/api/videos.json?token=${HDVB_TOKEN}&title=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return [];

      const data = await res.json() as HDVBVideo[];
      const items = Array.isArray(data) ? data : [];

      // Deduplicate by title+year
      const seen = new Set<string>();
      return items
        .filter((item) => {
          if (!item || !item.iframe_url) return false;
          const key = `${item.title_ru || item.title_en}_${item.year}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((item) => ({
          id: item.iframe_url,
          title: item.title_ru || item.title_en || '',
          year: item.year || 0,
          poster: item.poster || '',
          type: (item.type === 'movie' ? 'movie' : 'series') as 'movie' | 'series',
          provider: this.name,
        }));
    } catch (err) {
      console.error('HDVB search error:', err);
      return [];
    }
  }

  async stream(id: string): Promise<StreamResult[]> {
    try {
      // id is the iframe_url
      const iframeRes = await fetch(id, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'sec-fetch-dest': 'iframe',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'cross-site',
        },
      });

      if (!iframeRes.ok) return [];

      const html = await iframeRes.text();
      const streams: StreamResult[] = [];

      // Try to extract direct file URL (escaped slashes)
      const fileMatch = html.match(/"file"\s*:\s*"(https?:\/\/[^"]+\.m3u[^"]*)"/);
      if (fileMatch) {
        streams.push({ url: fileMatch[1].replace(/\\\//g, '/'), quality: '1080p', type: 'hls' });
        return streams;
      }

      // Try to extract via href/csrftoken/file pattern
      const hrefMatch = html.match(/"href"\s*:\s*"([^"]+)"/);
      const keyMatch = html.match(/"key"\s*:\s*"([^"]+)"/);
      const fileKeyMatch = html.match(/"file"\s*:\s*"([^"]+)"/);

      if (hrefMatch && keyMatch && fileKeyMatch) {
        const href = hrefMatch[1];
        const csrf = keyMatch[1].replace(/\\/g, '');
        let file = fileKeyMatch[1].replace(/\\/g, '').replace(/^\/playlist\//, '').replace(/\.txt$/, '');

        const vidHost = new URL(id).hostname;
        const playlistUrl = `https://vid11.${href}/playlist/${file}.txt`;

        const playlistRes = await fetch(playlistUrl, {
          method: 'POST',
          headers: {
            'x-csrf-token': csrf,
            'origin': `https://${vidHost}`,
            'referer': id,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (playlistRes.ok) {
          const text = await playlistRes.text();
          const m3uMatch = text.match(/(https?:\/\/[^\s"]+\.m3u[^\s"]*)/);
          if (m3uMatch) {
            streams.push({ url: m3uMatch[1], quality: '1080p', type: 'hls' });
          }
        }
      }

      return streams;
    } catch (err) {
      console.error('HDVB stream error:', err);
      return [];
    }
  }
}
