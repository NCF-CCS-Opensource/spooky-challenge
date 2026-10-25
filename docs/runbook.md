# Event-day runbook

Single booth computer, one organizer. Everything below is run from the repo root in a shell on that computer. Reset and export are shell steps only: no student-facing endpoint does either.

## Before the event (one-time, with internet)

1. `cp .env.example .env`, then set a unique `POSTGRES_PASSWORD` and the matching `DATABASE_URL`. Pick an `EXPORT_HMAC_KEY` (16+ characters), store it somewhere safe outside the repo, and reuse it for every export.
2. **Install the pinned Python runtime.** Piston sits on an internal network with no internet, so install once with the install overlay, then stop:
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.piston-install.yml up -d --build --wait
   docker compose exec piston node -e "require('http').get('http://localhost:2000/api/v2/runtimes',r=>r.pipe(process.stdout))"   # must list python 3.12.0
   docker compose down        # keep volumes: the runtime lives in piston-packages
   ```
   The pinned version is `PISTON_PYTHON_VERSION` (default `3.12.0`). The API refuses to start if it is missing, and every judged attempt is pinned to it.
3. **Seed challenges** (numbers 1–100):
   ```sh
   python3 apps/api/scripts/import_exercism.py --start 1 --limit 100 > seed.sql
   docker compose up -d --wait
   docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" < seed.sql
   ```
4. Run the smoke test below, then **reset** (the smoke test writes events).

## Start and health checks

```sh
docker compose up -d --wait      # no overlay: Piston has no internet during the event
docker compose ps                # db, piston, api, web must be "healthy"
curl -fsS localhost:3000 >/dev/null && echo web ok
docker compose exec api node -e "fetch('http://localhost:3001/health').then(r=>r.text()).then(console.log)"   # {"status":"ok"}
```

Open <http://localhost:3000> and keep one browser window on the booth. A student types a challenge number, then enters a **pseudonym, not a real name**.

## Smoke test (about 2 minutes, run before participants arrive)

Uses the web proxy and a throwaway visit on challenge 1. It never submits for judging, so no challenge gets solved and closed.

```sh
V=$(python3 -c 'import uuid;print(uuid.uuid4())')
B='"visitId":"'$V'","learnerUsername":"smoke-test"'
curl -fsS localhost:3000/api/challenges/1/open -H 'content-type: application/json' -d "{$B}"
curl -fsS localhost:3000/api/challenges/1/run  -H 'content-type: application/json' \
  -d "{$B,\"language\":\"python\",\"version\":\"3.12.0\",\"code\":\"print(6*7)\",\"stdin\":\"\"}"   # output "42\n", error null
curl -fsS localhost:3000/api/challenges/1/end  -H 'content-type: application/json' -d "{$B}"      # {"ended":true}
```

Pass = three successful responses, with `42` from the run. Then in the browser open `/challenge`, open challenge 1, and confirm the username modal, Run Code, and End challenge work. **Reset afterwards** to delete the `smoke-test` rows.

## During the event

- A student walks away without finishing: press **End challenge**. This logs "gave up" and clears the screen for the next student. Anyone can try a given-up challenge again.
- A solved challenge is closed for everyone. On the success screen, **hand out the candy**.
- Refreshing the page resumes the active visit; End challenge starts the next student clean.

## Piston failure recovery

Symptom: Check Solution shows a runner error, or `docker compose ps` shows piston unhealthy. Runner failures are logged as `runner_unavailable` and excluded from the dataset, so they do not count against students.

```sh
docker compose logs --tail 50 piston
docker compose restart piston api        # the API re-verifies the pinned runtime on start
```

If the API will not start with "Unable to install pinned Python", the volume lost the runtime: repeat step 2 of the one-time setup (needs internet). Never run `down -v` during the event.

## Backup and export (do this before any reset)

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/event-$(date +%F-%H%M).sql
docker compose exec -T db psql -U "$POSTGRES_USER" -At "$POSTGRES_DB" \
  -c "SELECT row_to_json(i) FROM learning_interactions i ORDER BY id" > interactions.jsonl
EXPORT_HMAC_KEY=<secret> python3 apps/api/scripts/export_bkt.py interactions.jsonl --out export/
```

`backups/*.sql` and `interactions.jsonl` contain raw usernames: keep them out of git. Share only `export/`, which has keyed learner IDs and no usernames or source code (source code is never stored). Copy `backups/` and `export/` off the booth computer.

## Safe event reset

Only after the backup and export above exist and `export/` is non-empty. This deletes event data and re-opens every challenge; challenge content stays.

```sh
docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "TRUNCATE learning_interactions, code_executions RESTART IDENTITY"
```

`learning_interactions` rejects row UPDATE and DELETE by design; TRUNCATE is the deliberate, shell-only reset. Afterwards confirm challenge 1 opens again.

## End-to-end tests (developer machine, disposable database)

```sh
export COMPOSE_PROJECT_NAME=e2e
docker compose -f docker-compose.yml -f docker-compose.piston-install.yml -f docker-compose.e2e.yml up -d --build --wait api
pnpm --filter api test:e2e
docker compose -f docker-compose.yml -f docker-compose.piston-install.yml -f docker-compose.e2e.yml down -v
```

The e2e overlay publishes the API and database on loopback for the tests only. Never use it on the booth computer.
