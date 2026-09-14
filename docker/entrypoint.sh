#!/bin/sh
set -e

echo "⏳ Waiting for PostgreSQL and running migrations..."
i=0
until node src/db/migrate.js; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "❌ Database not ready after 30 attempts"
    exit 1
  fi
  echo "   retry $i/30..."
  sleep 2
done

node src/db/migrations/add_task_fields.js

echo "🚀 Starting PeerTask API"
exec node src/index.js
