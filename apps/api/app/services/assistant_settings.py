from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SystemSetting

ASSISTANT_GENERAL_PROMPT_KEY = "assistant_general_prompt"
ASSISTANT_LESSON_PROMPT_KEY = "assistant_lesson_prompt"
ASSISTANT_TEMPERATURE_KEY = "assistant_temperature"
ASSISTANT_TOP_P_KEY = "assistant_top_p"
ASSISTANT_MAX_TOKENS_KEY = "assistant_max_tokens"
ASSISTANT_PRESENCE_PENALTY_KEY = "assistant_presence_penalty"
ASSISTANT_FREQUENCY_PENALTY_KEY = "assistant_frequency_penalty"
ASSISTANT_STREAMING_ENABLED_KEY = "assistant_streaming_enabled"

ASSISTANT_PROMPT_DEFAULTS = {
    "general_prompt": (
        "You are OW³教学评AI平台's general AI study buddy. Prefer concise, practical guidance. "
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

ASSISTANT_RUNTIME_DEFAULTS = {
    "temperature": 0.4,
    "top_p": None,
    "max_tokens": None,
    "presence_penalty": None,
    "frequency_penalty": None,
    "streaming_enabled": True,
}


def _parse_bool(value: str | None, fallback: bool) -> bool:
    normalized = (value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return fallback


def _parse_float(
    value: str | None,
    fallback: float,
    *,
    min_value: float,
    max_value: float,
) -> float:
    try:
        parsed = float((value or "").strip())
    except (TypeError, ValueError):
        return fallback
    if not min_value <= parsed <= max_value:
        return fallback
    return parsed


def _parse_optional_float(
    value: str | None,
    fallback: float | None,
    *,
    min_value: float,
    max_value: float,
) -> float | None:
    text = (value or "").strip()
    if not text:
        return fallback
    try:
        parsed = float(text)
    except (TypeError, ValueError):
        return fallback
    if not min_value <= parsed <= max_value:
        return fallback
    return parsed


def _parse_optional_int(
    value: str | None,
    fallback: int | None,
    *,
    min_value: int,
    max_value: int,
) -> int | None:
    text = (value or "").strip()
    if not text:
        return fallback
    try:
        parsed = int(text)
    except (TypeError, ValueError):
        return fallback
    if not min_value <= parsed <= max_value:
        return fallback
    return parsed


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


def read_assistant_runtime_settings(db: Session) -> dict[str, float | int | bool | None]:
    payload = ASSISTANT_RUNTIME_DEFAULTS.copy()
    rows = db.scalars(
        select(SystemSetting).where(
            SystemSetting.setting_key.in_(
                (
                    ASSISTANT_TEMPERATURE_KEY,
                    ASSISTANT_TOP_P_KEY,
                    ASSISTANT_MAX_TOKENS_KEY,
                    ASSISTANT_PRESENCE_PENALTY_KEY,
                    ASSISTANT_FREQUENCY_PENALTY_KEY,
                    ASSISTANT_STREAMING_ENABLED_KEY,
                )
            )
        )
    ).all()

    for row in rows:
        if row.setting_key == ASSISTANT_TEMPERATURE_KEY:
            payload["temperature"] = _parse_float(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["temperature"],
                min_value=0,
                max_value=2,
            )
        elif row.setting_key == ASSISTANT_TOP_P_KEY:
            payload["top_p"] = _parse_optional_float(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["top_p"],
                min_value=0,
                max_value=1,
            )
        elif row.setting_key == ASSISTANT_MAX_TOKENS_KEY:
            payload["max_tokens"] = _parse_optional_int(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["max_tokens"],
                min_value=1,
                max_value=8192,
            )
        elif row.setting_key == ASSISTANT_PRESENCE_PENALTY_KEY:
            payload["presence_penalty"] = _parse_optional_float(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["presence_penalty"],
                min_value=-2,
                max_value=2,
            )
        elif row.setting_key == ASSISTANT_FREQUENCY_PENALTY_KEY:
            payload["frequency_penalty"] = _parse_optional_float(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["frequency_penalty"],
                min_value=-2,
                max_value=2,
            )
        elif row.setting_key == ASSISTANT_STREAMING_ENABLED_KEY:
            payload["streaming_enabled"] = _parse_bool(
                row.setting_value,
                ASSISTANT_RUNTIME_DEFAULTS["streaming_enabled"],
            )

    return payload


def write_assistant_runtime_settings(payload: dict[str, float | int | bool | None], db: Session) -> None:
    temperature = _parse_float(
        str(payload.get("temperature")),
        ASSISTANT_RUNTIME_DEFAULTS["temperature"],
        min_value=0,
        max_value=2,
    )
    top_p = _parse_optional_float(
        None if payload.get("top_p") is None else str(payload.get("top_p")),
        ASSISTANT_RUNTIME_DEFAULTS["top_p"],
        min_value=0,
        max_value=1,
    )
    max_tokens = _parse_optional_int(
        None if payload.get("max_tokens") is None else str(payload.get("max_tokens")),
        ASSISTANT_RUNTIME_DEFAULTS["max_tokens"],
        min_value=1,
        max_value=8192,
    )
    presence_penalty = _parse_optional_float(
        None if payload.get("presence_penalty") is None else str(payload.get("presence_penalty")),
        ASSISTANT_RUNTIME_DEFAULTS["presence_penalty"],
        min_value=-2,
        max_value=2,
    )
    frequency_penalty = _parse_optional_float(
        None if payload.get("frequency_penalty") is None else str(payload.get("frequency_penalty")),
        ASSISTANT_RUNTIME_DEFAULTS["frequency_penalty"],
        min_value=-2,
        max_value=2,
    )
    values = {
        ASSISTANT_TEMPERATURE_KEY: str(round(temperature, 2)),
        ASSISTANT_TOP_P_KEY: "" if top_p is None else str(round(top_p, 2)),
        ASSISTANT_MAX_TOKENS_KEY: "" if max_tokens is None else str(max_tokens),
        ASSISTANT_PRESENCE_PENALTY_KEY: "" if presence_penalty is None else str(round(presence_penalty, 2)),
        ASSISTANT_FREQUENCY_PENALTY_KEY: "" if frequency_penalty is None else str(round(frequency_penalty, 2)),
        ASSISTANT_STREAMING_ENABLED_KEY: "true" if bool(payload.get("streaming_enabled", True)) else "false",
    }

    existing = {
        item.setting_key: item
        for item in db.scalars(
            select(SystemSetting).where(
                SystemSetting.setting_key.in_(
                    (
                        ASSISTANT_TEMPERATURE_KEY,
                        ASSISTANT_TOP_P_KEY,
                        ASSISTANT_MAX_TOKENS_KEY,
                        ASSISTANT_PRESENCE_PENALTY_KEY,
                        ASSISTANT_FREQUENCY_PENALTY_KEY,
                        ASSISTANT_STREAMING_ENABLED_KEY,
                    )
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
