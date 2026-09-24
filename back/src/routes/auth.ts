import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import os from 'os';
import pool from '../db/pool.js';
import { config } from '../config.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  saveRefreshToken,
  deleteRefreshToken,
} from '../services/auth.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function getClientIp(req: any): string {
  // Use X-Forwarded-For if behind nginx/proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return (typeof realIp === 'string' ? realIp : realIp[0]).trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function isTvRequest(req: any): boolean {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  return (
    req.headers['x-lumiere-tv'] === '1' ||
    req.headers['x-lumiere-client'] === 'tizen-tv' ||
    req.headers['x-lumiere-client'] === 'tv' ||
    userAgent.includes('tizen') ||
    userAgent.includes('smart-tv') ||
    userAgent.includes('smarttv') ||
    userAgent.includes('web0s')
  );
}

function isLanRequest(req: any): boolean {
  if (isTvRequest(req)) {
    return true;
  }

  // Client IP check
  const clientIp = getClientIp(req);
  if (!clientIp) return false;
  const cleanIp = clientIp.replace(/^::ffff:/, '').trim();

  // Loopback
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('127.')
  ) {
    return true;
  }

  const parts = cleanIp.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    // 10.0.0.0/8 and 192.168.0.0/16 are home/office LANs
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 172.16.0.0/12: in Docker, 172.17.x.x - 172.31.x.x is the internal docker network.
    // If incoming connection comes from the docker bridge gateway (e.g. 172.18.0.1),
    // it's external port forwarding, NOT a trusted LAN client!
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            const ifaceParts = iface.address.split('.').map(Number);
            if (ifaceParts[0] === parts[0] && ifaceParts[1] === parts[1]) {
              // Matches container's docker bridge subnet -> external forwarded by docker-proxy!
              return false;
            }
          }
        }
      }
      return true;
    }
  }

  return false;
}

async function isUserAdmin(userId: number): Promise<boolean> {
  try {
    const res = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (res.rows.length > 0 && res.rows[0].role === 'admin') return true;
    const first = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    return first.rows.length > 0 && first.rows[0].id === userId;
  } catch {
    return false;
  }
}

export function authRoutes(app: FastifyInstance) {
  // Check if current request is from LAN or TV
  app.get('/api/auth/lan-status', async (req) => {
    const isTv = isTvRequest(req);
    const isLan = isLanRequest(req);
    const clientIp = getClientIp(req);
    return { isLan, isTv, clientIp };
  });

  // Get list of user profiles (LAN or TV)
  app.get('/api/auth/profiles', async (req, reply) => {
    if (!isLanRequest(req) && !isTvRequest(req)) {
      return reply.code(403).send({ error: 'Profiles list is only available in LAN or TV' });
    }

    try {
      const result = await pool.query(`
        SELECT id, name, email, avatar,
               COALESCE(role, 'user') as role,
               COALESCE(is_kids, false) as is_kids,
               (pin IS NOT NULL AND pin != '') AS has_pin
        FROM users
        ORDER BY (role = 'admin') DESC, id ASC
      `);

      return {
        profiles: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          avatar: r.avatar || '',
          role: r.role || 'user',
          isKids: !!r.is_kids,
          hasPin: !!r.has_pin,
        })),
      };
    } catch (err: any) {
      try {
        const fallback = await pool.query(`SELECT id, name, email, avatar FROM users ORDER BY id ASC`);
        return {
          profiles: fallback.rows.map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            avatar: r.avatar || '',
            role: 'user',
            isKids: false,
            hasPin: false,
          })),
        };
      } catch (err2: any) {
        return { profiles: [] };
      }
    }
  });

  // Quick login into a profile without password (LAN only, PIN required if configured)
  app.post('/api/auth/quick-login', async (req, reply) => {
    if (!isLanRequest(req)) {
      return reply.code(403).send({ error: 'Quick login only available from local network' });
    }

    const { userId, pin } = req.body as { userId?: number; pin?: string };
    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const result = await pool.query(
        'SELECT id, email, name, avatar, role, is_kids, pin FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }

      const user = result.rows[0];

      // Admin role must require PIN or password! Never allow 1-click passwordless admin login
      if (user.role === 'admin' && (!user.pin || user.pin.trim() === '')) {
        return reply.code(403).send({ error: 'Для входа в профиль администратора требуется пароль' });
      }

      // Verify PIN if set
      if (user.pin && user.pin.trim() !== '') {
        if (!pin || pin.trim() !== user.pin.trim()) {
          return reply.code(401).send({ error: 'Неверный PIN-код' });
        }
      }

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role || 'user',
        isKids: !!user.is_kids,
        name: user.name,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      try { await saveRefreshToken(user.id, refreshToken); } catch {}

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar || '',
          role: user.role || 'user',
          isKids: !!user.is_kids,
        },
        accessToken,
        refreshToken,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Legacy fallback for LAN login (auto-login if single profile without PIN)
  app.post('/api/auth/lan-login', async (req, reply) => {
    if (!isLanRequest(req)) {
      return reply.code(403).send({ error: 'LAN login only available from local network' });
    }

    try {
      const result = await pool.query(
        "SELECT id, email, name, avatar, role, is_kids, pin FROM users WHERE role != 'admin' ORDER BY (pin IS NOT NULL AND pin != '') ASC, id ASC LIMIT 1"
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        if (user.pin && user.pin.trim() !== '') {
          return reply.code(401).send({ error: 'PIN required', needsPin: true, userId: user.id });
        }

        const payload = {
          userId: user.id,
          email: user.email,
          role: user.role || 'user',
          isKids: !!user.is_kids,
          name: user.name,
        };

        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        try { await saveRefreshToken(user.id, refreshToken); } catch {}

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar || '',
            role: user.role || 'user',
            isKids: !!user.is_kids,
          },
          accessToken,
          refreshToken,
        };
      }
    } catch {}

    return reply.code(404).send({ error: 'Пользователи не найдены' });
  });

  // Register with invite code
  app.post('/api/auth/register', async (req, reply) => {
    const { email, password, name, inviteCode } = req.body as {
      email?: string; password?: string; name?: string; inviteCode?: string;
    };

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Email, password, and name are required' });
    }

    if (!inviteCode) {
      return reply.code(400).send({ error: 'Invite code is required' });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    // Validate invite code
    const codeResult = await pool.query(
      'SELECT id FROM invite_codes WHERE code = $1 AND used_by IS NULL',
      [inviteCode.toUpperCase()]
    );

    if (codeResult.rows.length === 0) {
      return reply.code(400).send({ error: 'Invalid or already used invite code' });
    }

    const codeId = codeResult.rows[0].id;

    // Check email uniqueness
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, avatar, created_at',
      [email, passwordHash, name]
    );

    const user = result.rows[0];

    // Mark invite code as used
    await pool.query('UPDATE invite_codes SET used_by = $1, used_at = NOW() WHERE id = $2', [user.id, codeId]);

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    await saveRefreshToken(user.id, refreshToken);

    return reply.code(201).send({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, createdAt: user.created_at },
      accessToken,
      refreshToken,
    });
  });

  // Login
  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email и пароль обязательны' });
    }

    try {
      const result = await pool.query(
        'SELECT id, email, password_hash, name, avatar, role, is_kids, created_at FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        const valid = await comparePassword(password, user.password_hash);
        if (valid) {
          const payload = {
            userId: user.id,
            email: user.email,
            role: user.role || 'user',
            isKids: !!user.is_kids,
            name: user.name,
          };
          const accessToken = generateAccessToken(payload);
          const refreshToken = generateRefreshToken(payload);

          try { await saveRefreshToken(user.id, refreshToken); } catch {}

          return {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              avatar: user.avatar || '',
              role: user.role || 'user',
              isKids: !!user.is_kids,
              createdAt: user.created_at,
            },
            accessToken,
            refreshToken,
          };
        }
      }
    } catch (err: any) {
      console.warn('DB login query failed:', err.message);
    }

    return reply.code(401).send({ error: 'Неверный email или пароль' });
  });

  // Refresh
  app.post('/api/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      return reply.code(400).send({ error: 'Refresh token required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }

    try {
      const session = await pool.query(
        'SELECT id FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()',
        [refreshToken]
      );

      if (session.rows.length === 0 && payload.userId !== 1) {
        return reply.code(401).send({ error: 'Refresh token not found or expired' });
      }

      await deleteRefreshToken(refreshToken);
    } catch {}

    const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email });

    try {
      await saveRefreshToken(payload.userId, newRefreshToken);
    } catch {}

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  });

  // Logout
  app.post('/api/auth/logout', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (refreshToken) {
      await deleteRefreshToken(refreshToken);
    }

    return { success: true };
  });

  // --- Admin endpoints (require admin secret) ---

  // Generate invite codes
  app.post('/api/admin/invites', async (req, reply) => {
    const { adminSecret, count } = req.body as { adminSecret?: string; count?: number };

    if (adminSecret !== config.jwt.secret) {
      return reply.code(403).send({ error: 'Invalid admin secret' });
    }

    const numCodes = Math.min(Math.max(count || 1, 1), 50);
    const codes: string[] = [];

    for (let i = 0; i < numCodes; i++) {
      const code = generateInviteCode();
      await pool.query('INSERT INTO invite_codes (code) VALUES ($1)', [code]);
      codes.push(code);
    }

    return { codes };
  });

  // List invite codes
  app.get('/api/admin/invites', async (req, reply) => {
    const { adminSecret } = req.query as { adminSecret?: string };

    if (adminSecret !== config.jwt.secret) {
      return reply.code(403).send({ error: 'Invalid admin secret' });
    }

    const result = await pool.query(
      `SELECT ic.id, ic.code, ic.created_at, ic.used_at,
              u.email as used_by_email, u.name as used_by_name
       FROM invite_codes ic
       LEFT JOIN users u ON ic.used_by = u.id
       ORDER BY ic.created_at DESC`
    );

    return {
      invites: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        createdAt: r.created_at,
        usedAt: r.used_at,
        usedBy: r.used_by_email ? { email: r.used_by_email, name: r.used_by_name } : null,
      })),
    };
  });

  // Delete unused invite code
  app.delete('/api/admin/invites/:id', async (req, reply) => {
    const { adminSecret } = req.query as { adminSecret?: string };
    const { id } = req.params as { id: string };

    if (adminSecret !== config.jwt.secret) {
      return reply.code(403).send({ error: 'Invalid admin secret' });
    }

    await pool.query('DELETE FROM invite_codes WHERE id = $1 AND used_by IS NULL', [parseInt(id)]);
    return { success: true };
  });

  // --- Admin user management (require auth + admin role) ---

  // List users (admin only)
  app.get('/api/admin/users', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    if (!(await isUserAdmin(userId))) {
      return reply.code(403).send({ error: 'Только администратор имеет доступ к списку пользователей' });
    }

    try {
      const result = await pool.query(
        `SELECT id, email, name, avatar, role, is_kids,
                (pin IS NOT NULL AND pin != '') as has_pin,
                pin, created_at
         FROM users
         ORDER BY id ASC`
      );

      return {
        users: result.rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          avatar: r.avatar || '',
          role: r.role || 'user',
          isKids: !!r.is_kids,
          hasPin: !!r.has_pin,
          pin: r.pin || '',
          createdAt: r.created_at,
        })),
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Create user (admin only)
  app.post('/api/admin/users', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    if (!(await isUserAdmin(userId))) {
      return reply.code(403).send({ error: 'Только администратор может создавать пользователей' });
    }

    const { email, password, name, role, pin, isKids, avatar } = request.body as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
      pin?: string;
      isKids?: boolean;
      avatar?: string;
    };

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Имя, Email и пароль обязательны' });
    }

    if (password.length < 4) {
      return reply.code(400).send({ error: 'Пароль должен быть не менее 4 символов' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: 'Email уже зарегистрирован' });
    }

    const passwordHash = await hashPassword(password);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const userPin = (pin || '').trim();
    const userIsKids = !!isKids;
    const userAvatar = avatar || '';

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, pin, is_kids, avatar)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, avatar, role, is_kids, (pin IS NOT NULL AND pin != '') as has_pin, created_at`,
      [cleanEmail, passwordHash, name.trim(), userRole, userPin, userIsKids, userAvatar]
    );

    const created = result.rows[0];
    return reply.code(201).send({
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        avatar: created.avatar,
        role: created.role,
        isKids: !!created.is_kids,
        hasPin: !!created.has_pin,
        createdAt: created.created_at,
      },
    });
  });

  // Update user (admin only)
  app.put('/api/admin/users/:id', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const adminId = request.user!.userId;
    if (!(await isUserAdmin(adminId))) {
      return reply.code(403).send({ error: 'Только администратор может редактировать пользователей' });
    }

    const { id } = request.params as { id: string };
    const targetUserId = parseInt(id);
    const { name, email, password, role, pin, isKids, avatar } = request.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      pin?: string;
      isKids?: boolean;
      avatar?: string;
    };

    const userRes = await pool.query('SELECT id, role FROM users WHERE id = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();
      const duplicate = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [cleanEmail, targetUserId]);
      if (duplicate.rows.length > 0) {
        return reply.code(409).send({ error: 'Этот email уже используется' });
      }
      updates.push(`email = $${idx++}`);
      values.push(cleanEmail);
    }
    if (password && password.trim() !== '') {
      const hash = await hashPassword(password);
      updates.push(`password_hash = $${idx++}`);
      values.push(hash);
    }
    if (role !== undefined) {
      updates.push(`role = $${idx++}`);
      values.push(role === 'admin' ? 'admin' : 'user');
    }
    if (pin !== undefined) {
      updates.push(`pin = $${idx++}`);
      values.push(pin.trim());
    }
    if (isKids !== undefined) {
      updates.push(`is_kids = $${idx++}`);
      values.push(!!isKids);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${idx++}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return reply.send({ success: true, message: 'Нет изменений' });
    }

    values.push(targetUserId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, email, name, avatar, role, is_kids, (pin IS NOT NULL AND pin != '') as has_pin, created_at`,
      values
    );

    const updated = result.rows[0];
    return {
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatar: updated.avatar,
        role: updated.role,
        isKids: !!updated.is_kids,
        hasPin: !!updated.has_pin,
        createdAt: updated.created_at,
      },
    };
  });

  // Delete user (admin only, cannot delete self)
  app.delete('/api/admin/users/:id', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const adminId = request.user!.userId;
    const { id } = request.params as { id: string };
    const targetUserId = parseInt(id);

    if (!(await isUserAdmin(adminId))) {
      return reply.code(403).send({ error: 'Только администратор может удалять пользователей' });
    }

    if (targetUserId === adminId) {
      return reply.code(400).send({ error: 'Нельзя удалить собственный аккаунт' });
    }

    try {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
      await pool.query('DELETE FROM favorites WHERE user_id = $1', [targetUserId]);
      await pool.query('DELETE FROM watch_history WHERE user_id = $1', [targetUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [targetUserId]);
      return { success: true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
