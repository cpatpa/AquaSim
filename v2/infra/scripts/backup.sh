#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aquasim}"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/aquasim_$TIMESTAMP.sql.gz"

echo "Creating backup: $BACKUP_FILE"
docker compose exec -T db pg_dump -U aquasim aquasim | gzip > "$BACKUP_FILE"

echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "aquasim_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "aquasim_*.sql.gz" | wc -l)
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo "Backup complete. $BACKUP_COUNT backups totalling $BACKUP_SIZE"
