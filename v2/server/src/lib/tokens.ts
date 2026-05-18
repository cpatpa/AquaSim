import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export interface TokenPayload {
  sub: string;
  username: string;
  role: 'user' | 'admin' | 'guest';
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function getRefreshTokenExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return d;
}
