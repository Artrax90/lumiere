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

function getServerSubnet(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Return the subnet: e.g., "192.168.1" from "192.168.1.37"
        const parts = iface.address.split('.');
        if (parts[0] === '10' || parts[0] === '172' || parts[0] === '192') {
          return parts.slice(0, 3).join('.');
        }
        // For public IPs, just return first 3 octets
        return parts.slice(0, 3).join('.');
      }
    }
  }
  return null;
}

function getClientIp(req: any): string {
  // Use X-Forwarded-For if behind nginx/proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function isLanRequest(clientIp: string): boolean {
  const subnet = getServerSubnet();
  if (!subnet) return false;
  return clientIp.startsWith(subnet + '.');
}

export function authRoutes(app: FastifyInstance) {
  // Auto-login for LAN — if request is from the same network, auto-authorize as first admin
  app.post('/api/auth/lan-login', async (req, reply) => {
    const clientIp = getClientIp(req);

    if (!isLanRequest(clientIp)) {
      return reply.code(403).send({ error: 'LAN login only available from local network' });
    }

    // Find first admin user (first created user)
    const result = await pool.query(
      'SELECT id, email, name, avatar, created_at FROM users ORDER BY id ASC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'No users found' });
    }

    const user = result.rows[0];
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    await saveRefreshToken(user.id, refreshToken);

    return {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, createdAt: user.created_at },
      accessToken,
      refreshToken,
    };
  });

  // Check if current request is from LAN
  app.get('/api/auth/lan-status', async (req) => {
    const clientIp = getClientIp(req);
    return { isLan: isLanRequest(clientIp), clientIp };
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
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, name, avatar, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

    await saveRefreshToken(user.id, refreshToken);

    return {
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, createdAt: user.created_at },
      accessToken,
      refreshToken,
    };
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

    const session = await pool.query(
      'SELECT id FROM sessions WHERE refresh_token = $1 AND expires_at > NOW()',
      [refreshToken]
    );

    if (session.rows.length === 0) {
      return reply.code(401).send({ error: 'Refresh token not found or expired' });
    }

    await deleteRefreshToken(refreshToken);

    const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email });

    await saveRefreshToken(payload.userId, newRefreshToken);

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

  // Create user (admin only — based on being the first user)
  app.post('/api/admin/users', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;

    // Check if requester is the first user (admin)
    const adminCheck = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (adminCheck.rows[0].id !== userId) {
      return reply.code(403).send({ error: 'Only admin can create users' });
    }

    const { email, password, name } = request.body as { email?: string; password?: string; name?: string };

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, avatar, created_at',
      [email, passwordHash, name]
    );

    return reply.code(201).send({
      user: result.rows[0],
    });
  });

  // List users (admin only)
  app.get('/api/admin/users', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;

    const adminCheck = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (adminCheck.rows[0].id !== userId) {
      return reply.code(403).send({ error: 'Only admin can list users' });
    }

    const result = await pool.query(
      'SELECT id, email, name, avatar, created_at FROM users ORDER BY id ASC'
    );

    return { users: result.rows };
  });

  // Delete user (admin only, cannot delete self)
  app.delete('/api/admin/users/:id', { preHandler: requireAuth }, async (request: AuthenticatedRequest, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const adminCheck = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (adminCheck.rows[0].id !== userId) {
      return reply.code(403).send({ error: 'Only admin can delete users' });
    }

    if (parseInt(id) === userId) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [parseInt(id)]);
    return { success: true };
  });
}
