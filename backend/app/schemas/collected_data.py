from pydantic import BaseModel, Field


class CollectedDataWipeResult(BaseModel):
    responses_deleted: int = Field(ge=0)
    participants_deleted: int = Field(ge=0)
