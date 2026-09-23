import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

interface HeartbeatBody {
  sessionId: string;
  deviceType?: 'tv' | 'web' | 'mobile';
  deviceName?: string;
  mediaType: 'movie' | 'tv' | 'iptv' | 'live' | string;
  mediaId: string | number;
  mediaTitle: string;
  mediaPoster?: string;
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  isPaused?: boolean;
}

export function sessionRoutes(app: FastifyInstance) {
  // 1. Send heartbeat / update active playback session
  app.post(
    '/api/sessions/heartbeat',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const user = req.user!;
      const body = req.body as HeartbeatBody;

      if (!body.sessionId || !body.mediaTitle) {
        return reply.code(400).send({ error: 'sessionId and mediaTitle are required' });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim();
      const deviceType = body.deviceType || 'web';
      const deviceName = body.deviceName || (deviceType === 'tv' ? 'Smart TV' : 'Web Browser');
      const mediaType = (body.mediaType === 'live' ? 'iptv' : body.mediaType) || 'movie';
      const mediaId = String(body.mediaId || '');
      const mediaTitle = body.mediaTitle;
      const mediaPoster = body.mediaPoster || '';
      const season = Number(body.season || 0);
      const episode = Number(body.episode || 0);
      const currentTime = Number(body.currentTime || 0);
      const duration = Number(body.duration || 0);
      const isPaused = !!body.isPaused;

      try {
        // Upsert into playback_sessions
        await pool.query(
          `INSERT INTO playback_sessions (
            id, user_id, device_type, device_name, client_ip,
            media_type, media_id, media_title, media_poster,
            season, episode, current_time, duration, is_paused,
            last_heartbeat
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            current_time = EXCLUDED.current_time,
            duration = EXCLUDED.duration,
            is_paused = EXCLUDED.is_paused,
            last_heartbeat = CURRENT_TIMESTAMP`,
          [
            body.sessionId,
            user.userId,
            deviceType,
            deviceName,
            clientIp,
            mediaType,
            mediaId,
            mediaTitle,
            mediaPoster,
            season,
            episode,
            currentTime,
            duration,
            isPaused,
          ]
        );

        // Check if termination was requested by admin
        const checkRes = await pool.query('SELECT terminate_requested FROM playback_sessions WHERE id = $1', [body.sessionId]);
        const terminate = checkRes.rows.length > 0 && !!checkRes.rows[0].terminate_requested;

        // Sync to playback_history if currentTime > 5 or duration > 0 or mediaType === 'iptv'
        if (currentTime > 5 || duration > 0 || mediaType === 'iptv') {
          const isCompleted = duration > 0 && currentTime / duration >= 0.9;
          
          // Check for existing playback_history row for this item within the last 4 hours
          const existingRes = await pool.query(
            `SELECT id, watched_seconds FROM playback_history 
             WHERE user_id = $1 AND media_id = $2 AND media_type = $3 AND season = $4 AND episode = $5 
             AND ended_at > NOW() - INTERVAL '4 hours' 
             ORDER BY ended_at DESC LIMIT 1`,
            [user.userId, mediaId, mediaType, season, episode]
          );

          if (existingRes.rows.length > 0) {
            const histId = existingRes.rows[0].id;
            await pool.query(
              `UPDATE playback_history SET 
                watched_seconds = GREATEST(watched_seconds, $1),
                duration = GREATEST(duration, $2),
                completed = $3,
                device_type = $4,
                device_name = $5,
                ended_at = CURRENT_TIMESTAMP
               WHERE id = $6`,
              [currentTime, duration, isCompleted, deviceType, deviceName, histId]
            );
          } else {
            await pool.query(
              `INSERT INTO playback_history (
                user_id, device_type, device_name,
                media_type, media_id, media_title, media_poster,
                season, episode, watched_seconds, duration, completed
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                user.userId,
                deviceType,
                deviceName,
                mediaType,
                mediaId,
                mediaTitle,
                mediaPoster,
                season,
                episode,
                currentTime,
                duration,
                isCompleted,
              ]
            );
          }
        }

        return { success: true, terminate };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 2. Stop session when playback finishes or player closes
  app.post(
    '/api/sessions/stop',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) {
        return reply.code(400).send({ error: 'sessionId is required' });
      }

      try {
        await pool.query('DELETE FROM playback_sessions WHERE id = $1', [sessionId]);
        return { success: true };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 3. Get currently active playback sessions (Jellyfin-style "Кто что смотрит сейчас")
  app.get(
    '/api/sessions/active',
    { preHandler: [requireAuth] },
    async (_req: AuthenticatedRequest, reply) => {
      try {
        const result = await pool.query(
          `SELECT ps.*, u.name as user_name, u.avatar as user_avatar, u.email as user_email, u.is_kids
           FROM playback_sessions ps
           JOIN users u ON u.id = ps.user_id
           WHERE ps.last_heartbeat >= NOW() - INTERVAL '35 seconds'
           ORDER BY ps.last_heartbeat DESC`
        );

        return {
          sessions: result.rows.map((r: any) => ({
            id: r.id,
            userId: r.user_id,
            userName: r.user_name || 'Пользователь',
            userAvatar: r.user_avatar || '',
            userEmail: r.user_email || '',
            isKids: !!r.is_kids,
            deviceType: r.device_type || 'web',
            deviceName: r.device_name || '',
            clientIp: r.client_ip || '',
            mediaType: r.media_type || 'movie',
            mediaId: r.media_id,
            mediaTitle: r.media_title,
            mediaPoster: r.media_poster || '',
            season: r.season || 0,
            episode: r.episode || 0,
            currentTime: Number(r.current_time || 0),
            duration: Number(r.duration || 0),
            isPaused: !!r.is_paused,
            terminateRequested: !!r.terminate_requested,
            startedAt: r.started_at,
            lastHeartbeat: r.last_heartbeat,
          })),
        };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 4. Remote playback termination (Admin can stop any session)
  app.post(
    '/api/sessions/:id/terminate',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const user = req.user!;
      if (user.role !== 'admin') {
        return reply.code(403).send({ error: 'Only administrators can terminate active sessions' });
      }

      const { id } = req.params as { id: string };
      try {
        await pool.query('UPDATE playback_sessions SET terminate_requested = true WHERE id = $1', [id]);
        return { success: true, message: 'Session termination requested' };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 5. Get playback history across users
  app.get(
    '/api/sessions/history',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const user = req.user!;
      const query = req.query as { limit?: string; offset?: string; userId?: string };
      const limit = Math.min(Number(query.limit || 50), 100);
      const targetUserId = (user.role === 'admin' && query.userId) ? Number(query.userId) : (user.role === 'admin' ? null : user.userId);

      try {
        let result;
        if (targetUserId) {
          result = await pool.query(
            `SELECT ph.*, u.name as user_name, u.avatar as user_avatar
             FROM playback_history ph
             JOIN users u ON u.id = ph.user_id
             WHERE ph.user_id = $1
             ORDER BY ph.ended_at DESC
             LIMIT ${limit}`,
            [targetUserId]
          );
        } else {
          result = await pool.query(
            `SELECT ph.*, u.name as user_name, u.avatar as user_avatar
             FROM playback_history ph
             JOIN users u ON u.id = ph.user_id
             ORDER BY ph.ended_at DESC
             LIMIT ${limit}`
          );
        }

        return {
          history: result.rows.map((r: any) => ({
            id: r.id,
            userId: r.user_id,
            userName: r.user_name || 'Пользователь',
            userAvatar: r.user_avatar || '',
            deviceType: r.device_type || 'web',
            deviceName: r.device_name || '',
            mediaType: r.media_type || 'movie',
            mediaId: r.media_id,
            mediaTitle: r.media_title,
            mediaPoster: r.media_poster || '',
            season: r.season || 0,
            episode: r.episode || 0,
            watchedSeconds: Number(r.watched_seconds || 0),
            duration: Number(r.duration || 0),
            completed: !!r.completed,
            startedAt: r.started_at,
            endedAt: r.ended_at,
          })),
        };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 6. Delete single history record
  app.delete(
    '/api/sessions/history/:id',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const { id } = req.params as { id: string };
      try {
        await pool.query('DELETE FROM playback_history WHERE id = $1', [Number(id)]);
        return { success: true };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  // 7. Clear all playback history (Admin can clear all, regular user clears own)
  app.delete(
    '/api/sessions/history',
    { preHandler: [requireAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const user = req.user!;
      try {
        if (user.role === 'admin') {
          await pool.query('DELETE FROM playback_history');
        } else {
          await pool.query('DELETE FROM playback_history WHERE user_id = $1', [user.userId]);
        }
        return { success: true };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );
}
