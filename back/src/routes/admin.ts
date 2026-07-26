import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { readdirSync, statSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import os from 'os';

export function adminRoutes(app: FastifyInstance, db: Pool) {
  // Server status
  app.get('/api/admin/server-status', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    // Check if user is admin (first user)
    const users = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (users.rows.length === 0 || users.rows[0].id !== userId) {
      return { error: 'Admin only' };
    }

    // Get user count
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');

    // Check services
    const services = [];

    // TorrServer
    try {
      const res = await fetch('http://localhost:8090/echo', { signal: AbortSignal.timeout(2000) });
      services.push({ name: 'TorrServer', online: res.ok });
    } catch {
      services.push({ name: 'TorrServer', online: false });
    }

    // qBittorrent
    try {
      const res = await fetch('http://localhost:6003/api/v2/app/version', { signal: AbortSignal.timeout(2000) });
      services.push({ name: 'qBittorrent', online: res.ok });
    } catch {
      services.push({ name: 'qBittorrent', online: false });
    }

    // PostgreSQL
    try {
      await db.query('SELECT 1');
      services.push({ name: 'PostgreSQL', online: true });
    } catch {
      services.push({ name: 'PostgreSQL', online: false });
    }

    // Format uptime
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptime = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;

    return {
      uptime,
      users: parseInt(userCount.rows[0].count),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      hostname: os.hostname(),
      services,
    };
  });

  // FFmpeg sessions
  app.get('/api/admin/ffmpeg-sessions', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;

    // Check if user is admin
    const users = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (users.rows.length === 0 || users.rows[0].id !== userId) {
      return { error: 'Admin only' };
    }

    // Get active FFmpeg sessions from the torrents module
    // We'll check /tmp/hls-* directories
    const sessions: Array<{ sessionId: string; pid: number; createdAt: number }> = [];
    const tmpDir = '/tmp';

    try {
      const entries = readdirSync(tmpDir);
      for (const entry of entries) {
        if (entry.startsWith('hls-')) {
          const hlsDir = join(tmpDir, entry);
          const playlistPath = join(hlsDir, 'playlist.m3u8');
          if (existsSync(playlistPath)) {
            const stat = statSync(hlsDir);
            sessions.push({
              sessionId: entry.replace('hls-', ''),
              pid: 0, // PID not stored in filesystem
              createdAt: stat.mtimeMs,
            });
          }
        }
      }
    } catch {
      // ignore
    }

    return { sessions };
  });

  // Delete FFmpeg session (cleanup)
  app.delete('/api/admin/ffmpeg-sessions/:sessionId', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };

    // Check if user is admin
    const users = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (users.rows.length === 0 || users.rows[0].id !== userId) {
      return { error: 'Admin only' };
    }

    const hlsDir = join('/tmp', `hls-${sessionId}`);
    if (existsSync(hlsDir)) {
      try {
        // Remove all files in the directory
        const entries = readdirSync(hlsDir);
        for (const entry of entries) {
          unlinkSync(join(hlsDir, entry));
        }
        // Remove directory
        const { rmdirSync } = await import('fs');
        rmdirSync(hlsDir);
      } catch {
        // ignore
      }
    }

    return { success: true };
  });

  // Clear cache
  app.delete('/api/admin/cache/:type', { preHandler: requireAuth }, async (request: AuthenticatedRequest) => {
    const userId = request.user!.userId;
    const { type } = request.params as { type: string };

    // Check if user is admin
    const users = await db.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (users.rows.length === 0 || users.rows[0].id !== userId) {
      return { error: 'Admin only' };
    }

    let cleared = 0;

    if (type === 'hls') {
      // Clear all HLS directories
      const tmpDir = '/tmp';
      try {
        const entries = readdirSync(tmpDir);
        for (const entry of entries) {
          if (entry.startsWith('hls-')) {
            const hlsDir = join(tmpDir, entry);
            try {
              const files = readdirSync(hlsDir);
              for (const file of files) {
                unlinkSync(join(hlsDir, file));
              }
              const { rmdirSync } = await import('fs');
              rmdirSync(hlsDir);
              cleared++;
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    } else if (type === 'subtitles') {
      // Clear subtitle cache (in-memory, restart needed)
      cleared = -1; // indicates restart needed
    }

    return { success: true, cleared };
  });
}
