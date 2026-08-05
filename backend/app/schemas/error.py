from pydantic import BaseModel, ConfigDict, Field


class ErrorDetail(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "validation_error",
                "message": "The request contains invalid values.",
            }
        }
    )

    code: str = Field(description="Stable, machine-readable error code.")
    message: str = Field(description="Safe, human-readable error explanation.")


class ErrorResponse(BaseModel):
    error: ErrorDetail
