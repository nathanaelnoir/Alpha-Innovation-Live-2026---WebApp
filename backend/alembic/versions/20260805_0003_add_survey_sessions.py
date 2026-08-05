"""Add ordered, admin-controlled survey sessions.

Revision ID: 20260805_0003
Revises: 20260803_0002
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260805_0003"
down_revision: str | None = "20260803_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INITIAL_SESSION_ID = "4d5d7c13-38e8-5a8e-9c4c-e0ad7a46dc4a"


def upgrade() -> None:
    op.create_table(
        "survey_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("is_open", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "length(btrim(title)) > 0",
            name=op.f("ck_survey_sessions_title_not_blank"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_survey_sessions")),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO survey_sessions (id, title, is_open, opened_at)
            VALUES (
                CAST(:session_id AS UUID),
                'Initial session',
                EXISTS (SELECT 1 FROM questions WHERE is_active IS TRUE),
                CASE
                    WHEN EXISTS (SELECT 1 FROM questions WHERE is_active IS TRUE)
                    THEN now()
                    ELSE NULL
                END
            )
            """
        ).bindparams(session_id=INITIAL_SESSION_ID)
    )
    op.add_column(
        "questions",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("questions", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        sa.text(
            """
            WITH ordered AS (
                SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
                FROM questions
            )
            UPDATE questions AS question
            SET session_id = CAST(:session_id AS UUID), position = ordered.position
            FROM ordered
            WHERE question.id = ordered.id
            """
        ).bindparams(session_id=INITIAL_SESSION_ID)
    )
    op.alter_column("questions", "session_id", nullable=False)
    op.alter_column("questions", "position", nullable=False)
    op.create_foreign_key(
        op.f("fk_questions_session_id_survey_sessions"),
        "questions",
        "survey_sessions",
        ["session_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_questions_session_id"), "questions", ["session_id"], unique=False
    )
    op.create_unique_constraint(
        "uq_questions_session_position", "questions", ["session_id", "position"]
    )
    op.create_check_constraint(
        op.f("ck_questions_position_positive"), "questions", "position > 0"
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_questions_position_positive"), "questions", type_="check"
    )
    op.drop_constraint("uq_questions_session_position", "questions", type_="unique")
    op.drop_index(op.f("ix_questions_session_id"), table_name="questions")
    op.drop_constraint(
        op.f("fk_questions_session_id_survey_sessions"),
        "questions",
        type_="foreignkey",
    )
    op.drop_column("questions", "position")
    op.drop_column("questions", "session_id")
    op.drop_table("survey_sessions")
