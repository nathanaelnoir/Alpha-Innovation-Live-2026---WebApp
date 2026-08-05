import csv
import io
import logging
import math
import re

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResultsExportError
from app.repositories.results import ResultRow, list_results

logger = logging.getLogger(__name__)

CSV_DELIMITER = ";"
CSV_COLUMNS = (
    "response_id",
    "participant_id",
    "session_title",
    "question",
    "x",
    "y",
    "x_label",
    "y_label",
    "x_label_percentage",
    "y_label_percentage",
    "submitted_at",
    "updated_at",
)


async def export_results_csv(session: AsyncSession) -> str:
    try:
        rows = await list_results(session)
    except SQLAlchemyError as error:
        logger.error("results_export_failed")
        raise ResultsExportError from error
    return build_results_csv(rows)


def build_results_csv(rows: list[ResultRow]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=CSV_DELIMITER, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for row in rows:
        writer.writerow(
            (
                row.response_id,
                row.participant_id,
                row.session_title,
                row.question,
                row.x,
                row.y,
                readable_axis_label(row.x_axis_label, "Horizontal"),
                readable_axis_label(row.y_axis_label, "Vertical"),
                display_percentage(row.x),
                display_percentage(row.y),
                row.submitted_at.isoformat(),
                row.updated_at.isoformat(),
            )
        )
    return output.getvalue()


def readable_axis_label(label: str | None, fallback: str) -> str:
    """Match the participant frontend's shortened axis-label display."""
    if label is None:
        return fallback
    cleaned = re.sub(r"\s*\([^)]*\)", "", label).strip()
    return cleaned or fallback


def display_percentage(value: float) -> str:
    """Match JavaScript Math.round for normalized non-negative coordinates."""
    return f"{math.floor(value * 100 + 0.5)}%"
