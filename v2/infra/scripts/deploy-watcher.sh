#!/bin/bash
# Watches for deploy trigger files written by the AquaSim admin panel.
# Install as a systemd service or run in a tmux/screen session.
#
# Setup:
#   sudo cp infra/scripts/aquasim-deploy-watcher.service /etc/systemd/system/
#   sudo systemctl enable --now aquasim-deploy-watcher

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TRIGGER_DIR="$PROJECT_DIR/deploy-trigger"
TRIGGER_FILE="$TRIGGER_DIR/deploy.trigger"
LOG_FILE="$TRIGGER_DIR/deploy.log"

mkdir -p "$TRIGGER_DIR"

echo "AquaSim deploy watcher started. Monitoring $TRIGGER_FILE"

while true; do
  if [ -f "$TRIGGER_FILE" ]; then
    TIMESTAMP=$(cat "$TRIGGER_FILE")
    rm -f "$TRIGGER_FILE"

    echo "--- Deploy triggered at $TIMESTAMP ---" | tee -a "$LOG_FILE"

    cd "$PROJECT_DIR" || continue

    echo "Pulling latest changes..." | tee -a "$LOG_FILE"
    git pull origin main 2>&1 | tee -a "$LOG_FILE"

    echo "Rebuilding and restarting..." | tee -a "$LOG_FILE"
    bash deploy.sh 2>&1 | tee -a "$LOG_FILE"

    echo "--- Deploy complete at $(date -u +%Y-%m-%dT%H:%M:%SZ) ---" | tee -a "$LOG_FILE"
  fi
  sleep 5
done
