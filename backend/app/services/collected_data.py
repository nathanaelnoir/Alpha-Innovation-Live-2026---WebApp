import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    CollectedDataPersistenceError,
    CollectedDataWipeConflictError,
)
from app.repositories.collected_data import has_open_session
from app.repositories.collected_data import wipe_collected_data as persist_data_wipe
from app.repositories.survey_sessions import acquire_active_session_lock
from app.schemas.collected_data import CollectedDataWipeResult

logger = logging.getLogger(__name__)


async def wipe_collected_data(session: AsyncSession) -> CollectedDataWipeResult:
    try:
        async with session.begin():
            await acquire_active_session_lock(session)
            if await has_open_session(session):
                raise CollectedDataWipeConflictError
            response_count, participant_count = await persist_data_wipe(session)
    except SQLAlchemyError as error:
        logger.error("collected_data_wipe_failed")
        raise CollectedDataPersistenceError from error
    return CollectedDataWipeResult(
        responses_deleted=response_count,
        participants_deleted=participant_count,
    )
