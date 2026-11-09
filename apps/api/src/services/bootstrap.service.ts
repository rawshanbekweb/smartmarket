import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { BCRYPT_COST, passwordSchema } from './auth.service';

export const bootstrapInput = z.object({
  marketName: z.string().trim().min(2).max(100),
  marketAddress: z.string().trim().max(200).optional(),
  fullName: z.string().trim().min(3).max(100),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'Login: 3-32 ta lotin harf/raqam'),
  password: passwordSchema,
  // true when the password was passed non-interactively (env var / CI) and may linger in shell history
  mustChangePassword: z.boolean().default(false),
});
export type BootstrapInput = z.input<typeof bootstrapInput>;

/**
 * First-run setup of a real (non-demo) installation: creates the Market record and
 * the first CHIEF account. Everything else (rows, spaces, tariffs, payment cycle,
 * cameras, other users) is configured from the UI by that CHIEF.
 * Refuses to touch a database that contains demo data or already has a CHIEF.
 */
export async function bootstrapProduction(prisma: PrismaClient, raw: BootstrapInput) {
  const input = bootstrapInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const [demoMarket, demoUser, chief, market] = await Promise.all([
      tx.market.findFirst({ where: { isDemo: true }, select: { id: true } }),
      tx.user.findFirst({ where: { isDemo: true }, select: { id: true } }),
      tx.user.findFirst({ where: { role: 'CHIEF', isActive: true }, select: { username: true } }),
      tx.market.findFirst({ orderBy: { createdAt: 'asc' } }),
    ]);
    if (demoMarket || demoUser) {
      throw new AppError(409, 'DEMO_DATA_PRESENT', "Bazada DEMO ma'lumotlar bor. Haqiqiy ishga tushirish uchun yangi, bo'sh baza yarating.");
    }
    if (chief) throw new AppError(409, 'ALREADY_BOOTSTRAPPED', `Tizim allaqachon sozlangan (faol rahbar: ${chief.username}).`);
    if (await tx.user.findUnique({ where: { username: input.username } })) {
      throw new AppError(409, 'CONFLICT', `"${input.username}" logini band.`);
    }

    const m = market ?? (await tx.market.create({ data: { name: input.marketName, address: input.marketAddress } }));
    const user = await tx.user.create({
      data: {
        fullName: input.fullName,
        username: input.username,
        role: 'CHIEF',
        passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
        mustChangePassword: input.mustChangePassword,
      },
      select: { id: true, username: true, role: true, fullName: true },
    });
    await audit(tx, {
      actor: null,
      action: 'SYSTEM_BOOTSTRAPPED',
      entityType: 'User',
      entityId: user.id,
      summary: `Birinchi rahbar: ${user.username}; bozor: ${m.name}`,
      after: { marketId: m.id, marketCreated: !market, username: user.username },
    });
    return { market: m, user, marketCreated: !market };
  });
}
