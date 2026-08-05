import uuid
from typing import Annotated

from fastapi import APIRouter, Path, status

from app.api.dependencies import ParticipantIdDependency, SessionDependency
from app.schemas.error import ErrorResponse
from app.schemas.response import ResponseAccepted, ResponseSubmission
from app.services.responses import submit_response

router = APIRouter(prefix="/questions", tags=["Responses"])


@router.put(
    "/{question_id}/response",
    response_model=ResponseAccepted,
    summary="Submit or update a coordinate response",
    description=(
        "Stores one normalized point for the authenticated participant and question. "
        "Repeating the request updates that point, making network retries safe."
    ),
    response_description="The coordinate response accepted after commit.",
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The participant token is missing, invalid, or obsolete.",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ErrorResponse,
            "description": "The requested question does not exist.",
        },
        status.HTTP_409_CONFLICT: {
            "model": ErrorResponse,
            "description": "The question is not currently accepting responses.",
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "model": ErrorResponse,
            "description": "A coordinate or path value is invalid.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "The response could not be stored.",
        },
    },
    operation_id="submitResponse",
)
async def submit_response_route(
    question_id: Annotated[
        uuid.UUID,
        Path(description="UUID of the active question being answered."),
    ],
    submission: ResponseSubmission,
    participant_id: ParticipantIdDependency,
    session: SessionDependency,
) -> ResponseAccepted:
    return await submit_response(session, participant_id, question_id, submission)
