import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app
from app.models.question import Question
from app.models.survey_session import SurveySession
from app.repositories.questions import list_questions as retrieve_questions
from app.schemas.question import QuestionCreate
from app.services.questions import create_question, list_questions

ORGANIZER_TOKEN = "organizer-results-token-with-32-characters"
SESSION_ID = uuid.uuid4()


def make_session() -> AsyncMock:
    return AsyncMock(spec=AsyncSession)


def make_question(*, active: bool = False) -> Question:
    return Question(
        id=uuid.uuid4(),
        session_id=SESSION_ID,
        position=1,
        prompt="How valuable was this session?",
        x_axis_label="Not valuable",
        y_axis_label="Very valuable",
        is_active=active,
    )


def scalar_result(value: object | None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    return result


def scalars_result(questions: list[Question]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = questions
    return result


def test_question_input_is_trimmed_and_blank_labels_become_null() -> None:
    question = QuestionCreate(
        session_id=SESSION_ID,
        prompt="  How valuable was this session?  ",
        x_axis_label="   ",
        y_axis_label="  Very valuable  ",
    )

    assert question.prompt == "How valuable was this session?"
    assert question.x_axis_label is None
    assert question.y_axis_label == "Very valuable"


@pytest.mark.asyncio
async def test_create_question_service_stores_question_inactive() -> None:
    session = make_session()
    survey_session = SurveySession(id=SESSION_ID, title="Opening", is_open=False)
    session.execute.side_effect = [scalar_result(survey_session), scalar_result(1)]
    question_data = QuestionCreate(session_id=SESSION_ID, prompt="A new question")

    result = await create_question(session, question_data)

    stored_question = session.add.call_args.args[0]
    assert isinstance(stored_question, Question)
    assert stored_question.prompt == "A new question"
    assert stored_question.session_id == SESSION_ID
    assert stored_question.position == 1
    assert stored_question.is_active is False
    assert result.id == stored_question.id
    assert result.is_active is False
    session.begin.return_value.__aexit__.assert_awaited_once()
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_questions_repository_uses_deterministic_creation_order() -> None:
    questions = [make_question(), make_question(active=True)]
    session = make_session()
    session.execute.return_value = scalars_result(questions)

    result = await retrieve_questions(session)

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert result == questions
    assert "ORDER BY questions.session_id ASC, questions.position ASC" in compiled


@pytest.mark.asyncio
async def test_list_questions_service_returns_admin_views() -> None:
    questions = [make_question(), make_question(active=True)]
    session = make_session()
    session.execute.return_value = scalars_result(questions)

    result = await list_questions(session)

    assert [item.id for item in result] == [question.id for question in questions]
    assert [item.is_active for item in result] == [False, True]
    session.begin.return_value.__aexit__.assert_awaited_once()


async def request_question_admin(
    session: AsyncSession,
    method: str,
    path: str,
    *,
    token: str | None = ORGANIZER_TOKEN,
    payload: dict[str, object] | None = None,
    configured_token: str | None = ORGANIZER_TOKEN,
) -> httpx.Response:
    app = create_app(Settings(results_export_token=configured_token, _env_file=None))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, json=payload, headers=headers)


@pytest.mark.asyncio
async def test_organizer_can_create_question() -> None:
    session = make_session()
    survey_session = SurveySession(id=SESSION_ID, title="Opening", is_open=False)
    session.execute.side_effect = [scalar_result(survey_session), scalar_result(1)]

    response = await request_question_admin(
        session,
        "POST",
        "/api/v1/questions",
        payload={
            "session_id": str(SESSION_ID),
            "prompt": "How confident do you feel?",
            "x_axis_label": "Not confident",
            "y_axis_label": "Very confident",
        },
    )

    assert response.status_code == 201
    assert response.json()["prompt"] == "How confident do you feel?"
    assert response.json()["is_active"] is False


@pytest.mark.asyncio
async def test_organizer_can_list_all_questions() -> None:
    questions = [make_question(), make_question(active=True)]
    session = make_session()
    session.execute.return_value = scalars_result(questions)

    response = await request_question_admin(
        session,
        "GET",
        "/api/v1/questions",
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [
        str(question.id) for question in questions
    ]
    assert [item["is_active"] for item in response.json()] == [False, True]


@pytest.mark.asyncio
async def test_question_management_rejects_missing_organizer_token() -> None:
    session = make_session()

    response = await request_question_admin(
        session,
        "POST",
        "/api/v1/questions",
        token=None,
        payload={"session_id": str(SESSION_ID), "prompt": "Unauthorized question"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized_organizer_access"
    assert response.headers["www-authenticate"] == "Bearer"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_question_list_rejects_missing_organizer_token() -> None:
    session = make_session()

    response = await request_question_admin(
        session,
        "GET",
        "/api/v1/questions",
        token=None,
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized_organizer_access"
    assert response.headers["www-authenticate"] == "Bearer"
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_question_management_rejects_blank_prompt() -> None:
    session = make_session()

    response = await request_question_admin(
        session,
        "POST",
        "/api/v1/questions",
        payload={"session_id": str(SESSION_ID), "prompt": "   "},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_question_management_hides_database_failure_details() -> None:
    session = make_session()
    survey_session = SurveySession(id=SESSION_ID, title="Opening", is_open=False)
    session.execute.side_effect = [scalar_result(survey_session), scalar_result(1)]
    session.flush.side_effect = SQLAlchemyError("password=must-not-leak")

    response = await request_question_admin(
        session,
        "POST",
        "/api/v1/questions",
        payload={
            "session_id": str(SESSION_ID),
            "prompt": "Question that cannot be saved",
        },
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "question_persistence_failed"
    assert "must-not-leak" not in response.text


@pytest.mark.asyncio
async def test_question_list_hides_database_failure_details() -> None:
    session = make_session()
    session.execute.side_effect = SQLAlchemyError("password=must-not-leak")

    response = await request_question_admin(
        session,
        "GET",
        "/api/v1/questions",
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "questions_unavailable"
    assert "must-not-leak" not in response.text
