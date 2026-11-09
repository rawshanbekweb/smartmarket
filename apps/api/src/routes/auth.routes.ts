import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { AUTH_COOKIE, cookieOptions, requireSession, signSession, userFromToken, type AuthUser } from '../middleware/auth';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { getMarket } from '../services/market.service';
import { authenticate, changeOwnPassword, toAuthUser } from '../services/auth.service';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." } },
});

/** What the SPA sees about the logged-in user (no session internals). */
const publicSessionUser = (u: AuthUser) => ({
  id: u.id,
  role: u.role,
  fullName: u.fullName,
  username: u.username,
  mustChangePassword: u.mustChangePassword,
});

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const body = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) }).parse(req.body);
    const authUser = toAuthUser(await authenticate(body.username, body.password, req));
    await audit(prisma, { actor: authUser, action: 'LOGIN', entityType: 'User', entityId: authUser.id, req });
    res.cookie(AUTH_COOKIE, signSession(authUser), cookieOptions());
    res.json({ user: publicSessionUser(authUser) });
  }),
);

authRouter.post(
  '/logout',
  requireSession,
  ah(async (req, res) => {
    await audit(prisma, { actor: req.user, action: 'LOGOUT', entityType: 'User', entityId: req.user!.id, req });
    res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  }),
);

/** Change own password. Other devices are logged out; this one gets a fresh session. */
authRouter.post(
  '/password',
  loginLimiter,
  requireSession,
  ah(async (req, res) => {
    const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).parse(req.body);
    const authUser = toAuthUser(await changeOwnPassword(req.user!, body.currentPassword, body.newPassword, req));
    res.cookie(AUTH_COOKIE, signSession(authUser), cookieOptions());
    res.json({ user: publicSessionUser(authUser) });
  }),
);

async function sessionPayload(user: AuthUser) {
  const market = await getMarket().catch(() => null);
  return {
    user: publicSessionUser(user),
    demoMode: env.DEMO_MODE,
    market: market && { id: market.id, name: market.name, address: market.address, isDemo: market.isDemo },
  };
}

/** Session probe for the SPA: always 200, `user: null` when not logged in (avoids a 401 on every cold load). */
authRouter.get(
  '/session',
  ah(async (req, res) => {
    const user = await userFromToken(req.cookies?.[AUTH_COOKIE]);
    if (!user) return res.json({ user: null, demoMode: env.DEMO_MODE, market: null });
    res.json(await sessionPayload(user));
  }),
);

authRouter.get(
  '/me',
  requireSession,
  ah(async (req, res) => {
    res.json(await sessionPayload(req.user!));
  }),
);
