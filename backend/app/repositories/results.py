import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.models.response import Response
from app.models.survey_session import SurveySession


@dataclass(frozen=True, slots=True)
class ResultRow:
    response_id: uuid.UUID
    participant_id: uuid.UUID
    session_title: str
    question: str
    x_axis_label: str | None
    y_axis_label: str | None
    x: float
    y: float
    submitted_at: datetime
    updated_at: datetime


async def list_results(session: AsyncSession) -> list[ResultRow]:
    statement = (
        select(
            Response.id,
            Response.participant_id,
            SurveySession.title,
            Question.prompt,
            Question.x_axis_label,
            Question.y_axis_label,
            Response.x,
            Response.y,
            Response.submitted_at,
            Response.updated_at,
        )
        .join(Question, Question.id == Response.question_id)
        .join(SurveySession, SurveySession.id == Question.session_id)
        .order_by(Response.submitted_at, Response.id)
    )
    result = await session.execute(statement)
    return [ResultRow(*row) for row in result.tuples().all()]
