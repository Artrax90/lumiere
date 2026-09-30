import type { FastifyInstance } from 'fastify';
import fetch from 'node-fetch';
import type { TmdbClient } from '../services/tmdb-client.js';

interface ImageCacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}

const imageCache = new Map<string, ImageCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 300;

export function imageRoutes(
  app: FastifyInstance,
  opts: { tmdbClient?: TmdbClient; proxyUrl?: string } | TmdbClient
) {
  const tmdbClient = opts && 'getAgent' in opts ? (opts as TmdbClient) : (opts as any)?.tmdbClient;

  app.get('/api/image', async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) {
      return reply.code(400).send({ error: 'Missing url parameter' });
    }

    let targetUrl = url;
    // Unwrap if mistakenly double-wrapped (/api/image?url=https%3A%2F%2F...)
    while (targetUrl.includes('/api/image?url=')) {
      try {
        const u = new URL(targetUrl.startsWith('http') ? targetUrl : `http://localhost${targetUrl}`);
        const inner = u.searchParams.get('url');
        if (inner && inner !== targetUrl) {
          targetUrl = inner;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return reply.code(400).send({ error: 'Invalid protocol' });
      }
      const host = parsed.hostname.toLowerCase();
      const isAllowed =
        host.endsWith('tmdb.org') ||
        host.endsWith('themoviedb.org') ||
        host.endsWith('yandex.net') ||
        host.endsWith('kinopoisk.ru') ||
        host.endsWith('kinopoiskapiunofficial.tech') ||
        host.endsWith('kpcdn.net');
      if (!isAllowed) {
        return reply.code(403).send({ error: 'Host not allowed' });
      }
    } catch {
      return reply.code(400).send({ error: 'Invalid url' });
    }

    // Check memory cache
    const cached = imageCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      reply.header('Content-Type', cached.contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(cached.buffer);
    }

    try {
      const agent = tmdbClient?.getAgent();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(targetUrl, {
        agent: agent as any,
        signal: controller.signal as any,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/jpeg,image/png,image/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return reply.code(res.status).send({ error: `Upstream returned ${res.status}` });
      }

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const buffer = await res.buffer();

      if (imageCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = imageCache.keys().next().value;
        if (oldestKey) imageCache.delete(oldestKey);
      }
      imageCache.set(url, { buffer, contentType, timestamp: Date.now() });
      if (targetUrl !== url) {
        imageCache.set(targetUrl, { buffer, contentType, timestamp: Date.now() });
      }

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(buffer);
    } catch (err: any) {
      req.log.warn({ url, err: err.message }, 'Failed to proxy image');
      return reply.code(502).send({ error: err.message });
    }
  });
}
