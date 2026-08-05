import logging
import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ActiveQuestionNotFoundError,
    QuestionListRetrievalError,
    QuestionNotFoundError,
    QuestionPersistenceError,
    QuestionRetrievalError,
    SurveySessionNotEditableError,
    SurveySessionNotFoundError,
)
from app.models.question import Question
from app.repositories.questions import (
    create_question as persist_question,
)
from app.repositories.questions import (
    get_active_question as retrieve_active_question,
)
from app.repositories.questions import get_question_for_activation
from app.repositories.questions import list_questions as retrieve_questions
from app.repositories.survey_sessions import get_session_for_update
from app.schemas.question import ActiveQuestion, QuestionAdminView, QuestionCreate
from app.services.survey_sessions import close_session as close_survey_session
from app.services.survey_sessions import open_session as open_survey_session

logger = logging.getLogger(__name__)


async def get_active_question(session: AsyncSession) -> ActiveQuestion:
    try:
        async with session.begin():
            question = await retrieve_active_question(session)
    except SQLAlchemyError as error:
        logger.error("active_question_retrieval_failed")
        raise QuestionRetrievalError from error

    if question is None:
        raise ActiveQuestionNotFoundError

    return ActiveQuestion(
        id=question.id,
        position=question.position,
        prompt=question.prompt,
        x_axis_label=question.x_axis_label,
        y_axis_label=question.y_axis_label,
    )


async def list_questions(session: AsyncSession) -> list[QuestionAdminView]:
    try:
        async with session.begin():
            questions = await retrieve_questions(session)
    except SQLAlchemyError as error:
        logger.error("question_list_retrieval_failed")
        raise QuestionListRetrievalError from error

    return [_to_admin_view(question) for question in questions]


async def create_question(
    session: AsyncSession, question_data: QuestionCreate
) -> QuestionAdminView:
    try:
        async with session.begin():
            survey_session = await get_session_for_update(
                session, question_data.session_id
            )
            if survey_session is None:
                raise SurveySessionNotFoundError
            if survey_session.is_open:
                raise SurveySessionNotEditableError
            question = await persist_question(
                session,
                question_data.session_id,
                question_data.position,
                question_data.prompt,
                question_data.x_axis_label,
                question_data.y_axis_label,
            )
    except SQLAlchemyError as error:
        logger.error("question_creation_failed")
        raise QuestionPersistenceError from error
    return _to_admin_view(question)


async def activate_question(
    session: AsyncSession, question_id: uuid.UUID
) -> QuestionAdminView:
    try:
        async with session.begin():
            question = await get_question_for_activation(session, question_id)
            if question is None:
                raise QuestionNotFoundError
    except SQLAlchemyError as error:
        logger.error("question_activation_failed")
        raise QuestionPersistenceError from error
    await open_survey_session(session, question.session_id)
    question.is_active = True
    return _to_admin_view(question)


async def close_question(
    session: AsyncSession, question_id: uuid.UUID
) -> QuestionAdminView:
    try:
        async with session.begin():
            question = await get_question_for_activation(session, question_id)
            if question is None:
                raise QuestionNotFoundError
    except SQLAlchemyError as error:
        logger.error("question_close_failed")
        raise QuestionPersistenceError from error
    await close_survey_session(session, question.session_id)
    question.is_active = False
    return _to_admin_view(question)


def _to_admin_view(question: Question) -> QuestionAdminView:
    return QuestionAdminView(
        id=question.id,
        session_id=question.session_id,
        position=question.position,
        prompt=question.prompt,
        x_axis_label=question.x_axis_label,
        y_axis_label=question.y_axis_label,
        is_active=question.is_active,
    )
