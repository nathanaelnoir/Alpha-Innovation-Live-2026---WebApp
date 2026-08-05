import logging
import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ParticipantNotFoundError,
    QuestionNotActiveError,
    QuestionNotFoundError,
    ResponsePersistenceError,
)
from app.repositories.participants import get_participant
from app.repositories.questions import (
    get_question_for_submission,
    get_question_session_run_id,
)
from app.repositories.responses import upsert_response
from app.schemas.response import ResponseAccepted, ResponseSubmission

logger = logging.getLogger(__name__)


async def submit_response(
    session: AsyncSession,
    participant_id: uuid.UUID,
    question_id: uuid.UUID,
    submission: ResponseSubmission,
) -> ResponseAccepted:
    try:
        async with session.begin():
            participant = await get_participant(session, participant_id)
            if participant is None:
                raise ParticipantNotFoundError

            question = await get_question_for_submission(session, question_id)
            if question is None:
                raise QuestionNotFoundError
            session_run_id = (
                await get_question_session_run_id(session, question.session_id)
                if question.is_active
                else None
            )
            if session_run_id is None:
                raise QuestionNotActiveError

            response = await upsert_response(
                session,
                participant_id,
                question_id,
                submission.x,
                submission.y,
            )
    except SQLAlchemyError as error:
        logger.error("response_persistence_failed")
        raise ResponsePersistenceError from error

    return ResponseAccepted(
        response_id=response.id,
        question_id=response.question_id,
        x=response.x,
        y=response.y,
    )
