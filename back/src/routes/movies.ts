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

  const getMovieDetails = async (req: any) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.details(parseInt(id), 'movie', lang);
  };
  app.get('/api/movies/:id', getMovieDetails);
  app.get('/api/movie/:id', getMovieDetails);

  const getMovieRecs = async (req: any) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    const results = await provider.recommendations(parseInt(id), 'movie', lang);
    return { results };
  };
  app.get('/api/movies/:id/recommendations', getMovieRecs);
  app.get('/api/movie/:id/recommendations', getMovieRecs);

  const getMovieTrailer = async (req: any) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    const trailer = await provider.trailer(parseInt(id), 'movie', lang);
    return { trailer };
  };
  app.get('/api/movies/:id/trailer', getMovieTrailer);
  app.get('/api/movie/:id/trailer', getMovieTrailer);

  const getMovieSimilar = async (req: any) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    const results = await provider.similar(parseInt(id), 'movie', lang);
    return { results };
  };
  app.get('/api/movies/:id/similar', getMovieSimilar);
  app.get('/api/movie/:id/similar', getMovieSimilar);

  app.post('/api/recommendations/personal', async (req) => {
    const { lang } = req.query as { lang?: Lang };
    const body = (req.body as any) || {};
    const rawItems: Array<{ id: number; type?: 'movie' | 'tv'; name?: string }> = Array.isArray(body.items) ? body.items : [];

    const seenIds = new Set<number>();
    const validWatched: Array<{ id: number; type: 'movie' | 'tv'; name: string }> = [];

    for (const item of rawItems) {
      const numId = Number(item.id);
      if (!numId || isNaN(numId) || seenIds.has(numId)) continue;
      seenIds.add(numId);
      const isTv = item.type === 'tv' || / · S\d+/i.test(item.name || '') || /S\d+E\d+/i.test(item.name || '');
      validWatched.push({
        id: numId,
        type: isTv ? 'tv' : 'movie',
        name: item.name || '',
      });
    }

    // Sample up to 6 recently watched titles
    const sample = validWatched.slice(0, 6);
    const candidateMap = new Map<number, { title: any; freq: number; baseScore: number }>();

    await Promise.all(
      sample.map(async (w) => {
        try {
          const recs = await provider.recommendations(w.id, w.type, lang);
          if (Array.isArray(recs)) {
            for (const r of recs) {
              if (!r || !r.id || seenIds.has(r.id)) continue;
              if (!r.poster || r.poster.includes('null')) continue;
              const name = r.name || '';
              // Exclude untranslated obscure Asian scripts
              if (/^[\u4e00-\u9fa5\uac00-\ud7af\u3040-\u30ff\s.,:;!?'-]+$/.test(name)) continue;

              if (!candidateMap.has(r.id)) {
                candidateMap.set(r.id, {
                  title: r,
                  freq: 1,
                  baseScore: r.score || 7.0,
                });
              } else {
                const c = candidateMap.get(r.id)!;
                c.freq += 1;
              }
            }
          }
        } catch {}
      })
    );

    const candidates = Array.from(candidateMap.values());
    candidates.sort((a, b) => {
      const scoreA = a.baseScore + (a.freq - 1) * 2.0;
      const scoreB = b.baseScore + (b.freq - 1) * 2.0;
      return scoreB - scoreA;
    });

    let results = candidates.map((c) => c.title);

    // If pool is sparse, supplement with trending popular content
    if (results.length < 15) {
      try {
        const [trendMovies, trendTv] = await Promise.all([
          provider.trending('movie', 'week', lang),
          provider.trending('tv', 'week', lang),
        ]);
        const fallback = [...(trendMovies || []), ...(trendTv || [])];
        for (const t of fallback) {
          if (!t || !t.id || seenIds.has(t.id)) continue;
          if (!t.poster || t.poster.includes('null')) continue;
          if (!candidateMap.has(t.id)) {
            candidateMap.set(t.id, { title: t, freq: 1, baseScore: t.score || 7.0 });
            results.push(t);
            if (results.length >= 25) break;
          }
        }
      } catch {}
    }

    return { results: results.slice(0, 25) };
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
