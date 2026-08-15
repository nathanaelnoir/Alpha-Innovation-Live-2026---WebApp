import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def migrated_test_database_url() -> str:
    """Validate and migrate the explicitly isolated PostgreSQL test database."""

    database_url = os.getenv("TEST_DATABASE_URL")
    if database_url is None:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")

    parsed_url = make_url(database_url)
    if parsed_url.drivername != "postgresql+psycopg":
        raise RuntimeError("Integration tests require postgresql+psycopg")
    if parsed_url.database is None or not parsed_url.database.endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must target a database ending in '_test'")

    migration_environment = os.environ.copy()
    migration_environment["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=migration_environment,
        check=True,
    )
    return database_url


@pytest_asyncio.fixture
async def db_session(
    migrated_test_database_url: str,
) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_test_database_url, pool_pre_ping=True)
    async with engine.connect() as connection:
        outer_transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await outer_transaction.rollback()
    await engine.dispose()
