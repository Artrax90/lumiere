import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { TmdbClient } from '../services/tmdb-client.js';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export function settingsRoutes(app: FastifyInstance, tmdbClient: TmdbClient, pool?: Pool) {
  // Get TMDB configuration & status
  app.get('/api/settings/tmdb', { preHandler: optionalAuth }, async (req: AuthenticatedRequest) => {
    const config = tmdbClient.getConfig();
    const isAdmin = req.user?.role === 'admin';

    let tokenMasked = '';
    if (config.token) {
      if (config.token.length > 10) {
        tokenMasked = `${config.token.slice(0, 4)}••••••••${config.token.slice(-4)}`;
      } else {
        tokenMasked = '••••••••';
      }
    }

    const test = await tmdbClient.testConnection();

    return {
      configured: config.configured,
      tokenMasked: isAdmin ? tokenMasked : '',
      // Only expose the real proxyUrl to the administrator. Regular users see empty string.
      proxyUrl: isAdmin ? (config.proxyUrl || '') : '',
      isConfiguredProxy: Boolean(config.proxyUrl),
      online: test.ok,
      message: test.message,
    };
  });

  // Update TMDB configuration (Admin only)
  app.post('/api/settings/tmdb', { preHandler: requireAuth }, async (req: AuthenticatedRequest, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'Доступ разрешен только администраторам' });
    }

    const { token, proxyUrl } = req.body as { token?: string; proxyUrl?: string };

    const current = tmdbClient.getConfig();
    const newToken = token !== undefined && token.trim() !== '' ? token.trim() : current.token;
    const newProxy = proxyUrl !== undefined ? proxyUrl.trim() : current.proxyUrl;

    if (!newToken) {
      return reply.code(400).send({ error: 'API-токен TMDB не может быть пустым' });
    }

    tmdbClient.updateConfig(newToken, newProxy);

    const test = await tmdbClient.testConnection();

    // Persist to database if pool is available
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO app_settings (key, value, updated_at) 
           VALUES ('tmdb_token', $1, NOW()) 
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [newToken]
        );
        await pool.query(
          `INSERT INTO app_settings (key, value, updated_at) 
           VALUES ('tmdb_proxy_url', $1, NOW()) 
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [newProxy || '']
        );
      } catch (err: any) {
        console.warn('Could not persist TMDB settings to DB:', err.message);
      }
    }

    return {
      ok: test.ok,
      online: test.ok,
      message: test.message || (test.ok ? 'Настройки TMDB успешно сохранены' : 'Ошибка подключения к TMDB'),
      proxyUrl: newProxy,
      tokenMasked: newToken.length > 10 ? `${newToken.slice(0, 4)}••••••••${newToken.slice(-4)}` : '••••••••',
    };
  });

  // Test current TMDB connection (Admin only)
  app.post('/api/settings/tmdb/test', { preHandler: requireAuth }, async (req: AuthenticatedRequest, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'Доступ разрешен только администраторам' });
    }
    const test = await tmdbClient.testConnection();
    return test;
  });
}

