import { execSync } from 'child_process';
import path from 'path';
import { testDatabaseUrl } from './testDb';

export default function setup() {
  const url = testDatabaseUrl;
  if (!/smart_market_test/.test(url)) throw new Error(`Refusing to run tests against non-test database: ${url.replace(/:[^:@/]+@/, ':***@')}`);
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
