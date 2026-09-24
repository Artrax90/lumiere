import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';

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

let sessionTablesReady = false;
async function ensureSessionTables() {
  if (sessionTablesReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS playback_sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id INTEGER,
        device_type VARCHAR(50) DEFAULT 'web',
        device_name VARCHAR(255) DEFAULT '',
        client_ip VARCHAR(100) DEFAULT '',
        media_type VARCHAR(50) DEFAULT 'movie',
        media_id VARCHAR(255) DEFAULT '',
        media_title VARCHAR(500) NOT NULL,
        media_poster VARCHAR(500) DEFAULT '',
        season INTEGER DEFAULT 0,
        episode INTEGER DEFAULT 0,
        current_time NUMERIC DEFAULT 0,
        duration NUMERIC DEFAULT 0,
        is_paused BOOLEAN DEFAULT FALSE,
        terminate_requested BOOLEAN DEFAULT FALSE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS playback_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        device_type VARCHAR(50) DEFAULT 'web',
        device_name VARCHAR(255) DEFAULT '',
        media_type VARCHAR(50) DEFAULT 'movie',
        media_id VARCHAR(255) DEFAULT '',
        media_title VARCHAR(500) NOT NULL,
        media_poster VARCHAR(500) DEFAULT '',
        season INTEGER DEFAULT 0,
        episode INTEGER DEFAULT 0,
        watched_seconds NUMERIC DEFAULT 0,
        duration NUMERIC DEFAULT 0,
        completed BOOLEAN DEFAULT FALSE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playback_sessions_user_id ON playback_sessions(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playback_sessions_last_heartbeat ON playback_sessions(last_heartbeat)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playback_history_user_id ON playback_history(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_playback_history_ended_at ON playback_history(ended_at)`).catch(() => {});

    await pool.query(`ALTER TABLE IF EXISTS playback_sessions ALTER COLUMN user_id DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE IF EXISTS playback_history ALTER COLUMN user_id DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE IF EXISTS playback_sessions DROP CONSTRAINT IF EXISTS playback_sessions_user_id_fkey`).catch(() => {});
    await pool.query(`ALTER TABLE IF EXISTS playback_history DROP CONSTRAINT IF EXISTS playback_history_user_id_fkey`).catch(() => {});

    sessionTablesReady = true;
    console.log('[Sessions] Playback session tables ready');
  } catch (err: any) {
    console.error('[Sessions] ensureSessionTables error:', err.message);
  }
}

export function sessionRoutes(app: FastifyInstance) {
  // Ensure tables exist on startup
  ensureSessionTables().catch(() => {});

  // 1. Send heartbeat / update active playback session
  app.post(
    '/api/sessions/heartbeat',
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply) => {
      await ensureSessionTables();
      let userId = req.user?.userId;
      if (userId) {
        try {
          const uRes = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
          if (uRes.rows.length === 0) userId = undefined;
        } catch {
          userId = undefined;
        }
      }
      if (!userId) {
        try {
          const firstUser = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
          if (firstUser.rows.length > 0) {
            userId = firstUser.rows[0].id;
          }
        } catch {}
      }

      const body = req.body as HeartbeatBody;

      if (!body.sessionId) {
        return reply.code(400).send({ error: 'sessionId is required' });
      }

      const clientIp = (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim();
      const deviceType = body.deviceType || 'web';
      const deviceName = body.deviceName || (deviceType === 'tv' ? 'Smart TV' : 'Web Browser');
      const mediaType = (body.mediaType === 'live' ? 'iptv' : body.mediaType) || 'movie';
      const mediaId = String(body.mediaId || '');
      const mediaTitle = body.mediaTitle || 'Воспроизведение';
      const mediaPoster = body.mediaPoster || '';
      const season = Number(body.season || 0);
      const episode = Number(body.episode || 0);
      const currentTime = Number(body.currentTime || 0);
      const duration = Number(body.duration || 0);
      const isPaused = !!body.isPaused;

      console.log(`[Sessions] Heartbeat: session=${body.sessionId}, user=${userId || 'guest'}, title="${mediaTitle}", dev=${deviceType}, time=${currentTime}/${duration}, paused=${isPaused}`);

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
            user_id = COALESCE(EXCLUDED.user_id, playback_sessions.user_id),
            device_type = EXCLUDED.device_type,
            device_name = EXCLUDED.device_name,
            client_ip = EXCLUDED.client_ip,
            media_type = EXCLUDED.media_type,
            media_id = EXCLUDED.media_id,
            media_title = EXCLUDED.media_title,
            media_poster = EXCLUDED.media_poster,
            season = EXCLUDED.season,
            episode = EXCLUDED.episode,
            current_time = EXCLUDED.current_time,
            duration = EXCLUDED.duration,
            is_paused = EXCLUDED.is_paused,
            last_heartbeat = CURRENT_TIMESTAMP`,
          [
            body.sessionId,
            userId || null,
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

        // Sync to playback_history if (currentTime > 5 or duration > 0 or mediaType === 'iptv')
        if (currentTime > 5 || duration > 0 || mediaType === 'iptv') {
          const isCompleted = duration > 0 && currentTime / duration >= 0.9;
          
          // Check for existing playback_history row for this item within the last 4 hours
          let existingRes;
          if (userId) {
            existingRes = await pool.query(
              `SELECT id, watched_seconds FROM playback_history 
               WHERE user_id = $1 AND media_id = $2 AND media_type = $3 AND season = $4 AND episode = $5 
               AND ended_at > NOW() - INTERVAL '4 hours' 
               ORDER BY ended_at DESC LIMIT 1`,
              [userId, mediaId, mediaType, season, episode]
            );
          } else {
            existingRes = await pool.query(
              `SELECT id, watched_seconds FROM playback_history 
               WHERE media_id = $1 AND media_type = $2 AND season = $3 AND episode = $4 
               AND ended_at > NOW() - INTERVAL '4 hours' 
               ORDER BY ended_at DESC LIMIT 1`,
              [mediaId, mediaType, season, episode]
            );
          }

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
                userId || null,
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
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) {
        return reply.code(400).send({ error: 'sessionId is required' });
      }

      try {
        await ensureSessionTables();
        const sessRes = await pool.query('SELECT * FROM playback_sessions WHERE id = $1', [sessionId]);
        if (sessRes.rows.length > 0) {
          const s = sessRes.rows[0];
          const isCompleted = Number(s.duration) > 0 && Number(s.current_time) / Number(s.duration) >= 0.9;
          await pool.query(
            `INSERT INTO playback_history (
              user_id, device_type, device_name,
              media_type, media_id, media_title, media_poster,
              season, episode, watched_seconds, duration, completed,
              ended_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
            [
              s.user_id || null, s.device_type, s.device_name,
              s.media_type, s.media_id, s.media_title, s.media_poster,
              s.season, s.episode, s.current_time, s.duration, isCompleted
            ]
          ).catch(() => {});
        }
        console.log(`[Sessions] Stop session: id=${sessionId}`);
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
    { preHandler: [optionalAuth] },
    async (_req: AuthenticatedRequest, reply) => {
      try {
        await ensureSessionTables();
        const result = await pool.query(
          `SELECT ps.*, 
                  COALESCE(u.name, ps.device_name, 'Пользователь') as user_name, 
                  COALESCE(u.avatar, '') as user_avatar, 
                  COALESCE(u.email, '') as user_email, 
                  COALESCE(u.is_kids, false) as is_kids
           FROM playback_sessions ps
           LEFT JOIN users u ON u.id = ps.user_id
           WHERE ps.last_heartbeat >= NOW() - INTERVAL '5 minutes'
           ORDER BY ps.last_heartbeat DESC`
        );

        console.log(`[Sessions] Active: found ${result.rows.length} sessions`);

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
        console.error('[Sessions] active query error:', err.message);
        return { sessions: [] };
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
        await ensureSessionTables();
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
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const query = req.query as { limit?: string; offset?: string; userId?: string };
      const limit = Math.min(Number(query.limit || 50), 100);
      const targetUserId = query.userId ? Number(query.userId) : null;

      try {
        await ensureSessionTables();
        let result;
        if (targetUserId) {
          result = await pool.query(
            `SELECT ph.*, 
                    COALESCE(u.name, ph.device_name, 'Пользователь') as user_name, 
                    COALESCE(u.avatar, '') as user_avatar
             FROM playback_history ph
             LEFT JOIN users u ON u.id = ph.user_id
             WHERE ph.user_id = $1
             ORDER BY ph.ended_at DESC
             LIMIT ${limit}`,
            [targetUserId]
          );
        } else {
          result = await pool.query(
            `SELECT ph.*, 
                    COALESCE(u.name, ph.device_name, 'Пользователь') as user_name, 
                    COALESCE(u.avatar, '') as user_avatar
             FROM playback_history ph
             LEFT JOIN users u ON u.id = ph.user_id
             ORDER BY ph.ended_at DESC
             LIMIT ${limit}`
          );
        }


        console.log(`[Sessions] History: found ${result.rows.length} records`);

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
        console.error('[Sessions] history query error:', err.message);
        return { history: [] };
      }
    }
  );

  // 6. Delete single history record
  app.delete(
    '/api/sessions/history/:id',
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const { id } = req.params as { id: string };
      try {
        await ensureSessionTables();
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
    { preHandler: [optionalAuth] },
    async (req: AuthenticatedRequest, reply) => {
      const user = req.user;
      try {
        await ensureSessionTables();
        if (!user || user.role === 'admin') {
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
