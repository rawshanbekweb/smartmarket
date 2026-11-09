# SMART MARKET — single-service image for PaaS hosting (Render, Koyeb, ...):
# the API process also serves the built web app (WEB_DIST_DIR), so one free web
# service runs the SPA, REST API, Socket.IO and the alert worker on one origin.
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w apps/api && npm run build -w apps/web

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/apps/web/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/api
USER app
EXPOSE 4000
# The host sets PORT. Migrations run as the schema owner when MIGRATE_DATABASE_URL is set.
CMD ["sh", "-c", "DATABASE_URL=\"${MIGRATE_DATABASE_URL:-$DATABASE_URL}\" npx prisma migrate deploy && exec node dist/server.js"]
