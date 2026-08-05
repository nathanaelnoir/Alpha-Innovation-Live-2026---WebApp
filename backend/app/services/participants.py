import logging

from pydantic import SecretStr
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ParticipantPersistenceError,
    ParticipantTokenConfigurationError,
)
from app.core.security import (
    sign_participant_token,
    validate_participant_token_secret,
)
from app.repositories.participants import create_participant as persist_participant
from app.schemas.participant import ParticipantCreated

logger = logging.getLogger(__name__)


async def create_participant(
    session: AsyncSession, token_secret: SecretStr | None
) -> ParticipantCreated:
    if token_secret is None:
        raise ParticipantTokenConfigurationError

    secret = token_secret.get_secret_value()
    validate_participant_token_secret(secret)

    try:
        async with session.begin():
            participant = await persist_participant(session)
    except SQLAlchemyError as error:
        logger.error("participant_persistence_failed")
        raise ParticipantPersistenceError from error

    return ParticipantCreated(
        participant_id=participant.id,
        participant_token=sign_participant_token(participant.id, secret),
    )
