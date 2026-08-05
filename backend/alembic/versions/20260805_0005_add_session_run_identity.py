"""Add a new response identity for every session opening.

Revision ID: 20260805_0005
Revises: 20260805_0004
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260805_0005"
down_revision: str | None = "20260805_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "survey_sessions",
        sa.Column("current_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE survey_sessions
            SET current_run_id = CAST(md5(id::text || '-initial-run') AS UUID)
            """
        )
    )
    op.alter_column("survey_sessions", "current_run_id", nullable=False)

    op.add_column(
        "responses",
        sa.Column("session_run_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE responses AS response
            SET session_run_id = survey_session.current_run_id
            FROM questions AS question
            JOIN survey_sessions AS survey_session
              ON survey_session.id = question.session_id
            WHERE response.question_id = question.id
            """
        )
    )
    op.alter_column("responses", "session_run_id", nullable=False)
    op.drop_constraint("uq_responses_participant_question", "responses", type_="unique")
    op.create_unique_constraint(
        "uq_responses_participant_question_run",
        "responses",
        ["participant_id", "question_id", "session_run_id"],
    )
    op.create_index(
        op.f("ix_responses_session_run_id"),
        "responses",
        ["session_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_responses_session_run_id"), table_name="responses")
    op.drop_constraint(
        "uq_responses_participant_question_run", "responses", type_="unique"
    )
    op.create_unique_constraint(
        "uq_responses_participant_question",
        "responses",
        ["participant_id", "question_id"],
    )
    op.drop_column("responses", "session_run_id")
    op.drop_column("survey_sessions", "current_run_id")
