import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import type { TmdbProvider } from '../services/metadata/tmdb.js';
import type { Lang } from '../services/tmdb-client.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const TV_LOG_FILE = path.join(LOGS_DIR, 'tv.log');

interface TvLogBody {
  level?: string;
  category?: string;
  message?: string;
  details?: any;
  time?: string;
}

export function tvRoutes(app: FastifyInstance, provider: TmdbProvider) {
  // Remote TV error and debug logging
  app.post('/api/tv/log', async (req, reply) => {
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }

      const body = (req.body || {}) as TvLogBody;
      const now = body.time || new Date().toISOString();
      const level = (body.level || 'error').toUpperCase();
      const category = body.category ? `[${body.category}]` : '[client]';
      const msg = body.message || 'No message';
      let detailsStr = '';
      if (body.details) {
        detailsStr = typeof body.details === 'object' ? JSON.stringify(body.details) : String(body.details);
      }

      const logLine = `[${now}] [${level}] ${category} ${msg}${detailsStr ? ' | ' + detailsStr : ''}\n`;
      fs.appendFileSync(TV_LOG_FILE, logLine, 'utf8');

      // Also print in server terminal with color
      if (level === 'ERROR') {
        console.error(`\x1b[31m[TV-LOG ${now}]\x1b[0m ${category} ${msg}`, detailsStr ? `\x1b[90m${detailsStr}\x1b[0m` : '');
      } else if (level === 'WARN') {
        console.warn(`\x1b[33m[TV-LOG ${now}]\x1b[0m ${category} ${msg}`, detailsStr ? `\x1b[90m${detailsStr}\x1b[0m` : '');
      } else {
        console.log(`\x1b[36m[TV-LOG ${now}]\x1b[0m ${category} ${msg}`, detailsStr ? `\x1b[90m${detailsStr}\x1b[0m` : '');
      }

      return { ok: true };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  app.get('/api/tv/logs', async (req, reply) => {
    try {
      if (!fs.existsSync(TV_LOG_FILE)) {
        return { count: 0, lines: [] };
      }
      const content = fs.readFileSync(TV_LOG_FILE, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      // Return last 300 lines
      const recent = lines.slice(-300);
      return { count: recent.length, total: lines.length, lines: recent };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  app.delete('/api/tv/logs', async () => {
    try {
      if (fs.existsSync(TV_LOG_FILE)) {
        fs.unlinkSync(TV_LOG_FILE);
      }
      return { ok: true, cleared: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  app.get('/api/tv/trending', async (req) => {
    const { timeWindow, lang } = req.query as { timeWindow?: string; lang?: Lang };
    const results = await provider.trending('tv', (timeWindow as any) || 'day', lang);
    return { results };
  });

  app.get('/api/tv/popular', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.popular('tv', page ? parseInt(page) : 1, lang);
  });

  app.get('/api/tv/top_rated', async (req) => {
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.topRated('tv', page ? parseInt(page) : 1, lang);
  });

  app.get('/api/tv/genre/:genreId', async (req) => {
    const { genreId } = req.params as { genreId: string };
    const { page, lang } = req.query as { page?: string; lang?: Lang };
    return provider.discoverGenre('tv', parseInt(genreId), page ? parseInt(page) : 1, lang);
  });

  app.get('/api/tv/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    return provider.details(parseInt(id), 'tv', lang);
  });

  app.get('/api/tv/:id/similar', async (req) => {
    const { id } = req.params as { id: string };
    const { lang } = req.query as { lang?: Lang };
    const results = await provider.similar(parseInt(id), 'tv', lang);
    return { results };
  });

  app.get('/api/tv/:id/season/:seasonNumber', async (req) => {
    const { id, seasonNumber } = req.params as { id: string; seasonNumber: string };
    const { lang } = req.query as { lang?: Lang };
    const episodes = await provider.seasonDetails(parseInt(id), parseInt(seasonNumber), lang);
    return { episodes };
  });
}
