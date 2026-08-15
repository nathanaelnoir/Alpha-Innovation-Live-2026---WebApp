import uuid

from pydantic import BaseModel, Field


class PresentationPoint(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class PresentationQuestion(BaseModel):
    id: uuid.UUID
    position: int
    prompt: str
    x_axis_label: str | None
    y_axis_label: str | None
    prompt_de: str | None
    x_axis_label_de: str | None
    y_axis_label_de: str | None
    prompt_it: str | None
    x_axis_label_it: str | None
    y_axis_label_it: str | None
    points: list[PresentationPoint]


class ActivePresentation(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    title: str
    questions: list[PresentationQuestion]
