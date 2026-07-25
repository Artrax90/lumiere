import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { Lang } from '../services/tmdb-client.js';

export function tvRoutes(app: FastifyInstance, provider: TmdbProvider) {
  app.get('/api/tv/trending', async (req) => {
    const { timeWindow, lang } = req.query as { timeWindow?: string; lang?: Lang };
    const results = await provider.trending('tv', (timeWindow as any) || 'day', lang);
    return { results };
  });

  app.get('/api/tv/popular', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.popular('tv', page ? parseInt(page) : 1, lang);
  });

  app.get('/api/tv/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.details(parseInt(id), 'tv', lang);
  });

  app.get('/api/tv/:id/season/:seasonNumber', async (req) => {
    const { id, seasonNumber } = req.params as { id: string; seasonNumber: string };
    const { lang } = req.query as { lang?: Lang };
    const episodes = await provider.seasonDetails(parseInt(id), parseInt(seasonNumber), lang);
    return { episodes };
  });
}
