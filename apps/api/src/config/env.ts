import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEMO_MODE: bool,
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_HOURS: z.coerce.number().positive().default(12),
  COOKIE_SECURE: bool,
  VISION_API_KEY: z.string().min(16, 'VISION_API_KEY must be at least 16 characters'),
  ALERT_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(15),
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_SECRET_KEY: z.string().optional(),
  CLICK_SERVICE_ID: z.string().optional(),
  CLICK_MERCHANT_ID: z.string().optional(),
  CLICK_SECRET_KEY: z.string().optional(),
  UZUM_MERCHANT_ID: z.string().optional(),
  UZUM_SECRET_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};

/** Configuration mistakes that must never reach a production deployment with real money. */
export function productionConfigErrors(e: typeof env): string[] {
  if (!e.isProd) return [];
  const errors: string[] = [];
  const placeholder = (v: string | undefined) => !!v && /^dev-|CHANGE_ME/i.test(v);
  if (e.DEMO_MODE) errors.push('DEMO_MODE=true is not allowed in production (it enables simulators and demo seeding).');
  if (placeholder(e.JWT_SECRET)) errors.push('JWT_SECRET is a development/placeholder value.');
  if (placeholder(e.VISION_API_KEY)) errors.push('VISION_API_KEY is a development/placeholder value.');
  if (placeholder(e.DATABASE_URL)) errors.push('DATABASE_URL still contains a placeholder password.');
  return errors;
}

/** Risky but legitimate for a local/staging container over plain HTTP: logged at startup. */
export function productionConfigWarnings(e: typeof env): string[] {
  if (!e.isProd) return [];
  const warnings: string[] = [];
  if (!e.COOKIE_SECURE) warnings.push('COOKIE_SECURE=false — session cookies travel unencrypted. Use HTTPS and set COOKIE_SECURE=true for go-live.');
  if (e.corsOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) warnings.push('CORS_ORIGINS points to localhost — set the real HTTPS origin for go-live.');
  return warnings;
}

const configErrors = productionConfigErrors(env);
if (configErrors.length) {
  console.error('Refusing to start in production:\n  - ' + configErrors.join('\n  - '));
  process.exit(1);
}
