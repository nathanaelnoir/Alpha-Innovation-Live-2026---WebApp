import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ActiveSessionNotFoundError,
    EmptySurveySessionError,
    SurveySessionNotFoundError,
    SurveySessionPersistenceError,
    SurveySessionRetrievalError,
)
from app.models.survey_session import SurveySession
from app.repositories.survey_sessions import (
    acquire_active_session_lock,
    close_other_sessions,
    count_session_questions,
    get_session_for_update,
    set_session_questions_active,
)
from app.repositories.survey_sessions import create_session as persist_session
from app.repositories.survey_sessions import (
    get_active_session as retrieve_active_session,
)
from app.repositories.survey_sessions import (
    list_sessions as retrieve_sessions,
)
from app.schemas.question import ActiveQuestion
from app.schemas.survey_session import (
    ActiveSurveySession,
    SurveySessionAdminView,
    SurveySessionCreate,
)

logger = logging.getLogger(__name__)


async def get_active_session(session: AsyncSession) -> ActiveSurveySession:
    try:
        async with session.begin():
            result = await retrieve_active_session(session)
    except SQLAlchemyError as error:
        logger.error("active_session_retrieval_failed")
        raise SurveySessionRetrievalError from error
    if result is None:
        raise ActiveSessionNotFoundError
    survey_session, questions = result
    return ActiveSurveySession(
        id=survey_session.id,
        run_id=survey_session.current_run_id,
        title=survey_session.title,
        questions=[
            ActiveQuestion(
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
            )
            for question in questions
        ],
    )


async def list_sessions(session: AsyncSession) -> list[SurveySessionAdminView]:
    try:
        async with session.begin():
            sessions = await retrieve_sessions(session)
    except SQLAlchemyError as error:
        logger.error("session_list_retrieval_failed")
        raise SurveySessionRetrievalError from error
    return [_to_admin_view(item, count) for item, count in sessions]


async def create_session(
    session: AsyncSession, session_data: SurveySessionCreate
) -> SurveySessionAdminView:
    try:
        async with session.begin():
            survey_session = await persist_session(session, session_data.title)
    except SQLAlchemyError as error:
        logger.error("session_creation_failed")
        raise SurveySessionPersistenceError from error
    return _to_admin_view(survey_session, 0)


async def open_session(
    session: AsyncSession, session_id: uuid.UUID
) -> SurveySessionAdminView:
    try:
        async with session.begin():
            await acquire_active_session_lock(session)
            survey_session = await get_session_for_update(session, session_id)
            if survey_session is None:
                raise SurveySessionNotFoundError
            question_count = await count_session_questions(session, session_id)
            if question_count == 0:
                raise EmptySurveySessionError
            await close_other_sessions(session, session_id)
            await set_session_questions_active(session, session_id, active=True)
            survey_session.is_open = True
            survey_session.current_run_id = uuid.uuid4()
            survey_session.opened_at = datetime.now(UTC)
            survey_session.closed_at = None
            await session.flush()
    except SQLAlchemyError as error:
        logger.error("session_open_failed")
        raise SurveySessionPersistenceError from error
    return _to_admin_view(survey_session, question_count)


async def close_session(
    session: AsyncSession, session_id: uuid.UUID
) -> SurveySessionAdminView:
    try:
        async with session.begin():
            await acquire_active_session_lock(session)
            survey_session = await get_session_for_update(session, session_id)
            if survey_session is None:
                raise SurveySessionNotFoundError
            question_count = await count_session_questions(session, session_id)
            await set_session_questions_active(session, session_id, active=False)
            survey_session.is_open = False
            survey_session.closed_at = datetime.now(UTC)
            await session.flush()
    except SQLAlchemyError as error:
        logger.error("session_close_failed")
        raise SurveySessionPersistenceError from error
    return _to_admin_view(survey_session, question_count)


def _to_admin_view(
    survey_session: SurveySession, question_count: int
) -> SurveySessionAdminView:
    return SurveySessionAdminView(
        id=survey_session.id,
        current_run_id=survey_session.current_run_id,
        title=survey_session.title,
        is_open=survey_session.is_open,
        question_count=question_count,
        created_at=survey_session.created_at,
        opened_at=survey_session.opened_at,
        closed_at=survey_session.closed_at,
    )
