"""Translate the existing conference questions.

Revision ID: 20260806_0008
Revises: 20260806_0007
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260806_0008"
down_revision: str | None = "20260806_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

QUESTION_TRANSLATIONS = (
    {
        "prompt": "How would AI agents influence modern leadership?",
        "prompt_de": "Wie würden KI-Agenten moderne Führung beeinflussen?",
        "x_axis_label_de": "Effizienz (niedrig bis hoch)",
        "y_axis_label_de": "Personalisierung (niedrig bis hoch)",
        "prompt_it": (
            "In che modo gli agenti di IA influenzerebbero la leadership moderna?"
        ),
        "x_axis_label_it": "Efficienza (bassa-alta)",
        "y_axis_label_it": "Personalizzazione (bassa-alta)",
    },
    {
        "prompt": (
            "How does the integration of AI-driven tools in healthcare influence "
            "the human experience?"
        ),
        "prompt_de": (
            "Wie beeinflusst die Integration KI-gestützter Werkzeuge im "
            "Gesundheitswesen die menschliche Erfahrung?"
        ),
        "x_axis_label_de": "Komfort (niedrig bis hoch)",
        "y_axis_label_de": "Effizienz (niedrig bis hoch)",
        "prompt_it": (
            "In che modo l'integrazione di strumenti basati sull'IA "
            "nell'assistenza sanitaria influenza l'esperienza umana?"
        ),
        "x_axis_label_it": "Comfort (basso-alto)",
        "y_axis_label_it": "Efficienza (bassa-alta)",
    },
)


def upgrade() -> None:
    statement = sa.text(
        """
        UPDATE questions
        SET prompt_de = :prompt_de,
            x_axis_label_de = :x_axis_label_de,
            y_axis_label_de = :y_axis_label_de,
            prompt_it = :prompt_it,
            x_axis_label_it = :x_axis_label_it,
            y_axis_label_it = :y_axis_label_it
        WHERE prompt = :prompt
        """
    )
    for translation in QUESTION_TRANSLATIONS:
        op.execute(statement.bindparams(**translation))


def downgrade() -> None:
    statement = sa.text(
        """
        UPDATE questions
        SET prompt_de = NULL,
            x_axis_label_de = NULL,
            y_axis_label_de = NULL,
            prompt_it = NULL,
            x_axis_label_it = NULL,
            y_axis_label_it = NULL
        WHERE prompt = :prompt
          AND prompt_de = :prompt_de
          AND prompt_it = :prompt_it
        """
    )
    for translation in QUESTION_TRANSLATIONS:
        op.execute(
            statement.bindparams(
                prompt=translation["prompt"],
                prompt_de=translation["prompt_de"],
                prompt_it=translation["prompt_it"],
            )
        )
