import type { FastifyInstance } from 'fastify';
import { getEnabledProviders, getProvider, getAllProviders } from '../services/providers/registry.js';

// Cache: provider:id -> { baseUrl, expires }
// baseUrl is the CDN host + path without segment-specific query params
const baseUrlCache = new Map<string, { baseUrl: string; origin: string; expires: number }>();

async function getCdnBaseUrl(provider: string, id: string): Promise<{ baseUrl: string; origin: string } | null> {
  const cacheKey = `${provider}:${id}`;
  const cached = baseUrlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached;

  const p = getProvider(provider);
  if (!p) return null;

  try {
    const streams = await p.stream(id);
    if (streams.length === 0) return null;

    const url = new URL(streams[0].url);
    const result = {
      baseUrl: url.origin + url.pathname.replace(/master\.m3u8.*$/, ''),
      origin: url.origin,
    };

    // Cache for 30 seconds
    baseUrlCache.set(cacheKey, { ...result, expires: Date.now() + 30000 });
    return result;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(url).origin + '/',
        'Origin': new URL(url).origin,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok || i === retries) return res;
    // If 410, wait a bit and retry
    if (res.status === 410) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    return res;
  }
  throw new Error('Max retries exceeded');
}

export function onlineRoutes(app: FastifyInstance) {
  // HLS proxy for Collaps — handles master manifest, sub-playlists, and segments
  app.get('/api/online/hls/:provider/:id', async (req, reply) => {
    const { provider, id } = req.params as { provider: string; id: string };
    const { url, seg } = req.query as { url?: string; seg?: string };

    // If this is a segment request
    if (seg) {
      const cached = await getCdnBaseUrl(provider, id);
      if (!cached) {
        reply.code(404);
        return { error: 'No stream found' };
      }

      const segmentUrl = `${cached.baseUrl}${seg}`;
      try {
        const res = await fetchWithRetry(segmentUrl);
        if (!res.ok) {
          reply.code(res.status);
          return { error: `CDN error: ${res.status}` };
        }
        const buffer = await res.arrayBuffer();
        reply.header('Content-Type', res.headers.get('content-type') || 'video/mp2t');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Content-Length', buffer.byteLength);
        return reply.send(Buffer.from(buffer));
      } catch (err: any) {
        reply.code(500);
        return { error: err.message };
      }
    }

    // If this is a sub-playlist request
    if (url) {
      try {
        const res = await fetchWithRetry(url);
        if (!res.ok) {
          reply.code(res.status);
          return { error: `CDN error: ${res.status}` };
        }
        const manifest = await res.text();
        const proxyBase = `/api/online/hls/${provider}/${id}`;

        // Rewrite segment URLs to go through our proxy
        const rewritten = manifest.replace(
          /^(?!#)(.+\.ts(?:\?.*)?)$/gm,
          (match) => {
            const segment = match.trim();
            // Extract just the filename and query params
            return `${proxyBase}?seg=${encodeURIComponent(segment)}`;
          }
        );

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'no-cache');
        return rewritten;
      } catch (err: any) {
        reply.code(500);
        return { error: err.message };
      }
    }

    // Master manifest request — fetch fresh URL from provider
    const cached = await getCdnBaseUrl(provider, id);
    if (!cached) {
      reply.code(404);
      return { error: 'No stream found' };
    }

    try {
      // Fetch the master manifest from CDN
      const masterUrl = `${cached.baseUrl}master.m3u8`;
      const res = await fetchWithRetry(masterUrl);
      if (!res.ok) {
        reply.code(res.status);
        return { error: `CDN error: ${res.status}` };
      }

      const manifest = await res.text();
      const proxyBase = `/api/online/hls/${provider}/${id}`;

      // Rewrite sub-playlist URLs to go through our proxy
      const rewritten = manifest.replace(
        /(https?:\/\/[^\s"]+\.m3u8[^\s"]*)/g,
        (url) => `${proxyBase}?url=${encodeURIComponent(url)}`
      );

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache');
      return rewritten;
    } catch (err: any) {
      reply.code(500);
      return { error: err.message };
    }
  });

  // Simple redirect proxy for source selector
  app.get('/api/online/proxy/:provider/:id', async (req, reply) => {
    const { provider, id } = req.params as { provider: string; id: string };
    reply.code(302).header('Location', `/api/online/hls/${provider}/${encodeURIComponent(id)}`);
    return;
  });

  // List all providers
  app.get('/api/online/providers', async () => {
    const providers = getAllProviders();
    return {
      providers: providers.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        enabled: p.enabled,
      })),
    };
  });

  // Search across providers
  app.get('/api/online/search', async (req) => {
    const { q, provider, type } = req.query as {
      q?: string; provider?: string; type?: string;
    };

    if (!q) return { results: [] };

    const providers = provider
      ? [getProvider(provider)].filter((p): p is NonNullable<typeof p> => p !== undefined)
      : getEnabledProviders();

    const results = await Promise.all(providers.map(async (p) => {
      try {
        return await p.search(q, { type: type as any });
      } catch (err) {
        console.error(`Search error for ${p.name}:`, err);
        return [];
      }
    }));

    return { results: results.flat() };
  });

  // Get stream URL
  app.get('/api/online/stream/:provider/:id', async (req, reply) => {
    const { provider, id } = req.params as { provider: string; id: string };
    const p = getProvider(provider);
    if (!p) return reply.code(404).send({ error: 'Provider not found' });

    try {
      const streams = await p.stream(id);
      return { streams };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Get episodes
  app.get('/api/online/episodes/:provider/:id', async (req, reply) => {
    const { provider, id } = req.params as { provider: string; id: string };
    const p = getProvider(provider);
    if (!p) return reply.code(404).send({ error: 'Provider not found' });
    if (!p.episodes) return reply.code(400).send({ error: 'Provider does not support episodes' });

    try {
      const episodes = await p.episodes(id);
      return { episodes };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
