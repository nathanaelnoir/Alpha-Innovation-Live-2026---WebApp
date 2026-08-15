import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app
from app.models.participant import Participant
from app.models.question import Question
from app.models.response import Response
from app.models.survey_session import SurveySession

ORGANIZER_TOKEN = "integration-organizer-secret-with-32-characters"
PARTICIPANT_SECRET = "integration-participant-secret-with-32-characters"
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_destructive_admin_flow_is_protected_and_transactional(
    db_session: AsyncSession,
) -> None:
    app = create_app(
        Settings(
            participant_token_secret=PARTICIPANT_SECRET,
            results_export_token=ORGANIZER_TOKEN,
            _env_file=None,
        )
    )

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = override_session
    organizer_headers = {"Authorization": f"Bearer {ORGANIZER_TOKEN}"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        active = await client.get("/api/v1/sessions/active")
        assert active.status_code == 200
        initial_session_id = active.json()["id"]
        initial_question_id = active.json()["questions"][0]["id"]
        await client.put(
            f"/api/v1/sessions/{initial_session_id}/close",
            headers=organizer_headers,
        )

        created_session = await client.post(
            "/api/v1/sessions",
            headers=organizer_headers,
            json={"title": "Deletion integration session"},
        )
        assert created_session.status_code == 201
        session_id = created_session.json()["id"]
        created_question = await client.post(
            "/api/v1/questions",
            headers=organizer_headers,
            json={"session_id": session_id, "prompt": "Delete this question?"},
        )
        assert created_question.status_code == 201
        question_id = created_question.json()["id"]

        opened = await client.put(
            f"/api/v1/sessions/{session_id}/open", headers=organizer_headers
        )
        assert opened.status_code == 200
        for path in (
            f"/api/v1/questions/{question_id}",
            f"/api/v1/sessions/{session_id}",
            "/api/v1/admin/collected-data",
        ):
            conflict = await client.delete(path, headers=organizer_headers)
            assert conflict.status_code == 409

        participant = await client.post("/api/v1/participants")
        assert participant.status_code == 201
        participant_body = participant.json()
        participant_headers = {
            "Authorization": f"Bearer {participant_body['participant_token']}"
        }
        response = await client.put(
            f"/api/v1/questions/{question_id}/response",
            headers=participant_headers,
            json={"x": 0.25, "y": 0.75},
        )
        assert response.status_code == 200

        await client.put(
            f"/api/v1/sessions/{session_id}/close", headers=organizer_headers
        )
        deleted_question = await client.delete(
            f"/api/v1/questions/{question_id}", headers=organizer_headers
        )
        assert deleted_question.status_code == 204
        assert deleted_question.content == b""

        replacement_question = await client.post(
            "/api/v1/questions",
            headers=organizer_headers,
            json={"session_id": session_id, "prompt": "Delete with session?"},
        )
        assert replacement_question.status_code == 201
        await client.put(
            f"/api/v1/sessions/{session_id}/open", headers=organizer_headers
        )
        replacement_response = await client.put(
            f"/api/v1/questions/{replacement_question.json()['id']}/response",
            headers=participant_headers,
            json={"x": 0.5, "y": 0.5},
        )
        assert replacement_response.status_code == 200
        await client.put(
            f"/api/v1/sessions/{session_id}/close", headers=organizer_headers
        )
        deleted_session = await client.delete(
            f"/api/v1/sessions/{session_id}", headers=organizer_headers
        )
        assert deleted_session.status_code == 204

        second_participant = await client.post("/api/v1/participants")
        assert second_participant.status_code == 201
        await client.put(
            f"/api/v1/sessions/{initial_session_id}/open", headers=organizer_headers
        )
        second_participant_headers = {
            "Authorization": (
                f"Bearer {second_participant.json()['participant_token']}"
            )
        }
        retained_configuration_response = await client.put(
            f"/api/v1/questions/{initial_question_id}/response",
            headers=second_participant_headers,
            json={"x": 0.75, "y": 0.25},
        )
        assert retained_configuration_response.status_code == 200
        await client.put(
            f"/api/v1/sessions/{initial_session_id}/close",
            headers=organizer_headers,
        )
        wiped = await client.delete(
            "/api/v1/admin/collected-data", headers=organizer_headers
        )
        assert wiped.status_code == 200
        assert wiped.json()["responses_deleted"] == 1
        assert wiped.json()["participants_deleted"] >= 2

        await client.put(
            f"/api/v1/sessions/{initial_session_id}/open", headers=organizer_headers
        )
        invalidated_identity = await client.put(
            f"/api/v1/questions/{initial_question_id}/response",
            headers=second_participant_headers,
            json={"x": 0.75, "y": 0.25},
        )
        assert invalidated_identity.status_code == 401
        assert invalidated_identity.json()["error"]["code"] == "participant_not_found"
        await client.put(
            f"/api/v1/sessions/{initial_session_id}/close",
            headers=organizer_headers,
        )

        unauthorized = await client.delete("/api/v1/admin/collected-data")
        assert unauthorized.status_code == 401

    async with db_session.begin():
        deleted_session_count = await db_session.scalar(
            select(func.count(SurveySession.id)).where(
                SurveySession.id == uuid.UUID(session_id)
            )
        )
        deleted_question_count = await db_session.scalar(
            select(func.count(Question.id)).where(
                Question.id == uuid.UUID(replacement_question.json()["id"])
            )
        )
        participant_count = await db_session.scalar(select(func.count(Participant.id)))
        response_count = await db_session.scalar(select(func.count(Response.id)))
        configured_question_count = await db_session.scalar(
            select(func.count(Question.id))
        )

    assert deleted_session_count == 0
    assert deleted_question_count == 0
    assert participant_count == 0
    assert response_count == 0
    assert configured_question_count and configured_question_count > 0
