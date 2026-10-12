import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.config import normalize_database_url
from app.db import get_db
from app.main import app
from app.models import Task

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Repository-root .env when run from a checkout. Inside the test container the
# file does not exist and TEST_DATABASE_URL comes from the environment.
ROOT_ENV_FILE = BACKEND_DIR.parent.parent / ".env"


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or dotenv_values(ROOT_ENV_FILE).get(
        "TEST_DATABASE_URL"
    )
    if not url:
        pytest.fail(
            "TEST_DATABASE_URL is not set. Copy .env.example to .env in the repository "
            "root and start the database with: docker compose up -d db",
            pytrace=False,
        )
    url = normalize_database_url(url)
    # These tests drop tables and delete rows. Refuse anything that does not
    # look like a throwaway database.
    database = make_url(url).database or ""
    if not database.endswith("_test"):
        pytest.fail(
            f"Refusing to run integration tests against '{database}': "
            "the database name must end with '_test'.",
            pytrace=False,
        )
    return url


@pytest.fixture(scope="session")
def alembic_config(test_database_url) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = test_database_url
    return config


@pytest.fixture(scope="session")
def engine(test_database_url, alembic_config):
    # The schema is built by the real migrations, not by metadata.create_all,
    # so the tests also prove the migrations produce a working schema.
    command.downgrade(alembic_config, "base")
    command.upgrade(alembic_config, "head")
    engine = create_engine(test_database_url, poolclass=NullPool)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine):
    with engine.begin() as connection:
        connection.execute(delete(Task))
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def client(session_factory):
    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
