import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { seedDemo, DEMO_PASSWORD } from '../src/demo/seedDemo';

export const app = createApp();
export { prisma };

export async function resetDb() {
  return seedDemo(prisma, { quiet: true });
}

/** Returns a supertest agent with an authenticated session cookie and the CSRF header. */
export async function loginAs(username: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-Requested-With', 'SmartMarket').send({ username, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: unknown) => agent.post(url).set('X-Requested-With', 'SmartMarket').send(body as object),
    patch: (url: string, body?: unknown) => agent.patch(url).set('X-Requested-With', 'SmartMarket').send(body as object),
  };
}

export const uuid = () => randomUUID();

/** An occupied space without valid payment, under an online camera, in kassir1's rows (A/B). */
export async function findUnpaidOccupiedSpace(rowCodes = ['A', 'B', 'C', 'D', 'E', 'F']) {
  const now = new Date();
  return prisma.tradingSpace.findFirstOrThrow({
    where: {
      occupancyState: 'OCCUPIED',
      row: { code: { in: rowCodes } },
      cameraZone: { camera: { status: { in: ['ONLINE', 'DEGRADED'] } } },
      payments: { none: { status: 'SUCCESS', validUntil: { gt: now } } },
      exemptions: { none: { status: 'APPROVED', validUntil: { gt: now }, validFrom: { lte: now } } },
    },
    include: { tariff: true },
  });
}
