import pytest
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app


class EmptySession:
    """Stands in for the database: every lookup finds nothing."""

    def get(self, *args, **kwargs):
        return None

    def execute(self, *args, **kwargs):
        return None


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = lambda: EmptySession()
    yield TestClient(app)
    app.dependency_overrides.clear()


def metric_lines(client: TestClient, name: str) -> list[str]:
    body = client.get("/metrics").text
    return [line for line in body.splitlines() if line.startswith(name)]


def test_metrics_endpoint_serves_prometheus_text(client):
    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "# TYPE http_requests_total counter" in response.text


def test_metrics_are_not_served_under_the_public_api_prefix(client):
    # The frontend proxy and the load balancer forward only /api.
    assert client.get("/api/metrics").status_code == 404


def test_requests_are_counted_by_route_template_and_status(client):
    client.get("/api/tasks/41")
    client.get("/api/tasks/42")

    lines = metric_lines(client, "http_requests_total{")

    matching = [
        line
        for line in lines
        if 'handler="/api/tasks/{task_id}"' in line
        and 'method="GET"' in line
        and 'status="404"' in line
    ]
    assert len(matching) == 1, lines
    assert float(matching[0].rsplit(" ", 1)[1]) >= 2
    # One series per route, never one per task id.
    assert not any("/api/tasks/41" in line for line in lines)


def test_request_durations_are_recorded(client):
    client.get("/api/tasks/41")

    lines = metric_lines(client, "http_request_duration_seconds_bucket{")

    assert any('handler="/api/tasks/{task_id}"' in line for line in lines)


@pytest.mark.parametrize("path", ["/api/healthz", "/api/readyz", "/metrics"])
def test_probes_and_scrapes_are_not_counted(client, path):
    client.get(path)
    client.get(path)

    lines = metric_lines(client, "http_requests_total{")

    assert not any(f'handler="{path}"' in line for line in lines), lines


def test_unknown_urls_do_not_create_series(client):
    client.get("/api/does-not-exist-123")

    assert "does-not-exist-123" not in client.get("/metrics").text
