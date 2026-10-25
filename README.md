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

Open <http://localhost:3000>. Compose checks the API at `/health` on its internal port and waits for PostgreSQL and Piston before starting it, then waits for the API before starting the web app. Use `docker compose ps` to see service readiness. PostgreSQL initializes the two application tables from `apps/api/db/init.sql` on first startup.

`pnpm dev` runs the Next.js and NestJS development servers through Turborepo when PostgreSQL and Piston are already available. Stop Compose services with `pnpm dev:down`. Add `-v` to `docker compose down` only when you want to delete the local database and Piston package data.

## Piston network boundary

Piston publishes no host port. It is attached only to the internal `runner` network, shared with the API. The web container cannot reach it; browser code and Next.js do not call Piston. The API uses `PISTON_URL=http://piston:2000` for runner requests. PostgreSQL is on its own internal network with the API.

The checked-in `.env.example` contains local development defaults, not production credentials. `.env` files are ignored. Set unique `POSTGRES_PASSWORD` and a matching `DATABASE_URL` before using this stack on a booth computer or any shared host. Piston starts without language runtimes; runtime installation belongs with the runner integration work.
