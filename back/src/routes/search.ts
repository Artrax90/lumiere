import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { KinopoiskProvider } from '../services/metadata/kinopoisk.js';
import type { Lang } from '../services/tmdb-client.js';

export function searchRoutes(
  app: FastifyInstance,
  opts: { provider: TmdbProvider; kpProvider?: KinopoiskProvider } | TmdbProvider
) {
  const provider: TmdbProvider = 'search' in opts ? opts : opts.provider;
  const kpProvider: KinopoiskProvider | undefined = 'kpProvider' in opts ? opts.kpProvider : undefined;

  app.get('/api/search', async (req) => {
    const { q, page, lang, source } = req.query as {
      q?: string;
      page?: string;
      lang?: Lang;
      source?: 'all' | 'tmdb' | 'kp';
    };

    if (!q || !q.trim()) {
      return {
        results: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
        tmdb: { results: [], count: 0 },
        kp: { results: [], count: 0 },
      };
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    const queryStr = q.trim();

    if (source === 'tmdb') {
      const tmdbRes = await provider.search(queryStr, pageNum, lang);
      return {
        ...tmdbRes,
        tmdb: { results: tmdbRes.results, count: tmdbRes.totalResults || tmdbRes.results.length },
      };
    }

    if (source === 'kp') {
      const kpRes = kpProvider
        ? await kpProvider.search(queryStr, pageNum)
        : { results: [], page: 1, totalPages: 0, totalResults: 0 };
      return {
        ...kpRes,
        kp: { results: kpRes.results, count: kpRes.totalResults || kpRes.results.length },
      };
    }

    // Default: Search both in parallel
    const [tmdbRes, kpRes] = await Promise.all([
      provider.search(queryStr, pageNum, lang).catch(() => ({
        results: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      })),
      kpProvider
        ? kpProvider.search(queryStr, pageNum).catch(() => ({
            results: [],
            page: 1,
            totalPages: 0,
            totalResults: 0,
          }))
        : Promise.resolve({ results: [], page: 1, totalPages: 0, totalResults: 0 }),
    ]);

    const activeResults = tmdbRes.results.length > 0 ? tmdbRes.results : kpRes.results;

    return {
      results: activeResults,
      page: pageNum,
      totalPages: Math.max(tmdbRes.totalPages || 0, kpRes.totalPages || 0),
      totalResults: (tmdbRes.totalResults || 0) + (kpRes.totalResults || 0),
      tmdb: {
        results: tmdbRes.results,
        count: tmdbRes.totalResults || tmdbRes.results.length,
      },
      kp: {
        results: kpRes.results,
        count: kpRes.totalResults || kpRes.results.length,
      },
    };
  });

  // Kinopoisk title details
  app.get('/api/kp/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const numId = parseInt(id, 10);
    if (!numId || isNaN(numId)) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    const details = kpProvider ? await kpProvider.details(numId) : null;
    if (!details) {
      return reply.code(404).send({ error: 'Title not found on Kinopoisk' });
    }
    return details;
  });

  // Kinopoisk season episodes
  app.get('/api/kp/:id/season/:seasonNumber', async (req, reply) => {
    const { id, seasonNumber } = req.params as { id: string; seasonNumber: string };
    const numId = parseInt(id, 10);
    const numSeason = parseInt(seasonNumber, 10);
    if (!numId || isNaN(numId)) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    const episodes = kpProvider ? await kpProvider.seasonEpisodes(numId, numSeason) : [];
    return { episodes };
  });
}
