import { Router } from 'express';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { dateRangeQuery } from '../lib/http';
import { dashboardSummary, occupancyMap, paymentDistribution, revenueSeries } from '../services/analytics.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/summary', requireRole('CHIEF', 'MARKET_ADMIN'), ah(async (_req, res) => res.json(await dashboardSummary())));

dashboardRouter.get(
  '/occupancy',
  requireRole('CHIEF', 'MARKET_ADMIN', 'CASHIER'),
  ah(async (_req, res) => res.json(await occupancyMap())),
);

dashboardRouter.get(
  '/revenue',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const q = dateRangeQuery.parse(req.query);
    res.json(await revenueSeries(q.from, q.to));
  }),
);

dashboardRouter.get(
  '/payment-distribution',
  requireRole('CHIEF', 'MARKET_ADMIN'),
  ah(async (req, res) => {
    const q = dateRangeQuery.parse(req.query);
    res.json(await paymentDistribution(q.from, q.to));
  }),
);
