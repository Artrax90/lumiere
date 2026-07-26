import type { FastifyInstance } from 'fastify';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const QB_URL = process.env.QB_URL || 'http://localhost:6003';
let qbCookie: string | null = null;

async function qbLogin(): Promise<string | null> {
  try {
    const res = await fetch(`${QB_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=admin&password=adminadmin',
    });
    const cookie = res.headers.get('set-cookie');
    if (cookie) {
      qbCookie = cookie.split(';')[0];
    }
    return qbCookie;
  } catch {
    return null;
  }
}

async function qbFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!qbCookie) await qbLogin();
  
  const res = await fetch(`${QB_URL}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Cookie: qbCookie || '',
    },
  });
  
  // Re-login if unauthorized
  if (res.status === 403) {
    await qbLogin();
    return fetch(`${QB_URL}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
        Cookie: qbCookie || '',
      },
    });
  }
  
  return res;
}

interface TorrentInfo {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  state: string;
  eta: number;
  added_on: number;
  save_path: string;
}

export function downloadRoutes(app: FastifyInstance) {
  // Get download list
  app.get('/api/downloads', { preHandler: requireAuth }, async () => {
    try {
      const res = await qbFetch('/api/v2/torrents/info');
      if (!res.ok) return { torrents: [] };
      
      const torrents = await res.json() as TorrentInfo[];
      return {
        torrents: torrents.map(t => ({
          hash: t.hash,
          name: t.name,
          size: t.size,
          sizeFormatted: formatSize(t.size),
          progress: Math.round(t.progress * 100),
          downloadSpeed: t.dlspeed,
          downloadSpeedFormatted: formatSpeed(t.dlspeed),
          uploadSpeed: t.upspeed,
          uploadSpeedFormatted: formatSpeed(t.upspeed),
          state: t.state,
          eta: t.eta,
          addedAt: t.added_on * 1000,
          savePath: t.save_path,
        })),
      };
    } catch (err: any) {
      console.error('qBittorrent error:', err.message);
      return { torrents: [] };
    }
  });

  // Add torrent by magnet
  app.post('/api/downloads/add', { preHandler: requireAuth }, async (req, reply) => {
    const { magnet, name } = req.body as { magnet?: string; name?: string };

    if (!magnet) {
      return reply.code(400).send({ error: 'Magnet link required' });
    }

    try {
      const formData = new URLSearchParams();
      formData.append('urls', magnet);
      if (name) formData.append('rename', name);

      const res = await qbFetch('/api/v2/torrents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        return reply.code(500).send({ error: errText });
      }

      return { success: true };
    } catch (err: any) {
      console.error('qBittorrent add error:', err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Pause torrent
  app.post('/api/downloads/:hash/pause', { preHandler: requireAuth }, async (req, reply) => {
    const { hash } = req.params as { hash: string };
    try {
      await qbFetch('/api/v2/torrents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `hashes=${hash}`,
      });
      return { success: true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Resume torrent
  app.post('/api/downloads/:hash/resume', { preHandler: requireAuth }, async (req, reply) => {
    const { hash } = req.params as { hash: string };
    try {
      await qbFetch('/api/v2/torrents/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `hashes=${hash}`,
      });
      return { success: true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Delete torrent
  app.delete('/api/downloads/:hash', { preHandler: requireAuth }, async (req, reply) => {
    const { hash } = req.params as { hash: string };
    const { deleteFiles } = req.query as { deleteFiles?: string };
    try {
      await qbFetch('/api/v2/torrents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `hashes=${hash}&deleteFiles=${deleteFiles === 'true'}`,
      });
      return { success: true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  return formatSize(bytesPerSec) + '/s';
}
