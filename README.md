# Treat or Code

A local development stack for the Halloween programming challenge: Next.js, NestJS, PostgreSQL, and a private self-hosted Piston runner.

## Requirements

- Docker with Docker Compose
- Node.js 22+ and pnpm 10+

## Start locally

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev:compose
```

Open <http://localhost:3000>. Compose checks the API at `/health` on its internal port and waits for PostgreSQL and Piston before starting it, then waits for the API before starting the web app. Use `docker compose ps` to see service readiness. PostgreSQL initializes the application tables from `apps/api/db/init.sql` on first startup.

`pnpm dev` runs the Next.js and NestJS development servers through Turborepo when PostgreSQL and Piston are already available. The API installs the pinned Python runtime (`PISTON_PYTHON_VERSION`, default `3.12.0`) into Piston before it becomes healthy. Stop Compose services with `pnpm dev:down`. Add `-v` to `docker compose down` only when you want to delete the local database and Piston package data.

## Piston network boundary

Piston publishes no host port. It is attached only to the internal `runner` network, shared with the API. The web container cannot reach it; browser code and Next.js do not call Piston. The API uses `PISTON_URL=http://piston:2000` for runner requests. PostgreSQL is on its own internal network with the API.

The checked-in `.env.example` contains local development defaults, not production credentials. `.env` files are ignored. Set unique `POSTGRES_PASSWORD` and a matching `DATABASE_URL` before using this stack on a booth computer or any shared host. The challenge editor posts to the Next.js server, which forwards requests to the API; only the API talks to Piston. Source code is not persisted, and execution records contain runtime and result metadata only.

## BKT export

After the event, dump the event log and generate the privacy-aware dataset (learner IDs are keyed HMACs; keep `EXPORT_HMAC_KEY` secret and out of the repo):

```sh
docker compose exec -T postgres psql -U "$POSTGRES_USER" -At "$POSTGRES_DB" \
  -c "SELECT row_to_json(i) FROM learning_interactions i ORDER BY id" > interactions.jsonl
EXPORT_HMAC_KEY=<secret> python3 apps/api/scripts/export_bkt.py interactions.jsonl --out export/
python3 -m unittest discover apps/api/scripts   # run the export tests
```

`interactions.jsonl` contains raw usernames: keep it out of git and delete it after exporting. The output folder holds the BKT rows, separate visit outcome labels, a manifest with schema version, a data dictionary and a report. Usernames are self-reported, so impersonation or collisions can merge learners.

## Event day

See [docs/runbook.md](docs/runbook.md) for setup, smoke test, recovery, export and reset, and how to run the end-to-end tests (`pnpm --filter api test:e2e`).
