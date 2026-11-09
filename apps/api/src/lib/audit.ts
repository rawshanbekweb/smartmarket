import type { Request } from 'express';
import type { Db } from './prisma';
import type { AuthUser } from '../middleware/auth';

export interface AuditInput {
  actor?: AuthUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  req?: Request;
  isDemo?: boolean;
}

const SENSITIVE_KEYS = /password|secret|token|hash|key/i;

/** Strip secrets from objects before persisting them in the audit trail. */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v);
    }
    return out;
  }
  return value;
}

/** Append an audit record. AuditLog rows are append-only (DB trigger blocks UPDATE/DELETE). */
export async function audit(db: Db, input: AuditInput) {
  await db.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? (input.actor === null ? 'SYSTEM' : undefined),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: sanitize(input.before) as any,
      after: sanitize(input.after) as any,
      ip: input.req?.ip,
      userAgent: input.req?.get('user-agent')?.slice(0, 255),
      isDemo: input.isDemo ?? false,
    },
  });
}
