import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_database_url_requires_psycopg_dialect() -> None:
    with pytest.raises(ValidationError, match=r"postgresql\+psycopg"):
        Settings(database_url="postgresql+asyncpg://localhost/survey", _env_file=None)


def test_production_requires_strong_secrets() -> None:
    with pytest.raises(ValidationError, match="Production requires secrets"):
        Settings(app_env="production", _env_file=None)


def test_production_accepts_configured_secrets() -> None:
    settings = Settings(
        app_env="production",
        participant_token_secret="p" * 32,
        results_export_token="r" * 32,
        _env_file=None,
    )

    assert settings.app_env == "production"
