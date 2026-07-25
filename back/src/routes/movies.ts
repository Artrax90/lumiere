import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { Lang } from '../services/tmdb-client.js';

export function movieRoutes(app: FastifyInstance, provider: TmdbProvider) {
  app.get('/api/movies/trending', async (req) => {
    const { timeWindow, lang } = req.query as { timeWindow?: string; lang?: Lang };
    const results = await provider.trending('movie', (timeWindow as any) || 'day', lang);
    return { results };
  });

  app.get('/api/movies/popular', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.popular('movie', page ? parseInt(page) : 1, lang);
  });

  app.get('/api/movies/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.details(parseInt(id), 'movie', lang);
  });
}
