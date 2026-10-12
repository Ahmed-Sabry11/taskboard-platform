from alembic import command
from sqlalchemy import inspect, text


def test_head_schema_matches_expectations(engine):
    inspector = inspect(engine)

    columns = {column["name"]: column for column in inspector.get_columns("tasks")}
    assert set(columns) == {
        "id",
        "title",
        "description",
        "status",
        "priority",
        "due_date",
        "created_at",
        "updated_at",
    }
    assert columns["due_date"]["nullable"] is True
    assert all(not columns[name]["nullable"] for name in columns if name != "due_date")
    assert {c["name"] for c in inspector.get_check_constraints("tasks")} == {
        "ck_tasks_status",
        "ck_tasks_priority",
    }
    assert "ix_tasks_status" in {index["name"] for index in inspector.get_indexes("tasks")}

    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0001"


def test_downgrade_and_upgrade_round_trip(engine, alembic_config):
    command.downgrade(alembic_config, "base")
    assert "tasks" not in inspect(engine).get_table_names()

    command.upgrade(alembic_config, "head")
    assert "tasks" in inspect(engine).get_table_names()
