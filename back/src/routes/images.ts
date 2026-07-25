import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

export function imageRoutes(app: FastifyInstance, opts: { proxyUrl?: string }) {
  const agent = opts.proxyUrl ? new SocksProxyAgent(opts.proxyUrl) : undefined;

  app.get('/api/image', async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) {
      return reply.code(400).send({ error: 'Missing url parameter' });
    }

    try {
      const res = await fetch(url, {
        agent: agent as any,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: `Upstream returned ${res.status}` });
      }

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=86400');

      return reply.send(res.body);
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    }
  });
}
