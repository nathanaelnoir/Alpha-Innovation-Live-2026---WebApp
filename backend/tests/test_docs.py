import httpx
import pytest

from app.core.config import Settings
from app.main import create_app


@pytest.mark.asyncio
async def test_openapi_schema_describes_complete_participant_flow() -> None:
    app = create_app(Settings(_env_file=None))
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "Conference Survey API"
    assert schema["info"]["version"] == "0.1.0"
    assert "Typical participant flow" in schema["info"]["description"]
    assert [tag["name"] for tag in schema["tags"]] == [
        "Participants",
        "Sessions",
        "Questions",
        "Responses",
        "Results",
        "Organizer",
        "Operations",
    ]

    participant_operation = schema["paths"]["/api/v1/participants"]["post"]
    session_operation = schema["paths"]["/api/v1/sessions/active"]["get"]
    question_operation = schema["paths"]["/api/v1/questions/active"]["get"]
    response_operation = schema["paths"]["/api/v1/questions/{question_id}/response"][
        "put"
    ]
    results_operation = schema["paths"]["/api/v1/results.csv"]["get"]
    create_question_operation = schema["paths"]["/api/v1/questions"]["post"]
    list_questions_operation = schema["paths"]["/api/v1/questions"]["get"]
    activate_question_operation = schema["paths"][
        "/api/v1/questions/{question_id}/activate"
    ]["put"]
    delete_question_operation = schema["paths"]["/api/v1/questions/{question_id}"][
        "delete"
    ]
    delete_session_operation = schema["paths"]["/api/v1/sessions/{session_id}"][
        "delete"
    ]
    wipe_operation = schema["paths"]["/api/v1/admin/collected-data"]["delete"]
    assert participant_operation["summary"] == "Create a pseudonymous participant"
    assert session_operation["operationId"] == "getActiveSession"
    assert question_operation["operationId"] == "getActiveQuestion"
    assert response_operation["operationId"] == "submitResponse"
    assert set(response_operation["responses"]) >= {
        "200",
        "401",
        "404",
        "409",
        "422",
        "503",
    }
    assert response_operation["security"] == [{"ParticipantToken": []}]
    assert results_operation["operationId"] == "exportResultsCsv"
    assert results_operation["security"] == [{"OrganizerToken": []}]
    assert set(results_operation["responses"]) >= {"200", "401", "500", "503"}
    assert create_question_operation["security"] == [{"OrganizerToken": []}]
    assert list_questions_operation["operationId"] == "listQuestions"
    assert list_questions_operation["security"] == [{"OrganizerToken": []}]
    assert activate_question_operation["operationId"] == "activateQuestion"
    assert delete_question_operation["operationId"] == "deleteQuestion"
    assert delete_session_operation["operationId"] == "deleteSession"
    assert wipe_operation["operationId"] == "wipeCollectedData"
    assert wipe_operation["security"] == [{"OrganizerToken": []}]
    assert (
        "signed participant token"
        in schema["components"]["securitySchemes"]["ParticipantToken"][
            "description"
        ].lower()
    )


@pytest.mark.asyncio
async def test_swagger_ui_uses_review_friendly_defaults() -> None:
    app = create_app(Settings(_env_file=None))
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/docs")

    assert response.status_code == 200
    assert "Swagger UI" in response.text
    assert '"displayRequestDuration": true' in response.text
    assert '"docExpansion": "list"' in response.text
    assert '"filter": true' in response.text
    assert '"persistAuthorization": false' in response.text


@pytest.mark.asyncio
async def test_api_documentation_is_hidden_in_production() -> None:
    app = create_app(
        Settings(
            app_env="production",
            participant_token_secret="p" * 32,
            results_export_token="r" * 32,
            _env_file=None,
        )
    )
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        responses = [
            await client.get(path) for path in ("/docs", "/redoc", "/openapi.json")
        ]

    assert [response.status_code for response in responses] == [404, 404, 404]


@pytest.mark.asyncio
async def test_cors_preflight_allows_admin_delete_requests() -> None:
    frontend_origin = "https://survey.example.com"
    app = create_app(Settings(frontend_origin=frontend_origin, _env_file=None))
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/api/v1/admin/collected-data",
            headers={
                "Origin": frontend_origin,
                "Access-Control-Request-Method": "DELETE",
                "Access-Control-Request-Headers": "authorization",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == frontend_origin
    assert "DELETE" in response.headers["access-control-allow-methods"]
