#!/bin/bash
set -e

if [ ! -f .env ]; then
    echo "No .env file found. Run the guided installer first:"
    echo "  bash infra/scripts/install.sh"
    exit 1
fi

source .env

GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

COMPOSE_CMD="docker compose"
if ! docker compose version &>/dev/null 2>&1; then
    echo "docker compose not found. Install Docker Compose plugin first."
    exit 1
fi

COMPOSE_PROFILES=""
if [ -n "$TUNNEL_TOKEN" ]; then
    COMPOSE_PROFILES="--profile tunnel"
fi

echo "Building AquaSim (commit: $GIT_COMMIT)..."
$COMPOSE_CMD $COMPOSE_PROFILES build \
    --build-arg GIT_COMMIT="$GIT_COMMIT" \
    --build-arg BUILD_TIME="$BUILD_TIME"

echo "Restarting services..."
$COMPOSE_CMD $COMPOSE_PROFILES up -d

echo ""
echo "Waiting for health check..."
RETRIES=30
until curl -skf https://localhost/api/health &>/dev/null || [ $RETRIES -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    sleep 3
done

if [ $RETRIES -eq 0 ]; then
    echo "Warning: Health check did not pass within 40 seconds."
    echo "Check logs: docker compose logs app"
else
    echo "Health check passed."
fi

echo ""
echo "========================================="
echo "  AquaSim deployed"
echo "========================================="
echo "  Build:  $GIT_COMMIT ($BUILD_TIME)"
echo "  URL:    ${APP_URL:-https://localhost}"
echo "  Admin:  ${APP_URL:-https://localhost}/admin"
if [ -n "$TUNNEL_TOKEN" ]; then
echo "  Tunnel: running (Cloudflare)"
else
echo "  Tunnel: not configured (LAN only)"
fi
echo "========================================="
