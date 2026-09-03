import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.models.response import Response
from app.models.survey_session import SurveySession

ACTIVE_QUESTION_ADVISORY_LOCK = 7_361_772_901


async def get_active_question(session: AsyncSession) -> Question | None:
    statement = (
        select(Question)
        .join(SurveySession, SurveySession.id == Question.session_id)
        .where(SurveySession.is_open.is_(True), Question.is_active.is_(True))
        .order_by(Question.position.asc())
        .limit(1)
    )
    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def list_questions(session: AsyncSession) -> list[Question]:
    statement = select(Question).order_by(
        Question.session_id.asc(), Question.position.asc(), Question.id.asc()
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


async def get_question_for_submission(
    session: AsyncSession, question_id: uuid.UUID
) -> Question | None:
    statement = (
        select(Question).where(Question.id == question_id).with_for_update(read=True)
    )
    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def get_question_session_run_id(
    session: AsyncSession, session_id: uuid.UUID
) -> uuid.UUID | None:
    result = await session.execute(
        select(SurveySession.current_run_id).where(
            SurveySession.id == session_id,
            SurveySession.is_open.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def create_question(
    session: AsyncSession,
    session_id: uuid.UUID,
    position: int | None,
    prompt: str,
    x_axis_label: str | None,
    y_axis_label: str | None,
    prompt_de: str | None,
    x_axis_label_de: str | None,
    y_axis_label_de: str | None,
    prompt_it: str | None,
    x_axis_label_it: str | None,
    y_axis_label_it: str | None,
) -> Question:
    if position is None:
        position_result = await session.execute(
            select(func.coalesce(func.max(Question.position), 0) + 1).where(
                Question.session_id == session_id
            )
        )
        position = position_result.scalar_one()
    question = Question(
        id=uuid.uuid4(),
        session_id=session_id,
        position=position,
        prompt=prompt,
        x_axis_label=x_axis_label,
        y_axis_label=y_axis_label,
        prompt_de=prompt_de,
        x_axis_label_de=x_axis_label_de,
        y_axis_label_de=y_axis_label_de,
        prompt_it=prompt_it,
        x_axis_label_it=x_axis_label_it,
        y_axis_label_it=y_axis_label_it,
        is_active=False,
    )
    session.add(question)
    await session.flush()
    return question


async def update_question(
    session: AsyncSession,
    question: Question,
    *,
    prompt: str,
    x_axis_label: str | None,
    y_axis_label: str | None,
    prompt_de: str | None,
    x_axis_label_de: str | None,
    y_axis_label_de: str | None,
    prompt_it: str | None,
    x_axis_label_it: str | None,
    y_axis_label_it: str | None,
) -> Question:
    question.prompt = prompt
    question.x_axis_label = x_axis_label
    question.y_axis_label = y_axis_label
    question.prompt_de = prompt_de
    question.x_axis_label_de = x_axis_label_de
    question.y_axis_label_de = y_axis_label_de
    question.prompt_it = prompt_it
    question.x_axis_label_it = x_axis_label_it
    question.y_axis_label_it = y_axis_label_it
    await session.flush()
    return question


async def acquire_active_question_lock(session: AsyncSession) -> None:
    statement = select(func.pg_advisory_xact_lock(ACTIVE_QUESTION_ADVISORY_LOCK))
    await session.execute(statement)


async def get_question_for_activation(
    session: AsyncSession, question_id: uuid.UUID
) -> Question | None:
    result = await session.execute(
        select(Question).where(Question.id == question_id).with_for_update()
    )
    return result.scalar_one_or_none()


async def delete_question(session: AsyncSession, question_id: uuid.UUID) -> None:
    await session.execute(delete(Response).where(Response.question_id == question_id))
    await session.execute(delete(Question).where(Question.id == question_id))


async def deactivate_other_questions(
    session: AsyncSession, active_question_id: uuid.UUID
) -> None:
    await session.execute(
        update(Question)
        .where(Question.is_active.is_(True), Question.id != active_question_id)
        .values(is_active=False, updated_at=func.now())
    )
