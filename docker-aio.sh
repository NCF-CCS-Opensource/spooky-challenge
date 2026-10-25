#!/bin/bash
set -e
PG=$(echo /usr/lib/postgresql/*/bin)
DB=${POSTGRES_DB:-treat_or_code} U=${POSTGRES_USER:-treat_or_code} PW=${POSTGRES_PASSWORD:-change-me}
PGDATA=/var/lib/postgresql/data

# Piston's stock entrypoint (patched at build to background node instead of exec) sets up cgroups,
# which only works while PID 1 is the sole process in the container, so source it before anything else.
. /piston-entry.sh
export PATH=/opt/node22/bin:$PATH

mkdir -p $PGDATA && chown -R postgres:postgres /var/lib/postgresql
if [ ! -s $PGDATA/PG_VERSION ]; then
  su postgres -c "$PG/initdb -D $PGDATA"
  su postgres -c "$PG/pg_ctl -D $PGDATA -w start"
  su postgres -c "psql -c \"CREATE ROLE $U LOGIN PASSWORD '$PW'\" -c \"CREATE DATABASE $DB OWNER $U\""
  su postgres -c "psql -d $DB -f /app/apps/api/db/init.sql"
  su postgres -c "$PG/pg_ctl -D $PGDATA -w stop"
fi
su postgres -c "$PG/postgres -D $PGDATA -c listen_addresses=127.0.0.1" &
until su postgres -c "$PG/pg_isready -h 127.0.0.1" >/dev/null; do sleep 1; done

export DATABASE_URL=postgresql://$U:$PW@127.0.0.1:5432/$DB PISTON_URL=http://127.0.0.1:2000 API_URL=http://127.0.0.1:3001
until curl -sf $PISTON_URL/api/v2/runtimes >/dev/null; do sleep 1; done

cd /app
PORT=3001 pnpm --filter api start &
until curl -sf $API_URL/health >/dev/null; do sleep 1; done
PORT=3000 pnpm --filter web start &
wait -n # any service dying stops the container
