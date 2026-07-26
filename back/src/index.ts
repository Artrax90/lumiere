import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import { readFileSync } from 'fs';
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
import pool from './db/pool.js';
import { hashPassword } from './services/auth.js';
import { registerProvider } from './services/providers/registry.js';
import { CollapsProvider } from './services/providers/collaps.js';
import { HdvbProvider } from './services/providers/hdvb.js';
import { PhantomProvider } from './services/providers/phantom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  try {
    const migrationsPath = join(__dirname, 'db', 'migrations.sql');
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
app.register(imageRoutes, { proxyUrl: config.tmdb.proxyUrl });
app.register(authRoutes);
app.register(userRoutes);
app.register(onlineRoutes);
app.register(torrentRoutes);
app.register(downloadRoutes);
app.register(syncRoutes, pool);
app.register(iptvRoutes);
app.register(adminRoutes, pool);

// Register content providers
registerProvider(new CollapsProvider());
registerProvider(new HdvbProvider());
registerProvider(new PhantomProvider());

app.get('/api/health', async () => ({ status: 'ok' }));

app.get('/api/setup/status', async () => {
  const result = await pool.query('SELECT COUNT(*) as count FROM users');
  return { needsSetup: parseInt(result.rows[0].count) === 0 };
});

app.post('/api/setup/admin', async (req, reply) => {
  const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCount.rows[0].count) > 0) {
    return reply.code(400).send({ error: 'Admin already exists' });
  }

  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password || !name) {
    return reply.code(400).send({ error: 'Email, password, and name are required' });
  }

  if (password.length < 6) {
    return reply.code(400).send({ error: 'Password must be at least 6 characters' });
  }

  const passwordHash = await hashPassword(password);
  await pool.query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [email, passwordHash, name]);

  const codes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    await pool.query('INSERT INTO invite_codes (code) VALUES ($1)', [code]);
    codes.push(code);
  }

  return reply.code(201).send({
    message: 'Admin account created',
    inviteCodes: codes,
  });
});

await runMigrations();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Lumiere backend listening on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
