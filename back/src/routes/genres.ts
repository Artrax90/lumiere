import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { Lang } from '../services/tmdb-client.js';

export function genreRoutes(app: FastifyInstance, provider: TmdbProvider) {
  app.get('/api/genres', async (req) => {
    const { type, lang } = req.query as { type?: string; lang?: Lang };
    const mediaType = type === 'tv' ? 'tv' : 'movie';
    const genres = await provider.genres(mediaType, lang);
    return { genres };
  });
}
