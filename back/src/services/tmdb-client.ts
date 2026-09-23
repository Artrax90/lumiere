import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type Lang = 'ru' | 'en';

const langMap: Record<Lang, string> = {
  ru: 'ru-RU',
  en: 'en-US',
};

export class TmdbClient {
  private agent: SocksProxyAgent | HttpsProxyAgent<string> | undefined;

  constructor(
    private token: string,
    private proxyUrl?: string,
  ) {
    if (proxyUrl) {
      this.initAgent(proxyUrl);
    }
  }

  private initAgent(proxyUrl: string) {
    try {
      const trimmed = proxyUrl.trim();
      if (!trimmed) {
        this.agent = undefined;
        return;
      }
      if (trimmed.startsWith('socks')) {
        this.agent = new SocksProxyAgent(trimmed);
      } else {
        this.agent = new HttpsProxyAgent(trimmed);
      }
    } catch (e) {
      console.error('Failed to initialize proxy agent:', e);
      this.agent = undefined;
    }
  }

  getAgent(): SocksProxyAgent | HttpsProxyAgent<string> | undefined {
    return this.agent;
  }

  updateConfig(token: string, proxyUrl?: string) {
    this.token = token;
    this.proxyUrl = proxyUrl && proxyUrl.trim() ? proxyUrl.trim() : undefined;
    if (this.proxyUrl) {
      this.initAgent(this.proxyUrl);
    } else {
      this.agent = undefined;
    }
  }

  getConfig() {
    return {
      token: this.token,
      proxyUrl: this.proxyUrl || '',
      configured: !!this.token,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    try {
      const data = await this.get('/configuration');
      if (data && data.images) {
        return { ok: true, message: 'Соединение с TMDB установлено' };
      }
      return { ok: false, message: 'Некорректный ответ от TMDB' };
    } catch (err: any) {
      return { ok: false, message: err.message || 'Ошибка подключения' };
    }
  }

  async get(path: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${TMDB_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
    };

    const res = await fetch(url.toString(), {
      headers,
      agent: this.agent as any,
    });

    if (!res.ok) {
      throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  lang(l?: Lang): string {
    return langMap[l || 'ru'];
  }

  imageUrl(path: string | null, size: string = 'w500'): string {
    if (!path) return '';
    const directUrl = `${TMDB_IMAGE_BASE}/${size}${path}`;
    return `/api/image?url=${encodeURIComponent(directUrl)}`;
  }

  backdropUrl(path: string | null): string {
    return this.imageUrl(path, 'w1280');
  }

  posterUrl(path: string | null): string {
    return this.imageUrl(path, 'w500');
  }

  profileUrl(path: string | null): string {
    return this.imageUrl(path, 'w185');
  }
}
