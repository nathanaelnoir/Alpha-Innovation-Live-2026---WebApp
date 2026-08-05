import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import ActiveQuestionNotFoundError, QuestionRetrievalError
from app.db.session import get_session
from app.main import create_app
from app.models.question import Question
from app.repositories.questions import get_active_question as retrieve_active_question
from app.services.questions import get_active_question


def make_session(question: Question | None = None) -> AsyncMock:
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.scalar_one_or_none.return_value = question
    session.execute.return_value = result
    return session


def make_question() -> Question:
    return Question(
        id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        position=1,
        prompt="How useful was this session?",
        x_axis_label="Not useful",
        y_axis_label="Very useful",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_repository_query_filters_for_active_question() -> None:
    question = make_question()
    session = make_session(question)

    result = await retrieve_active_question(session)

    statement = session.execute.await_args.args[0]
    compiled = str(
        statement.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert result is question
    assert "questions.is_active IS true" in compiled
    assert "survey_sessions.is_open IS true" in compiled


@pytest.mark.asyncio
async def test_service_returns_only_public_active_question_fields() -> None:
    question = make_question()
    session = make_session(question)

    result = await get_active_question(session)

    assert result.model_dump() == {
        "id": question.id,
        "position": 1,
        "prompt": question.prompt,
        "x_axis_label": question.x_axis_label,
        "y_axis_label": question.y_axis_label,
    }
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_service_reports_when_no_question_is_active() -> None:
    session = make_session()

    with pytest.raises(ActiveQuestionNotFoundError):
        await get_active_question(session)


@pytest.mark.asyncio
async def test_service_converts_query_failure_to_application_error() -> None:
    session = make_session()
    session.execute.side_effect = SQLAlchemyError("unsafe query detail")

    with pytest.raises(QuestionRetrievalError):
        await get_active_question(session)


async def request_active_question(
    session: AsyncSession,
) -> httpx.Response:
    app = create_app(Settings(_env_file=None))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/questions/active")


@pytest.mark.asyncio
async def test_active_question_endpoint() -> None:
    question = make_question()

    response = await request_active_question(make_session(question))

    assert response.status_code == 200
    assert response.json() == {
        "id": str(question.id),
        "position": 1,
        "prompt": "How useful was this session?",
        "x_axis_label": "Not useful",
        "y_axis_label": "Very useful",
    }
    assert "is_active" not in response.json()
    assert "created_at" not in response.json()


@pytest.mark.asyncio
async def test_active_question_endpoint_returns_safe_not_found() -> None:
    response = await request_active_question(make_session())

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "active_question_not_found",
            "message": "There is no active question right now.",
        }
    }


@pytest.mark.asyncio
async def test_active_question_endpoint_hides_query_failure_details() -> None:
    session = make_session()
    session.execute.side_effect = SQLAlchemyError("password=must-not-leak")

    response = await request_active_question(session)

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "active_question_unavailable",
            "message": "The active question could not be loaded. Please try again.",
        }
    }
    assert "must-not-leak" not in response.text
