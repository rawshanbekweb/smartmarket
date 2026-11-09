import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { AUTH_COOKIE, cookieOptions, requireAuth, signSession, userFromToken } from '../middleware/auth';
import { unauthorized } from '../lib/errors';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { getMarket } from '../services/market.service';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." } },
});

// Constant-cost comparison for unknown users (mitigates username enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const body = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { username: body.username.toLowerCase() } });
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      await audit(prisma, { actor: null, action: 'LOGIN_FAILED', entityType: 'User', summary: `username=${body.username.slice(0, 64)}`, req });
      throw unauthorized("Login yoki parol noto'g'ri");
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const authUser = { id: user.id, role: user.role, fullName: user.fullName, username: user.username };
    await audit(prisma, { actor: authUser, action: 'LOGIN', entityType: 'User', entityId: user.id, req });
    res.cookie(AUTH_COOKIE, signSession(authUser), cookieOptions());
    res.json({ user: authUser });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  ah(async (req, res) => {
    await audit(prisma, { actor: req.user, action: 'LOGOUT', entityType: 'User', entityId: req.user!.id, req });
    res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  }),
);

/** Session probe for the SPA: always 200, `user: null` when not logged in (avoids a 401 on every cold load). */
authRouter.get(
  '/session',
  ah(async (req, res) => {
    const user = await userFromToken(req.cookies?.[AUTH_COOKIE]);
    if (!user) return res.json({ user: null, demoMode: env.DEMO_MODE, market: null });
    const market = await getMarket().catch(() => null);
    res.json({
      user,
      demoMode: env.DEMO_MODE,
      market: market && { id: market.id, name: market.name, address: market.address, isDemo: market.isDemo },
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const market = await getMarket().catch(() => null);
    res.json({
      user: req.user,
      demoMode: env.DEMO_MODE,
      market: market && { id: market.id, name: market.name, address: market.address, isDemo: market.isDemo },
    });
  }),
);
