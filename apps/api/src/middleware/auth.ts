import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { AppError, forbidden, unauthorized } from '../lib/errors';

export const AUTH_COOKIE = 'sm_session';

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  username: string;
  sessionVersion: number;
  mustChangePassword: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signSession(user: AuthUser) {
  return jwt.sign({ sub: user.id, role: user.role, sv: user.sessionVersion }, env.JWT_SECRET, {
    expiresIn: `${env.JWT_EXPIRES_IN_HOURS}h`,
    issuer: 'smart-market',
  });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: env.JWT_EXPIRES_IN_HOURS * 3600 * 1000,
  };
}

/** Verify a session token and load the (still active) user from the database. */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'smart-market' }) as jwt.JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user || !user.isActive) return null;
    // Sessions issued before a password reset / deactivation / role change are revoked.
    if ((payload.sv ?? 0) !== user.sessionVersion) return null;
    return {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      username: user.username,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    return null;
  }
}

/** Valid session, even one that still has to change its password (used by /api/auth/*). */
export async function requireSession(req: Request, _res: Response, next: NextFunction) {
  const user = await userFromToken(req.cookies?.[AUTH_COOKIE]);
  if (!user) return next(unauthorized());
  req.user = user;
  next();
}

/** Valid session with no pending forced password change. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await requireSession(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user!.mustChangePassword) {
      return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', "Davom etish uchun parolingizni almashtiring"));
    }
    next();
  });
}

/** Backend authorization guard — every sensitive route must declare allowed roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 * Session cookie is SameSite=Strict; additionally require a custom header that
 * cross-site forms cannot set without a CORS preflight.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'SmartMarket') return next(forbidden('CSRF tekshiruvi muvaffaqiyatsiz'));
  next();
}
