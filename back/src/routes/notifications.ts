import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import type { TmdbProvider } from '../services/metadata/tmdb.js';

export function notificationRoutes(app: FastifyInstance, tmdbProvider?: TmdbProvider) {
  // 1. Get notifications
  app.get('/api/notifications', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query(
        'SELECT id, title, message, media_type, media_id, poster, action_data, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50',
        [userId]
      );
      const unreadResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );
      const unreadCount = (unreadResult.rows[0] && unreadResult.rows[0].count) || 0;
      return {
        notifications: result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          message: row.message,
          mediaType: row.media_type,
          mediaId: row.media_id,
          poster: row.poster,
          actionData: row.action_data || {},
          isRead: !!row.is_read,
          createdAt: row.created_at
        })),
        unreadCount
      };
    } catch (err: any) {
      return { notifications: [], unreadCount: 0 };
    }
  });

  // 2. Mark notification as read
  app.put('/api/notifications/:id/read', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    try {
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [parseInt(id, 10), userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 3. Mark all notifications as read
  app.put('/api/notifications/read-all', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1',
        [userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 4. Get series subscriptions
  app.get('/api/notifications/subscriptions', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query(
        'SELECT id, tmdb_id, title, poster, last_season, last_episode, created_at FROM series_subscriptions WHERE user_id = $1 ORDER BY id DESC',
        [userId]
      );
      return {
        subscriptions: result.rows.map((row) => ({
          id: row.id,
          tmdbId: row.tmdb_id,
          title: row.title,
          poster: row.poster,
          lastSeason: row.last_season,
          lastEpisode: row.last_episode,
          createdAt: row.created_at
        }))
      };
    } catch (err: any) {
      return { subscriptions: [] };
    }
  });

  // 5. Check if user is subscribed to a series
  app.get('/api/notifications/is-subscribed/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };
    try {
      const result = await pool.query(
        'SELECT id, tmdb_id, title, last_season, last_episode FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2',
        [userId, parseInt(tmdbId, 10)]
      );
      return {
        isSubscribed: result.rows.length > 0,
        subscription: result.rows[0] || null
      };
    } catch {
      return { isSubscribed: false };
    }
  });

  // 6. Subscribe to a series
  app.post('/api/notifications/subscribe', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId, title, poster, lastSeason, lastEpisode } = request.body as {
      tmdbId: number;
      title: string;
      poster?: string;
      lastSeason?: number;
      lastEpisode?: number;
    };

    if (!tmdbId || !title) {
      return { success: false, error: 'tmdbId and title are required' };
    }

    try {
      await pool.query(
        `INSERT INTO series_subscriptions (user_id, tmdb_id, title, poster, last_season, last_episode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, tmdb_id) DO UPDATE
         SET title = EXCLUDED.title, poster = EXCLUDED.poster, last_season = EXCLUDED.last_season, last_episode = EXCLUDED.last_episode`,
        [userId, tmdbId, title, poster || '', lastSeason || 0, lastEpisode || 0]
      );
      return { success: true, isSubscribed: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 7. Unsubscribe from a series
  app.delete('/api/notifications/subscribe/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };
    try {
      await pool.query(
        'DELETE FROM series_subscriptions WHERE user_id = $1 AND tmdb_id = $2',
        [userId, parseInt(tmdbId, 10)]
      );
      return { success: true, isSubscribed: false };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 8. Check for new episodes across subscribed series
  app.post('/api/notifications/check', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const subsResult = await pool.query(
        'SELECT id, tmdb_id, title, poster, last_season, last_episode FROM series_subscriptions WHERE user_id = $1',
        [userId]
      );
      const subs = subsResult.rows;
      let newCount = 0;

      for (const sub of subs) {
        if (!tmdbProvider) continue;
        try {
          const details: any = await tmdbProvider.details(sub.tmdb_id, 'tv', 'ru');
          if (!details) continue;

          // Check if TMDB has next_episode_to_air or new seasons/episodes
          const seasons = details.seasons || [];
          let latestSeasonNum = 0;
          let latestEpisodeNum = 0;

          // Find the latest released season
          for (const s of seasons) {
            if (s.season_number > 0 && s.season_number >= latestSeasonNum) {
              latestSeasonNum = s.season_number;
              latestEpisodeNum = s.episode_count || 1;
            }
          }

          const prevSeason = sub.last_season || 0;
          const prevEpisode = sub.last_episode || 0;

          if (latestSeasonNum > prevSeason || (latestSeasonNum === prevSeason && latestEpisodeNum > prevEpisode)) {
            // New episode detected! Create notification
            const epMsg = `Вышла ${latestEpisodeNum} серия ${latestSeasonNum} сезона!`;
            await pool.query(
              `INSERT INTO notifications (user_id, title, message, media_type, media_id, poster, action_data, is_read)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
              [
                userId,
                sub.title,
                epMsg,
                'tv',
                sub.tmdb_id,
                sub.poster || details.poster || '',
                JSON.stringify({ seriesId: sub.tmdb_id, season: latestSeasonNum, episode: latestEpisodeNum })
              ]
            );

            // Update subscription with latest episode
            await pool.query(
              `UPDATE series_subscriptions SET last_season = $1, last_episode = $2 WHERE user_id = $3 AND tmdb_id = $4`,
              [latestSeasonNum, latestEpisodeNum, userId, sub.tmdb_id]
            );
            newCount++;
          }
        } catch (subErr) {
          // Continue scanning next subscriptions if one fails
        }
      }

      return { success: true, newEpisodesFound: newCount };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 9. EPG Reminders / Auto-switch
  app.get('/api/epg/reminders', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query(
        'SELECT id, channel_id, channel_name, program_title, start_ms, stop_ms, auto_switch, created_at FROM epg_reminders WHERE user_id = $1 ORDER BY start_ms ASC',
        [userId]
      );
      return {
        reminders: result.rows.map((row) => ({
          id: row.id,
          channelId: row.channel_id,
          channelName: row.channel_name,
          programTitle: row.program_title,
          startMs: Number(row.start_ms),
          stopMs: Number(row.stop_ms),
          autoSwitch: !!row.auto_switch,
          createdAt: row.created_at
        }))
      };
    } catch (err: any) {
      return { reminders: [] };
    }
  });

  app.post('/api/epg/reminders', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { channelId, channelName, programTitle, startMs, stopMs, autoSwitch } = request.body as {
      channelId: string;
      channelName: string;
      programTitle: string;
      startMs: number;
      stopMs: number;
      autoSwitch?: boolean;
    };

    if (!channelId || !programTitle || !startMs) {
      return { success: false, error: 'Missing required reminder parameters' };
    }

    try {
      const result = await pool.query(
        `INSERT INTO epg_reminders (user_id, channel_id, channel_name, program_title, start_ms, stop_ms, auto_switch)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, channelId, channelName || '', programTitle, startMs, stopMs || startMs + 3600000, autoSwitch !== false]
      );
      return { success: true, id: result.rows[0]?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  app.delete('/api/epg/reminders/:id', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    try {
      await pool.query(
        'DELETE FROM epg_reminders WHERE id = $1 AND user_id = $2',
        [parseInt(id, 10), userId]
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
