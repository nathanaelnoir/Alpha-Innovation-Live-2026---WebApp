from functools import lru_cache
from typing import Literal, Self

from pydantic import AnyHttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/conference_survey"
    )
    frontend_origin: AnyHttpUrl = AnyHttpUrl("http://localhost:5173")
    presentation_origin: AnyHttpUrl | None = None
    participant_token_secret: SecretStr | None = None
    results_export_token: SecretStr | None = None
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    @field_validator("database_url")
    @classmethod
    def require_psycopg_database_url(cls, value: str) -> str:
        # Render supplies its internal connection URL as ``postgresql://``.
        # Make the selected SQLAlchemy/Psycopg dialect explicit without asking
        # operators to split a generated secret connection string into parts.
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if not value.startswith("postgresql+psycopg://"):
            message = "DATABASE_URL must use the postgresql+psycopg dialect"
            raise ValueError(message)
        return value

    @model_validator(mode="after")
    def require_production_secrets(self) -> Self:
        if self.app_env != "production":
            return self

        missing = [
            name
            for name, value in (
                ("PARTICIPANT_TOKEN_SECRET", self.participant_token_secret),
                ("RESULTS_EXPORT_TOKEN", self.results_export_token),
            )
            if value is None or len(value.get_secret_value()) < 32
        ]
        if missing:
            joined = ", ".join(missing)
            raise ValueError(f"Production requires secrets of 32+ characters: {joined}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
