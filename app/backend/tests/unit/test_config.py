import pytest
from pydantic import ValidationError

from app.config import Settings, normalize_database_url

URL = "postgresql+psycopg://user:pw@db:5432/app"


def make_settings(**overrides) -> Settings:
    # _env_file=None keeps a developer's local .env from leaking into the test.
    return Settings(_env_file=None, **overrides)


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgres://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
    ],
)
def test_normalize_database_url(raw, expected):
    assert normalize_database_url(raw) == expected


def test_settings_normalize_database_url():
    assert make_settings(database_url="postgresql://u:p@h/db").database_url.startswith(
        "postgresql+psycopg://"
    )


def test_defaults_are_production_safe(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    settings = make_settings(database_url=URL)

    assert settings.app_env == "production"
    assert settings.is_production
    assert settings.cors_origin_list == []
    assert settings.db_pool_size == 5


def test_values_come_from_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DB_POOL_SIZE", "3")

    settings = make_settings()

    assert settings.database_url == URL
    assert settings.app_env == "development"
    assert settings.db_pool_size == 3


def test_database_url_is_required(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        make_settings()


def test_cors_origins_are_split_and_trimmed():
    settings = make_settings(
        database_url=URL, cors_origins=" http://localhost:5173 , https://example.com ,"
    )

    assert settings.cors_origin_list == ["http://localhost:5173", "https://example.com"]


@pytest.mark.parametrize(
    "overrides",
    [{"app_env": "staging"}, {"log_level": "TRACE"}, {"db_pool_size": 0}, {"db_pool_size": 21}],
)
def test_invalid_values_are_rejected(overrides):
    with pytest.raises(ValidationError):
        make_settings(database_url=URL, **overrides)
