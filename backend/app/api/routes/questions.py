import uuid
from typing import Annotated

from fastapi import APIRouter, Path, status

from app.api.dependencies import OrganizerAccessDependency, SessionDependency
from app.schemas.error import ErrorResponse
from app.schemas.question import (
    ActiveQuestion,
    QuestionAdminView,
    QuestionCreate,
    QuestionUpdate,
)
from app.services.questions import (
    activate_question,
    close_question,
    create_question,
    delete_question,
    get_active_question,
    list_questions,
    update_question,
)

router = APIRouter(prefix="/questions", tags=["Questions"])


@router.get(
    "/active",
    response_model=ActiveQuestion,
    summary="Get the active survey question",
    description=(
        "Returns the single question currently accepting responses, including "
        "optional labels for both coordinate axes."
    ),
    response_description="The question currently shown to participants.",
    responses={
        status.HTTP_404_NOT_FOUND: {
            "model": ErrorResponse,
            "description": "No question is currently active.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The active question could not be retrieved.",
        },
    },
    operation_id="getActiveQuestion",
)
async def get_active_question_route(session: SessionDependency) -> ActiveQuestion:
    return await get_active_question(session)


@router.get(
    "",
    response_model=list[QuestionAdminView],
    summary="List survey questions",
    description=(
        "Returns every survey question in creation order, including inactive "
        "questions. Requires the organizer token."
    ),
    response_description="All stored survey questions.",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The organizer token is missing or invalid.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Organizer authentication is not configured.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The questions could not be retrieved.",
        },
    },
    operation_id="listQuestions",
)
async def list_questions_route(
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> list[QuestionAdminView]:
    return await list_questions(session)


@router.post(
    "",
    response_model=QuestionAdminView,
    status_code=status.HTTP_201_CREATED,
    summary="Create a survey question",
    description=(
        "Creates an inactive question. Activate it separately when participants "
        "should begin responding. Requires the organizer token."
    ),
    response_description="The newly created inactive question.",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The organizer token is missing or invalid.",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": ErrorResponse,
            "description": "The question or an axis label is invalid.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Organizer authentication is not configured.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The question could not be stored.",
        },
    },
    operation_id="createQuestion",
)
async def create_question_route(
    question_data: QuestionCreate,
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> QuestionAdminView:
    return await create_question(session, question_data)


@router.put(
    "/{question_id}",
    response_model=QuestionAdminView,
    summary="Update a survey question",
    description=(
        "Updates question text, translations, and axis labels. The owning session "
        "must be closed and organizer authorization is required."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
        status.HTTP_409_CONFLICT: {"model": ErrorResponse},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
    operation_id="updateQuestion",
)
async def update_question_route(
    question_id: Annotated[
        uuid.UUID, Path(description="UUID of the question to update.")
    ],
    question_data: QuestionUpdate,
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> QuestionAdminView:
    return await update_question(session, question_id, question_data)


@router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete a question",
    description=(
        "Deletes a question and all of its stored responses. The owning session "
        "must be closed and organizer authorization is required."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
        status.HTTP_409_CONFLICT: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
    operation_id="deleteQuestion",
)
async def delete_question_route(
    question_id: Annotated[
        uuid.UUID, Path(description="UUID of the question to permanently delete.")
    ],
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> None:
    await delete_question(session, question_id)


@router.put(
    "/{question_id}/activate",
    response_model=QuestionAdminView,
    summary="Activate a survey question",
    description=(
        "Legacy compatibility endpoint. Opens the selected question's entire "
        "session; use the session open endpoint for new organizer workflows."
    ),
    response_description="The question now accepting responses.",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The organizer token is missing or invalid.",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ErrorResponse,
            "description": "The selected question does not exist.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Organizer authentication is not configured.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The activation could not be stored.",
        },
    },
    operation_id="activateQuestion",
)
async def activate_question_route(
    question_id: Annotated[
        uuid.UUID, Path(description="UUID of the question to activate.")
    ],
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> QuestionAdminView:
    return await activate_question(session, question_id)


@router.put(
    "/{question_id}/close",
    response_model=QuestionAdminView,
    summary="Close a survey question",
    description=(
        "Legacy compatibility endpoint. Closes the selected question's entire "
        "session; use the session close endpoint for new organizer workflows."
    ),
    response_description="The closed question.",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The organizer token is missing or invalid.",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ErrorResponse,
            "description": "The selected question does not exist.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Organizer authentication is not configured.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The question could not be closed.",
        },
    },
    operation_id="closeQuestion",
)
async def close_question_route(
    question_id: Annotated[
        uuid.UUID, Path(description="UUID of the question to close.")
    ],
    _authorized: OrganizerAccessDependency,
    session: SessionDependency,
) -> QuestionAdminView:
    return await close_question(session, question_id)
