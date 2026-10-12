# Local Development with Docker

Graduation project GPJ2617: *Design and Implementation of a Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes*.

How to build, run, test, and clean up the application with Docker Compose, and how its containers, networks, and volumes are set up. The platform design is in [architecture.md](architecture.md).

| Service | Stack | Local URL |
|---|---|---|
| frontend | React 18, TypeScript, Vite, served by NGINX | http://127.0.0.1:8080 |
| backend | FastAPI, SQLAlchemy 2, Alembic, Python 3.13 | http://127.0.0.1:8000 |
| database | PostgreSQL 16 | 127.0.0.1:5432 |

**Docker Desktop is the only requirement** for building, running, and testing. Python and Node.js are needed only for the optional hot-reload workflow in section 7.

Commands are for Windows PowerShell and are run from the repository root.

## 1. Configure

```powershell
Copy-Item .env.example .env
```

Open `.env` and change `POSTGRES_PASSWORD` (letters and digits only). `.env` is git-ignored. Compose refuses to start without it.

## 2. Build

```powershell
docker compose build
```

Builds two images: `taskboard-backend:local` and `taskboard-frontend:local`. Add `--no-cache` to rebuild from scratch, or `--pull` to refresh the base images.

## 3. Start

```powershell
docker compose up -d
docker compose ps -a
```

Start order is enforced by health checks: `db` becomes healthy, `migrate` applies the schema and exits, `backend` becomes ready, then `frontend` starts.

Expected state: `db`, `backend`, and `frontend` are `running (healthy)`, and `migrate` is `exited (0)`.

Follow the logs with:

```powershell
docker compose logs -f backend
```

## 4. Test

### Automated smoke test of the running stack

```powershell
.\scripts\smoke-test.ps1
```

It checks the health endpoints, a full create/read/update/delete cycle through the frontend proxy, input validation, security headers, non-root users, the read-only filesystem, and that the frontend cannot reach the database. It prints PASS or FAIL per check and exits with code 1 on any failure.

If PowerShell blocks the script, run it with `powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1`.

### Unit and integration tests, inside containers

```powershell
docker compose --profile test run --rm --build backend-tests
docker compose --profile test run --rm --build frontend-tests
```

The backend run executes the unit tests and the integration tests. The integration tests use real PostgreSQL in the separate `taskboard_test` database, build its schema with the Alembic migrations, and refuse to run against any database whose name does not end in `_test`.

Narrower runs:

```powershell
docker compose --profile test run --rm backend-tests pytest -p no:cacheprovider tests/unit
docker compose --profile test run --rm frontend-tests npm run typecheck
```

| Suite | Location | What it covers |
|---|---|---|
| Backend unit | `app/backend/tests/unit` | Schema validation, settings, health endpoints, request validation, with no database |
| Backend integration | `app/backend/tests/integration` | CRUD over HTTP against PostgreSQL, pagination, filtering, constraints, migrations up and down |
| Frontend unit | `src/validation.test.ts`, `src/api.test.ts` | Form validation rules, API client requests and error handling |
| Frontend integration | `src/App.test.tsx` | The whole UI against an in-memory backend that follows the API contract |

### Manual checks

Open http://127.0.0.1:8080 and add, edit, complete, filter, and delete a task. API docs are at http://127.0.0.1:8000/api/docs (development only).

**Data survives removing the containers:**

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/tasks -ContentType 'application/json' -Body '{"title":"Persistent task"}'
docker compose down
docker compose up -d
Invoke-RestMethod http://127.0.0.1:8000/api/tasks
```

The task is still listed, because it lives in the `db-data` volume and not in the container.

**Readiness follows the database, liveness does not:**

```powershell
docker compose stop db
Invoke-RestMethod http://127.0.0.1:8000/api/healthz
Invoke-RestMethod http://127.0.0.1:8000/api/readyz
docker compose start db
```

`healthz` still answers 200 and `readyz` fails with 503 until the database is back.

**Health status as Docker sees it:**

```powershell
docker inspect --format '{{.Name}} {{.State.Health.Status}}' (docker compose ps -q)
```

## 5. Stop

| Command | Containers | Networks | Database data |
|---|---|---|---|
| `docker compose stop` | stopped, kept | kept | kept |
| `docker compose down` | removed | removed | kept |
| `docker compose down -v` | removed | removed | **deleted** |

## 6. Clean up

Remove everything this project created, including the database volume and the images:

```powershell
docker compose --profile test down -v --rmi local --remove-orphans
```

Confirm nothing is left:

```powershell
docker ps -a --filter "label=com.docker.compose.project=taskboard"
docker volume ls --filter "label=com.docker.compose.project=taskboard"
docker network ls --filter "label=com.docker.compose.project=taskboard"
```

Optionally reclaim build cache, which is shared by all your Docker projects:

```powershell
docker builder prune
```

## 7. Develop with hot reload (optional)

Requires Python 3.12+ and Node.js 20+. Run only the database in Docker, and the two services on your machine:

```powershell
docker compose up -d db

# Terminal 1
cd app\backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2
cd app\frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend, and the backend reads the repository-root `.env`. Tests also run directly: `.venv\Scripts\python -m pytest` and `npm test`.

`npm install` creates `package-lock.json`. Commit it: the Docker build switches to the reproducible `npm ci` once it exists.

Create a migration after changing `app/backend/app/models.py`:

```powershell
.venv\Scripts\python -m alembic revision --autogenerate -m "describe the change"
```

## 8. Run on a local Kubernetes cluster

The same images run on a local kind cluster with two replicas of each service, a migration Job, and persistent database storage. The app is served at http://127.0.0.1:8090.

```powershell
kind create cluster --config deploy/local/kind-cluster.yaml
docker compose build
kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard
Copy-Item deploy/apps/taskboard/overlays/local/secrets.env.example deploy/apps/taskboard/overlays/local/secrets.env
kubectl apply -k deploy/apps/taskboard/overlays/local
```

Edit `secrets.env` before the last command. The full guide, with inspection, logs, network tests, and troubleshooting, is in [kubernetes-local.md](kubernetes-local.md).

## How the containers are built

| | backend | frontend |
|---|---|---|
| Base image | `python:3.13-slim-bookworm` | `nginxinc/nginx-unprivileged:1.27-alpine` |
| Build stages | `builder` installs dependencies into a virtualenv; `runtime` copies only that virtualenv and the source | `build` compiles the bundle with Node.js; `runtime` contains only NGINX and static files |
| User | UID 10001, no shell, no home | UID 101 |
| Port | 8000 | 8080 (unprivileged) |
| Image health check | `GET /api/healthz` | `GET /healthz` |
| Not in the image | pip cache, tests, dev dependencies, `.env` | Node.js, `node_modules`, source code, `.env` |

At run time Compose additionally makes both root filesystems read-only, drops all Linux capabilities, and sets `no-new-privileges`.

PostgreSQL uses the official image unchanged. Its entrypoint starts as root only to prepare the data directory, then runs the server as the `postgres` user.

## Networking

Compose creates two private bridge networks. On each one, Docker's built-in DNS resolves a service name to that container's address, which is why the backend connects to `db:5432` and NGINX forwards to `backend:8000` with no IP addresses anywhere.

```
 your machine (127.0.0.1)
   :8080            :8000                 :5432
     |                |                     |
 +----------+     +---------+          +--------+
 | frontend |-----| backend |----------|   db   |
 +----------+     +---------+          +--------+
      \_____ edge ____/ \_____ data _______/
```

| Network | Members | Purpose |
|---|---|---|
| `edge` | frontend, backend | NGINX forwards `/api` to the backend |
| `data` | backend, migrate, db, backend-tests | Database access |

- The frontend is not on `data`, so it cannot resolve or connect to `db`. A compromised web container has no path to the database. This is the same rule the Kubernetes NetworkPolicies will enforce later.
- **Container-to-container traffic never uses published ports.** It goes over the private network to the container port (`db:5432`).
- **Published ports** (`ports:`) are only for your machine to reach in. Each one is bound to `127.0.0.1`, so other devices on your Wi-Fi or LAN cannot connect. Change the host side with `FRONTEND_PORT`, `BACKEND_PORT`, and `DB_PORT` in `.env`.
- The browser talks only to the frontend on 8080. Requests to `/api` are proxied to the backend, so UI and API share one origin and CORS is not needed.

## Volumes and storage

A container's own filesystem is deleted with the container. Anything that must outlive it has to be stored outside.

| Mount | Type | Lifetime | Purpose |
|---|---|---|---|
| `db-data` at `/var/lib/postgresql/data` | Named volume | Until `docker compose down -v` | PostgreSQL data. Managed by Docker and independent of any container. |
| `./docker/postgres/init` at `/docker-entrypoint-initdb.d` | Bind mount, read-only | Follows the repository | SQL run once, when the volume is first initialised. Creates `taskboard_test`. |
| `/tmp` (backend, frontend), `/etc/nginx/conf.d` (frontend) | tmpfs, in memory | Until the container stops | The only writable paths in the read-only application containers. |

- The application containers are stateless. All durable state is in `db-data`, which is what allows the backend to be replicated later.
- A named volume is used for the database rather than a bind mount to a Windows folder: it performs better under Docker Desktop and avoids file-permission problems.
- PostgreSQL applies `POSTGRES_PASSWORD` and the init scripts **only when the volume is empty**. After changing either, recreate the volume with `docker compose down -v`.

Back up and restore the development database:

```powershell
docker compose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/taskboard.dump'
docker compose cp db:/tmp/taskboard.dump ./taskboard.dump

docker compose cp ./taskboard.dump db:/tmp/taskboard.dump
docker compose exec -T db sh -c 'pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists /tmp/taskboard.dump'
```

## Health checks

| Service | Check | Meaning |
|---|---|---|
| db | `pg_isready` | Accepting connections |
| backend (image) | `GET /api/healthz` | Process is alive. Independent of the database. |
| backend (Compose override) | `GET /api/readyz` | Can reach the database. Gates the frontend's start. |
| frontend | `GET /healthz` | NGINX is serving. Independent of the backend. |

The liveness and readiness split matches the Kubernetes probes used in later milestones.

## Configuration

All configuration comes from environment variables, set in `.env` for local use. Unset backend values fall back to the safest option.

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | none, required | Database credentials and name |
| `FRONTEND_PORT`, `BACKEND_PORT`, `DB_PORT` | `8080`, `8000`, `5432` | Host ports |
| `DATABASE_URL` | none, required by the backend | Built by Compose for containers. `postgresql://` is rewritten to the psycopg 3 driver. |
| `APP_ENV` | `production` in the image, `development` in Compose | API docs are disabled in production. |
| `CORS_ORIGINS` | empty | Comma-separated allowed origins. Empty disables CORS. |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, or `ERROR` |
| `DB_POOL_SIZE` | `5` | Hard cap on database connections per backend process (1 to 20) |
| `TEST_DATABASE_URL` | none | Integration tests only |
| `BACKEND_URL` | `http://backend:8000` | Frontend container: where NGINX forwards `/api` |

## API

| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/api/healthz` | 200 | Liveness. Does not touch the database. |
| GET | `/api/readyz` | 200 | Readiness. 503 when the database is unreachable. |
| GET | `/api/tasks` | 200 | Query: `status`, `limit` (1 to 100, default 20), `offset`. Newest first. |
| POST | `/api/tasks` | 201 | Body: `title` (required, 1 to 200 chars), `description` (up to 2000), `status`, `priority`, `due_date`. |
| GET | `/api/tasks/{id}` | 200 | 404 when missing. |
| PATCH | `/api/tasks/{id}` | 200 | Partial update. An empty body is rejected. |
| DELETE | `/api/tasks/{id}` | 204 | 404 when missing. |

`status` is one of `todo`, `in_progress`, `done`. `priority` is one of `low`, `medium`, `high`. Invalid input returns 422, and unknown fields are rejected.

## Known limitations

- There is no authentication. Anyone who can reach the API can read and change all tasks. See ADR-001 in the architecture document.
- Dependency versions are ranges and base images are pinned by tag, not by digest. Lock files, digest pinning, and vulnerability scanning arrive with the CI pipeline.
- The Compose file is for local development. Production runs on Kubernetes with RDS, as described in the architecture document.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Copy .env.example to .env first` | `.env` is missing. Run the command in section 1. |
| `port is already allocated` | Another program holds the port. Change `FRONTEND_PORT`, `BACKEND_PORT`, or `DB_PORT` in `.env`. |
| `password authentication failed` after editing `.env` | PostgreSQL keeps the password from when the volume was created. Run `docker compose down -v` and start again. |
| `database "taskboard_test" does not exist` | The volume predates the init script. Run `docker compose down -v`, then `docker compose up -d`. |
| `migrate` exited with a non-zero code | Read `docker compose logs migrate`. The backend will not start until migrations succeed. |
| `frontend` keeps restarting | Read `docker compose logs frontend`. If it reports that it cannot write to `/etc/nginx/conf.d`, your Docker version does not accept the tmpfs ownership options; update Docker Desktop. |
| A container is `unhealthy` | `docker inspect --format '{{json .State.Health}}' <container>` shows the output of the last checks. |
