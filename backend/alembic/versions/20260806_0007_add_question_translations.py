"""Add German and Italian question translations.

Revision ID: 20260806_0007
Revises: 20260805_0006
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260806_0007"
down_revision: str | None = "20260805_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INITIAL_QUESTION_ID = "a9bb82a0-1b7f-5254-a761-8104f701b098"


def upgrade() -> None:
    for column_name in (
        "prompt_de",
        "x_axis_label_de",
        "y_axis_label_de",
        "prompt_it",
        "x_axis_label_it",
        "y_axis_label_it",
    ):
        op.add_column("questions", sa.Column(column_name, sa.Text(), nullable=True))

    op.create_check_constraint(
        op.f("ck_questions_prompt_de_not_blank"),
        "questions",
        "prompt_de IS NULL OR length(btrim(prompt_de)) > 0",
    )
    op.create_check_constraint(
        op.f("ck_questions_prompt_it_not_blank"),
        "questions",
        "prompt_it IS NULL OR length(btrim(prompt_it)) > 0",
    )

    op.execute(
        sa.text(
            """
            UPDATE questions
            SET prompt_de = :prompt_de,
                x_axis_label_de = :x_axis_label_de,
                y_axis_label_de = :y_axis_label_de,
                prompt_it = :prompt_it,
                x_axis_label_it = :x_axis_label_it,
                y_axis_label_it = :y_axis_label_it
            WHERE id = CAST(:question_id AS UUID)
            """
        ).bindparams(
            question_id=INITIAL_QUESTION_ID,
            prompt_de="Wie erleben Sie diese Sitzung gerade?",
            x_axis_label_de="Engagement (niedrig bis hoch)",
            y_axis_label_de="Verständnis (niedrig bis hoch)",
            prompt_it="Come sta vivendo questa sessione in questo momento?",
            x_axis_label_it="Coinvolgimento (basso-alto)",
            y_axis_label_it="Comprensione (bassa-alta)",
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_questions_prompt_it_not_blank"), "questions", type_="check"
    )
    op.drop_constraint(
        op.f("ck_questions_prompt_de_not_blank"), "questions", type_="check"
    )
    for column_name in (
        "y_axis_label_it",
        "x_axis_label_it",
        "prompt_it",
        "y_axis_label_de",
        "x_axis_label_de",
        "prompt_de",
    ):
        op.drop_column("questions", column_name)
