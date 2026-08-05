from typing import cast

from sqlalchemy import CheckConstraint, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models import Participant, Question, Response, SurveySession


def test_required_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {
        "participants",
        "questions",
        "responses",
        "survey_sessions",
    }


def test_primary_keys_use_postgresql_uuid() -> None:
    for model in (Participant, Question, Response, SurveySession):
        assert isinstance(model.__table__.c.id.type, UUID)


def test_response_constraints_and_indexes_are_present() -> None:
    table = cast(Table, Response.__table__)
    constraint_names = {constraint.name for constraint in table.constraints}
    index_names = {index.name for index in table.indexes}

    assert "ck_responses_x_normalized" in constraint_names
    assert "ck_responses_y_normalized" in constraint_names
    assert "uq_responses_participant_question" in constraint_names
    assert "ix_responses_participant_id" in index_names
    assert "ix_responses_question_id" in index_names
    assert any(isinstance(item, CheckConstraint) for item in table.constraints)
    assert any(isinstance(item, UniqueConstraint) for item in table.constraints)
