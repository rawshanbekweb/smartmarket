import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';
import { BCRYPT_COST, passwordSchema as password } from '../services/auth.service';

export const usersRouter = Router();
// No self-registration: only CHIEF manages management accounts.
usersRouter.use(requireAuth, requireRole('CHIEF'));

const publicUser = {
  id: true,
  fullName: true,
  username: true,
  role: true,
  phone: true,
  isActive: true,
  isDemo: true,
  lastLoginAt: true,
  lockedUntil: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({ select: publicUser, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] });
    res.json(users);
  }),
);

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const body = z
      .object({
        fullName: z.string().trim().min(3).max(100),
        username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'Login: 3-32 ta lotin harf/raqam'),
        role: z.enum(['CHIEF', 'MARKET_ADMIN', 'CASHIER']),
        phone: z.string().trim().max(20).optional(),
        password,
      })
      .parse(req.body);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        // The initial password is handed over by the CHIEF, so the user must replace it at first login.
        data: {
          fullName: body.fullName,
          username: body.username,
          role: body.role,
          phone: body.phone,
          passwordHash: await bcrypt.hash(body.password, BCRYPT_COST),
          mustChangePassword: true,
        },
        select: publicUser,
      });
      await audit(tx, { actor: req.user, req, action: 'USER_CREATED', entityType: 'User', entityId: u.id, summary: `${u.username} (${u.role})`, after: { ...body, password: undefined } });
      return u;
    });
    res.status(201).json(user);
  }),
);

usersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const body = z
      .object({
        fullName: z.string().trim().min(3).max(100).optional(),
        role: z.enum(['CHIEF', 'MARKET_ADMIN', 'CASHIER']).optional(),
        phone: z.string().trim().max(20).nullable().optional(),
        isActive: z.boolean().optional(),
        password: password.optional(),
      })
      .parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: publicUser });
    if (!before) throw notFound('Foydalanuvchi topilmadi');
    if (before.id === req.user!.id && (body.isActive === false || (body.role && body.role !== 'CHIEF'))) {
      throw badRequest("O'zingizni o'chira yoki rolingizni pasaytira olmaysiz");
    }
    const user = await prisma.$transaction(async (tx) => {
      const { password: pw, ...rest } = body;
      // Reset password, deactivation or role change revokes every issued session of that user.
      const revoke = !!pw || rest.isActive === false || (!!rest.role && rest.role !== before.role);
      const u = await tx.user.update({
        where: { id: before.id },
        data: {
          ...rest,
          ...(pw && { passwordHash: await bcrypt.hash(pw, BCRYPT_COST), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null }),
          ...(revoke && { sessionVersion: { increment: 1 } }),
        },
        select: publicUser,
      });
      await audit(tx, {
        actor: req.user,
        req,
        action: pw ? 'USER_PASSWORD_RESET' : 'USER_UPDATED',
        entityType: 'User',
        entityId: u.id,
        summary: u.username,
        before,
        after: rest,
      });
      return u;
    });
    res.json(user);
  }),
);

usersRouter.post(
  '/:id/unlock',
  ah(async (req, res) => {
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: publicUser });
    if (!before) throw notFound('Foydalanuvchi topilmadi');
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: before.id }, data: { lockedUntil: null, failedLoginCount: 0 }, select: publicUser });
      await audit(tx, { actor: req.user, req, action: 'USER_UNLOCKED', entityType: 'User', entityId: u.id, summary: u.username, before: { lockedUntil: before.lockedUntil } });
      return u;
    });
    res.json(user);
  }),
);
