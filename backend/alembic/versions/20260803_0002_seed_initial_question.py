"""Seed the initial conference question.

Revision ID: 20260803_0002
Revises: 20260803_0001
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260803_0002"
down_revision: str | None = "20260803_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INITIAL_QUESTION_ID = "a9bb82a0-1b7f-5254-a761-8104f701b098"
INITIAL_PROMPT = "How are you experiencing this session right now?"
INITIAL_X_AXIS_LABEL = "Engagement (low to high)"
INITIAL_Y_AXIS_LABEL = "Understanding (low to high)"


def upgrade() -> None:
    statement = sa.text(
        """
        INSERT INTO questions (
            id,
            prompt,
            x_axis_label,
            y_axis_label,
            is_active,
            created_at,
            updated_at
        )
        SELECT
            CAST(:question_id AS UUID),
            :prompt,
            :x_axis_label,
            :y_axis_label,
            NOT EXISTS (
                SELECT 1 FROM questions WHERE is_active IS TRUE
            ),
            now(),
            now()
        ON CONFLICT (id) DO NOTHING
        """
    ).bindparams(
        question_id=INITIAL_QUESTION_ID,
        prompt=INITIAL_PROMPT,
        x_axis_label=INITIAL_X_AXIS_LABEL,
        y_axis_label=INITIAL_Y_AXIS_LABEL,
    )
    op.execute(statement)


def downgrade() -> None:
    statement = sa.text(
        "DELETE FROM questions WHERE id = CAST(:question_id AS UUID)"
    ).bindparams(question_id=INITIAL_QUESTION_ID)
    op.execute(statement)
