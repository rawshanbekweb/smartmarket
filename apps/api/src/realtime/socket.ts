import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { env } from '../config/env';
import { AUTH_COOKIE, userFromToken } from '../middleware/auth';
import { logger } from '../lib/logger';

let io: Server | null = null;

export type RealtimeEvent =
  | 'space:updated'
  | 'payment:created'
  | 'payment:updated'
  | 'alert:created'
  | 'alert:updated'
  | 'camera:updated'
  | 'notification:new';

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: env.corsOrigins, credentials: true },
  });

  // Only authenticated management users may subscribe.
  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await userFromToken(cookies[AUTH_COOKIE]);
    if (!user || user.mustChangePassword) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`role:${user.role}`);
    socket.join(`user:${user.id}`);
  });

  logger.info('Realtime (Socket.IO) initialised');
  return io;
}

export function emit(event: RealtimeEvent, payload: unknown) {
  io?.emit(event, payload);
}

export function emitToUser(userId: string, event: RealtimeEvent, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
