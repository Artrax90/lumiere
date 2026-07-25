import type { ContentProvider, SearchResult, StreamResult, EpisodeResult } from './types.js';
import { getPage } from './browser.js';

const PHANTOM_HOST = 'https://phantom.to';

export class PhantomProvider implements ContentProvider {
  name = 'phantom';
  displayName = 'Phantom';
  enabled = false;

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${PHANTOM_HOST}/search?query=${encodeURIComponent(query)}`;
      const { page } = await getPage(url);

      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('.search-result, .movie-card, article');
        return Array.from(items).slice(0, 10).map((el: any) => ({
          id: el.querySelector('a')?.href?.match(/\/(\d+)/)?.[1] || el.dataset?.id || '',
          title: el.querySelector('.title, h3, h4')?.textContent?.trim() || '',
          year: parseInt(el.querySelector('.year')?.textContent?.trim() || '0'),
          poster: el.querySelector('img')?.src || '',
          type: el.querySelector('.type')?.textContent?.includes('Сериал') ? 'series' : 'movie',
        }));
      });

      await page.close();

      return results
        .filter((r) => r.id && r.title)
        .map((r) => ({ ...r, provider: this.name, type: r.type as 'movie' | 'series' }));
    } catch (err) {
      console.error(`Phantom search error:`, err);
      return [];
    }
  }

  async stream(id: string): Promise<StreamResult[]> {
    try {
      const url = `${PHANTOM_HOST}/movie/${id}`;
      const { page } = await getPage(url);

      const streams = await page.evaluate(() => {
        const videos = document.querySelectorAll('video source, .video-link');
        return Array.from(videos).map((el: any) => ({
          url: el.src || el.href || '',
          quality: el.dataset?.quality || '1080p',
          type: el.type?.includes('hls') ? 'hls' : 'mp4',
        }));
      });

      await page.close();

      return streams.filter((s) => s.url).map((s) => ({ ...s, type: s.type as 'hls' | 'mp4' | 'dash' }));
    } catch (err) {
      console.error(`Phantom stream error:`, err);
      return [];
    }
  }

  async episodes(id: string): Promise<EpisodeResult[]> {
    try {
      const url = `${PHANTOM_HOST}/movie/${id}`;
      const { page } = await getPage(url);

      const episodes = await page.evaluate(() => {
        const eps = document.querySelectorAll('.episode, .season-episode');
        return Array.from(eps).map((el: any) => ({
          id: el.dataset?.id || '',
          season: parseInt(el.dataset?.season || '1'),
          episode: parseInt(el.dataset?.episode || '0'),
          title: el.querySelector('.title')?.textContent?.trim() || '',
          streams: [{
            url: el.dataset?.url || '',
            quality: '1080p',
            type: 'hls',
          }],
        }));
      });

      await page.close();

      return episodes.filter((e) => e.id || e.streams[0]?.url).map((e) => ({
        ...e,
        streams: e.streams.map((s) => ({ ...s, type: s.type as 'hls' | 'mp4' | 'dash' })),
      }));
    } catch (err) {
      console.error(`Phantom episodes error:`, err);
      return [];
    }
  }
}
