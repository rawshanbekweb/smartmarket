import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, badRequest, unauthorized } from '../lib/errors';
import { audit } from '../lib/audit';
import { minutes } from '../lib/time';
import { getSetting } from './settings.service';
import type { AuthUser } from '../middleware/auth';

export const BCRYPT_COST = 12;

/** Password policy shared by user management, self-service change and the bootstrap CLI. */
export const passwordSchema = z
  .string()
  .min(10, "Parol kamida 10 belgidan iborat bo'lishi kerak")
  .max(128)
  .regex(/[a-z]/, "Parolda kichik harf bo'lishi kerak")
  .regex(/[A-Z]/, "Parolda katta harf bo'lishi kerak")
  .regex(/\d/, "Parolda raqam bo'lishi kerak");

export const toAuthUser = (u: User): AuthUser => ({
  id: u.id,
  role: u.role,
  fullName: u.fullName,
  username: u.username,
  sessionVersion: u.sessionVersion,
  mustChangePassword: u.mustChangePassword,
});

// Constant-cost comparison for unknown users (mitigates username enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const locked = (until: Date, now: Date) =>
  new AppError(
    423,
    'ACCOUNT_LOCKED',
    `Akkaunt vaqtincha bloklangan. ${Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000))} daqiqadan so'ng urinib ko'ring yoki rahbarga murojaat qiling.`,
  );

/**
 * Verify credentials with per-account lockout. Failed attempts are counted in the
 * database (survives restarts, shared by all API instances); reaching the limit
 * locks the account for `auth.lockoutMinutes`.
 */
export async function authenticate(username: string, password: string, req: Request, now = new Date()): Promise<User> {
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (user?.lockedUntil && user.lockedUntil > now) {
    await audit(prisma, { actor: null, action: 'LOGIN_BLOCKED_LOCKED', entityType: 'User', entityId: user.id, summary: user.username, req });
    throw locked(user.lockedUntil, now);
  }
  if (!user || !ok || !user.isActive) {
    if (user && user.isActive && !ok) await registerFailure(user, req, now);
    await audit(prisma, { actor: null, action: 'LOGIN_FAILED', entityType: 'User', summary: `username=${username.slice(0, 64)}`, req });
    throw unauthorized("Login yoki parol noto'g'ri");
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
  });
}

async function registerFailure(user: User, req: Request, now: Date) {
  const max = await getSetting('auth.maxFailedLogins');
  // Atomic increment so parallel attempts cannot slip past the limit.
  const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
  if (updated.failedLoginCount < max) return;
  const lockMinutes = await getSetting('auth.lockoutMinutes');
  const until = new Date(now.getTime() + minutes(lockMinutes));
  await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: until, failedLoginCount: 0 } });
  await audit(prisma, {
    actor: null,
    action: 'ACCOUNT_LOCKED',
    entityType: 'User',
    entityId: user.id,
    summary: `${user.username}: ${max} ta noto'g'ri urinish, ${lockMinutes} daqiqaga bloklandi`,
    req,
  });
}

/** Self-service password change. Revokes every other session of the user. */
export async function changeOwnPassword(actor: AuthUser, currentPassword: string, newPassword: string, req: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Joriy parol noto'g'ri");
  const next = passwordSchema.parse(newPassword);
  if (await bcrypt.compare(next, user.passwordHash)) throw badRequest("Yangi parol eskisidan farq qilishi kerak");
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(next, BCRYPT_COST),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await audit(tx, { actor, req, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: u.id, summary: u.username });
    return u;
  });
}
