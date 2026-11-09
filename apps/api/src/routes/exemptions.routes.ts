import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { ah } from '../middleware/common';
import { requireAuth, requireRole, type AuthUser } from '../middleware/auth';
import { badRequest, conflict, notFound } from '../lib/errors';
import { paged, paging } from '../lib/http';
import { audit } from '../lib/audit';
import { getSetting } from '../services/settings.service';
import { createInfoAlert, ensureUnpaidAlert, resolveUnpaidAlerts } from '../services/alert.service';
import { emit } from '../realtime/socket';

export const exemptionsRouter = Router();
exemptionsRouter.use(requireAuth, requireRole('CHIEF', 'MARKET_ADMIN'));

const include = {
  space: { select: { id: true, number: true, row: { select: { name: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ExemptionInclude;

exemptionsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = z
      .object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ACTIVE']).optional(), search: z.string().trim().max(50).optional() })
      .parse(req.query);
    const { page, pageSize, skip, take } = paging(req.query);
    const now = new Date();
    const where: Prisma.ExemptionWhereInput = {
      ...(q.status === 'ACTIVE'
        ? { status: 'APPROVED', validFrom: { lte: now }, validUntil: { gt: now } }
        : q.status
          ? { status: q.status }
          : {}),
      ...(q.search && { space: { number: { contains: q.search, mode: 'insensitive' } } }),
    };
    const [items, total] = await Promise.all([
      prisma.exemption.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.exemption.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  }),
);

async function onApproved(tx: Tx, ex: { id: string; spaceId: string; validFrom: Date; validUntil: Date; reason: string }, actor: AuthUser) {
  const space = await tx.tradingSpace.findUniqueOrThrow({ where: { id: ex.spaceId } });
  const now = new Date();
  let resolved: string[] = [];
  if (ex.validFrom <= now && ex.validUntil > now) {
    resolved = await resolveUnpaidAlerts(tx, ex.spaceId, 'Imtiyoz tasdiqlandi', { actor });
  }
  await createInfoAlert(tx, {
    type: 'EXEMPTION_APPROVED',
    title: `${space.number}-joy: imtiyoz tasdiqlandi`,
    message: ex.reason,
    spaceId: ex.spaceId,
    actorId: actor.id,
  });
  return resolved;
}

/** MARKET_ADMIN creates a request (PENDING); CHIEF creates an approved exemption directly. */
exemptionsRouter.post(
  '/',
  ah(async (req, res) => {
    const defaultDays = await getSetting('exemption.defaultValidityDays');
    const body = z
      .object({
        spaceId: z.string().min(1),
        reason: z.string().trim().min(5).max(500),
        validFrom: z.coerce.date().optional(),
        validUntil: z.coerce.date().optional(),
      })
      .parse(req.body);
    const validFrom = body.validFrom ?? new Date();
    const validUntil = body.validUntil ?? new Date(validFrom.getTime() + defaultDays * 86_400_000);
    if (validUntil <= validFrom) throw badRequest("Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak");
    const space = await prisma.tradingSpace.findUnique({ where: { id: body.spaceId } });
    if (!space) throw notFound('Savdo joyi topilmadi');
    const isChief = req.user!.role === 'CHIEF';

    const { ex, resolved } = await prisma.$transaction(async (tx) => {
      const ex = await tx.exemption.create({
        data: {
          spaceId: space.id,
          reason: body.reason,
          validFrom,
          validUntil,
          requestedById: req.user!.id,
          status: isChief ? 'APPROVED' : 'PENDING',
          ...(isChief && { approvedById: req.user!.id, approvedAt: new Date() }),
        },
      });
      await audit(tx, {
        actor: req.user,
        req,
        action: isChief ? 'EXEMPTION_APPROVED' : 'EXEMPTION_REQUESTED',
        entityType: 'Exemption',
        entityId: ex.id,
        summary: `Joy ${space.number}: ${body.reason}`,
        after: { validFrom, validUntil, reason: body.reason },
      });
      const resolved = isChief ? await onApproved(tx, ex, req.user!) : [];
      return { ex, resolved };
    });
    emit('space:updated', { id: space.id });
    for (const id of resolved) emit('alert:updated', { id });
    res.status(201).json(ex);
  }),
);

exemptionsRouter.post(
  '/:id/decision',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() }).parse(req.body);
    const ex = await prisma.exemption.findUnique({ where: { id: req.params.id } });
    if (!ex) throw notFound('Imtiyoz topilmadi');
    if (ex.status !== 'PENDING') throw conflict("Faqat kutilayotgan so'rov bo'yicha qaror qabul qilinadi");
    await prisma.$transaction(async (tx) => {
      const updated = await tx.exemption.update({
        where: { id: ex.id },
        data: { status: body.decision, approvedById: req.user!.id, approvedAt: new Date(), decisionNote: body.note },
      });
      await audit(tx, { actor: req.user, req, action: `EXEMPTION_${body.decision}`, entityType: 'Exemption', entityId: ex.id, before: { status: ex.status }, after: body });
      if (body.decision === 'APPROVED') await onApproved(tx, updated, req.user!);
    });
    emit('space:updated', { id: ex.spaceId });
    res.json({ ok: true });
  }),
);

exemptionsRouter.post(
  '/:id/revoke',
  requireRole('CHIEF'),
  ah(async (req, res) => {
    const body = z.object({ note: z.string().trim().min(3).max(500) }).parse(req.body);
    const ex = await prisma.exemption.findUnique({ where: { id: req.params.id } });
    if (!ex) throw notFound('Imtiyoz topilmadi');
    if (ex.status !== 'APPROVED') throw conflict('Faqat tasdiqlangan imtiyozni bekor qilish mumkin');
    await prisma.$transaction(async (tx) => {
      await tx.exemption.update({ where: { id: ex.id }, data: { status: 'REVOKED', decisionNote: body.note } });
      await audit(tx, { actor: req.user, req, action: 'EXEMPTION_REVOKED', entityType: 'Exemption', entityId: ex.id, after: body });
      await ensureUnpaidAlert(tx, ex.spaceId);
    });
    emit('space:updated', { id: ex.spaceId });
    res.json({ ok: true });
  }),
);
