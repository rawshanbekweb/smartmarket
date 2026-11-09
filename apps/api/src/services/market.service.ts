import { prisma, type Db } from '../lib/prisma';
import { AppError } from '../lib/errors';

/**
 * The platform currently serves one market. All queries are still scoped by
 * marketId so a multi-market rollout does not require a schema change.
 */
export async function getMarket(db: Db = prisma) {
  const market = await db.market.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!market) throw new AppError(503, 'NOT_CONFIGURED', 'Bozor sozlanmagan. Avval seed yoki boshlang\'ich sozlamani bajaring.');
  return market;
}

export async function getActiveCycle(marketId: string, db: Db = prisma) {
  return db.paymentCycle.findFirst({ where: { marketId, isActive: true } });
}
