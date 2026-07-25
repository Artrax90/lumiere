import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import pool from '../db/pool.js';

const SALT_ROUNDS = 10;

export interface TokenPayload {
  userId: number;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret as string, { expiresIn: config.jwt.accessExpiry as any });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret as string, { expiresIn: config.jwt.refreshExpiry as any });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret as string) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret as string) as TokenPayload;
  } catch {
    return null;
  }
}

export async function saveRefreshToken(userId: number, refreshToken: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await pool.query(
    'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [userId, refreshToken, expiresAt]
  );
}

export async function deleteRefreshToken(refreshToken: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
}

export async function deleteExpiredTokens(): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
}
