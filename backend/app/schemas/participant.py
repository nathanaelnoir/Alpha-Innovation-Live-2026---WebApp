import uuid

from pydantic import BaseModel, ConfigDict, Field


class ParticipantCreated(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "participant_id": "123e4567-e89b-12d3-a456-426614174000",
                "participant_token": "v1.uuid-payload.signature",
            }
        }
    )

    participant_id: uuid.UUID = Field(
        description="Server-generated pseudonymous participant identifier."
    )
    participant_token: str = Field(
        description=(
            "Signed token used as Bearer authentication for response submission."
        )
    )
