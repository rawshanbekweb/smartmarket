import { z } from 'zod';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

/** `maxPageSize` lets pickers that need the whole market (e.g. the cashier's space list) ask for more. */
export function paging(q: unknown, maxPageSize = 200) {
  const { page, pageSize } = pageQuery.extend({ pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(20) }).parse(q);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, total, page, pageSize });

export const dateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const idParam = z.object({ id: z.string().min(1).max(64) });
