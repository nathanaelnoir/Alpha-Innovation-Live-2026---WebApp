from fastapi import APIRouter, status

from app.api.dependencies import OrganizerAccessDependency, SessionDependency
from app.schemas.error import ErrorResponse
from app.schemas.presentation import ActivePresentation
from app.services.presentation import get_active_presentation

router = APIRouter(prefix="/presentation", tags=["Presentation"])


@router.get(
    "/active",
    response_model=ActivePresentation,
    summary="Get anonymized data for the live presentation",
    description=(
        "Returns the open session's multilingual questions, coordinate labels, "
        "and normalized response points. Participant and response identifiers are "
        "intentionally excluded. Organizer authorization is required."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
    operation_id="getActivePresentation",
)
async def get_active_presentation_route(
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> ActivePresentation:
    return await get_active_presentation(session)
