import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../lib/audit';

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
  createdAt: true,
} as const;

const password = z
  .string()
  .min(8, "Parol kamida 8 belgidan iborat bo'lishi kerak")
  .max(128)
  .regex(/[A-Za-z]/, "Parolda harf bo'lishi kerak")
  .regex(/\d/, "Parolda raqam bo'lishi kerak");

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
        data: { fullName: body.fullName, username: body.username, role: body.role, phone: body.phone, passwordHash: await bcrypt.hash(body.password, 12) },
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
      const u = await tx.user.update({
        where: { id: before.id },
        data: { ...rest, ...(pw && { passwordHash: await bcrypt.hash(pw, 12) }) },
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
