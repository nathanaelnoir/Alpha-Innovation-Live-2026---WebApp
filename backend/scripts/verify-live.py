#!/usr/bin/env python3
"""Exercise the deployed API with a happy path or concurrent submission burst."""

import argparse
import asyncio
import csv
import io
import os
import uuid
from typing import Any

import httpx

from app.core.config import get_settings


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default=os.getenv("SURVEY_API_BASE_URL", "http://127.0.0.1:8000"),
    )
    parser.add_argument("--participants", type=int, default=1)
    parser.add_argument("--concurrency", type=int, default=50)
    return parser.parse_args()


def require_success(response: httpx.Response) -> Any:
    response.raise_for_status()
    return response.json()


async def verify(args: argparse.Namespace) -> None:
    if not 1 <= args.participants <= 1000:
        raise ValueError("--participants must be between 1 and 1000")
    if not 1 <= args.concurrency <= 100:
        raise ValueError("--concurrency must be between 1 and 100")

    settings = get_settings()
    export_secret = settings.results_export_token
    if export_secret is None:
        raise RuntimeError("RESULTS_EXPORT_TOKEN must be configured")
    organizer_headers = {"Authorization": f"Bearer {export_secret.get_secret_value()}"}
    title = f"Verification {uuid.uuid4()}"

    limits = httpx.Limits(
        max_connections=args.concurrency,
        max_keepalive_connections=args.concurrency,
    )
    timeout = httpx.Timeout(30.0)
    async with httpx.AsyncClient(
        base_url=args.base_url.rstrip("/"), limits=limits, timeout=timeout
    ) as client:
        require_success(await client.get("/health"))
        active_session_response = await client.get("/api/v1/sessions/active")
        if active_session_response.status_code not in {200, 404}:
            active_session_response.raise_for_status()
        previous_session_id = (
            active_session_response.json()["id"]
            if active_session_response.status_code == 200
            else None
        )
        verification_session_id: str | None = None

        try:
            session = require_success(
                await client.post(
                    "/api/v1/sessions",
                    headers=organizer_headers,
                    json={"title": title},
                )
            )
            verification_session_id = session["id"]
            question = require_success(
                await client.post(
                    "/api/v1/questions",
                    headers=organizer_headers,
                    json={
                        "session_id": verification_session_id,
                        "prompt": "Automated verification question",
                        "x_axis_label": "Left to right",
                        "y_axis_label": "Bottom to top",
                    },
                )
            )
            require_success(
                await client.put(
                    f"/api/v1/sessions/{verification_session_id}/open",
                    headers=organizer_headers,
                )
            )

            semaphore = asyncio.Semaphore(args.concurrency)

            async def submit(index: int) -> str:
                async with semaphore:
                    identity = require_success(
                        await client.post("/api/v1/participants")
                    )
                    participant_headers = {
                        "Authorization": f"Bearer {identity['participant_token']}"
                    }
                    coordinate = {
                        "x": index / max(args.participants - 1, 1),
                        "y": 1 - (index / max(args.participants - 1, 1)),
                    }
                    path = f"/api/v1/questions/{question['id']}/response"
                    first = require_success(
                        await client.put(
                            path, headers=participant_headers, json=coordinate
                        )
                    )
                    retry = require_success(
                        await client.put(
                            path, headers=participant_headers, json=coordinate
                        )
                    )
                    if first["response_id"] != retry["response_id"]:
                        raise AssertionError("retry created a duplicate response")
                    return identity["participant_id"]

            participant_ids = set(
                await asyncio.gather(
                    *(submit(index) for index in range(args.participants))
                )
            )
            export = await client.get("/api/v1/results.csv", headers=organizer_headers)
            export.raise_for_status()
            rows = [
                row
                for row in csv.DictReader(io.StringIO(export.text), delimiter=";")
                if row["session_title"] == title
            ]
            exported_participants = {row["participant_id"] for row in rows}
            if (
                len(rows) != args.participants
                or exported_participants != participant_ids
            ):
                raise AssertionError(
                    f"expected {args.participants} unique exported responses, "
                    f"got {len(rows)}"
                )
        finally:
            if verification_session_id is not None:
                require_success(
                    await client.put(
                        f"/api/v1/sessions/{verification_session_id}/close",
                        headers=organizer_headers,
                    )
                )
            if previous_session_id is not None:
                require_success(
                    await client.put(
                        f"/api/v1/sessions/{previous_session_id}/open",
                        headers=organizer_headers,
                    )
                )

    print(
        f"Verified {args.participants} participants, idempotent retries, "
        "and matching CSV rows."
    )


if __name__ == "__main__":
    asyncio.run(verify(parse_arguments()))
