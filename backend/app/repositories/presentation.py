import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.models.response import Response
from app.models.survey_session import SurveySession


@dataclass(frozen=True, slots=True)
class PresentationPointRow:
    question_id: uuid.UUID
    x: float
    y: float


async def list_presentation_sessions(
    session: AsyncSession,
) -> list[tuple[SurveySession, list[Question]]]:
    sessions_result = await session.execute(
        select(SurveySession).order_by(
            SurveySession.created_at.asc(), SurveySession.id.asc()
        )
    )
    survey_sessions = list(sessions_result.scalars().all())
    if not survey_sessions:
        return []

    session_ids = [survey_session.id for survey_session in survey_sessions]
    questions_result = await session.execute(
        select(Question)
        .where(Question.session_id.in_(session_ids))
        .order_by(Question.session_id, Question.position.asc())
    )
    questions_by_session: dict[uuid.UUID, list[Question]] = {
        session_id: [] for session_id in session_ids
    }
    for question in questions_result.scalars().all():
        questions_by_session[question.session_id].append(question)

    return [
        (survey_session, questions_by_session[survey_session.id])
        for survey_session in survey_sessions
    ]


async def list_presentation_points(
    session: AsyncSession, question_ids: list[uuid.UUID]
) -> list[PresentationPointRow]:
    if not question_ids:
        return []
    statement = (
        select(Response.question_id, Response.x, Response.y)
        .where(Response.question_id.in_(question_ids))
        .order_by(Response.question_id, Response.submitted_at, Response.id)
    )
    result = await session.execute(statement)
    return [PresentationPointRow(*row) for row in result.tuples().all()]
