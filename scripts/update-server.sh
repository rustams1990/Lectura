#!/usr/bin/env bash
# ==============================================================================
# Lectura — Fast Production Update Script for Ubuntu Server
# Conforms to Lectura Dogmas: Mandatory DB backup before every server update
# Time to update: ~15-30 seconds (no compiling on server)
# ==============================================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
DATA_DIR="./data"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "========================================="
echo "Lectura Fast Production Update"
echo "========================================="

# 1. Mandatory Database Backup
mkdir -p "$BACKUP_DIR"
if [ -f "$DATA_DIR/local_server_db.sqlite" ]; then
  echo "Step 1/3: Creating mandatory DB backup..."
  if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DATA_DIR/local_server_db.sqlite" ".backup '$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite'"
  else
    cp "$DATA_DIR/local_server_db.sqlite" "$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"
  fi
  echo "Backup created at: $BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"
else
  echo "No existing database file found at $DATA_DIR/local_server_db.sqlite, skipping backup."
fi

# 2. Pull pre-built image from GitHub Packages (ghcr.io)
echo "Step 2/3: Pulling pre-built Docker image..."
docker compose -f "$COMPOSE_FILE" pull

# 3. Start or restart container
echo "Step 3/3: Starting Lectura container..."
docker compose -f "$COMPOSE_FILE" up -d

# 4. Clean dangling images to save disk space
docker image prune -f > /dev/null 2>&1 || true

echo "========================================="
echo "Lectura updated and running at port 8586!"
echo "========================================="
