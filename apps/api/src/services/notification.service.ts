import type { Role } from '@prisma/client';
import type { Db } from '../lib/prisma';
import { emitToUser } from '../realtime/socket';

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  alertId?: string;
}

/** Create a notification for every active user with one of the given roles. */
export async function notifyRoles(db: Db, roles: Role[], input: NotifyInput) {
  const users = await db.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } });
  if (!users.length) return [];
  await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, ...input })) });
  return users.map((u) => u.id);
}

/** Push realtime notice after the surrounding transaction has committed. */
export function pushNotifications(userIds: string[], input: NotifyInput) {
  for (const id of userIds) emitToUser(id, 'notification:new', input);
}
