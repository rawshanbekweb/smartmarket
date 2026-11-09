import http from 'http';
import { env, productionConfigWarnings } from './config/env';
import { createApp } from './app';
import { initRealtime } from './realtime/socket';
import { startAlertWorker } from './workers/alertWorker';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

async function main() {
  for (const w of productionConfigWarnings(env)) logger.warn(w);
  await prisma.$connect();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  const stopWorker = startAlertWorker();

  server.listen(env.API_PORT, () => {
    logger.info(`SMART MARKET API listening on http://localhost:${env.API_PORT}`, { demoMode: env.DEMO_MODE });
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutting down', { signal });
    stopWorker();
    // Let in-flight requests (e.g. a cash payment transaction) finish, but not forever.
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { err: String((reason as Error)?.stack ?? reason) }));
}

main().catch((err) => {
  logger.error('Failed to start', { err: String(err?.stack ?? err) });
  process.exit(1);
});
