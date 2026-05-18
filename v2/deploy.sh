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

COMPOSE_PROFILES=""
if [ -n "$TUNNEL_TOKEN" ]; then
    COMPOSE_PROFILES="--profile tunnel"
fi

echo "Building AquaSim (commit: $GIT_COMMIT)..."
docker compose $COMPOSE_PROFILES build \
    --build-arg GIT_COMMIT="$GIT_COMMIT" \
    --build-arg BUILD_TIME="$BUILD_TIME"

echo "Restarting services..."
docker compose $COMPOSE_PROFILES up -d

echo ""
echo "========================================="
echo "  AquaSim deployed"
echo "========================================="
echo "  Build:  $GIT_COMMIT ($BUILD_TIME)"
echo "  URL:    $APP_URL"
echo "  Admin:  $APP_URL/admin"
echo "========================================="
