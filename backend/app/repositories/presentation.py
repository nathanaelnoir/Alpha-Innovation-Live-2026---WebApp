import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.response import Response


@dataclass(frozen=True, slots=True)
class PresentationPointRow:
    question_id: uuid.UUID
    x: float
    y: float


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
