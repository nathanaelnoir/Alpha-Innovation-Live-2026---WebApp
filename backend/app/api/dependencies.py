import hmac
import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import (
    InvalidParticipantTokenError,
    OrganizerTokenConfigurationError,
    ParticipantTokenConfigurationError,
    ResultsTokenConfigurationError,
    UnauthorizedOrganizerAccessError,
    UnauthorizedResultsAccessError,
)
from app.core.security import verify_participant_token
from app.db.session import get_session


async def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="ParticipantToken",
    description=(
        "Signed participant token returned by `POST /api/v1/participants`. "
        "Enter the token only; Swagger adds the `Bearer` prefix."
    ),
)
organizer_bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="OrganizerToken",
    description=(
        "Organizer-only Bearer secret configured through `RESULTS_EXPORT_TOKEN`. "
        "It authorizes question management and results export."
    ),
)


async def get_participant_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> uuid.UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise InvalidParticipantTokenError
    if settings.participant_token_secret is None:
        raise ParticipantTokenConfigurationError

    return verify_participant_token(
        credentials.credentials,
        settings.participant_token_secret.get_secret_value(),
    )


async def require_results_access(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(organizer_bearer_scheme)
    ],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> None:
    if (
        settings.results_export_token is None
        or len(settings.results_export_token.get_secret_value()) < 32
    ):
        raise ResultsTokenConfigurationError
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedResultsAccessError

    supplied_token = credentials.credentials
    configured_token = settings.results_export_token.get_secret_value()
    if not hmac.compare_digest(supplied_token, configured_token):
        raise UnauthorizedResultsAccessError


async def require_organizer_access(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(organizer_bearer_scheme)
    ],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> None:
    if (
        settings.results_export_token is None
        or len(settings.results_export_token.get_secret_value()) < 32
    ):
        raise OrganizerTokenConfigurationError
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedOrganizerAccessError
    if not hmac.compare_digest(
        credentials.credentials,
        settings.results_export_token.get_secret_value(),
    ):
        raise UnauthorizedOrganizerAccessError


SessionDependency = Annotated[AsyncSession, Depends(get_session)]
SettingsDependency = Annotated[Settings, Depends(get_app_settings)]
ParticipantIdDependency = Annotated[uuid.UUID, Depends(get_participant_id)]
ResultsAccessDependency = Annotated[None, Depends(require_results_access)]
OrganizerAccessDependency = Annotated[None, Depends(require_organizer_access)]
