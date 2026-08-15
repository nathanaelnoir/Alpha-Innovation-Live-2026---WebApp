from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.response import Response
from app.models.survey_session import SurveySession


async def has_open_session(session: AsyncSession) -> bool:
    result = await session.scalar(
        select(func.count(SurveySession.id)).where(SurveySession.is_open.is_(True))
    )
    return bool(result)


async def wipe_collected_data(session: AsyncSession) -> tuple[int, int]:
    response_count = await session.scalar(select(func.count(Response.id)))
    participant_count = await session.scalar(select(func.count(Participant.id)))
    await session.execute(delete(Response))
    await session.execute(delete(Participant))
    return response_count or 0, participant_count or 0
