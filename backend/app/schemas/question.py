import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuestionCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "session_id": "123e4567-e89b-12d3-a456-426614174000",
                "prompt": "How valuable was this session?",
                "x_axis_label": "Not valuable",
                "y_axis_label": "Very valuable",
                "prompt_de": "Wie wertvoll war diese Sitzung?",
                "x_axis_label_de": "Nicht wertvoll",
                "y_axis_label_de": "Sehr wertvoll",
                "prompt_it": "Quanto è stata utile questa sessione?",
                "x_axis_label_it": "Per niente utile",
                "y_axis_label_it": "Molto utile",
            }
        }
    )

    session_id: uuid.UUID = Field(description="Session that owns this question.")
    position: int | None = Field(default=None, ge=1)
    prompt: str = Field(min_length=1, max_length=1000)
    x_axis_label: str | None = Field(default=None, max_length=200)
    y_axis_label: str | None = Field(default=None, max_length=200)
    prompt_de: str | None = Field(default=None, max_length=1000)
    x_axis_label_de: str | None = Field(default=None, max_length=200)
    y_axis_label_de: str | None = Field(default=None, max_length=200)
    prompt_it: str | None = Field(default=None, max_length=1000)
    x_axis_label_it: str | None = Field(default=None, max_length=200)
    y_axis_label_it: str | None = Field(default=None, max_length=200)

    @field_validator("prompt")
    @classmethod
    def strip_and_require_prompt(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("prompt must not be blank")
        return stripped

    @field_validator("prompt_de", "prompt_it")
    @classmethod
    def strip_optional_prompt(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator(
        "x_axis_label",
        "y_axis_label",
        "x_axis_label_de",
        "y_axis_label_de",
        "x_axis_label_it",
        "y_axis_label_it",
    )
    @classmethod
    def strip_optional_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class QuestionAdminView(BaseModel):
    id: uuid.UUID = Field(description="Question identifier.")
    session_id: uuid.UUID
    position: int
    prompt: str = Field(description="Question displayed to participants.")
    x_axis_label: str | None
    y_axis_label: str | None
    prompt_de: str | None
    x_axis_label_de: str | None
    y_axis_label_de: str | None
    prompt_it: str | None
    x_axis_label_it: str | None
    y_axis_label_it: str | None
    is_active: bool = Field(description="Whether this question accepts responses.")


class ActiveQuestion(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174001",
                "prompt": "How useful was this session?",
                "x_axis_label": "Not useful",
                "y_axis_label": "Very useful",
                "prompt_de": "Wie nützlich war diese Sitzung?",
                "x_axis_label_de": "Nicht nützlich",
                "y_axis_label_de": "Sehr nützlich",
                "prompt_it": "Quanto è stata utile questa sessione?",
                "x_axis_label_it": "Per niente utile",
                "y_axis_label_it": "Molto utile",
            }
        }
    )

    id: uuid.UUID = Field(description="Identifier used when submitting a response.")
    position: int = Field(description="One-based position within the active session.")
    prompt: str = Field(description="Question displayed to the participant.")
    x_axis_label: str | None = Field(
        description="Optional label describing the horizontal axis."
    )
    y_axis_label: str | None = Field(
        description="Optional label describing the vertical axis."
    )
    prompt_de: str | None = Field(description="Optional German question text.")
    x_axis_label_de: str | None = Field(description="Optional German horizontal label.")
    y_axis_label_de: str | None = Field(description="Optional German vertical label.")
    prompt_it: str | None = Field(description="Optional Italian question text.")
    x_axis_label_it: str | None = Field(
        description="Optional Italian horizontal label."
    )
    y_axis_label_it: str | None = Field(description="Optional Italian vertical label.")
