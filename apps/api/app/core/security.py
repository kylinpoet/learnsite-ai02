import base64
import hashlib
import hmac
import os
from typing import Any

from app.core.config import settings


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    actual_salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), actual_salt, 120_000)
    return f"{actual_salt.hex()}:{digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt_hex, digest_hex = password_hash.split(":", maxsplit=1)
    recalculated = hash_password(password, salt=bytes.fromhex(salt_hex))
    return hmac.compare_digest(recalculated.split(":", maxsplit=1)[1], digest_hex)


def create_access_token(*, user_id: int, user_type: str, username: str) -> str:
    payload = f"{user_id}:{user_type}:{username}"
    signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_bytes = f"{payload}:{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_bytes).decode("utf-8")


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload, signature = decoded.rsplit(":", maxsplit=1)
        expected = hmac.new(
            settings.secret_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        user_id, user_type, username = payload.split(":", maxsplit=2)
        return {
            "user_id": int(user_id),
            "user_type": user_type,
            "username": username,
        }
    except Exception:
        return None
