import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import EmptySurveySessionError
from app.db.session import get_session
from app.main import create_app
from app.models.question import Question
from app.models.survey_session import SurveySession
from app.services.survey_sessions import get_active_session, open_session

ORGANIZER_TOKEN = "organizer-results-token-with-32-characters"


def result_with_scalar(value: object | None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    return result


def result_with_questions(questions: list[Question]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = questions
    return result


def make_survey_session(*, is_open: bool = True) -> SurveySession:
    now = datetime.now(UTC)
    return SurveySession(
        id=uuid.uuid4(),
        current_run_id=uuid.uuid4(),
        title="Opening session",
        is_open=is_open,
        created_at=now,
        updated_at=now,
        opened_at=now if is_open else None,
    )


def make_question(session_id: uuid.UUID, position: int) -> Question:
    return Question(
        id=uuid.uuid4(),
        session_id=session_id,
        position=position,
        prompt=f"Question {position}",
        prompt_de=f"Frage {position}",
        prompt_it=f"Domanda {position}",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_active_session_returns_questions_in_repository_order() -> None:
    survey_session = make_survey_session()
    questions = [
        make_question(survey_session.id, 1),
        make_question(survey_session.id, 2),
    ]
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        result_with_scalar(survey_session),
        result_with_questions(questions),
    ]

    result = await get_active_session(session)

    assert result.id == survey_session.id
    assert [question.id for question in result.questions] == [
        question.id for question in questions
    ]
    assert [question.prompt_de for question in result.questions] == [
        "Frage 1",
        "Frage 2",
    ]
    assert [question.prompt_it for question in result.questions] == [
        "Domanda 1",
        "Domanda 2",
    ]
    questions_statement = session.execute.await_args_list[1].args[0]
    assert "ORDER BY questions.position ASC" in str(
        questions_statement.compile(dialect=postgresql.dialect())
    )


@pytest.mark.asyncio
async def test_open_session_serializes_and_activates_all_its_questions() -> None:
    survey_session = make_survey_session(is_open=False)
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        MagicMock(),
        result_with_scalar(survey_session),
        result_with_scalar(2),
        MagicMock(),
        MagicMock(),
        MagicMock(),
    ]

    result = await open_session(session, survey_session.id)

    advisory_statement = session.execute.await_args_list[0].args[0]
    activate_statement = session.execute.await_args_list[5].args[0]
    dialect = postgresql.dialect()
    assert "pg_advisory_xact_lock" in str(advisory_statement.compile(dialect=dialect))
    assert "UPDATE questions SET is_active=" in str(
        activate_statement.compile(dialect=dialect)
    )
    assert result.is_open is True
    assert result.question_count == 2
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_empty_session_cannot_be_opened() -> None:
    survey_session = make_survey_session(is_open=False)
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        MagicMock(),
        result_with_scalar(survey_session),
        result_with_scalar(0),
    ]

    with pytest.raises(EmptySurveySessionError):
        await open_session(session, survey_session.id)

    session.flush.assert_not_awaited()


async def request_active_session(session: AsyncSession) -> httpx.Response:
    app = create_app(Settings(_env_file=None))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/sessions/active")


@pytest.mark.asyncio
async def test_active_session_endpoint_returns_safe_not_found() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = result_with_scalar(None)

    response = await request_active_session(session)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "active_session_not_found"
