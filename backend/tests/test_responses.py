import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    ParticipantNotFoundError,
    QuestionNotActiveError,
    QuestionNotFoundError,
)
from app.core.security import sign_participant_token
from app.db.session import get_session
from app.main import create_app
from app.models.participant import Participant
from app.models.question import Question
from app.models.response import Response as StoredResponse
from app.repositories.questions import get_question_for_submission
from app.repositories.responses import upsert_response
from app.schemas.response import ResponseSubmission
from app.services.responses import submit_response

SECRET = "participant-test-secret-with-32-characters"
RUN_ID = uuid.uuid4()


def scalar_result(*, optional: object = None, required: object = None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = optional
    result.scalar_one.return_value = required
    return result


def make_entities(
    *, active: bool = True, x: float = 0.25, y: float = 0.75
) -> tuple[Participant, Question, StoredResponse]:
    participant = Participant(id=uuid.uuid4())
    question = Question(
        id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        position=1,
        prompt="Place your response",
        is_active=active,
    )
    response = StoredResponse(
        id=uuid.uuid4(),
        participant_id=participant.id,
        question_id=question.id,
        x=x,
        y=y,
    )
    return participant, question, response


def make_submission_session(
    participant: Participant | None,
    question: Question | None,
    response: StoredResponse | None,
) -> AsyncMock:
    session = AsyncMock(spec=AsyncSession)
    results: list[object] = [
        scalar_result(optional=participant),
        scalar_result(optional=question),
    ]
    if question is not None and question.is_active:
        results.append(scalar_result(optional=RUN_ID))
    if response is not None:
        results.append(scalar_result(required=response))
    session.execute.side_effect = results
    return session


@pytest.mark.asyncio
async def test_response_service_commits_before_returning_success() -> None:
    participant, question, response = make_entities()
    session = make_submission_session(participant, question, response)

    result = await submit_response(
        session,
        participant.id,
        question.id,
        ResponseSubmission(x=0.25, y=0.75),
    )

    assert result.response_id == response.id
    assert result.question_id == question.id
    assert result.x == 0.25
    assert result.y == 0.75
    session.begin.assert_called_once_with()
    session.begin.return_value.__aexit__.assert_awaited_once()
    assert session.execute.await_count == 4


@pytest.mark.asyncio
async def test_response_upsert_targets_participant_question_uniqueness() -> None:
    participant, question, response = make_entities()
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = scalar_result(required=response)

    stored = await upsert_response(
        session,
        participant.id,
        question.id,
        x=0.4,
        y=0.6,
    )

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert stored is response
    assert "ON CONFLICT (participant_id, question_id) DO UPDATE" in compiled
    assert "x = excluded.x" in compiled
    assert "y = excluded.y" in compiled
    assert "updated_at = now()" in compiled


@pytest.mark.asyncio
async def test_submission_query_holds_question_active_until_commit() -> None:
    _, question, _ = make_entities()
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = scalar_result(optional=question)

    result = await get_question_for_submission(session, question.id)

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert result is question
    assert "questions.id =" in compiled
    assert "FOR SHARE" in compiled


@pytest.mark.asyncio
async def test_response_service_rejects_unknown_participant() -> None:
    _, question, _ = make_entities()
    session = make_submission_session(None, question, None)

    with pytest.raises(ParticipantNotFoundError):
        await submit_response(
            session,
            uuid.uuid4(),
            question.id,
            ResponseSubmission(x=0.5, y=0.5),
        )

    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_response_service_rejects_unknown_question() -> None:
    participant, _, _ = make_entities()
    session = make_submission_session(participant, None, None)

    with pytest.raises(QuestionNotFoundError):
        await submit_response(
            session,
            participant.id,
            uuid.uuid4(),
            ResponseSubmission(x=0.5, y=0.5),
        )

    assert session.execute.await_count == 2


@pytest.mark.asyncio
async def test_response_service_rejects_inactive_question() -> None:
    participant, question, _ = make_entities(active=False)
    session = make_submission_session(participant, question, None)

    with pytest.raises(QuestionNotActiveError):
        await submit_response(
            session,
            participant.id,
            question.id,
            ResponseSubmission(x=0.5, y=0.5),
        )

    assert session.execute.await_count == 2


async def request_submission(
    session: AsyncSession,
    question_id: uuid.UUID,
    payload: dict[str, object],
    token: str | None,
) -> httpx.Response:
    app = create_app(Settings(participant_token_secret=SECRET, _env_file=None))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.put(
            f"/api/v1/questions/{question_id}/response",
            json=payload,
            headers=headers,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("x", "y"),
    [(0.0, 0.0), (0.0, 1.0), (1.0, 0.0), (1.0, 1.0)],
)
async def test_response_endpoint_accepts_all_coordinate_boundaries(
    x: float, y: float
) -> None:
    participant, question, response = make_entities(x=x, y=y)
    session = make_submission_session(participant, question, response)
    token = sign_participant_token(participant.id, SECRET)

    api_response = await request_submission(
        session, question.id, {"x": x, "y": y}, token
    )

    assert api_response.status_code == 200
    assert api_response.json() == {
        "response_id": str(response.id),
        "question_id": str(question.id),
        "x": x,
        "y": y,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("x", "y"),
    [(-0.000001, 0.5), (1.000001, 0.5), (0.5, -0.000001), (0.5, 1.000001)],
)
async def test_response_endpoint_rejects_coordinates_outside_unit_square(
    x: float, y: float
) -> None:
    participant, question, response = make_entities()
    session = make_submission_session(participant, question, response)
    token = sign_participant_token(participant.id, SECRET)

    api_response = await request_submission(
        session, question.id, {"x": x, "y": y}, token
    )

    assert api_response.status_code == 422
    assert api_response.json() == {
        "error": {
            "code": "validation_error",
            "message": "The request contains invalid values.",
        }
    }
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_response_endpoint_requires_valid_bearer_token() -> None:
    participant, question, response = make_entities()
    session = make_submission_session(participant, question, response)

    missing_response = await request_submission(
        session, question.id, {"x": 0.5, "y": 0.5}, None
    )
    invalid_response = await request_submission(
        session, question.id, {"x": 0.5, "y": 0.5}, "altered-token"
    )

    assert missing_response.status_code == 401
    assert invalid_response.status_code == 401
    assert missing_response.headers["www-authenticate"] == "Bearer"
    assert missing_response.json()["error"]["code"] == "invalid_participant_token"
    assert session.execute.await_count == 0


@pytest.mark.asyncio
async def test_response_endpoint_hides_database_failure_details() -> None:
    participant, question, _ = make_entities()
    session = make_submission_session(participant, question, None)
    session.execute.side_effect = [
        scalar_result(optional=participant),
        scalar_result(optional=question),
        scalar_result(optional=True),
        SQLAlchemyError("password=must-not-leak"),
    ]
    token = sign_participant_token(participant.id, SECRET)

    api_response = await request_submission(
        session, question.id, {"x": 0.5, "y": 0.5}, token
    )

    assert api_response.status_code == 503
    assert api_response.json() == {
        "error": {
            "code": "response_persistence_failed",
            "message": "The response could not be saved. Please try again.",
        }
    }
    assert "must-not-leak" not in api_response.text
