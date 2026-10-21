import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, type TokenPayload } from '../services/auth.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: TokenPayload;
}

export async function requireAuth(request: AuthenticatedRequest, reply: FastifyReply) {
  let token = '';
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if ((request.query as any)?.token) {
    token = String((request.query as any).token);
  } else if ((request.body as any)?.token) {
    token = String((request.body as any).token);
  }

  if (!token) {
    return reply.code(401).send({ error: 'Authorization token required' });
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }

  request.user = payload;
}

export async function optionalAuth(request: AuthenticatedRequest, _reply: FastifyReply) {
  let token = '';
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if ((request.query as any)?.token) {
    token = String((request.query as any).token);
  } else if ((request.body as any)?.token) {
    token = String((request.body as any).token);
  }

  if (!token) {
    return;
  }

  const payload = verifyAccessToken(token);

  if (payload) {
    request.user = payload;
  }
}
