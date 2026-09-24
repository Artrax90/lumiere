import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config.js';
import { TmdbClient } from './services/tmdb-client.js';
import { TmdbProvider } from './services/metadata/tmdb.js';
import { movieRoutes } from './routes/movies.js';
import { tvRoutes } from './routes/tv.js';
import { searchRoutes } from './routes/search.js';
import { genreRoutes } from './routes/genres.js';
import { imageRoutes } from './routes/images.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import { onlineRoutes } from './routes/online.js';
import { torrentRoutes } from './routes/torrents.js';
import { downloadRoutes } from './routes/downloads.js';
import { syncRoutes } from './routes/sync.js';
import { iptvRoutes } from './routes/iptv.js';
import { adminRoutes } from './routes/admin.js';
import { settingsRoutes } from './routes/settings.js';
import { notificationRoutes } from './routes/notifications.js';
import { sessionRoutes } from './routes/sessions.js';
import pool from './db/pool.js';
import { hashPassword, generateAccessToken, generateRefreshToken, saveRefreshToken } from './services/auth.js';
import { registerProvider } from './services/providers/registry.js';
import { CollapsProvider } from './services/providers/collaps.js';
import { HdvbProvider } from './services/providers/hdvb.js';
import { PhantomProvider } from './services/providers/phantom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-detect FFmpeg on Windows if winget package exists
if (process.platform === 'win32') {
  const wingetFFmpeg = join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WinGet',
    'Packages',
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-9.0.1-full_build',
    'bin'
  );
  if (existsSync(wingetFFmpeg)) {
    process.env.PATH = `${wingetFFmpeg};${process.env.PATH}`;
  }
}

async function runMigrations() {
  try {
    const candidates = [
      join(__dirname, 'db', 'migrations.sql'),
      join(__dirname, '..', 'src', 'db', 'migrations.sql'),
      join(__dirname, '..', 'db', 'migrations.sql'),
      join(__dirname, 'src', 'db', 'migrations.sql'),
    ];
    const migrationsPath = candidates.find((p) => existsSync(p));
    if (!migrationsPath) {
      console.warn('Migrations file not found in candidates, skipping');
      return;
    }
    const migrations = readFileSync(migrationsPath, 'utf-8');
    await pool.query(migrations);
    console.log('Database migrations completed');
  } catch (err: any) {
    console.error('Migration error:', err.message);
  }
}



const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, { origin: config.cors.origin });

const tmdbClient = new TmdbClient(config.tmdb.token, config.tmdb.proxyUrl);
const provider = new TmdbProvider(tmdbClient);

app.register(movieRoutes, provider);
app.register(tvRoutes, provider);
app.register(searchRoutes, provider);
app.register(genreRoutes, provider);
app.register(imageRoutes, { tmdbClient });
app.register(authRoutes);
app.register(userRoutes);
app.register(onlineRoutes);
app.register(torrentRoutes);
app.register(downloadRoutes);
app.register(syncRoutes, pool);
app.register(iptvRoutes);
app.register(adminRoutes, pool);
settingsRoutes(app, tmdbClient, pool);
notificationRoutes(app, provider);
sessionRoutes(app);

// Register content providers
registerProvider(new CollapsProvider());
registerProvider(new HdvbProvider());
registerProvider(new PhantomProvider());

app.get('/api/health', async () => ({ status: 'ok' }));

// MediaStationX (MSX) endpoints for universal Smart TV launcher
app.get('/msx', async (req, reply) => {
  const host = req.headers.host || `localhost:${config.port}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const baseUrl = `${proto}://${host}`;
  reply.header('Content-Type', 'application/json; charset=utf-8');
  reply.header('Access-Control-Allow-Origin', '*');
  return {
    name: 'Lumiere Media Center',
    version: '1.0.0',
    parameter: `content:${baseUrl}/tv/`,
    menu: [
      {
        type: 'link',
        label: 'Lumière TV',
        icon: `${baseUrl}/tv/icon.png`,
        data: `${baseUrl}/tv/`,
      },
    ],
    ready: true,
  };
});

app.get('/msx.json', async (req, reply) => {
  const host = req.headers.host || `localhost:${config.port}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const baseUrl = `${proto}://${host}`;
  reply.header('Content-Type', 'application/json; charset=utf-8');
  reply.header('Access-Control-Allow-Origin', '*');
  return {
    name: 'Lumiere Media Center',
    version: '1.0.0',
    parameter: `content:${baseUrl}/tv/`,
    menu: [
      {
        type: 'link',
        label: 'Lumière TV',
        icon: `${baseUrl}/tv/icon.png`,
        data: `${baseUrl}/tv/`,
      },
    ],
    ready: true,
  };
});

app.get('/api/setup/status', async () => {
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    const adminCount = parseInt(result.rows[0].count, 10);
    return { needsSetup: adminCount === 0 };
  } catch {
    try {
      const result = await pool.query("SELECT COUNT(*) as count FROM users");
      return { needsSetup: parseInt(result.rows[0].count, 10) === 0 };
    } catch {
      return { needsSetup: true };
    }
  }
});

app.post('/api/setup/admin', async (req, reply) => {
  try {
    const adminCountRes = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    if (parseInt(adminCountRes.rows[0].count, 10) > 0) {
      return reply.code(400).send({ error: 'Учетная запись администратора уже существует' });
    }
  } catch {}

  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password || !name) {
    return reply.code(400).send({ error: 'Email/Логин, пароль и имя обязательны' });
  }

  if (password.length < 6) {
    return reply.code(400).send({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const passwordHash = await hashPassword(password);

  const userRes = await pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin') RETURNING id, email, name, role, avatar, created_at",
    [cleanEmail, passwordHash, cleanName]
  );
  const user = userRes.rows[0];

  const accessToken = generateAccessToken({ userId: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });
  try { await saveRefreshToken(user.id, refreshToken); } catch {}

  return reply.code(201).send({
    message: 'Учетная запись администратора успешно создана',
    user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar, createdAt: user.created_at },
    accessToken,
    refreshToken,
  });
});

async function loadPersistedSettings() {
  try {
    const res = await pool.query(`SELECT key, value FROM app_settings WHERE key IN ('tmdb_token', 'tmdb_proxy_url')`);
    let token = config.tmdb.token;
    let proxyUrl = config.tmdb.proxyUrl;
    for (const row of res.rows) {
      if (row.key === 'tmdb_token' && row.value) {
        token = row.value;
      }
      if (row.key === 'tmdb_proxy_url') {
        proxyUrl = row.value;
      }
    }
    if (token !== config.tmdb.token || proxyUrl !== config.tmdb.proxyUrl) {
      tmdbClient.updateConfig(token, proxyUrl);
      console.log('Applied TMDB configuration from database');
    }
  } catch (err: any) {
    console.warn('Could not load app settings from database:', err.message);
  }
}

await runMigrations();
await loadPersistedSettings();

// Serve static frontend files (React build)
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  // Global no-cache hook for all TV assets
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/tv')) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
      const currentCt = reply.getHeader('content-type') as string || '';
      if (currentCt.includes('text/html') && !currentCt.includes('charset')) {
        reply.header('Content-Type', 'text/html; charset=utf-8');
      }
    }
  });

  // Serve /tv and /tv/ directly as tv/index.html with strict no-cache
  app.get('/tv', async (request, reply) => {
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.sendFile('tv/index.html', publicDir);
  });

  app.get('/tv/', async (request, reply) => {
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.sendFile('tv/index.html', publicDir);
  });

  // Serve /tv/* files with strict no-cache headers (must be registered BEFORE staticFiles)
  app.get('/tv/*', async (request, reply) => {
    const filePath = request.url.split('?')[0]; // Remove query params
    const fullPath = join(publicDir, filePath);
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    if (existsSync(fullPath)) {
      if (filePath.endsWith('.html')) {
        reply.header('Content-Type', 'text/html; charset=utf-8');
      } else if (filePath.endsWith('.js')) {
        reply.header('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        reply.header('Content-Type', 'text/css; charset=utf-8');
      }
      return reply.sendFile(filePath.replace(/^\//, ''), publicDir);
    }
    // Fallback to tv/index.html
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.sendFile('tv/index.html', publicDir);
  });

  await app.register(staticFiles, {
    root: publicDir,
    prefix: '/',
  });

  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api/')) {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.sendFile('index.html', publicDir);
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  console.log('Serving static files from', publicDir);
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Lumiere backend listening on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
