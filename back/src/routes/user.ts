import type { FastifyInstance, FastifyReply } from 'fastify';
import pool from '../db/pool.js';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { testTelegramConnection } from '../services/telegram.js';
import { comparePassword } from '../services/auth.js';

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
      const cur = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [userId]);
      const existing = (cur.rows.length > 0 && cur.rows[0].preferences) ? cur.rows[0].preferences : {};
      const merged = { ...existing, ...prefData };

      await pool.query(
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET preferences = $2, updated_at = NOW()`,
        [userId, JSON.stringify(merged)]
      );
      return { success: true, preferences: merged };
    } catch (err: any) {
      console.error('Error saving preferences:', err.message);
      return { error: 'Failed to save preferences' };
    }
  });

  // Helper to ensure admin only
  async function isCallerAdmin(request: AuthenticatedRequest): Promise<boolean> {
    if (request.user?.role === 'admin') return true;
    try {
      const res = await pool.query('SELECT role FROM users WHERE id = $1', [request.user!.userId]);
      return res.rows.length > 0 && res.rows[0].role === 'admin';
    } catch {
      return false;
    }
  }

  // Get user Telegram Bot settings (Admin only)
  app.get('/api/user/telegram', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    if (!(await isCallerAdmin(request))) {
      return reply.code(403).send({ error: 'Только администратор имеет доступ к настройке Telegram-бота' });
    }
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

  // Save user Telegram Bot settings (Admin only)
  app.post('/api/user/telegram', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    if (!(await isCallerAdmin(request))) {
      return reply.code(403).send({ error: 'Только администратор имеет доступ к настройке Telegram-бота' });
    }
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
        const trimmedToken = botToken.trim();
        if (trimmedToken) {
          if (!/^\d{6,14}:[A-Za-z0-9_-]{20,}$/.test(trimmedToken)) {
            return reply.code(400).send({
              error: 'Неверный формат токена Telegram-бота. Токен от @BotFather должен иметь вид: 123456789:ABCdefGHI...'
            });
          }
          prefs.telegram_bot_token = trimmedToken;
        } else {
          delete prefs.telegram_bot_token;
        }
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

  // Test user Telegram Bot connection (Admin only)
  app.post('/api/user/telegram/test', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    if (!(await isCallerAdmin(request))) {
      return reply.code(403).send({ error: 'Только администратор имеет доступ к настройке Telegram-бота' });
    }
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

  // Internal endpoint to resolve Lumiere user by Telegram Chat ID for strict 1 user = 1 universe isolation
  app.get('/api/internal/telegram-user', async (request, reply) => {
    const queryChatId = (request.query as any)?.chatId;
    if (!queryChatId) {
      return { found: false, error: 'chatId query parameter is required' };
    }

    const cleanChatId = String(queryChatId).trim();
    try {
      // 1. Direct match on user_preferences.telegram_chat_id
      const usersRes = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, p.preferences
         FROM users u
         JOIN user_preferences p ON p.user_id = u.id`
      );

      for (const row of usersRes.rows || []) {
        let prefs = row.preferences || {};
        if (typeof prefs === 'string') {
          try { prefs = JSON.parse(prefs); } catch {}
        }
        const userChatId = String(prefs.telegram_chat_id || prefs.telegramChatId || '').trim();
        if (userChatId && userChatId === cleanChatId) {
          return {
            found: true,
            userId: row.id,
            userName: row.name,
            email: row.email,
            role: row.role || 'user',
          };
        }
      }

      // 2. Check admin allowed_chats if mapped to a specific userId or user name
      for (const row of usersRes.rows || []) {
        let prefs = row.preferences || {};
        if (typeof prefs === 'string') {
          try { prefs = JSON.parse(prefs); } catch {}
        }
        const allowed = Array.isArray(prefs.telegram_allowed_chats) ? prefs.telegram_allowed_chats : [];
        for (const item of allowed) {
          if (!item) continue;
          const allowedCid = typeof item === 'string' ? item.trim() : String(item.chatId || '').trim();
          if (allowedCid === cleanChatId) {
            // If item has explicit userId
            if (typeof item === 'object' && item.userId) {
              const matchedUser = (usersRes.rows || []).find((u: any) => Number(u.id) === Number(item.userId));
              if (matchedUser) {
                return {
                  found: true,
                  userId: matchedUser.id,
                  userName: matchedUser.name,
                  email: matchedUser.email,
                  role: matchedUser.role || 'user',
                };
              }
            }
            // If item name matches user name or email
            if (typeof item === 'object' && item.name) {
              const n = String(item.name).trim().toLowerCase();
              const matchedUser = (usersRes.rows || []).find(
                (u: any) => u.name.toLowerCase() === n || u.email.toLowerCase() === n
              );
              if (matchedUser) {
                return {
                  found: true,
                  userId: matchedUser.id,
                  userName: matchedUser.name,
                  email: matchedUser.email,
                  role: matchedUser.role || 'user',
                };
              }
            }
          }
        }
      }

      return { found: false };
    } catch (err: any) {
      return reply.code(500).send({ found: false, error: err.message });
    }
  });

  // Internal endpoint to link a Telegram Chat ID to a user account (/link command)
  app.post('/api/internal/telegram-link', async (request, reply) => {
    const { chatId, email, password } = (request.body as any) || {};
    if (!chatId || !email || !password) {
      return { success: false, error: 'chatId, email и password обязательны' };
    }

    try {
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanChatId = String(chatId).trim();

      const userRes = await pool.query(
        'SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = $1',
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        return { success: false, error: 'Пользователь с таким email не найден' };
      }

      const user = userRes.rows[0];
      const valid = await comparePassword(String(password), user.password_hash);
      if (!valid) {
        return { success: false, error: 'Неверный пароль' };
      }

      // Save telegram_chat_id into user_preferences
      const prefRes = await pool.query('SELECT preferences FROM user_preferences WHERE user_id = $1', [user.id]);
      let prefs = prefRes.rows[0]?.preferences || {};
      if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch {}
      }
      prefs.telegram_chat_id = cleanChatId;

      await pool.query(
        `INSERT INTO user_preferences (user_id, preferences) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences`,
        [user.id, JSON.stringify(prefs)]
      );

      console.log(`[TelegramLink] Successfully linked Telegram Chat ID ${cleanChatId} to user "${user.name}" (ID ${user.id})`);

      return {
        success: true,
        userId: user.id,
        userName: user.name,
        email: user.email,
      };
    } catch (err: any) {
      return reply.code(500).send({ success: false, error: err.message });
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

    // Auto-subscribe movie to digital release tracking
    if (mediaType === 'movie' || mediaType === 'film') {
      pool.query(
        `INSERT INTO series_subscriptions (user_id, tmdb_id, title, poster, last_season, last_episode, media_type, target_quality, is_notified)
         VALUES ($1, $2, $3, $4, 0, 0, 'movie', 'digital', false)
         ON CONFLICT (user_id, tmdb_id) DO NOTHING`,
        [userId, tmdbId, titleName, poster || '']
      ).catch((subErr: any) => console.warn('[Favorites] Auto-subscribe movie release notice failed:', subErr.message));
    }

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
  app.get('/api/user/watchlist', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : 1);

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
  app.post('/api/user/watchlist', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const body = (request.body || {}) as any;
    const userId = request.user?.userId || (body.userId ? parseInt(body.userId, 10) : 1);
    const { tmdbId, mediaType, titleName, poster } = body;

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
  app.delete('/api/user/watchlist/:tmdbId', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const bodyUserId = (request.body as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? parseInt(queryUserId, 10) : (bodyUserId ? parseInt(bodyUserId, 10) : 1));
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

  // Get aggregated watch statistics for the current user
  app.get('/api/user/stats', { preHandler: optionalAuth }, async (request: AuthenticatedRequest) => {
    const queryUserId = (request.query as any)?.userId;
    const userId = request.user?.userId || (queryUserId ? Number(queryUserId) : 1);

    try {
      // 1. Playback history stats
      const playRes = await pool.query(
        `SELECT
           COALESCE(SUM(watched_seconds), 0)::bigint AS total_watch_seconds,
           COUNT(DISTINCT COALESCE(NULLIF(media_id, ''), media_title))::int AS unique_titles_count,
           COUNT(*)::int AS total_sessions,
           COUNT(DISTINCT CASE WHEN media_type = 'movie' THEN COALESCE(NULLIF(media_id, ''), media_title) END)::int AS movies_count,
           COUNT(DISTINCT CASE WHEN media_type = 'tv' THEN COALESCE(NULLIF(media_id, ''), media_title) END)::int AS series_count,
           COUNT(CASE WHEN media_type = 'tv' THEN 1 END)::int AS episodes_count
         FROM playback_history
         WHERE user_id = $1 AND (watched_seconds >= 15 OR media_type = 'iptv')`,
        [userId]
      );
      const playStats = playRes.rows[0] || {};

      // 2. Watch history stats
      const watchRes = await pool.query(
        `SELECT
           COUNT(DISTINCT tmdb_id)::int AS watch_hist_count,
           COALESCE(SUM(CASE WHEN progress > 0 THEN progress ELSE 0 END), 0)::bigint AS watch_hist_seconds
         FROM watch_history
         WHERE user_id = $1`,
        [userId]
      );
      const watchStats = watchRes.rows[0] || {};

      // 3. Favorites count
      const favRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM favorites WHERE user_id = $1`,
        [userId]
      );
      const favoritesCount = favRes.rows[0]?.count || 0;

      // 4. Devices breakdown
      const devRes = await pool.query(
        `SELECT
           COALESCE(device_type, 'tv') AS device_type,
           COALESCE(NULLIF(device_name, ''), 'Smart TV') AS device_name,
           COUNT(*)::int AS count,
           COALESCE(SUM(watched_seconds), 0)::bigint AS seconds
         FROM playback_history
         WHERE user_id = $1 AND watched_seconds >= 15
         GROUP BY device_type, device_name
         ORDER BY seconds DESC`,
        [userId]
      );

      const devices = devRes.rows.map(r => ({
        type: r.device_type,
        name: r.device_name,
        count: r.count,
        seconds: Number(r.seconds)
      }));

      let primaryDevice = 'Smart TV';
      if (devices.length > 0) {
        const topDev = devices[0];
        if (topDev.type === 'tv') primaryDevice = topDev.name.includes('Tizen') ? 'Samsung Tizen TV' : (topDev.name || 'Smart TV');
        else if (topDev.type === 'web') primaryDevice = 'Web-браузер';
        else if (topDev.type === 'mobile') primaryDevice = 'Мобильное приложение';
        else primaryDevice = topDev.name;
      }

      // Combine numbers
      const totalWatchSeconds = Math.max(Number(playStats.total_watch_seconds || 0), Number(watchStats.watch_hist_seconds || 0));
      const totalWatchHours = Number((totalWatchSeconds / 3600).toFixed(1));
      const totalWatchMinutes = Math.round(totalWatchSeconds / 60);
      const watchedCount = Math.max(Number(playStats.unique_titles_count || 0), Number(watchStats.watch_hist_count || 0));
      const moviesCount = Number(playStats.movies_count || 0);
      const seriesCount = Number(playStats.series_count || 0);
      const episodesCount = Number(playStats.episodes_count || 0);

      // 5. Favorite genres calculation
      const topMediaRes = await pool.query(
        `SELECT DISTINCT media_title, media_type
         FROM playback_history
         WHERE user_id = $1 AND media_title IS NOT NULL AND media_title != ''`,
        [userId]
      );

      const KNOWN_GENRES: Record<string, string[]> = {
        'паук': ['Боевик', 'Фантастика', 'Приключения'],
        'голодные игры': ['Фантастика', 'Приключения', 'Боевик'],
        'сплит': ['Триллер', 'Ужасы'],
        'камеди': ['Комедия'],
        'теория большого взрыва': ['Комедия'],
        'аанг': ['Мультфильм', 'Фэнтези', 'Приключения'],
        'хаус': ['Драма', 'Детектив'],
        'убить билла': ['Боевик', 'Триллер', 'Криминал'],
        'титаны': ['Боевик', 'Фантастика', 'Драма'],
        'обитель зла': ['Ужасы', 'Боевик', 'Фантастика'],
        'аватар': ['Фантастика', 'Боевик', 'Приключения'],
        'поттер': ['Фэнтези', 'Приключения', 'Семейный'],
        'пацана': ['Драма', 'Криминал'],
        'майкл': ['Биография', 'Драма', 'Музыка'],
        'кэрри': ['Драма', 'Фантастика'],
        'жизнь заново': ['Драма', 'Комедия'],
        'министерство': ['Боевик', 'Военный', 'Комедия'],
        'игрушек': ['Мультфильм', 'Комедия', 'Приключения'],
        'звезды': ['Комедия', 'Шоу'],
        'больница питт': ['Драма'],
        'собачьи': ['Фантастика', 'Триллер'],
        'шепот': ['Триллер', 'Ужасы'],
        'гамп': ['Драма', 'Мелодрама'],
        'роботы': ['Фантастика', 'Мультфильм'],
        'симпсоны': ['Мультфильм', 'Комедия'],
      };

      const genreCounts: Record<string, number> = {};
      for (const row of topMediaRes.rows) {
        const titleLower = (row.media_title || '').toLowerCase();
        let matched = false;
        for (const [key, gList] of Object.entries(KNOWN_GENRES)) {
          if (titleLower.includes(key)) {
            matched = true;
            for (const g of gList) {
              genreCounts[g] = (genreCounts[g] || 0) + 1;
            }
            break;
          }
        }
        if (!matched) {
          if (row.media_type === 'movie') {
            genreCounts['Фильмы'] = (genreCounts['Фильмы'] || 0) + 1;
          } else if (row.media_type === 'tv') {
            genreCounts['Сериалы'] = (genreCounts['Сериалы'] || 0) + 1;
          }
        }
      }

      const sortedGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      const maxG = sortedGenres[0]?.[1] || 1;
      const favoriteGenres = sortedGenres.map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / maxG) * 100),
      }));

      return {
        success: true,
        totalWatchSeconds,
        totalWatchMinutes,
        totalWatchHours,
        watchedCount,
        moviesCount,
        seriesCount,
        episodesCount,
        favoritesCount,
        primaryDevice,
        devices,
        favoriteGenres,
      };
    } catch (err: any) {
      console.error('Error fetching user stats:', err);
      return {
        success: false,
        totalWatchSeconds: 0,
        totalWatchMinutes: 0,
        totalWatchHours: 0,
        watchedCount: 0,
        moviesCount: 0,
        seriesCount: 0,
        episodesCount: 0,
        favoritesCount: 0,
        primaryDevice: 'Smart TV',
        devices: [],
        favoriteGenres: [],
      };
    }
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
