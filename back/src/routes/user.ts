import type { FastifyInstance, FastifyReply } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export function userRoutes(app: FastifyInstance) {
  // Get profile
  app.get('/api/user/profile', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    try {
      const result = await pool.query(
        'SELECT id, email, name, avatar, role, is_kids, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role || 'user',
          isKids: !!user.is_kids,
          createdAt: user.created_at,
        };
      }
    } catch {}

    // Fallback for user from token
    return {
      id: userId || 1,
      email: request.user?.email || '',
      name: request.user?.name || 'Пользователь',
      avatar: '',
      role: request.user?.role || 'user',
      isKids: !!request.user?.isKids,
      createdAt: new Date().toISOString(),
    };
  });

  // Update profile
  app.put('/api/user/profile', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { name, avatar } = request.body as { name?: string; avatar?: string };

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return { error: 'No fields to update' };
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, avatar, created_at`,
      values
    );

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.created_at,
    };
  });

  // Get user preferences (e.g. home page shelf order, visibility)
  app.get('/api/user/preferences', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query(
        'SELECT preferences FROM user_preferences WHERE user_id = $1',
        [userId]
      );
      if (result.rows.length > 0) {
        return { preferences: result.rows[0].preferences || {} };
      }
    } catch (err: any) {
      console.warn('Error fetching preferences:', err.message);
    }
    return { preferences: {} };
  });

  // Save / Update user preferences
  app.put('/api/user/preferences', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { preferences } = (request.body as { preferences?: Record<string, any> }) || {};
    const prefData = preferences || {};

    try {
      await pool.query(
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
        [userId, JSON.stringify(prefData)]
      );
      return { success: true, preferences: prefData };
    } catch (err: any) {
      console.error('Error saving preferences:', err.message);
      return { error: 'Failed to save preferences' };
    }
  });

  // Get favorites
  app.get('/api/user/favorites', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const result = await pool.query(
      'SELECT id, tmdb_id, media_type, title_name, poster, added_at FROM favorites WHERE user_id = $1 ORDER BY added_at DESC',
      [userId]
    );

    return { favorites: result.rows.map((r) => ({
      id: r.id,
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      titleName: r.title_name,
      poster: r.poster,
      addedAt: r.added_at,
    })) };
  });

  // Add to favorites
  app.post('/api/user/favorites', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId, mediaType, titleName, poster } = request.body as {
      tmdbId?: number; mediaType?: string; titleName?: string; poster?: string;
    };

    if (!tmdbId || !mediaType || !titleName) {
      return { error: 'tmdbId, mediaType, and titleName are required' };
    }

    const result = await pool.query(
      `INSERT INTO favorites (user_id, tmdb_id, media_type, title_name, poster)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, tmdb_id, media_type) DO NOTHING
       RETURNING id`,
      [userId, tmdbId, mediaType, titleName, poster || '']
    );

    return { success: true, id: result.rows[0]?.id };
  });

  // Remove from favorites
  app.delete('/api/user/favorites/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };

    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND tmdb_id = $2',
      [userId, parseInt(tmdbId)]
    );

    return { success: true };
  });

  // Get watchlist ("Буду смотреть")
  app.get('/api/user/watchlist', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const result = await pool.query(
      'SELECT id, tmdb_id, media_type, title_name, poster, added_at FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
      [userId]
    );

    return { watchlist: result.rows.map((r) => ({
      id: r.id,
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      titleName: r.title_name,
      poster: r.poster,
      addedAt: r.added_at,
    })) };
  });

  // Add to watchlist
  app.post('/api/user/watchlist', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId, mediaType, titleName, poster } = request.body as {
      tmdbId?: number; mediaType?: string; titleName?: string; poster?: string;
    };

    if (!tmdbId || !mediaType || !titleName) {
      return { error: 'tmdbId, mediaType, and titleName are required' };
    }

    const result = await pool.query(
      `INSERT INTO watchlist (user_id, tmdb_id, media_type, title_name, poster)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, tmdb_id, media_type) DO NOTHING
       RETURNING id`,
      [userId, tmdbId, mediaType, titleName, poster || '']
    );

    return { success: true, id: result.rows[0]?.id };
  });

  // Remove from watchlist
  app.delete('/api/user/watchlist/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };

    await pool.query(
      'DELETE FROM watchlist WHERE user_id = $1 AND tmdb_id = $2',
      [userId, parseInt(tmdbId)]
    );

    return { success: true };
  });

  // Remove from history ("Просмотрено")
  app.delete('/api/user/history/:tmdbId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId } = request.params as { tmdbId: string };

    await pool.query(
      'DELETE FROM watch_history WHERE user_id = $1 AND tmdb_id = $2',
      [userId, parseInt(tmdbId)]
    );

    return { success: true };
  });

  // Get watch history
  app.get('/api/user/history', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const result = await pool.query(
      'SELECT id, tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at FROM watch_history WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );

    return { history: result.rows.map((r) => ({
      id: r.id,
      tmdbId: r.tmdb_id,
      mediaType: r.media_type,
      titleName: r.title_name,
      poster: r.poster,
      progress: r.progress,
      timestamp: r.timestamp,
      updatedAt: r.updated_at,
    })) };
  });

  // Update watch progress
  app.post('/api/user/history', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { tmdbId, mediaType, titleName, poster, progress, timestamp } = request.body as {
      tmdbId?: number; mediaType?: string; titleName?: string; poster?: string; progress?: number; timestamp?: number;
    };

    if (!tmdbId || !mediaType || !titleName) {
      return { error: 'tmdbId, mediaType, and titleName are required' };
    }

    const result = await pool.query(
      `INSERT INTO watch_history (user_id, tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tmdb_id, media_type)
       DO UPDATE SET progress = $6, timestamp = $7, updated_at = NOW()
       RETURNING id`,
      [userId, tmdbId, mediaType, titleName, poster || '', progress || 0, timestamp || 0]
    );

    return { success: true, id: result.rows[0]?.id };
  });

  // Activity tracking (in-memory for now)
  const activityLog: Array<{
    userId: number;
    userName: string;
    action: string;
    titleId: number;
    titleName: string;
    timestamp: number;
  }> = [];

  // Report current activity
  app.post('/api/user/activity', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: true }; // No auth, skip logging
    }
    const token = authHeader.slice(7);
    const { verifyAccessToken } = await import('../services/auth.js');
    const payload = verifyAccessToken(token);
    if (!payload) {
      return { success: true }; // Token expired, skip logging
    }
    const userId = payload.userId;
    const { action, titleId, titleName } = request.body as {
      action: string;
      titleId: number;
      titleName: string;
    };

    // Get user name
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.name || 'Unknown';

    activityLog.unshift({
      userId,
      userName,
      action,
      titleId,
      titleName,
      timestamp: Date.now(),
    });

    // Keep only last 100 entries
    if (activityLog.length > 100) activityLog.length = 100;

    return { success: true };
  });

  // Get activity log (admin only)
  app.get('/api/admin/activity', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    // Check if user is admin (first user)
    const users = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
    if (users.rows[0]?.id !== userId) {
      return { error: 'Admin only' };
    }

    return { activities: activityLog };
  });
}
