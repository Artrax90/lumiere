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

  app.get('/api/movies/top_rated', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.topRated('movie', page ? parseInt(page) : 1, lang);
  });

  app.get('/api/movies/now_playing', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.nowPlaying(page ? parseInt(page) : 1, lang);
  });

  app.get('/api/movies/genre/:genreId', async (req) => {
    const { genreId } = req.params as { genreId: string };
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.discoverGenre('movie', parseInt(genreId), page ? parseInt(page) : 1, lang);
  });

  app.get('/api/movies/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.details(parseInt(id), 'movie', lang);
  });

  app.get('/api/movies/:id/similar', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    const results = await provider.similar(parseInt(id), 'movie', lang);
    return { results };
  });

  app.get('/api/catalog/person/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.person(parseInt(id), lang);
  });

  app.get('/api/person/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.person(parseInt(id), lang);
  });
}
