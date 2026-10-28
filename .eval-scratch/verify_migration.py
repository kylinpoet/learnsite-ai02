# -*- coding: utf-8 -*-
"""迁移兼容性单元验证脚本（临时，跑完即删）。
覆盖：
1. 新格式令牌（PyJWT HS256）创建后可被 decode_access_token/decode_task_runtime_token 解出；
2. 手工构造的旧格式令牌（base64url(json.hmac_hex)）仍可被回退路径解出；
3. 旧格式令牌签名被篡改时 decode 返回 None；
4. passlib 新哈希可被 verify_password 验证；
5. 手工构造的旧格式哈希 hex(salt):hex(digest) 可被 verify_password 回退验证；
6. 错误密码验证返回 False；
7. access token 与 task_runtime token 的字段契约（返回 dict 的键）与调用方期望一致。
"""
import base64
import hashlib
import hmac
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_task_runtime_token,
    decode_access_token,
    decode_task_runtime_token,
    hash_password,
    verify_password,
)

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name} {detail}")
    if not cond:
        failures.append(name)


# --- 1. 新格式 access token 往返 ---
issued = datetime.now(UTC).replace(microsecond=0)
token, expires_at = create_access_token(user_id=1, user_type="student", username="70101", issued_at=issued)
check("new access token is compact JWT (two dots)", token.count(".") == 2)
data = decode_access_token(token)
check("new access token decodes", data is not None)
if data:
    check("access fields", set(data.keys()) == {"user_id", "user_type", "username", "issued_at", "expires_at"})
    check("access values", data["user_id"] == 1 and data["user_type"] == "student" and data["username"] == "70101")
    check("issued_at roundtrip", data["issued_at"] == issued, f"{data['issued_at']} vs {issued}")
    check("expires_at roundtrip", data["expires_at"] == expires_at)

# --- 2. 旧格式 access token 回退 ---
legacy_payload = json.dumps(
    {"user_id": 2, "user_type": "staff", "username": "t1",
     "issued_at": int(issued.timestamp()), "expires_at": int((issued + timedelta(hours=2)).timestamp())},
    separators=(",", ":"), sort_keys=True,
)
legacy_sig = hmac.new(settings.secret_key.encode(), legacy_payload.encode(), hashlib.sha256).hexdigest()
legacy_token = base64.urlsafe_b64encode(f"{legacy_payload}.{legacy_sig}".encode()).decode()
legacy_data = decode_access_token(legacy_token)
check("legacy access token decodes via fallback", legacy_data is not None)
if legacy_data:
    check("legacy access values", legacy_data["user_id"] == 2 and legacy_data["username"] == "t1")

# --- 3. 篡改签名的旧令牌 ---
tampered_payload = json.dumps(
    {"user_id": 3, "user_type": "staff", "username": "t1",
     "issued_at": int(issued.timestamp()), "expires_at": int((issued + timedelta(hours=2)).timestamp())},
    separators=(",", ":"), sort_keys=True,
)
tampered_token = base64.urlsafe_b64encode(f"{tampered_payload}.{legacy_sig}".encode()).decode()
check("tampered legacy token rejected", decode_access_token(tampered_token) is None)
check("garbage token rejected", decode_access_token("not-a-token") is None)

# --- 4. 新格式 task runtime token 往返 + scope 校验 ---
rt_token, rt_expires = create_task_runtime_token(
    user_id=4, user_type="student", username="70102", task_id=83,
    issued_at=issued, ttl_seconds=300,
)
rt_data = decode_task_runtime_token(rt_token)
check("new runtime token decodes", rt_data is not None)
if rt_data:
    check("runtime fields", set(rt_data.keys()) == {"scope", "task_id", "user_id", "user_type", "username", "issued_at", "expires_at"})
    check("runtime values", rt_data["scope"] == "task_runtime" and rt_data["task_id"] == 83 and rt_data["user_id"] == 4)
    check("runtime expires", rt_data["expires_at"] == rt_expires)
# access token 不是 runtime token
check("access token not accepted as runtime", decode_task_runtime_token(token) is None)

# --- 5. 旧格式 task runtime token 回退 ---
legacy_rt_payload = json.dumps(
    {"scope": "task_runtime", "task_id": 57, "user_id": 5, "user_type": "student", "username": "70103",
     "issued_at": int(issued.timestamp()), "expires_at": int((issued + timedelta(minutes=5)).timestamp())},
    separators=(",", ":"), sort_keys=True,
)
legacy_rt_sig = hmac.new(settings.secret_key.encode(), legacy_rt_payload.encode(), hashlib.sha256).hexdigest()
legacy_rt_token = base64.urlsafe_b64encode(f"{legacy_rt_payload}.{legacy_rt_sig}".encode()).decode()
legacy_rt_data = decode_task_runtime_token(legacy_rt_token)
check("legacy runtime token decodes via fallback", legacy_rt_data is not None)
if legacy_rt_data:
    check("legacy runtime values", legacy_rt_data["task_id"] == 57 and legacy_rt_data["user_id"] == 5)

# --- 6. 密码哈希：新 passlib 格式 ---
h = hash_password("secret-pw")
check("new hash is passlib pbkdf2_sha256", h.startswith("$pbkdf2-sha256$"))
check("new hash verifies", verify_password("secret-pw", h) is True)
check("new hash wrong password", verify_password("wrong", h) is False)

# --- 7. 密码哈希：旧 hex(salt):hex(digest) 格式 ---
salt = b"\x01" * 16
old_digest = hashlib.pbkdf2_hmac("sha256", b"secret-pw", salt, 120_000)
old_hash = f"{salt.hex()}:{old_digest.hex()}"
check("old hash is not passlib format", not old_hash.startswith("$"))
check("old hash verifies via fallback", verify_password("secret-pw", old_hash) is True)
check("old hash wrong password", verify_password("wrong", old_hash) is False)

# --- 8. 显式 salt 仍生成旧格式（签名兼容保留）---
explicit = hash_password("abc", salt=salt)
check("explicit salt produces legacy format", explicit == old_hash.replace("secret-pw", "") or explicit.split(":")[0] == salt.hex())

# --- 9. 异常输入 ---
check("empty hash", verify_password("x", "") is False)
check("malformed hash", verify_password("x", "zzzz") is False)
check("empty token", decode_access_token("") is None)

print()
if failures:
    print(f"FAILED: {len(failures)} -> {failures}")
    sys.exit(1)
print("ALL CHECKS PASSED")
