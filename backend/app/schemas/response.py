import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

NormalizedCoordinate = Annotated[
    float,
    Field(
        strict=True,
        ge=0.0,
        le=1.0,
        allow_inf_nan=False,
        description="Normalized coordinate from 0.0 through 1.0, inclusive.",
    ),
]


class ResponseSubmission(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"x": 0.35, "y": 0.72}})

    x: NormalizedCoordinate
    y: NormalizedCoordinate


class ResponseAccepted(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "response_id": "123e4567-e89b-12d3-a456-426614174002",
                "question_id": "123e4567-e89b-12d3-a456-426614174001",
                "x": 0.35,
                "y": 0.72,
            }
        }
    )

    response_id: uuid.UUID = Field(description="Identifier of the stored response.")
    question_id: uuid.UUID = Field(description="Question answered by this response.")
    x: float = Field(ge=0.0, le=1.0, description="Accepted horizontal coordinate.")
    y: float = Field(ge=0.0, le=1.0, description="Accepted vertical coordinate.")
