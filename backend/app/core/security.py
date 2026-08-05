import base64
import binascii
import hashlib
import hmac
import uuid

from app.core.exceptions import (
    InvalidParticipantTokenError,
    ParticipantTokenConfigurationError,
)

TOKEN_VERSION = "v1"
MINIMUM_SECRET_LENGTH = 32


def validate_participant_token_secret(secret: str) -> None:
    if len(secret) < MINIMUM_SECRET_LENGTH:
        raise ParticipantTokenConfigurationError


def sign_participant_token(participant_id: uuid.UUID, secret: str) -> str:
    """Create a versioned, URL-safe token containing a signed participant UUID."""

    validate_participant_token_secret(secret)
    payload = _encode_base64(participant_id.bytes)
    signed_value = f"{TOKEN_VERSION}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed_value.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{signed_value}.{_encode_base64(signature)}"


def verify_participant_token(token: str, secret: str) -> uuid.UUID:
    """Verify a participant token and return the UUID it securely represents."""

    validate_participant_token_secret(secret)
    try:
        version, payload, encoded_signature = token.split(".")
        if version != TOKEN_VERSION:
            raise InvalidParticipantTokenError

        signed_value = f"{version}.{payload}"
        expected_signature = hmac.new(
            secret.encode("utf-8"), signed_value.encode("ascii"), hashlib.sha256
        ).digest()
        supplied_signature = _decode_base64(encoded_signature)
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise InvalidParticipantTokenError

        participant_bytes = _decode_base64(payload)
        return uuid.UUID(bytes=participant_bytes)
    except (ValueError, UnicodeError, binascii.Error) as error:
        raise InvalidParticipantTokenError from error


def _encode_base64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_base64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.b64decode(value + padding, altchars=b"-_", validate=True)
