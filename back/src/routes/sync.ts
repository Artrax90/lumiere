import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export function syncRoutes(app: FastifyInstance, db: Pool) {
  // Get all sync data for the current user
  app.get('/api/sync', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    // Get watch history with playback positions
    const historyResult = await db.query(
      `SELECT tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at
       FROM watch_history
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    // Get favorites
    const favoritesResult = await db.query(
      `SELECT tmdb_id, media_type, title_name, poster, added_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY added_at DESC`,
      [userId]
    );

    // Get IPTV playlists
    const iptvResult = await db.query(
      `SELECT name, url, epg_url
       FROM iptv_playlists
       WHERE user_id = $1`,
      [userId]
    );

    return {
      watchHistory: historyResult.rows.map(row => ({
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        titleName: row.title_name,
        poster: row.poster,
        progress: row.progress,
        timestamp: row.timestamp,
        updatedAt: row.updated_at,
      })),
      favorites: favoritesResult.rows.map(row => ({
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        titleName: row.title_name,
        poster: row.poster,
        addedAt: row.added_at,
      })),
      iptvPlaylists: iptvResult.rows.map(row => ({
        name: row.name,
        url: row.url,
        epgUrl: row.epg_url || '',
      })),
      syncedAt: new Date().toISOString(),
    };
  });

  // Push sync data (batch update)
  app.post('/api/sync/push', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const { watchHistory, favorites, iptvPlaylists } = request.body as {
      watchHistory?: Array<{
        tmdbId: number;
        mediaType: string;
        titleName: string;
        poster?: string;
        progress?: number;
        timestamp?: number;
      }>;
      favorites?: Array<{
        tmdbId: number;
        mediaType: string;
        titleName: string;
        poster?: string;
      }>;
      iptvPlaylists?: Array<{
        name: string;
        url: string;
        epgUrl?: string;
      }>;
    };

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Upsert watch history entries
      if (watchHistory && watchHistory.length > 0) {
        for (const item of watchHistory) {
          await client.query(
            `INSERT INTO watch_history (user_id, tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (user_id, tmdb_id, media_type)
             DO UPDATE SET
               progress = GREATEST(watch_history.progress, EXCLUDED.progress),
               timestamp = GREATEST(watch_history.timestamp, EXCLUDED.timestamp),
               title_name = EXCLUDED.title_name,
               poster = EXCLUDED.poster,
               updated_at = NOW()`,
            [userId, item.tmdbId, item.mediaType, item.titleName, item.poster || '', item.progress || 0, item.timestamp || 0]
          );
        }
      }

      // Upsert favorites
      if (favorites && favorites.length > 0) {
        for (const item of favorites) {
          await client.query(
            `INSERT INTO favorites (user_id, tmdb_id, media_type, title_name, poster, added_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, tmdb_id, media_type)
             DO UPDATE SET
               title_name = EXCLUDED.title_name,
               poster = EXCLUDED.poster`,
            [userId, item.tmdbId, item.mediaType, item.titleName, item.poster || '']
          );
        }
      }

      // Upsert IPTV playlists
      if (iptvPlaylists && iptvPlaylists.length > 0) {
        for (const item of iptvPlaylists) {
          await client.query(
            `INSERT INTO iptv_playlists (user_id, name, url, epg_url, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, url)
             DO UPDATE SET
               name = EXCLUDED.name,
               epg_url = EXCLUDED.epg_url,
               updated_at = NOW()`,
            [userId, item.name, item.url, item.epgUrl || '']
          );
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        syncedAt: new Date().toISOString(),
        watchHistoryCount: watchHistory?.length || 0,
        favoritesCount: favorites?.length || 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Get watch history for a specific title
  app.get('/api/sync/progress/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };
    const { type } = request.query as { type?: string };

    const result = await db.query(
      `SELECT progress, timestamp, updated_at
       FROM watch_history
       WHERE user_id = $1 AND tmdb_id = $2 AND media_type = $3`,
      [userId, parseInt(tmdbId), type || 'movie']
    );

    if (result.rows.length === 0) {
      return { progress: 0, timestamp: 0 };
    }

    const row = result.rows[0];
    return {
      progress: row.progress,
      timestamp: row.timestamp,
      updatedAt: row.updated_at,
    };
  });

  // Update watch progress for a specific title
  app.post('/api/sync/progress', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const { tmdbId, mediaType, titleName, poster, progress, timestamp } = request.body as {
      tmdbId: number;
      mediaType: string;
      titleName?: string;
      poster?: string;
      progress?: number;
      timestamp?: number;
    };

    await db.query(
      `INSERT INTO watch_history (user_id, tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tmdb_id, media_type)
       DO UPDATE SET
         progress = GREATEST(watch_history.progress, EXCLUDED.progress),
         timestamp = GREATEST(watch_history.timestamp, EXCLUDED.timestamp),
         title_name = COALESCE(EXCLUDED.title_name, watch_history.title_name),
         poster = COALESCE(EXCLUDED.poster, watch_history.poster),
         updated_at = NOW()`,
      [userId, tmdbId, mediaType || 'movie', titleName || '', poster || '', progress || 0, timestamp || 0]
    );

    return { success: true };
  });
}
