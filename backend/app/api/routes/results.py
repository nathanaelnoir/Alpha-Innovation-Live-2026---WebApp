from fastapi import APIRouter, Response, status

from app.api.dependencies import ResultsAccessDependency, SessionDependency
from app.schemas.error import ErrorResponse
from app.services.results import export_results_csv

router = APIRouter(tags=["Results"])


@router.get(
    "/results.csv",
    summary="Export all stored responses",
    description=(
        "Downloads an organizer-only CSV containing pseudonymous participant IDs, "
        "question IDs, normalized coordinates, and submission timestamps. The file "
        "uses an Excel-friendly semicolon delimiter."
    ),
    response_description=(
        "A semicolon-delimited UTF-8 CSV file ordered by submission time."
    ),
    responses={
        status.HTTP_200_OK: {
            "content": {"text/csv": {"schema": {"type": "string"}}},
            "description": "The complete response export.",
        },
        status.HTTP_401_UNAUTHORIZED: {
            "model": ErrorResponse,
            "description": "The organizer export token is missing or invalid.",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "model": ErrorResponse,
            "description": "Results export authentication is not configured.",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": ErrorResponse,
            "description": "Stored responses could not be retrieved.",
        },
    },
    operation_id="exportResultsCsv",
)
async def export_results_route(
    _authorized: ResultsAccessDependency,
    session: SessionDependency,
) -> Response:
    csv_content = await export_results_csv(session)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                'attachment; filename="conference-survey-results.csv"'
            ),
            "Cache-Control": "no-store",
        },
    )
