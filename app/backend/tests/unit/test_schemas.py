from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas import TaskCreate, TaskUpdate


def test_create_applies_defaults():
    task = TaskCreate(title="Write report")

    assert task.description == ""
    assert task.status == "todo"
    assert task.priority == "medium"
    assert task.due_date is None


def test_create_strips_whitespace():
    task = TaskCreate(title="  Write report  ", description="  chapter 3 ")

    assert task.title == "Write report"
    assert task.description == "chapter 3"


def test_create_parses_due_date():
    assert TaskCreate(title="x", due_date="2026-12-01").due_date == date(2026, 12, 1)


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_create_rejects_bad_title(title):
    with pytest.raises(ValidationError):
        TaskCreate(title=title)


def test_create_accepts_title_at_max_length():
    assert len(TaskCreate(title="x" * 200).title) == 200


def test_create_rejects_long_description():
    with pytest.raises(ValidationError):
        TaskCreate(title="x", description="d" * 2001)


@pytest.mark.parametrize(
    "field, value",
    [("status", "archived"), ("priority", "urgent"), ("due_date", "not-a-date")],
)
def test_create_rejects_invalid_values(field, value):
    with pytest.raises(ValidationError):
        TaskCreate(title="x", **{field: value})


def test_create_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        TaskCreate(title="x", owner="someone")


def test_create_requires_title():
    with pytest.raises(ValidationError):
        TaskCreate()


def test_update_keeps_only_provided_fields():
    update = TaskUpdate(status="done")

    assert update.model_dump(exclude_unset=True) == {"status": "done"}


def test_update_rejects_empty_body():
    with pytest.raises(ValidationError, match="at least one field"):
        TaskUpdate()


@pytest.mark.parametrize("field", ["title", "description", "status", "priority"])
def test_update_rejects_null_for_required_columns(field):
    with pytest.raises(ValidationError, match="cannot be null"):
        TaskUpdate(**{field: None})


def test_update_allows_clearing_due_date():
    update = TaskUpdate(due_date=None)

    assert update.model_dump(exclude_unset=True) == {"due_date": None}


def test_update_rejects_blank_title():
    with pytest.raises(ValidationError):
        TaskUpdate(title="   ")
