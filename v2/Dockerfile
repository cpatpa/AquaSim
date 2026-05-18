# Stage 1: Install all workspace dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm install --workspaces --include-workspace-root

# Stage 2: Build client
FROM deps AS client-build
WORKDIR /app
COPY shared/ shared/
COPY client/ client/
RUN cd client && npx tsc --noEmit && npx vite build

# Stage 3: Build server
FROM deps AS server-build
WORKDIR /app
COPY shared/ shared/
COPY server/ server/
RUN cd server && npx tsc

# Stage 4: Production dependencies only
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --workspaces --include-workspace-root --omit=dev

# Stage 5: Runtime
FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
ARG GIT_COMMIT=dev
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT BUILD_TIME=$BUILD_TIME NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules/
COPY --from=server-build /app/server/dist/ ./dist/
COPY --from=client-build /app/client/dist ./public/
COPY server/drizzle ./drizzle/

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server/src/index.js"]
