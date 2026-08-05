import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.question import ActiveQuestion


class SurveySessionCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"title": "Morning keynote"}}
    )

    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def strip_and_require_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped


class SurveySessionAdminView(BaseModel):
    id: uuid.UUID
    current_run_id: uuid.UUID
    title: str
    is_open: bool
    question_count: int
    created_at: datetime
    opened_at: datetime | None
    closed_at: datetime | None


class ActiveSurveySession(BaseModel):
    id: uuid.UUID = Field(description="Current session identifier.")
    run_id: uuid.UUID = Field(
        description="Changes whenever the session is opened or reopened."
    )
    title: str = Field(description="Participant-facing session title.")
    questions: list[ActiveQuestion] = Field(
        description="Questions in the order each browser should display them."
    )
