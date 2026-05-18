# Stage 1: Build shared types
FROM node:22-alpine AS shared-build
WORKDIR /app/shared
COPY shared/package.json shared/tsconfig.json ./
COPY shared/types.ts ./

# Stage 2: Build client
FROM node:22-alpine AS client-build
WORKDIR /app
COPY shared/ shared/
COPY client/package.json client/package-lock.json* client/
WORKDIR /app/client
RUN npm install
COPY client/ .
RUN npx tsc --noEmit && npx vite build

# Stage 3: Build server
FROM node:22-alpine AS server-build
WORKDIR /app
COPY shared/ shared/
COPY server/package.json server/package-lock.json* server/
WORKDIR /app/server
RUN npm install
COPY server/ .
RUN npx tsc

# Stage 4: Runtime
FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
ARG GIT_COMMIT=dev
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT BUILD_TIME=$BUILD_TIME NODE_ENV=production
COPY --from=server-build /app/server/dist ./server/
COPY --from=server-build /app/server/node_modules ./node_modules/
COPY --from=client-build /app/client/dist ./public/
COPY server/drizzle ./drizzle/
COPY server/admin-static ./admin-static/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/index.js"]
