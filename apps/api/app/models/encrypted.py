from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text, types

logger = logging.getLogger(__name__)

_KEY_INFO = b"learnsite.at-rest-secret.v1"
_FERNET_PREFIX = "gAAAA"


def _fernet() -> Fernet:
    from app.core.config import settings

    secret = (settings.secret_key or "").encode("utf-8")
    digest = hashlib.pbkdf2_hmac("sha256", secret, _KEY_INFO, 120_000)
    return Fernet(base64.urlsafe_b64encode(digest))


def looks_encrypted(value: str) -> bool:
    return value.startswith(_FERNET_PREFIX)


def encrypt_secret(plaintext: str) -> str:
    if not plaintext or looks_encrypted(plaintext):
        return plaintext
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value or not looks_encrypted(value):
        return value
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("[SECRET_CRYPTO] ciphertext_invalid_falling_back_to_raw_value")
        return value


class EncryptedText(types.TypeDecorator):
    """Fernet-encrypted text column for at-rest secrets.

    Values are encrypted on bind and decrypted on fetch. Reads fall back to
    the raw stored value so plaintext rows written before this column type
    existed keep working until they are re-saved (see init_db migration).
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_secret(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_secret(str(value))
