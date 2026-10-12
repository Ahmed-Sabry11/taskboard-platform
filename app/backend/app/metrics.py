from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

METRICS_PATH = "/metrics"

# Probes and scrapes arrive every few seconds. Counting them would bury the
# real traffic and make latency look better than users experience it.
EXCLUDED_HANDLERS = [METRICS_PATH, "/api/healthz", "/api/readyz"]


def setup_metrics(app: FastAPI) -> None:
    """Record request counts and durations, and expose them for Prometheus.

    The endpoint is /metrics, outside /api on purpose: the frontend proxy and
    the load balancer forward only /api, so metrics stay inside the cluster.
    """
    Instrumentator(
        # Label by route template (/api/tasks/{task_id}), not by URL, so the
        # number of time series does not grow with the number of tasks.
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        excluded_handlers=EXCLUDED_HANDLERS,
    ).instrument(app).expose(app, endpoint=METRICS_PATH, include_in_schema=False)
