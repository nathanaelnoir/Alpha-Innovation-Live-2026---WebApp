import uuid

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.models.response import Response
from app.schemas.question import QuestionCreate
from app.schemas.response import ResponseSubmission
from app.schemas.survey_session import SurveySessionCreate
from app.services.participants import create_participant
from app.services.questions import (
    create_question,
    get_active_question,
    list_questions,
)
from app.services.responses import submit_response
from app.services.results import export_results_csv
from app.services.survey_sessions import (
    close_session,
    create_session,
    get_active_session,
    open_session,
)

PARTICIPANT_SECRET = "integration-participant-secret-with-32-characters"
INITIAL_QUESTION_ID = uuid.UUID("a9bb82a0-1b7f-5254-a761-8104f701b098")
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_migrations_and_initial_seed_are_present(
    db_session: AsyncSession,
) -> None:
    async with db_session.begin():
        revision = await db_session.scalar(
            text("SELECT version_num FROM alembic_version")
        )
    active_question = await get_active_question(db_session)
    active_session = await get_active_session(db_session)

    assert revision == "20260806_0008"
    assert active_question.id == INITIAL_QUESTION_ID
    assert active_question.prompt == "How are you experiencing this session right now?"
    assert active_question.prompt_de == "Wie erleben Sie diese Sitzung gerade?"
    assert (
        active_question.prompt_it
        == "Come sta vivendo questa sessione in questo momento?"
    )
    assert active_question.x_axis_label_de == "Engagement (niedrig bis hoch)"
    assert active_question.y_axis_label_it == "Comprensione (bassa-alta)"
    assert active_session.questions
    async with db_session.begin():
        active_question_count = await db_session.scalar(
            select(func.count())
            .select_from(Question)
            .where(
                Question.session_id == active_session.id,
                Question.is_active.is_(True),
            )
        )
    assert active_question_count == len(active_session.questions)


@pytest.mark.asyncio
async def test_real_postgresql_participant_upsert_and_csv_flow(
    db_session: AsyncSession,
) -> None:
    first_participant = await create_participant(
        db_session, SecretStr(PARTICIPANT_SECRET)
    )
    second_participant = await create_participant(
        db_session, SecretStr(PARTICIPANT_SECRET)
    )
    active_question = await get_active_question(db_session)

    first_response = await submit_response(
        db_session,
        first_participant.participant_id,
        active_question.id,
        ResponseSubmission(x=0.2, y=0.8),
    )
    retried_response = await submit_response(
        db_session,
        first_participant.participant_id,
        active_question.id,
        ResponseSubmission(x=0.7, y=0.3),
    )
    await submit_response(
        db_session,
        second_participant.participant_id,
        active_question.id,
        ResponseSubmission(x=0.5, y=0.5),
    )

    response_count = await db_session.scalar(
        select(func.count())
        .select_from(Response)
        .where(Response.question_id == active_question.id)
    )
    csv_export = await export_results_csv(db_session)

    assert retried_response.response_id == first_response.response_id
    assert retried_response.x == 0.7
    assert retried_response.y == 0.3
    assert response_count == 2
    assert len(csv_export.splitlines()) == 3


@pytest.mark.asyncio
async def test_opening_session_activates_its_ordered_questions(
    db_session: AsyncSession,
) -> None:
    created_session = await create_session(
        db_session, SurveySessionCreate(title="Keynote follow-up")
    )
    created_question = await create_question(
        db_session,
        QuestionCreate(
            session_id=created_session.id,
            prompt="Where are you on the four-quadrant plane?",
            x_axis_label="Engagement (low to high)",
            y_axis_label="Understanding (low to high)",
            prompt_de="Wo befinden Sie sich im Vier-Quadranten-Feld?",
            x_axis_label_de="Engagement (niedrig bis hoch)",
            y_axis_label_de="Verständnis (niedrig bis hoch)",
            prompt_it="Dove si trova nel piano a quattro quadranti?",
            x_axis_label_it="Coinvolgimento (basso-alto)",
            y_axis_label_it="Comprensione (bassa-alta)",
        ),
    )

    opened_session = await open_session(db_session, created_session.id)
    public_question = await get_active_question(db_session)
    all_questions = await list_questions(db_session)
    active_count = await db_session.scalar(
        select(func.count()).select_from(Question).where(Question.is_active.is_(True))
    )

    assert opened_session.is_open is True
    assert public_question.id == created_question.id
    assert any(question.id == created_question.id for question in all_questions)
    assert active_count == 1


@pytest.mark.asyncio
async def test_reopening_session_restarts_progress_and_overwrites_answers(
    db_session: AsyncSession,
) -> None:
    participant = await create_participant(db_session, SecretStr(PARTICIPANT_SECRET))
    first_session = await get_active_session(db_session)
    question = first_session.questions[0]
    assert question is not None

    first_response = await submit_response(
        db_session,
        participant.participant_id,
        question.id,
        ResponseSubmission(x=0.2, y=0.8),
    )
    await close_session(db_session, first_session.id)
    reopened = await open_session(db_session, first_session.id)
    assert reopened.current_run_id != first_session.run_id
    overwritten_response = await submit_response(
        db_session,
        participant.participant_id,
        question.id,
        ResponseSubmission(x=0.7, y=0.3),
    )

    response_count = await db_session.scalar(
        select(func.count())
        .select_from(Response)
        .where(
            Response.participant_id == participant.participant_id,
            Response.question_id == question.id,
        )
    )
    assert overwritten_response.response_id == first_response.response_id
    assert overwritten_response.x == 0.7
    assert overwritten_response.y == 0.3
    assert response_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(("x", "y"), [(-0.000001, 0.5), (0.5, 1.000001)])
async def test_database_rejects_coordinates_outside_unit_square(
    db_session: AsyncSession, x: float, y: float
) -> None:
    participant = await create_participant(db_session, SecretStr(PARTICIPANT_SECRET))
    question = await get_active_question(db_session)

    with pytest.raises(IntegrityError):
        async with db_session.begin():
            db_session.add(
                Response(
                    id=uuid.uuid4(),
                    participant_id=participant.participant_id,
                    question_id=question.id,
                    x=x,
                    y=y,
                )
            )
            await db_session.flush()
