from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = Field(description="Current application process status.")


router = APIRouter(tags=["Operations"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check application health",
    description=(
        "Returns quickly when the API process is running. It does not expose "
        "configuration, credentials, or detailed infrastructure state."
    ),
    response_description="The application process is healthy.",
    operation_id="getHealth",
)
async def health() -> HealthResponse:
    """Report process health without exposing internal state."""

    return HealthResponse(status="ok")
