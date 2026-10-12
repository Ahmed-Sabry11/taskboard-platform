# Stages:
#   base     shared Python runtime settings
#   builder  installs production dependencies into a virtualenv
#   test     builder + dev dependencies + tests (never shipped)
#   runtime  the image that gets deployed (default target)

FROM python:3.13-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app


FROM base AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv

# Dependencies are copied before the source so this layer is rebuilt only
# when requirements.txt changes.
COPY requirements.txt .
RUN pip install -r requirements.txt


FROM builder AS test

COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt

COPY . .

USER 10001:10001

# The container filesystem is read-only, so pytest must not write its cache.
CMD ["pytest", "-p", "no:cacheprovider"]


FROM base AS runtime

LABEL org.opencontainers.image.title="taskboard-backend" \
      org.opencontainers.image.description="TaskBoard REST API (FastAPI)"

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

# Only the virtualenv crosses over: pip caches and build tooling stay behind.
COPY --from=builder /opt/venv /opt/venv

# Files stay owned by root, so the application user cannot modify its own code.
COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

# Numeric UID so Kubernetes can verify runAsNonRoot.
USER 10001:10001

EXPOSE 8000

# Liveness only. It must not depend on the database, or a database outage
# would get healthy API containers restarted for no benefit.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=2)"]

# Exec form: uvicorn is PID 1 and receives SIGTERM directly for graceful shutdown.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
