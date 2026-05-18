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

echo ""
echo "AquaSim is running at http://localhost:$PORT"
