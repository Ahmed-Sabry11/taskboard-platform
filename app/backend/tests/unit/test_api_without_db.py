"""API behaviour that must not need a database: liveness, readiness failure
handling, and request validation."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db import get_db
from app.main import app


class UntouchableSession:
    def __getattr__(self, name):
        raise AssertionError(f"unit test touched the database session (.{name})")


class DownSession:
    def execute(self, *args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


class UpSession:
    def execute(self, *args, **kwargs):
        return None


def client_with(session) -> TestClient:
    app.dependency_overrides[get_db] = lambda: session
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


def test_healthz_does_not_use_the_database():
    response = client_with(UntouchableSession()).get("/api/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_reports_ready_when_database_answers():
    response = client_with(UpSession()).get("/api/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readyz_returns_503_without_leaking_details():
    response = client_with(DownSession()).get("/api/readyz")

    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "ok", "status": "archived"},
        {"title": "ok", "priority": "urgent"},
        {"title": "ok", "due_date": "tomorrow"},
        {"title": "ok", "id": 99},
    ],
)
def test_create_rejects_invalid_payload_before_reaching_the_database(payload):
    response = client_with(UntouchableSession()).post("/api/tasks", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "query", ["limit=0", "limit=101", "offset=-1", "status=archived", "limit=abc"]
)
def test_list_rejects_invalid_query(query):
    response = client_with(UntouchableSession()).get(f"/api/tasks?{query}")

    assert response.status_code == 422


@pytest.mark.parametrize("task_id", ["0", "-1", "abc", "2147483648"])
def test_task_id_must_be_a_valid_positive_integer(task_id):
    response = client_with(UntouchableSession()).get(f"/api/tasks/{task_id}")

    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{}, {"title": None}, {"status": "archived"}])
def test_update_rejects_invalid_payload(payload):
    response = client_with(UntouchableSession()).patch("/api/tasks/1", json=payload)

    assert response.status_code == 422


def test_docs_are_available_outside_production():
    # tests/conftest.py sets APP_ENV=test
    assert client_with(UntouchableSession()).get("/api/openapi.json").status_code == 200
