import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app
from app.models.question import Question
from app.models.survey_session import SurveySession
from app.services.presentation import get_active_presentation

ORGANIZER_TOKEN = "organizer-results-token-with-32-characters"


def scalar_result(value: object | None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def questions_result(questions: list[Question]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = questions
    return result


def points_result(rows: list[tuple[uuid.UUID, float, float]]) -> MagicMock:
    result = MagicMock()
    result.tuples.return_value.all.return_value = rows
    return result


def presentation_records() -> tuple[SurveySession, Question]:
    now = datetime.now(UTC)
    survey_session = SurveySession(
        id=uuid.uuid4(),
        current_run_id=uuid.uuid4(),
        title="Session 01",
        is_open=True,
        created_at=now,
        updated_at=now,
        opened_at=now,
    )
    question = Question(
        id=uuid.uuid4(),
        session_id=survey_session.id,
        position=1,
        prompt="How ready are we?",
        x_axis_label="Not ready — ready",
        y_axis_label="Individual — collective",
        prompt_de="Wie bereit sind wir?",
        prompt_it="Quanto siamo pronti?",
        is_active=True,
    )
    return survey_session, question


@pytest.mark.asyncio
async def test_active_presentation_is_anonymized_and_ordered() -> None:
    survey_session, question = presentation_records()
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        scalar_result(survey_session),
        questions_result([question]),
        points_result([(question.id, 0.25, 0.75)]),
    ]

    result = await get_active_presentation(session)

    assert result.title == "Session 01"
    assert result.questions[0].prompt_de == "Wie bereit sind wir?"
    assert result.questions[0].points[0].model_dump() == {"x": 0.25, "y": 0.75}
    point_statement = session.execute.await_args_list[2].args[0]
    compiled = str(point_statement.compile(dialect=postgresql.dialect()))
    assert "participants" not in compiled
    assert "responses.participant_id" not in compiled


async def request_presentation(
    session: AsyncSession, token: str | None
) -> httpx.Response:
    app = create_app(
        Settings(results_export_token=ORGANIZER_TOKEN, _env_file=None)
    )

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/presentation/active", headers=headers)


@pytest.mark.asyncio
async def test_presentation_endpoint_requires_organizer_token() -> None:
    response = await request_presentation(AsyncMock(spec=AsyncSession), None)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized_organizer_access"


@pytest.mark.asyncio
async def test_presentation_endpoint_excludes_identifiers() -> None:
    survey_session, question = presentation_records()
    session = AsyncMock(spec=AsyncSession)
    session.execute.side_effect = [
        scalar_result(survey_session),
        questions_result([question]),
        points_result([(question.id, 0.25, 0.75)]),
    ]

    response = await request_presentation(session, ORGANIZER_TOKEN)

    assert response.status_code == 200
    point = response.json()["questions"][0]["points"][0]
    assert point == {"x": 0.25, "y": 0.75}
    assert "participant_id" not in point
    assert "response_id" not in point
