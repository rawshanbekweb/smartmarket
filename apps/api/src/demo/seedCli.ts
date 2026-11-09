import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedDemo, DEMO_PASSWORD, DEMO_USERS } from './seedDemo';

const prisma = new PrismaClient();

seedDemo(prisma)
  .then(() => {
    console.log('\nDEMO accounts (development only), password for all:', DEMO_PASSWORD);
    for (const u of DEMO_USERS) console.log(`  ${u.username.padEnd(8)} ${u.role}`);
  })
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
