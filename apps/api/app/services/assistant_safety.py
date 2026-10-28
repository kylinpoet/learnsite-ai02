from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CompanionConversation, CompanionMessage, SystemSetting, User

ASSISTANT_STUDENT_DAILY_LIMIT_KEY = "assistant_student_daily_message_limit"
ASSISTANT_BLOCKED_KEYWORDS_KEY = "assistant_blocked_keywords"

DEFAULT_STUDENT_DAILY_MESSAGE_LIMIT = 50
MAX_STUDENT_DAILY_MESSAGE_LIMIT = 500

DEFAULT_BLOCKED_KEYWORDS: dict[str, dict[str, Any]] = {
    "violence": {
        "label": "暴力自残",
        "enabled": True,
        "keywords": ["自杀", "自残", "伤害他人", "爆炸制作", "武器制作"],
    },
    "porn": {
        "label": "色情低俗",
        "enabled": True,
        "keywords": ["色情", "裸体", "成人视频"],
    },
    "jailbreak": {
        "label": "越狱提示词",
        "enabled": True,
        "keywords": ["忽略前面", "ignore previous", "无限制模式", "扮演无道德", "DAN 模式"],
    },
    "cheat": {
        "label": "学业作弊",
        "enabled": False,
        "keywords": ["完整答案", "直接帮我做", "帮我写完整代码"],
    },
}


def sanitize_blocked_keywords(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        return {key: dict(value) for key, value in DEFAULT_BLOCKED_KEYWORDS.items()}

    sanitized: dict[str, dict[str, Any]] = {}
    for category, item in raw.items():
        if not isinstance(category, str) or not category.strip():
            continue
        category_key = category.strip()[:40]
        if not isinstance(item, dict):
            continue

        label = str(item.get("label") or category_key).strip()[:40] or category_key
        enabled = bool(item.get("enabled", False))
        raw_keywords = item.get("keywords")
        if not isinstance(raw_keywords, list):
            raw_keywords = []

        keywords: list[str] = []
        seen: set[str] = set()
        for keyword in raw_keywords:
            normalized = str(keyword).strip()[:100]
            if not normalized or normalized.lower() in seen:
                continue
            seen.add(normalized.lower())
            keywords.append(normalized)
            if len(keywords) >= 100:
                break

        sanitized[category_key] = {"label": label, "enabled": enabled, "keywords": keywords}
    return sanitized


def read_assistant_safety_settings(db: Session) -> dict[str, Any]:
    limit_value = DEFAULT_STUDENT_DAILY_MESSAGE_LIMIT
    keywords_value = {key: dict(value) for key, value in DEFAULT_BLOCKED_KEYWORDS.items()}

    rows = db.scalars(
        select(SystemSetting).where(
            SystemSetting.setting_key.in_(
                (ASSISTANT_STUDENT_DAILY_LIMIT_KEY, ASSISTANT_BLOCKED_KEYWORDS_KEY)
            )
        )
    ).all()

    for row in rows:
        if row.setting_key == ASSISTANT_STUDENT_DAILY_LIMIT_KEY:
            try:
                parsed = int((row.setting_value or "").strip())
            except (TypeError, ValueError):
                continue
            if 0 <= parsed <= MAX_STUDENT_DAILY_MESSAGE_LIMIT:
                limit_value = parsed
        elif row.setting_key == ASSISTANT_BLOCKED_KEYWORDS_KEY:
            try:
                parsed = json.loads(row.setting_value or "{}")
            except json.JSONDecodeError:
                continue
            keywords_value = sanitize_blocked_keywords(parsed) or keywords_value

    return {
        "student_daily_message_limit": limit_value,
        "blocked_keywords": keywords_value,
    }


def write_assistant_safety_settings(
    db: Session,
    *,
    student_daily_message_limit: int,
    blocked_keywords: dict[str, Any],
) -> None:
    if not 0 <= student_daily_message_limit <= MAX_STUDENT_DAILY_MESSAGE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"每日消息上限必须在 0-{MAX_STUDENT_DAILY_MESSAGE_LIMIT} 之间（0 表示不限制）",
        )

    sanitized_keywords = sanitize_blocked_keywords(blocked_keywords)
    values = {
        ASSISTANT_STUDENT_DAILY_LIMIT_KEY: str(student_daily_message_limit),
        ASSISTANT_BLOCKED_KEYWORDS_KEY: json.dumps(sanitized_keywords, ensure_ascii=False),
    }

    existing = {
        item.setting_key: item
        for item in db.scalars(
            select(SystemSetting).where(
                SystemSetting.setting_key.in_(values.keys())
            )
        ).all()
    }
    for setting_key, setting_value in values.items():
        row = existing.get(setting_key)
        if row is None:
            db.add(SystemSetting(setting_key=setting_key, setting_value=setting_value))
        else:
            row.setting_value = setting_value


def find_blocked_keyword(texts: list[str], blocked_keywords: dict[str, Any]) -> dict[str, str] | None:
    normalized_texts = " \n".join(item for item in texts if item).lower()
    if not normalized_texts:
        return None

    for category, item in blocked_keywords.items():
        if not item.get("enabled"):
            continue
        for keyword in item.get("keywords") or []:
            normalized_keyword = str(keyword).strip().lower()
            if normalized_keyword and normalized_keyword in normalized_texts:
                return {
                    "category": str(category),
                    "label": str(item.get("label") or category),
                    "keyword": str(keyword),
                }
    return None


def count_student_companion_messages_today(db: Session, user_id: int) -> int:
    value = db.scalar(
        select(func.count(CompanionMessage.id))
        .join(CompanionConversation, CompanionMessage.conversation_id == CompanionConversation.id)
        .where(
            CompanionConversation.user_id == user_id,
            CompanionMessage.role == "user",
            CompanionMessage.is_blocked.is_(False),
            func.date(CompanionMessage.created_at) == func.date(func.now()),
        )
    )
    return int(value or 0)


def enforce_student_companion_allowance(user: User, db: Session) -> None:
    """Raise 429 when the student has exhausted today's AI message allowance."""
    if user.user_type != "student":
        return

    settings_payload = read_assistant_safety_settings(db)
    limit_value = int(settings_payload["student_daily_message_limit"])
    if limit_value <= 0:
        return

    used = count_student_companion_messages_today(db, user.id)
    if used >= limit_value:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日 AI 学伴消息已达上限（{limit_value} 条），请明天再试或咨询老师。",
        )
