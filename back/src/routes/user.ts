import type { FastifyInstance, FastifyReply } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { testTelegramConnection } from '../services/telegram.js';

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

  // Get user Telegram Bot settings
  app.get('/api/user/telegram', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const result = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const prefs = result.rows[0]?.preferences || {};
      const token = prefs.telegram_bot_token || '';
      const chatId = prefs.telegram_chat_id || '';
      const allowedChats = Array.isArray(prefs.telegram_allowed_chats) ? prefs.telegram_allowed_chats : [];
      let botTokenMasked = '';
      if (token) {
        botTokenMasked = token.length > 10 ? `${token.slice(0, 4)}••••••••${token.slice(-4)}` : '••••••••';
      }
      return {
        configured: !!(token && chatId),
        botTokenMasked,
        chatId,
        allowedChats,
      };
    } catch (err: any) {
      return { configured: false, botTokenMasked: '', chatId: '', allowedChats: [] };
    }
  });

  // Save user Telegram Bot settings
  app.post('/api/user/telegram', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    const { botToken, chatId, allowedChats } = request.body as {
      botToken?: string;
      chatId?: string;
      allowedChats?: Array<{ chatId: string; name?: string } | string>;
    };

    try {
      const currentRes = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const prefs = currentRes.rows[0]?.preferences || {};

      if (botToken !== undefined) {
        if (botToken.trim()) prefs.telegram_bot_token = botToken.trim();
        else delete prefs.telegram_bot_token;
      }
      if (chatId !== undefined) {
        if (chatId.trim()) prefs.telegram_chat_id = chatId.trim();
        else delete prefs.telegram_chat_id;
      }
      if (allowedChats !== undefined) {
        if (Array.isArray(allowedChats)) {
          prefs.telegram_allowed_chats = allowedChats
            .map((item: any) => {
              if (typeof item === 'string') {
                const s = item.trim();
                return s ? { chatId: s, name: '' } : null;
              } else if (item && typeof item === 'object') {
                const c = String(item.chatId || '').trim();
                const n = String(item.name || '').trim();
                return c ? { chatId: c, name: n } : null;
              }
              return null;
            })
            .filter(Boolean);
        } else {
          delete prefs.telegram_allowed_chats;
        }
      }

      await pool.query(
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
        [userId, JSON.stringify(prefs)]
      );

      return {
        success: true,
        configured: !!(prefs.telegram_bot_token && prefs.telegram_chat_id),
        message: 'Настройки Telegram успешно сохранены',
      };
    } catch (err: any) {
      console.error('Error saving telegram settings:', err.message);
      return reply.code(500).send({ error: 'Failed to save Telegram settings' });
    }
  });

  // Test user Telegram Bot connection
  app.post('/api/user/telegram/test', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    const body = (request.body as { botToken?: string; chatId?: string }) || {};

    let botToken = body.botToken?.trim();
    let chatId = body.chatId?.trim();

    if (!botToken || !chatId) {
      // Load from stored preferences if not provided in body
      const res = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const prefs = res.rows[0]?.preferences || {};
      botToken = botToken || prefs.telegram_bot_token;
      chatId = chatId || prefs.telegram_chat_id;
    }

    if (!botToken || !chatId) {
      return reply.code(400).send({ ok: false, message: 'Укажите токен бота и Chat ID' });
    }

    const testRes = await testTelegramConnection(botToken, chatId);
    return testRes;
  });

  // Internal endpoint for Python bot runner to discover active user bot tokens & proxy
  app.get('/api/internal/telegram-bots', async () => {
    try {
      const proxyRes = await pool.query("SELECT value FROM app_settings WHERE key = 'tmdb_proxy_url'");
      const proxyUrl = (proxyRes.rows[0]?.value || process.env.TMDB_PROXY_URL || '').trim();

      const usersRes = await pool.query(
        `SELECT u.id, u.name, u.email, p.preferences 
         FROM users u
         JOIN user_preferences p ON p.user_id = u.id`
      );

      let rows = usersRes.rows || [];
      if (rows.length === 0) {
        try {
          const prefsRes = await pool.query('SELECT user_id, preferences FROM user_preferences');
          const usersList = await pool.query('SELECT id, name, email FROM users');
          rows = (prefsRes.rows || []).map((p: any) => {
            const u = (usersList.rows || []).find((usr: any) => Number(usr.id) === Number(p.user_id));
            return {
              id: p.user_id,
              name: u?.name || 'Пользователь',
              email: u?.email || '',
              preferences: p.preferences,
            };
          });
        } catch {}
      }

      const bots = rows
        .map((r: any) => {
          let prefs = r.preferences || {};
          if (typeof prefs === 'string') {
            try { prefs = JSON.parse(prefs); } catch {}
          }
          const token = (prefs.telegram_bot_token || '').trim();
          const chatId = (prefs.telegram_chat_id || '').trim();
          if (!token) return null;

          const rawAllowed = Array.isArray(prefs.telegram_allowed_chats) ? prefs.telegram_allowed_chats : [];
          const allowedChatIds: string[] = [];
          for (const item of rawAllowed) {
            if (typeof item === 'string' && item.trim()) {
              allowedChatIds.push(item.trim());
            } else if (item && typeof item === 'object' && item.chatId) {
              const c = String(item.chatId).trim();
              if (c) allowedChatIds.push(c);
            }
          }

          return {
            userId: r.id,
            userName: r.name,
            token,
            chatId,
            allowedChatIds,
          };
        })
        .filter(Boolean);

      return { proxyUrl, bots };
    } catch (err: any) {
      return { proxyUrl: '', bots: [] };
    }
  });

  // Get preferred voiceover
  app.get('/api/user/voiceover', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    try {
      const res = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const prefs = res.rows[0]?.preferences || {};
      const vo = prefs.preferred_voiceover || '';
      return { preferredVoiceover: vo, voiceover: vo };
    } catch {
      return { preferredVoiceover: '', voiceover: '' };
    }
  });

  // Save preferred voiceover
  app.post('/api/user/voiceover', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    const body = (request.body as any) || {};
    const preferredVoiceover = body.preferredVoiceover || body.voiceover || '';

    try {
      const res = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const prefs = res.rows[0]?.preferences || {};
      prefs.preferred_voiceover = (preferredVoiceover || '').trim();

      await pool.query(
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
        [userId, JSON.stringify(prefs)]
      );

      return { success: true, preferredVoiceover: prefs.preferred_voiceover };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Get favorites
  app.get('/api/user/favorites', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);

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
  app.post('/api/user/favorites', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const body = (request.body || {}) as any;
    const userId = request.user?.userId || (body.userId ? parseInt(body.userId, 10) : 1);
    const { tmdbId, mediaType, titleName, poster } = body;

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
  app.delete('/api/user/favorites/:tmdbId', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : (bodyUserId ? parseInt(bodyUserId, 10) : 1));
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
  app.delete('/api/user/history/:tmdbId', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user?.userId || 1;
    const { tmdbId } = request.params as { tmdbId: string };

    await pool.query(
      'DELETE FROM watch_history WHERE user_id = $1 AND tmdb_id = $2',
      [userId, parseInt(tmdbId)]
    );

    return { success: true };
  });

  // Get watch history
  app.get('/api/user/history', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user?.userId || 1;

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
  app.post('/api/user/history', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user?.userId || 1;
    const { tmdbId, mediaType, titleName, poster, progress, timestamp } = request.body as {
      tmdbId?: number; mediaType?: string; titleName?: string; poster?: string; progress?: number; timestamp?: number;
    };

    if (!tmdbId) {
      return { error: 'tmdbId is required' };
    }

    const effectiveTitle = titleName || ('Медиа #' + tmdbId);
    const effectiveType = mediaType || 'movie';

    const result = await pool.query(
      `INSERT INTO watch_history (user_id, tmdb_id, media_type, title_name, poster, progress, timestamp, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, tmdb_id, media_type)
       DO UPDATE SET
         progress = EXCLUDED.progress,
         timestamp = GREATEST(watch_history.timestamp, EXCLUDED.timestamp),
         title_name = COALESCE(EXCLUDED.title_name, watch_history.title_name),
         poster = COALESCE(EXCLUDED.poster, watch_history.poster),
         updated_at = NOW()
       RETURNING id`,
      [userId, tmdbId, effectiveType, effectiveTitle, poster || '', progress || 0, timestamp || Date.now()]
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
