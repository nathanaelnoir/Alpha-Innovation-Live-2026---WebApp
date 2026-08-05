import uuid

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.response import Response


async def upsert_response(
    session: AsyncSession,
    participant_id: uuid.UUID,
    question_id: uuid.UUID,
    x: float,
    y: float,
) -> Response:
    insert_statement = insert(Response).values(
        id=uuid.uuid4(),
        participant_id=participant_id,
        question_id=question_id,
        x=x,
        y=y,
    )
    upsert_statement = insert_statement.on_conflict_do_update(
        index_elements=[Response.participant_id, Response.question_id],
        set_={
            "x": insert_statement.excluded.x,
            "y": insert_statement.excluded.y,
            "updated_at": func.now(),
        },
    ).returning(Response)
    result = await session.execute(upsert_statement)
    return result.scalar_one()
