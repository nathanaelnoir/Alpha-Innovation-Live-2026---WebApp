import uuid

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question import Question
from app.models.survey_session import SurveySession

ACTIVE_SESSION_ADVISORY_LOCK = 7_361_772_901


def _session_with_count_statement() -> Select[tuple[SurveySession, int]]:
    return (
        select(SurveySession, func.count(Question.id))
        .outerjoin(Question, Question.session_id == SurveySession.id)
        .group_by(SurveySession.id)
    )


async def get_active_session(
    session: AsyncSession,
) -> tuple[SurveySession, list[Question]] | None:
    result = await session.execute(
        select(SurveySession).where(SurveySession.is_open.is_(True))
    )
    survey_session = result.scalar_one_or_none()
    if survey_session is None:
        return None
    questions_result = await session.execute(
        select(Question)
        .where(Question.session_id == survey_session.id)
        .order_by(Question.position.asc())
    )
    return survey_session, list(questions_result.scalars().all())


async def list_sessions(session: AsyncSession) -> list[tuple[SurveySession, int]]:
    result = await session.execute(
        _session_with_count_statement().order_by(
            SurveySession.created_at.asc(), SurveySession.id.asc()
        )
    )
    return [(item, count) for item, count in result.all()]


async def create_session(session: AsyncSession, title: str) -> SurveySession:
    survey_session = SurveySession(id=uuid.uuid4(), title=title, is_open=False)
    session.add(survey_session)
    await session.flush()
    return survey_session


async def acquire_active_session_lock(session: AsyncSession) -> None:
    await session.execute(
        select(func.pg_advisory_xact_lock(ACTIVE_SESSION_ADVISORY_LOCK))
    )


async def get_session_for_update(
    session: AsyncSession, session_id: uuid.UUID
) -> SurveySession | None:
    result = await session.execute(
        select(SurveySession).where(SurveySession.id == session_id).with_for_update()
    )
    return result.scalar_one_or_none()


async def count_session_questions(session: AsyncSession, session_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.count(Question.id)).where(Question.session_id == session_id)
    )
    return result.scalar_one()


async def close_other_sessions(
    session: AsyncSession, open_session_id: uuid.UUID
) -> None:
    await session.execute(
        update(SurveySession)
        .where(
            SurveySession.is_open.is_(True),
            SurveySession.id != open_session_id,
        )
        .values(is_open=False, closed_at=func.now(), updated_at=func.now())
    )
    await session.execute(
        update(Question)
        .where(Question.session_id != open_session_id, Question.is_active.is_(True))
        .values(is_active=False, updated_at=func.now())
    )


async def set_session_questions_active(
    session: AsyncSession, session_id: uuid.UUID, *, active: bool
) -> None:
    await session.execute(
        update(Question)
        .where(Question.session_id == session_id)
        .values(is_active=active, updated_at=func.now())
    )
