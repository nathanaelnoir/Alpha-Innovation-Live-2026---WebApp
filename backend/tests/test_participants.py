import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import ParticipantPersistenceError
from app.core.security import verify_participant_token
from app.db.session import get_session
from app.main import create_app
from app.models.participant import Participant
from app.services.participants import create_participant

SECRET = "participant-test-secret-with-32-characters"


def make_session() -> AsyncMock:
    return AsyncMock(spec=AsyncSession)


@pytest.mark.asyncio
async def test_service_generates_and_persists_participant_uuid() -> None:
    session = make_session()

    result = await create_participant(session, SecretStr(SECRET))

    added_participant = session.add.call_args.args[0]
    assert isinstance(added_participant, Participant)
    assert added_participant.id == result.participant_id
    assert (
        verify_participant_token(result.participant_token, SECRET)
        == result.participant_id
    )
    session.begin.assert_called_once_with()
    session.begin.return_value.__aexit__.assert_awaited_once()
    session.flush.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_service_converts_database_failure_to_application_error() -> None:
    session = make_session()
    session.flush.side_effect = SQLAlchemyError("unsafe internal detail")

    with pytest.raises(ParticipantPersistenceError):
        await create_participant(session, SecretStr(SECRET))


@pytest.mark.asyncio
async def test_participant_creation_endpoint() -> None:
    session = make_session()
    app = create_app(
        Settings(participant_token_secret=SECRET, results_export_token="r" * 32)
    )

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/participants")

    assert response.status_code == 201
    response_body = response.json()
    participant_id = uuid.UUID(response_body["participant_id"])
    assert (
        verify_participant_token(response_body["participant_token"], SECRET)
        == participant_id
    )


@pytest.mark.asyncio
async def test_participant_endpoint_hides_database_failure_details() -> None:
    session = make_session()
    session.flush.side_effect = SQLAlchemyError("password=must-not-leak")
    app = create_app(Settings(participant_token_secret=SECRET))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/participants")

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "participant_persistence_failed",
            "message": "The participant could not be created. Please try again.",
        }
    }
    assert "must-not-leak" not in response.text
