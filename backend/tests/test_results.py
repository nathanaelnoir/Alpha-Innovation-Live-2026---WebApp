import csv
import io
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app
from app.repositories.results import ResultRow, list_results
from app.services.results import (
    CSV_COLUMNS,
    CSV_DELIMITER,
    build_results_csv,
    display_percentage,
    readable_axis_label,
    readable_question,
)

EXPORT_TOKEN = "organizer-results-token-with-32-characters"


def make_row() -> ResultRow:
    return ResultRow(
        response_id=uuid.UUID("123e4567-e89b-12d3-a456-426614174002"),
        participant_id=uuid.UUID("123e4567-e89b-12d3-a456-426614174000"),
        session_title="Opening keynote",
        question="How are you experiencing this session?",
        x_axis_label="Engagement (low to high)",
        y_axis_label="Understanding (low to high)",
        x=0.35,
        y=0.72,
        submitted_at=datetime(2026, 8, 3, 12, 0, tzinfo=UTC),
        updated_at=datetime(2026, 8, 3, 12, 5, tzinfo=UTC),
    )


def make_results_session(rows: list[ResultRow]) -> AsyncMock:
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.tuples.return_value.all.return_value = [
        (
            row.response_id,
            row.participant_id,
            row.session_title,
            row.question,
            row.x_axis_label,
            row.y_axis_label,
            row.x,
            row.y,
            row.submitted_at,
            row.updated_at,
        )
        for row in rows
    ]
    session.execute.return_value = result
    return session


def test_csv_export_has_stable_columns_and_utc_timestamps() -> None:
    row = make_row()

    csv_content = build_results_csv([row])

    assert csv_content.splitlines() == [
        CSV_DELIMITER.join(CSV_COLUMNS),
        (
            "123e4567-e89b-12d3-a456-426614174002;"
            "123e4567-e89b-12d3-a456-426614174000;"
            "Opening keynote;How are you experiencing this session?;"
            "0.35;0.72;Engagement;Understanding;35%;72%;"
            "2026-08-03T12:00:00+00:00;2026-08-03T12:05:00+00:00"
        ),
    ]


def test_display_columns_match_frontend_label_and_percentage_logic() -> None:
    assert readable_axis_label(" Engagement (low to high) ", "Horizontal") == (
        "Engagement"
    )
    assert readable_axis_label("  ", "Vertical") == "Vertical"
    assert readable_axis_label(None, "Horizontal") == "Horizontal"
    assert display_percentage(0.0) == "0%"
    assert display_percentage(0.345) == "35%"
    assert display_percentage(1.0) == "100%"


def test_slider_only_question_export_uses_the_visible_title() -> None:
    encoded = '[[slider-only:v1]]["Decision making","Choose a position."]'
    row = make_row()
    row = ResultRow(
        response_id=row.response_id,
        participant_id=row.participant_id,
        session_title=row.session_title,
        question=encoded,
        x_axis_label=row.x_axis_label,
        y_axis_label=row.y_axis_label,
        x=row.x,
        y=row.y,
        submitted_at=row.submitted_at,
        updated_at=row.updated_at,
    )
    exported_rows = list(
        csv.reader(io.StringIO(build_results_csv([row])), delimiter=CSV_DELIMITER)
    )

    assert readable_question(encoded) == "Decision making"
    assert exported_rows[1][3] == "Decision making"
    assert readable_question("A normal question") == "A normal question"
    assert readable_question("[[slider-only:v1]]broken") == ("[[slider-only:v1]]broken")


def test_empty_csv_export_still_contains_header() -> None:
    assert build_results_csv([]) == CSV_DELIMITER.join(CSV_COLUMNS) + "\n"


@pytest.mark.asyncio
async def test_results_repository_orders_export_deterministically() -> None:
    row = make_row()
    session = make_results_session([row])

    rows = await list_results(session)

    statement = session.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert rows == [row]
    assert "ORDER BY responses.submitted_at, responses.id" in compiled


async def request_export(
    session: AsyncSession,
    token: str | None,
    *,
    configured_token: str | None = EXPORT_TOKEN,
) -> httpx.Response:
    app = create_app(Settings(results_export_token=configured_token, _env_file=None))

    async def override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = override_session
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/results.csv", headers=headers)


@pytest.mark.asyncio
async def test_authorized_results_export_downloads_csv() -> None:
    row = make_row()
    session = make_results_session([row])

    response = await request_export(session, EXPORT_TOKEN)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == (
        'attachment; filename="conference-survey-results.csv"'
    )
    assert str(row.response_id) in response.text
    parsed_rows = list(csv.reader(io.StringIO(response.text), delimiter=CSV_DELIMITER))
    assert parsed_rows[0] == list(CSV_COLUMNS)
    assert len(parsed_rows[1]) == len(CSV_COLUMNS)


@pytest.mark.asyncio
@pytest.mark.parametrize("token", [None, "incorrect-organizer-token-value"])
async def test_results_export_rejects_unauthorized_requests(token: str | None) -> None:
    session = make_results_session([])

    response = await request_export(session, token)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized_results_access"
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_results_export_requires_secure_configuration() -> None:
    session = make_results_session([])

    response = await request_export(session, EXPORT_TOKEN, configured_token=None)

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "results_export_unavailable"
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_results_export_hides_database_failure_details() -> None:
    session = make_results_session([])
    session.execute.side_effect = SQLAlchemyError("password=must-not-leak")

    response = await request_export(session, EXPORT_TOKEN)

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "results_export_failed",
            "message": "Results could not be exported. Please try again.",
        }
    }
    assert "must-not-leak" not in response.text
