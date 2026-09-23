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

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return reply.code(400).send({ error: 'Invalid protocol' });
      }
      const host = parsed.hostname.toLowerCase();
      if (!host.endsWith('tmdb.org') && !host.endsWith('themoviedb.org')) {
        return reply.code(403).send({ error: 'Host not allowed' });
      }
    } catch {
      return reply.code(400).send({ error: 'Invalid url' });
    }

    // Check memory cache
    const cached = imageCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      reply.header('Content-Type', cached.contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(cached.buffer);
    }

    try {
      const agent = tmdbClient?.getAgent();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        agent: agent as any,
        signal: controller.signal as any,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
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

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=604800, immutable');
      return reply.send(buffer);
    } catch (err: any) {
      req.log.warn({ url, err: err.message }, 'Failed to proxy image');
      return reply.code(502).send({ error: err.message });
    }
  });
}
