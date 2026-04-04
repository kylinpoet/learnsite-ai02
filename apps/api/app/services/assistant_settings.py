from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SystemSetting

ASSISTANT_GENERAL_PROMPT_KEY = "assistant_general_prompt"
ASSISTANT_LESSON_PROMPT_KEY = "assistant_lesson_prompt"

ASSISTANT_PROMPT_DEFAULTS = {
    "general_prompt": (
        "You are LearnSite's general AI study buddy. Prefer concise, practical guidance. "
        "Help with platform usage, study planning, learning strategies, and classroom collaboration. "
        "Do not fabricate system behavior you cannot confirm."
    ),
    "lesson_prompt": (
        "You are the lesson-context AI study buddy. Always ground your answer in the current lesson plan, task, "
        "and classroom context when available. For students, prefer hints, checkpoints, and step-by-step coaching "
        "instead of directly giving final answers or full code. For teachers, help with questioning, scaffolding, "
        "and classroom facilitation."
    ),
}


def read_assistant_prompt_settings(db: Session) -> dict[str, str]:
    payload = ASSISTANT_PROMPT_DEFAULTS.copy()
    rows = db.scalars(
        select(SystemSetting).where(
            SystemSetting.setting_key.in_(
                (ASSISTANT_GENERAL_PROMPT_KEY, ASSISTANT_LESSON_PROMPT_KEY)
            )
        )
    ).all()

    for row in rows:
        if row.setting_key == ASSISTANT_GENERAL_PROMPT_KEY:
            payload["general_prompt"] = row.setting_value or ""
        elif row.setting_key == ASSISTANT_LESSON_PROMPT_KEY:
            payload["lesson_prompt"] = row.setting_value or ""

    return payload


def write_assistant_prompt_settings(payload: dict[str, str], db: Session) -> None:
    values = {
        ASSISTANT_GENERAL_PROMPT_KEY: (payload.get("general_prompt") or "").strip(),
        ASSISTANT_LESSON_PROMPT_KEY: (payload.get("lesson_prompt") or "").strip(),
    }

    existing = {
        item.setting_key: item
        for item in db.scalars(
            select(SystemSetting).where(
                SystemSetting.setting_key.in_(
                    (ASSISTANT_GENERAL_PROMPT_KEY, ASSISTANT_LESSON_PROMPT_KEY)
                )
            )
        ).all()
    }

    for setting_key, setting_value in values.items():
        row = existing.get(setting_key)
        if row is None:
            db.add(SystemSetting(setting_key=setting_key, setting_value=setting_value))
        else:
            row.setting_value = setting_value
