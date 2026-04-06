import base64
import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta
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


def utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def build_session_expiration(issued_at: datetime | None = None) -> datetime:
    actual_issued_at = ensure_utc(issued_at or utc_now()).replace(microsecond=0)
    return actual_issued_at + timedelta(seconds=settings.session_ttl_seconds)


def create_access_token(
    *,
    user_id: int,
    user_type: str,
    username: str,
    issued_at: datetime | None = None,
) -> tuple[str, datetime]:
    actual_issued_at = ensure_utc(issued_at or utc_now()).replace(microsecond=0)
    expires_at = build_session_expiration(actual_issued_at)
    payload = json.dumps(
        {
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": int(actual_issued_at.timestamp()),
            "expires_at": int(expires_at.timestamp()),
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_bytes = f"{payload}.{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_bytes).decode("utf-8"), expires_at


def create_task_runtime_token(
    *,
    user_id: int,
    user_type: str,
    username: str,
    task_id: int,
    issued_at: datetime | None = None,
    ttl_seconds: int | None = None,
) -> tuple[str, datetime]:
    actual_issued_at = ensure_utc(issued_at or utc_now()).replace(microsecond=0)
    actual_ttl_seconds = max(int(ttl_seconds or settings.task_runtime_ttl_seconds), 30)
    expires_at = actual_issued_at + timedelta(seconds=actual_ttl_seconds)
    payload = json.dumps(
        {
            "scope": "task_runtime",
            "task_id": int(task_id),
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": int(actual_issued_at.timestamp()),
            "expires_at": int(expires_at.timestamp()),
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_bytes = f"{payload}.{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_bytes).decode("utf-8"), expires_at


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload, signature = decoded.rsplit(".", maxsplit=1)
        expected = hmac.new(
            settings.secret_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        parsed = json.loads(payload)
        user_id = int(parsed["user_id"])
        user_type = str(parsed["user_type"])
        username = str(parsed["username"])
        issued_at = datetime.fromtimestamp(int(parsed["issued_at"]), tz=UTC)
        expires_at = datetime.fromtimestamp(int(parsed["expires_at"]), tz=UTC)
        return {
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": issued_at,
            "expires_at": expires_at,
        }
    except Exception:
        return None


def decode_task_runtime_token(token: str) -> dict[str, Any] | None:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload, signature = decoded.rsplit(".", maxsplit=1)
        expected = hmac.new(
            settings.secret_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        parsed = json.loads(payload)
        if str(parsed.get("scope") or "") != "task_runtime":
            return None
        user_id = int(parsed["user_id"])
        user_type = str(parsed["user_type"])
        username = str(parsed["username"])
        task_id = int(parsed["task_id"])
        issued_at = datetime.fromtimestamp(int(parsed["issued_at"]), tz=UTC)
        expires_at = datetime.fromtimestamp(int(parsed["expires_at"]), tz=UTC)
        return {
            "scope": "task_runtime",
            "task_id": task_id,
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": issued_at,
            "expires_at": expires_at,
        }
    except Exception:
        return None


def is_access_token_expired(token_data: dict[str, Any], *, now: datetime | None = None) -> bool:
    expires_at = token_data.get("expires_at")
    if not isinstance(expires_at, datetime):
        return True
    return ensure_utc(expires_at) <= ensure_utc(now or utc_now())
