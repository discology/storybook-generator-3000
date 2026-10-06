#!/bin/sh
# Starts the hosted app. Everything it saves lives on the /data volume:
# the database (/data/storybook.db) and uploads (/data/uploads).
set -e
mkdir -p /data/uploads

# One-time import of a copied database and uploads folder (docs/deployment.md):
# upload the archive to /data/import.tgz, then restart the machine.
if [ -f /data/import.tgz ]; then
  echo "Importing /data/import.tgz"
  rm -rf /data/import
  mkdir -p /data/import
  tar -xzf /data/import.tgz -C /data/import
  if [ -f /data/import/storybook.db ]; then
    rm -f /data/storybook.db /data/storybook.db-journal
    mv /data/import/storybook.db /data/storybook.db
  fi
  if [ -d /data/import/uploads ]; then
    rm -rf /data/uploads
    mv /data/import/uploads /data/uploads
  fi
  rm -rf /data/import /data/import.tgz
  echo "Import finished"
fi

# The app reads and writes uploads/ in its own folder; point that at the volume.
rm -rf /app/uploads
ln -s /data/uploads /app/uploads

npx prisma migrate deploy
exec node_modules/.bin/tsx server.ts
