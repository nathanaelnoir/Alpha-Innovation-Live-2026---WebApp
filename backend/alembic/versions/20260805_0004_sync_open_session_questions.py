"""Synchronize question activity with open sessions.

Revision ID: 20260805_0004
Revises: 20260805_0003
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260805_0004"
down_revision: str | None = "20260805_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE questions AS question
            SET is_active = survey_session.is_open, updated_at = now()
            FROM survey_sessions AS survey_session
            WHERE question.session_id = survey_session.id
              AND question.is_active IS DISTINCT FROM survey_session.is_open
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE questions AS question
            SET is_active = (
                survey_session.is_open AND question.position = 1
            ), updated_at = now()
            FROM survey_sessions AS survey_session
            WHERE question.session_id = survey_session.id
            """
        )
    )
