import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, type TokenPayload } from '../services/auth.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: TokenPayload;
}

export async function requireAuth(request: AuthenticatedRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Authorization token required' });
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }

  request.user = payload;
}
