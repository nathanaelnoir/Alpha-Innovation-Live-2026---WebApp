from fastapi import APIRouter, status

from app.api.dependencies import SessionDependency, SettingsDependency
from app.schemas.error import ErrorResponse
from app.schemas.participant import ParticipantCreated
from app.services.participants import create_participant

router = APIRouter(prefix="/participants", tags=["Participants"])


@router.post(
    "",
    response_model=ParticipantCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create a pseudonymous participant",
    description=(
        "Creates a server-generated UUID without collecting personal details. "
        "Keep the returned signed token locally and use it to authorize responses."
    ),
    response_description="The participant UUID and its signed access token.",
    responses={
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Participant token signing is unavailable.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The participant could not be stored.",
        },
    },
    operation_id="createParticipant",
)
async def create_participant_route(
    session: SessionDependency, settings: SettingsDependency
) -> ParticipantCreated:
    return await create_participant(session, settings.participant_token_secret)
