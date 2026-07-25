import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { Lang } from '../services/tmdb-client.js';

export function searchRoutes(app: FastifyInstance, provider: TmdbProvider) {
  app.get('/api/search', async (req) => {
    const { q, page, lang } = req.query as { q?: string; page?: string; lang?: Lang };
    if (!q) return { results: [], page: 1, totalPages: 0, totalResults: 0 };
    return provider.search(q, page ? parseInt(page) : 1, lang);
  });
}
