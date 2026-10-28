import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

# 新密码哈希方案：passlib pbkdf2-sha256，迭代次数与旧手写实现保持同等强度（120000 次）。
# 注意：passlib 1.7.4 在 Python 3.12 下可能触发 CryptographyDeprecationWarning，属已知噪音，
# 不为此引入 bcrypt（见迁移说明）。
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], pbkdf2_sha256__rounds=120_000, deprecated="auto")

# 旧手写哈希参数（存量数据兼容用）：PBKDF2-SHA256，12 万次迭代，盐 16 字节。
_LEGACY_PBKDF2_ITERATIONS = 120_000


def _legacy_hash_password(password: str, salt: bytes) -> str:
    """旧手写哈希格式：``hex(salt):hex(digest)``，仅供存量数据校验回退使用。"""
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _LEGACY_PBKDF2_ITERATIONS)
    return f"{salt.hex()}:{digest.hex()}"


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    # 兼容保留：显式传入 salt 时按旧手写格式生成（旧 verify_password 回退路径依赖同一实现）。
    if salt is not None:
        return _legacy_hash_password(password, salt)
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    # 先按 passlib 新格式（$pbkdf2-sha256$...）校验；不是 passlib 格式时回退旧 hex(salt):hex(digest) 格式，
    # 保证存量数据库中的旧哈希仍可验证通过。
    if password_hash:
        try:
            if pwd_context.identify(password_hash) is not None:
                return pwd_context.verify(password, password_hash)
        except Exception:
            pass
    try:
        salt_hex, digest_hex = password_hash.split(":", maxsplit=1)
        recalculated = _legacy_hash_password(password, bytes.fromhex(salt_hex))
        return hmac.compare_digest(recalculated.split(":", maxsplit=1)[1], digest_hex)
    except Exception:
        return False


def utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def build_session_expiration(issued_at: datetime | None = None) -> datetime:
    actual_issued_at = ensure_utc(issued_at or utc_now()).replace(microsecond=0)
    return actual_issued_at + timedelta(seconds=settings.session_ttl_seconds)


def _encode_token(payload: dict[str, Any]) -> str:
    """新令牌格式：PyJWT HS256 签名的紧凑 JWT。"""
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """按 PyJWT 新格式解码。只校验签名，不校验过期（过期统一由 is_access_token_expired 判定，
    保证过期令牌仍能被解出并返回 401 "Session expired"）。"""
    try:
        parsed = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            options={"verify_exp": False},
        )
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _decode_legacy_token_payload(token: str) -> dict[str, Any] | None:
    """旧手写令牌格式回退解码：``base64url(payload_json.signature_hex)``，HMAC-SHA256 签名。
    存量客户端持有的旧令牌在 TTL 内仍可通过此路径解码。"""
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
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _decode_token_payload(token: str) -> dict[str, Any] | None:
    """先按新格式（PyJWT）解，失败再回退旧格式（手写 base64url+HMAC）。"""
    parsed = _decode_jwt_payload(token)
    if parsed is None:
        parsed = _decode_legacy_token_payload(token)
    return parsed


def _token_datetime(payload: dict[str, Any], field: str, standard_field: str) -> datetime:
    """优先取业务字段（issued_at/expires_at），缺失时回退标准 JWT 字段（iat/exp）。"""
    value = payload.get(field, payload.get(standard_field))
    return datetime.fromtimestamp(int(value), tz=UTC)


def create_access_token(
    *,
    user_id: int,
    user_type: str,
    username: str,
    issued_at: datetime | None = None,
) -> tuple[str, datetime]:
    actual_issued_at = ensure_utc(issued_at or utc_now()).replace(microsecond=0)
    expires_at = build_session_expiration(actual_issued_at)
    token = _encode_token(
        {
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": int(actual_issued_at.timestamp()),
            "expires_at": int(expires_at.timestamp()),
            "iat": int(actual_issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
    )
    return token, expires_at


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
    token = _encode_token(
        {
            "scope": "task_runtime",
            "task_id": int(task_id),
            "user_id": user_id,
            "user_type": user_type,
            "username": username,
            "issued_at": int(actual_issued_at.timestamp()),
            "expires_at": int(expires_at.timestamp()),
            "iat": int(actual_issued_at.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
    )
    return token, expires_at


def decode_access_token(token: str) -> dict[str, Any] | None:
    parsed = _decode_token_payload(token)
    if parsed is None:
        return None
    try:
        user_id = int(parsed["user_id"])
        user_type = str(parsed["user_type"])
        username = str(parsed["username"])
        issued_at = _token_datetime(parsed, "issued_at", "iat")
        expires_at = _token_datetime(parsed, "expires_at", "exp")
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
    parsed = _decode_token_payload(token)
    if parsed is None:
        return None
    try:
        if str(parsed.get("scope") or "") != "task_runtime":
            return None
        user_id = int(parsed["user_id"])
        user_type = str(parsed["user_type"])
        username = str(parsed["username"])
        task_id = int(parsed["task_id"])
        issued_at = _token_datetime(parsed, "issued_at", "iat")
        expires_at = _token_datetime(parsed, "expires_at", "exp")
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
