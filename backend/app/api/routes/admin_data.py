from fastapi import APIRouter, status

from app.api.dependencies import OrganizerAccessDependency, SessionDependency
from app.schemas.collected_data import CollectedDataWipeResult
from app.schemas.error import ErrorResponse
from app.services.collected_data import wipe_collected_data

router = APIRouter(prefix="/admin", tags=["Organizer"])


@router.delete(
    "/collected-data",
    response_model=CollectedDataWipeResult,
    summary="Permanently wipe collected participant data",
    description=(
        "Deletes every stored response and pseudonymous participant. Survey "
        "sessions and questions are preserved. All sessions must be closed and "
        "organizer authorization is required."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_409_CONFLICT: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
    operation_id="wipeCollectedData",
)
async def wipe_collected_data_route(
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> CollectedDataWipeResult:
    return await wipe_collected_data(session)
