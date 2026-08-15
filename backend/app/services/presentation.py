import logging
import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ActiveSessionNotFoundError, SurveySessionRetrievalError
from app.repositories.presentation import list_presentation_points
from app.repositories.survey_sessions import get_active_session
from app.schemas.presentation import (
    ActivePresentation,
    PresentationPoint,
    PresentationQuestion,
)

logger = logging.getLogger(__name__)


async def get_active_presentation(session: AsyncSession) -> ActivePresentation:
    try:
        async with session.begin():
            result = await get_active_session(session)
            if result is None:
                raise ActiveSessionNotFoundError
            survey_session, questions = result
            point_rows = await list_presentation_points(
                session, [question.id for question in questions]
            )
    except SQLAlchemyError as error:
        logger.error("active_presentation_retrieval_failed")
        raise SurveySessionRetrievalError from error

    points_by_question: dict[uuid.UUID, list[PresentationPoint]] = {
        question.id: [] for question in questions
    }
    for row in point_rows:
        points_by_question[row.question_id].append(PresentationPoint(x=row.x, y=row.y))

    return ActivePresentation(
        id=survey_session.id,
        run_id=survey_session.current_run_id,
        title=survey_session.title,
        questions=[
            PresentationQuestion(
                id=question.id,
                position=question.position,
                prompt=question.prompt,
                x_axis_label=question.x_axis_label,
                y_axis_label=question.y_axis_label,
                prompt_de=question.prompt_de,
                x_axis_label_de=question.x_axis_label_de,
                y_axis_label_de=question.y_axis_label_de,
                prompt_it=question.prompt_it,
                x_axis_label_it=question.x_axis_label_it,
                y_axis_label_it=question.y_axis_label_it,
                points=points_by_question[question.id],
            )
            for question in questions
        ],
    )
