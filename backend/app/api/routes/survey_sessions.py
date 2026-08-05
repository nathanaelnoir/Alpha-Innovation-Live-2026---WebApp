import uuid
from typing import Annotated

from fastapi import APIRouter, Path, status

from app.api.dependencies import OrganizerAccessDependency, SessionDependency
from app.schemas.error import ErrorResponse
from app.schemas.survey_session import (
    ActiveSurveySession,
    SurveySessionAdminView,
    SurveySessionCreate,
)
from app.services.survey_sessions import (
    close_session,
    create_session,
    get_active_session,
    list_sessions,
    open_session,
)

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.get(
    "/active",
    response_model=ActiveSurveySession,
    summary="Get the open survey session",
    responses={
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
    operation_id="getActiveSession",
)
async def get_active_session_route(session: SessionDependency) -> ActiveSurveySession:
    return await get_active_session(session)


@router.get(
    "",
    response_model=list[SurveySessionAdminView],
    summary="List survey sessions",
    operation_id="listSessions",
)
async def list_sessions_route(
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> list[SurveySessionAdminView]:
    return await list_sessions(session)


@router.post(
    "",
    response_model=SurveySessionAdminView,
    status_code=status.HTTP_201_CREATED,
    summary="Create a survey session",
    operation_id="createSession",
)
async def create_session_route(
    session_data: SurveySessionCreate,
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> SurveySessionAdminView:
    return await create_session(session, session_data)


@router.put(
    "/{session_id}/open",
    response_model=SurveySessionAdminView,
    summary="Open a survey session",
    description=(
        "Opens every ordered question in this session and atomically closes any "
        "previously open session. Empty sessions cannot be opened."
    ),
    operation_id="openSession",
)
async def open_session_route(
    session_id: Annotated[uuid.UUID, Path(description="Session UUID to open.")],
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> SurveySessionAdminView:
    return await open_session(session, session_id)


@router.put(
    "/{session_id}/close",
    response_model=SurveySessionAdminView,
    summary="Close a survey session",
    operation_id="closeSession",
)
async def close_session_route(
    session_id: Annotated[uuid.UUID, Path(description="Session UUID to close.")],
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> SurveySessionAdminView:
    return await close_session(session, session_id)
