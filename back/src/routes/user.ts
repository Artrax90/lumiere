import type { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export function userRoutes(app: FastifyInstance) {
  // Get profile
  app.get('/api/user/profile', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    const result = await pool.query(
      'SELECT id, email, name, avatar, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { error: 'User not found' };
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.created_at,
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
}
