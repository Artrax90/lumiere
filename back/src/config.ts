import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  tmdb: {
    token: process.env.TMDB_TOKEN || process.env.TMDB_API_KEY || '',
    proxyUrl: process.env.TMDB_PROXY_URL || undefined,
  },
  cors: {
    origin: true,
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    user: process.env.DB_USER || 'lumiere',
    password: process.env.DB_PASS || 'lumiere123',
    database: process.env.DB_NAME || 'lumiere',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'lumiere-secret-key-change-in-production-2024',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '7d',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  torrserver: {
    url: process.env.TORRSERVER_URL || 'http://localhost:8090',
  },
  jacred: {
    url: process.env.JACRED_URL || process.env.jacredUrl || 'http://ns3bg91xvuqfvq9h.cfhttp.top',
  },
  downloads: {
    qbUrl: process.env.QB_URL || 'http://localhost:6003',
  },
};

