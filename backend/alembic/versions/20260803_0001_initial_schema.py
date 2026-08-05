"""Create participants, questions, and responses.

Revision ID: 20260803_0001
Revises:
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260803_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_participants"),
    )
    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("x_axis_label", sa.Text(), nullable=True),
        sa.Column("y_axis_label", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
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
        sa.CheckConstraint(
            "length(btrim(prompt)) > 0",
            name=op.f("ck_questions_prompt_not_blank"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_questions"),
    )
    op.create_table(
        "responses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("x", sa.Double(), nullable=False),
        sa.Column("y", sa.Double(), nullable=False),
        sa.Column(
            "submitted_at",
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
        sa.CheckConstraint("x >= 0 AND x <= 1", name=op.f("ck_responses_x_normalized")),
        sa.CheckConstraint("y >= 0 AND y <= 1", name=op.f("ck_responses_y_normalized")),
        sa.ForeignKeyConstraint(
            ["participant_id"],
            ["participants.id"],
            name="fk_responses_participant_id_participants",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_responses_question_id_questions",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_responses"),
        sa.UniqueConstraint(
            "participant_id",
            "question_id",
            name="uq_responses_participant_question",
        ),
    )
    op.create_index(
        "ix_responses_participant_id", "responses", ["participant_id"], unique=False
    )
    op.create_index(
        "ix_responses_question_id", "responses", ["question_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_responses_question_id", table_name="responses")
    op.drop_index("ix_responses_participant_id", table_name="responses")
    op.drop_table("responses")
    op.drop_table("questions")
    op.drop_table("participants")
