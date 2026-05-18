# AquaSim Architecture

## Overview

AquaSim is a marine ecosystem simulator that runs evolution, speciation, and ecological dynamics on a cell-based grid. Originally a client-side-only application, it has been expanded into a full-stack web application with user accounts, persistent storage, multiplayer rooms, leaderboards, and an admin console.

```
                     Internet
                        |
                  Cloudflare Edge
                  (Public TLS)
                        |
                   cloudflared
                   (tunnel)
                        |
              +---------+---------+
              |    Docker Network  |
              |                    |
              |   nginx (443/80)   |
              |   self-signed TLS  |
              |   security headers |
              |        |           |
              |   +----+----+      |
              |   |         |      |
              |  /api    / (SPA)   |
              |  /ws                |
              |  /admin             |
              |   |                 |
              |  Hono API (:3000)   |
              |  REST + WebSocket   |
              |  Admin HTML         |
              |        |            |
              |  PostgreSQL (:5432) |
              |  Users, Saves,      |
              |  Leaderboard,       |
              |  Analytics          |
              +--------------------+
```

## Components

### Client (SPA)

- **Stack**: Vite + TypeScript, no framework
- **Renderer**: Canvas 2D / WebGL for grid visualisation, procedural creature portraits
- **Simulation engine**: Runs entirely in the browser. The scheduler (`scheduler.ts`, ~1,800 lines) advances the grid state each tick with breeding, movement, feeding, death, and evolution logic
- **Save format**: JSON with RLE-encoded typed arrays (species, hunger, age, currents). Versioned via `SaveData.version`
- **Auth integration**: JWT tokens stored in memory, refresh via httpOnly cookie
- **WebSocket client**: Connects to `/ws` for multiplayer room sync

### Server (API)

- **Stack**: Hono on Node.js
- **Serves**: REST API (`/api/*`), WebSocket (`/ws`), admin console (`/admin/*`), static client bundle (`/`)
- **Auth**: Argon2id password hashing, JWT access tokens (15 min), httpOnly refresh cookies (30 days), TOTP MFA, WebAuthn passkeys
- **Rate limiting**: Per-IP and per-user, configurable thresholds
- **Logging**: Pino (structured JSON)

### Database (PostgreSQL 16)

Tables:
- `users` -- accounts with roles (user/admin/guest), MFA state, ban status
- `passkey_credentials` -- WebAuthn credential storage
- `simulations` -- saved game states as JSONB, 10 per user
- `leaderboard_entries` -- high scores by category
- `refresh_tokens` -- hashed refresh tokens with expiry
- `password_reset_tokens` -- time-limited reset tokens
- `user_activity` -- daily active user tracking (one row per user per day)

### nginx

- Reverse proxy with self-signed TLS for internal network / LAN access
- Routes `/api/*`, `/ws`, `/admin/*` to the Hono app on port 3000
- Serves static client assets with 1-year immutable cache headers
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

### Cloudflare Tunnel

- `cloudflared` container connects outbound to Cloudflare edge
- Zero inbound ports required on the host
- Public TLS terminated at Cloudflare; internal traffic uses self-signed certs
- WebSocket proxying supported natively
- Enabled via Docker Compose profile (`--profile tunnel`)

## Authentication

### Password + MFA

1. User registers with username, email, password
2. Password hashed with Argon2id (19 MiB, 2 iterations)
3. Optional TOTP MFA setup (scanned via QR code)
4. Login: password verification, then TOTP if enabled
5. JWT access token (15 min) returned in response body
6. Refresh token (30 days) set as httpOnly/Secure/SameSite=Strict cookie

### WebAuthn Passkeys

1. User registers a passkey from account settings
2. Credential stored in `passkey_credentials` table
3. Login: passwordless authentication via `navigator.credentials.get()`
4. Can be used as primary auth or as MFA second factor

### Guest Accounts

1. Auto-created on "Play as Guest"
2. Limited to 3 simulation saves
3. Can be promoted to full account by adding username/email/password

### Password Reset

1. User submits email to forgot-password endpoint
2. Random token generated, hashed, stored with 1-hour expiry
3. Email sent with reset link
4. User sets new password, token marked as used

## Data Flow

### Simulation Save/Load

```
Client: SimState -> serialise() -> SaveData (JSON)
          |
    POST /api/simulations
          |
Server: validate SaveData, check save limit (10)
          |
    INSERT INTO simulations (state) VALUES ($saveData::jsonb)
          |
    GET /api/simulations/:id
          |
Client: SaveData -> deserialise() -> SimState
```

### Multiplayer Sync

```
Host Client                Server                  Spectator Client
    |                         |                         |
    |-- join_room ----------->|                         |
    |                         |<-- join_room -----------|
    |                         |--- room_state --------->|
    |                         |--- sync_snapshot ------>|
    |                         |                         |
    |-- sync_delta ---------->|--- sync_delta --------->|
    |-- sync_delta ---------->|--- sync_delta --------->|
    |                         |                         |
    |                         |<-- paint ---------------|
    |<-- paint ---------------|                         |
```

- Host client runs simulation, sends state deltas every 5 ticks
- Server validates (monotonic generation, valid grid dimensions) and broadcasts
- Spectators receive deltas and apply them to local state
- Collaborators can send paint operations, which the host applies and rebroadcasts

## Admin Console

- Server-rendered HTML using Hono's `html` tagged template literal
- HTMX for interactive elements (no client-side framework)
- Protected by `adminOnly` middleware (checks `user.role === 'admin'`)

### Features

- **Dashboard**: Total users, DAU, MAU, live users, active rooms, build number
- **User management**: Search, paginate, ban/unban, delete, promote/demote admin
- **Game stats**: Active simulations, total generations, leaderboard overview
- **Analytics**: DAU/MAU charts (90-day history), user growth
- **Health**: DB status, memory (RSS/heap), uptime, active WebSocket connections
- **Deploy**: GitHub webhook log viewer, manual deploy trigger

### Build Number

Injected at Docker build time via build args:
- `GIT_COMMIT`: short git hash
- `BUILD_TIME`: ISO 8601 UTC timestamp

Displayed in admin console header.

## Deployment

### Docker Compose Services

| Service | Image | Purpose |
|---------|-------|---------|
| `app` | Custom (Node.js) | Hono API + serves static client bundle |
| `db` | postgres:16-alpine | PostgreSQL database |
| `nginx` | nginx:alpine | Reverse proxy, TLS, security headers |
| `cloudflared` | cloudflare/cloudflared | Public tunnel (optional profile) |

### Guided Installer

`infra/scripts/install.sh` automates setup on Ubuntu 22.04+:
1. Installs Docker, git, openssl if missing
2. Prompts for planned URL (used for CORS, WebAuthn origin)
3. Generates self-signed certificates
4. Configures Cloudflare Tunnel (optional)
5. Configures SMTP for email (optional)
6. Generates random DB password, JWT secret, webhook secret
7. Builds and starts containers
8. Bootstraps initial admin account

### Auto-Deploy via GitHub Webhook

1. GitHub sends POST to `/api/webhooks/github-deploy` on push to main
2. Server verifies HMAC-SHA256 signature using `GITHUB_WEBHOOK_SECRET`
3. Spawns detached process: `git pull && docker compose up -d --build`
4. Deploy log viewable at `/admin/deploy`

### Backups

- `infra/scripts/backup.sh` runs `pg_dump`, compresses with gzip
- Cron job installed by installer: daily at 03:00
- Retains last 7 days of backups

## Project Structure

```
v2/
├── client/           Frontend SPA (Vite + TypeScript)
│   └── src/          34 simulation modules + UI + API client
├── server/           Backend API (Hono + Node.js)
│   ├── src/routes/   REST endpoints
│   ├── src/admin/    Admin console (server-rendered)
│   ├── src/ws/       WebSocket rooms and sync
│   ├── src/db/       Drizzle schema and migrations
│   └── src/lib/      Auth, email, analytics, health
├── shared/           Types shared between client and server
├── infra/            nginx config, certs, installer scripts
├── docs/             This file
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Leaderboard Scoring

| Category | Metric | Source |
|----------|--------|--------|
| Highest Biodiversity | Shannon diversity index peak | `calcBiodiversity()` from population history |
| Most Speciations | Total species ever created | Evolution log count |
| Longest Surviving Species | Max generations any single species survived | Species birth/death tracking |
| Largest Population | Peak total living cell count | Population snapshot max |
| Most Generations | Total simulation ticks | `SimState.generation` |
