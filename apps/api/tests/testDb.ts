import 'dotenv/config';

/** Tests use a SEPARATE database: TEST_DATABASE_URL, or DATABASE_URL with the db name replaced by smart_market_test. */
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/smart_market').replace(/\/[^/?]+(\?|$)/, '/smart_market_test$1');
