type Meta = Record<string, unknown>;

function line(level: string, msg: string, meta?: Meta) {
  const entry = { t: new Date().toISOString(), level, msg, ...meta };
  return JSON.stringify(entry);
}

export const logger = {
  info: (msg: string, meta?: Meta) => process.env.NODE_ENV !== 'test' && console.log(line('info', msg, meta)),
  warn: (msg: string, meta?: Meta) => console.warn(line('warn', msg, meta)),
  error: (msg: string, meta?: Meta) => console.error(line('error', msg, meta)),
};
