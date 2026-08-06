import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("length(btrim(prompt)) > 0", name="prompt_not_blank"),
        CheckConstraint(
            "prompt_de IS NULL OR length(btrim(prompt_de)) > 0",
            name="prompt_de_not_blank",
        ),
        CheckConstraint(
            "prompt_it IS NULL OR length(btrim(prompt_it)) > 0",
            name="prompt_it_not_blank",
        ),
        CheckConstraint("position > 0", name="position_positive"),
        UniqueConstraint(
            "session_id", "position", name="uq_questions_session_position"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("survey_sessions.id"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    x_axis_label: Mapped[str | None] = mapped_column(Text)
    y_axis_label: Mapped[str | None] = mapped_column(Text)
    prompt_de: Mapped[str | None] = mapped_column(Text)
    x_axis_label_de: Mapped[str | None] = mapped_column(Text)
    y_axis_label_de: Mapped[str | None] = mapped_column(Text)
    prompt_it: Mapped[str | None] = mapped_column(Text)
    x_axis_label_it: Mapped[str | None] = mapped_column(Text)
    y_axis_label_it: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
