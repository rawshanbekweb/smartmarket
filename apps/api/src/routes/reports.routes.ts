import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../middleware/common';
import { requireAuth, requireRole } from '../middleware/auth';
import { dateRangeQuery } from '../lib/http';
import { audit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { buildReport, REPORT_TYPES, toCsv } from '../services/reports.service';
import { getMarket } from '../services/market.service';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('CHIEF'));

reportsRouter.get('/', (_req, res) => {
  res.json(REPORT_TYPES);
});

reportsRouter.get(
  '/:type',
  ah(async (req, res) => {
    const q = dateRangeQuery.extend({ search: z.string().trim().max(60).optional(), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
    const report = await buildReport(req.params.type, q.from, q.to, q.search);
    if (q.format === 'csv') {
      const market = await getMarket();
      await audit(prisma, { actor: req.user, req, action: 'REPORT_EXPORTED', entityType: 'Report', entityId: report.type, summary: `${report.title} ${report.from}..${report.to}` });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="smart-market-${report.type}-${report.from}_${report.to}.csv"`);
      return res.send(toCsv(report, market.utcOffsetMinutes));
    }
    res.json(report);
  }),
);
