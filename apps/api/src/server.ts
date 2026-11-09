import http from 'http';
import { env } from './config/env';
import { createApp } from './app';
import { initRealtime } from './realtime/socket';
import { startAlertWorker } from './workers/alertWorker';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

async function main() {
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
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start', { err: String(err?.stack ?? err) });
  process.exit(1);
});
