import uuid
from collections.abc import Callable

import pytest

from app.core.exceptions import (
    InvalidParticipantTokenError,
    ParticipantTokenConfigurationError,
)
from app.core.security import sign_participant_token, verify_participant_token

SECRET = "participant-test-secret-with-32-characters"


def test_signed_token_resolves_to_original_participant() -> None:
    participant_id = uuid.uuid4()

    token = sign_participant_token(participant_id, SECRET)

    assert verify_participant_token(token, SECRET) == participant_id
    assert str(participant_id) not in token


@pytest.mark.parametrize(
    "token_transform",
    [
        lambda token: f"{token[:-1]}{'A' if token[-1] != 'A' else 'B'}",
        lambda token: token.replace("v1.", "v2.", 1),
        lambda _token: "malformed",
    ],
)
def test_invalid_or_altered_token_is_rejected(
    token_transform: Callable[[str], str],
) -> None:
    participant_id = uuid.uuid4()
    token = sign_participant_token(participant_id, SECRET)

    transformed = token_transform(token)

    with pytest.raises(InvalidParticipantTokenError):
        verify_participant_token(transformed, SECRET)


def test_token_signed_with_different_secret_is_rejected() -> None:
    token = sign_participant_token(uuid.uuid4(), SECRET)

    with pytest.raises(InvalidParticipantTokenError):
        verify_participant_token(token, "different-test-secret-with-32-characters")


def test_weak_signing_secret_is_rejected() -> None:
    with pytest.raises(ParticipantTokenConfigurationError):
        sign_participant_token(uuid.uuid4(), "too-short")
