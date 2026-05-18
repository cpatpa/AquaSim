#!/bin/bash
set -e

PORT="${1:-8080}"
NAME="aquasim"

echo "Building AquaSim..."
docker build -t "$NAME" .

echo "Stopping any existing container..."
docker rm -f "$NAME" 2>/dev/null || true

echo "Starting AquaSim on port $PORT..."
docker run -d --name "$NAME" -p "$PORT:8080" --restart unless-stopped "$NAME"

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOSTNAME=$(hostname -f 2>/dev/null || hostname)

echo ""
echo "========================================="
echo "  AquaSim deployed successfully"
echo "========================================="
echo ""
echo "  Local:    http://localhost:$PORT"
[ -n "$HOST_IP" ] && echo "  Network:  http://$HOST_IP:$PORT"
[ "$HOSTNAME" != "localhost" ] && echo "  Host:     http://$HOSTNAME:$PORT"
echo ""
echo "  Container: $NAME"
echo "  Port:      $PORT"
echo "  Status:    $(docker inspect -f '{{.State.Status}}' $NAME 2>/dev/null)"
echo "========================================="
