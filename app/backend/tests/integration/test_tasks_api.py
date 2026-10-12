from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Task


def create(client, **fields) -> dict:
    response = client.post("/api/tasks", json={"title": "Task", **fields})
    assert response.status_code == 201, response.text
    return response.json()


def test_readyz_with_real_database(client):
    response = client.get("/api/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_create_returns_task_with_defaults(client):
    response = client.post("/api/tasks", json={"title": "  Write report  "})

    assert response.status_code == 201
    body = response.json()
    assert body["id"] >= 1
    assert body["title"] == "Write report"
    assert body["description"] == ""
    assert body["status"] == "todo"
    assert body["priority"] == "medium"
    assert body["due_date"] is None
    assert datetime.fromisoformat(body["created_at"]).tzinfo is not None
    assert body["updated_at"] == body["created_at"]


def test_create_stores_all_fields(client):
    payload = {
        "title": "Prepare slides",
        "description": "For the committee",
        "status": "in_progress",
        "priority": "high",
        "due_date": "2026-12-01",
    }

    body = client.post("/api/tasks", json=payload).json()

    assert {key: body[key] for key in payload} == payload


def test_get_returns_created_task(client):
    created = create(client, title="Find me")

    response = client.get(f"/api/tasks/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_task_returns_404(client):
    response = client.get("/api/tasks/999999")

    assert response.status_code == 404
    assert response.json() == {"detail": "task not found"}


def test_list_is_empty_initially(client):
    assert client.get("/api/tasks").json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_list_returns_newest_first(client):
    first = create(client, title="first")
    second = create(client, title="second")

    body = client.get("/api/tasks").json()

    assert [item["id"] for item in body["items"]] == [second["id"], first["id"]]
    assert body["total"] == 2


def test_list_paginates(client):
    ids = [create(client, title=f"task {n}")["id"] for n in range(5)]
    newest_first = list(reversed(ids))

    page = client.get("/api/tasks", params={"limit": 2, "offset": 2}).json()

    assert [item["id"] for item in page["items"]] == newest_first[2:4]
    assert page["total"] == 5
    assert page["limit"] == 2
    assert page["offset"] == 2


def test_list_filters_by_status(client):
    create(client, title="a", status="todo")
    done = create(client, title="b", status="done")

    body = client.get("/api/tasks", params={"status": "done"}).json()

    assert [item["id"] for item in body["items"]] == [done["id"]]
    assert body["total"] == 1


def test_patch_changes_only_given_fields(client):
    created = create(client, title="Original", description="keep me", priority="low")

    response = client.patch(f"/api/tasks/{created['id']}", json={"status": "done"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "done"
    assert body["title"] == "Original"
    assert body["description"] == "keep me"
    assert body["priority"] == "low"
    assert datetime.fromisoformat(body["updated_at"]) > datetime.fromisoformat(body["created_at"])


def test_patch_is_persisted(client):
    created = create(client, title="Old title")

    client.patch(f"/api/tasks/{created['id']}", json={"title": "New title"})

    assert client.get(f"/api/tasks/{created['id']}").json()["title"] == "New title"


def test_patch_can_clear_due_date(client):
    created = create(client, due_date="2026-12-01")

    body = client.patch(f"/api/tasks/{created['id']}", json={"due_date": None}).json()

    assert body["due_date"] is None


def test_patch_unknown_task_returns_404(client):
    assert client.patch("/api/tasks/999999", json={"status": "done"}).status_code == 404


def test_patch_invalid_payload_leaves_task_unchanged(client):
    created = create(client, title="Stable")

    response = client.patch(f"/api/tasks/{created['id']}", json={"title": "   "})

    assert response.status_code == 422
    assert client.get(f"/api/tasks/{created['id']}").json() == created


def test_delete_removes_task(client):
    created = create(client)

    response = client.delete(f"/api/tasks/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/tasks/{created['id']}").status_code == 404
    assert client.get("/api/tasks").json()["total"] == 0


def test_delete_unknown_task_returns_404(client):
    assert client.delete("/api/tasks/999999").status_code == 404


def test_invalid_create_stores_nothing(client):
    response = client.post("/api/tasks", json={"title": ""})

    assert response.status_code == 422
    assert client.get("/api/tasks").json()["total"] == 0


@pytest.mark.parametrize("column, value", [("status", "archived"), ("priority", "urgent")])
def test_database_rejects_invalid_values_even_without_the_api(session_factory, column, value):
    with session_factory() as session:
        session.add(Task(title="bypass", **{column: value}))
        with pytest.raises(IntegrityError):
            session.commit()
