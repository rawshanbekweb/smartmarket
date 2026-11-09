import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { csrfGuard } from './middleware/auth';
import { errorHandler } from './middleware/common';
import { notFound } from './lib/errors';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { spacesRouter } from './routes/spaces.routes';
import { rowsRouter } from './routes/rows.routes';
import { camerasRouter } from './routes/cameras.routes';
import { paymentsRouter } from './routes/payments.routes';
import { cashierRouter } from './routes/cashier.routes';
import { alertsRouter } from './routes/alerts.routes';
import { complaintsRouter } from './routes/complaints.routes';
import { exemptionsRouter } from './routes/exemptions.routes';
import { reportsRouter } from './routes/reports.routes';
import { usersRouter } from './routes/users.routes';
import { auditRouter } from './routes/audit.routes';
import { settingsRouter } from './routes/settings.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { publicRouter } from './routes/public.routes';
import { internalRouter } from './routes/internal.routes';
import { demoRouter } from './routes/demo.routes';
import { collectionsRouter } from './routes/collections.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // JSON API: nothing may be rendered or framed.
  app.use(
    '/api',
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // JSON BigInt support (AuditLog ids)
  app.set('json replacer', (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));

  app.get('/api/health', async (_req, res) => {
    let db = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      /* reported below */
    }
    res.status(db === 'up' ? 200 : 503).json({
      status: db === 'up' ? 'ok' : 'degraded',
      database: db,
      demoMode: env.DEMO_MODE,
      time: new Date().toISOString(),
    });
  });

  // Machine-to-machine routes (own auth, no cookies / CSRF)
  app.use('/api/internal', internalRouter);
  // Public seller QR routes (rate limited, token based)
  app.use('/api/public', publicRouter);

  // Cookie-authenticated management API
  app.use('/api', csrfGuard);
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/spaces', spacesRouter);
  app.use('/api/rows', rowsRouter);
  app.use('/api/cameras', camerasRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/cashier', cashierRouter);
  app.use('/api/collections', collectionsRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/complaints', complaintsRouter);
  app.use('/api/exemptions', exemptionsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/demo', demoRouter);

  app.use('/api', (_req, _res, next) => next(notFound('API yo\'li topilmadi')));
  if (env.WEB_DIST_DIR) serveSpa(app, env.WEB_DIST_DIR);
  app.use(errorHandler);
  return app;
}

/**
 * Single-service hosting (e.g. Render): the API also serves the built React app, so
 * the session cookie and Socket.IO stay same-origin. In the VPS stack nginx does this.
 */
function serveSpa(app: express.Express, dir: string) {
  const root = path.resolve(dir);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Ant Design injects runtime styles; Inter is loaded from Google Fonts.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          // Only behind HTTPS; over plain HTTP it would break every asset request.
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
    }),
  );
  app.use('/assets', express.static(path.join(root, 'assets'), { immutable: true, maxAge: '30d' }));
  app.use('/assets', (_req, res) => res.status(404).end());
  app.use(express.static(root, { index: false, maxAge: 0 }));
  // Client-side routes (/cashier, /qr/:token, ...) → index.html
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(root, 'index.html'));
  });
}
