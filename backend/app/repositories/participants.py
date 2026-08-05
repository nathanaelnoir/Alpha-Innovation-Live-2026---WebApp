import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant


async def create_participant(session: AsyncSession) -> Participant:
    participant = Participant(id=uuid.uuid4())
    session.add(participant)
    await session.flush()
    return participant


async def get_participant(
    session: AsyncSession, participant_id: uuid.UUID
) -> Participant | None:
    result = await session.execute(
        select(Participant).where(Participant.id == participant_id)
    )
    return result.scalar_one_or_none()
