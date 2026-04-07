from __future__ import annotations

import json
import re
from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SystemSetting

SYSTEM_THEME_PRESETS: list[dict[str, str]] = [
    {"code": "mango-splash", "name": "芒果冲浪", "description": "橙黄与海盐青的高亮组合，适合作为默认课堂主题"},
    {"code": "berry-pop", "name": "莓莓汽泡", "description": "亮粉、亮蓝与奶油黄混合，更像初中生会主动选择的活力主题"},
    {"code": "neon-pulse", "name": "电光霓虹", "description": "电蓝与霓虹感紫粉更有科技感，适合信息科技课程氛围"},
]
SYSTEM_THEME_CODES = {item["code"] for item in SYSTEM_THEME_PRESETS}
DEFAULT_THEME_CODE = "mango-splash"

ARCHIVED_CLASS_IDS_KEY = "archived_class_ids"
CLASS_ARCHIVE_RECORDS_KEY = "class_archive_records"

DEFAULT_GROUP_DRIVE_ALLOWED_EXTENSIONS = [
    "txt",
    "md",
    "pdf",
    "doc",
    "docx",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "csv",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "mp3",
    "mp4",
    "wav",
    "zip",
    "rar",
    "7z",
    "py",
    "js",
    "ts",
    "json",
    "html",
    "css",
]

DEFAULT_GROUP_DRIVE_FILE_MAX_COUNT = 50
DEFAULT_GROUP_DRIVE_SINGLE_FILE_MAX_MB = 20

DEFAULT_CLASS_TRANSFER_REVIEW_NOTE_PRESETS_TEXT = "\n".join(
    [
        "通过 · 班额协调完成|同意调班，班额与教学安排已协调，请按新班级参加后续课程与作业。",
        "通过 · 家校沟通确认|同意调班，已完成家校沟通确认，请关注新班级课堂通知。",
        "拒绝 · 班级容量不足|暂不通过，本次目标班级容量已满，建议后续重新发起申请。",
        "拒绝 · 学习进度稳定优先|暂不通过，当前学习进度建议保持原班级，以保证学习连续性。",
    ]
)
DEFAULT_CLASS_TRANSFER_UNREVIEW_REASON_PRESETS_TEXT = "\n".join(
    [
        "撤销 · 信息需补充|撤销本次审核，申请信息待补充后重新审核。",
        "撤销 · 班级容量变更|撤销本次审核，因班级容量变化需重新核对后再处理。",
        "撤销 · 教务安排调整|撤销本次审核，教务安排发生调整，申请恢复为待审核。",
    ]
)

SYSTEM_SETTING_DEFAULTS: dict[str, object] = {
    "school_name": "信息科技学习平台测试校",
    "active_grade_nos": [7, 8],
    "theme_code": DEFAULT_THEME_CODE,
    "student_register_enabled": False,
    "assistant_enabled": True,
    "auto_attendance_on_login": True,
    "student_drive_quota_mb": 128,
    "group_drive_quota_mb": 256,
    "group_drive_file_max_count": DEFAULT_GROUP_DRIVE_FILE_MAX_COUNT,
    "group_drive_single_file_max_mb": DEFAULT_GROUP_DRIVE_SINGLE_FILE_MAX_MB,
    "group_drive_allowed_extensions": ",".join(DEFAULT_GROUP_DRIVE_ALLOWED_EXTENSIONS),
    "class_transfer_review_note_presets_text": DEFAULT_CLASS_TRANSFER_REVIEW_NOTE_PRESETS_TEXT,
    "class_transfer_unreview_reason_presets_text": DEFAULT_CLASS_TRANSFER_UNREVIEW_REASON_PRESETS_TEXT,
}

BOOL_SETTING_KEYS = {
    "student_register_enabled",
    "assistant_enabled",
    "auto_attendance_on_login",
}
INT_SETTING_KEYS = {
    "student_drive_quota_mb",
    "group_drive_quota_mb",
    "group_drive_file_max_count",
    "group_drive_single_file_max_mb",
}


def normalize_theme_code(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized not in SYSTEM_THEME_CODES:
        return DEFAULT_THEME_CODE
    return normalized


def normalize_allowed_extensions_text(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw or raw == "*":
        return ""

    seen: set[str] = set()
    extensions: list[str] = []
    for token in re.split(r"[\s,;，；]+", raw):
        normalized = token.strip().lower().lstrip(".")
        if not normalized or normalized == "*" or normalized in seen:
            continue
        if not re.fullmatch(r"[a-z0-9]+", normalized):
            continue
        seen.add(normalized)
        extensions.append(normalized)
    return ",".join(extensions)


def parse_allowed_extensions_text(value: str | None) -> list[str]:
    normalized = normalize_allowed_extensions_text(value)
    if not normalized:
        return []
    return normalized.split(",")


def normalize_preset_template_text(value: str | None) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in str(value or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line or line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines[:50])


def load_setting_value(setting_key: str, db: Session) -> str | None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == setting_key))
    if row is None:
        return None
    return row.setting_value


def load_int_setting(setting_key: str, default_value: int, db: Session, *, minimum: int = 1) -> int:
    raw_value = load_setting_value(setting_key, db)
    if raw_value is None:
        return default_value
    try:
        return max(minimum, int(raw_value))
    except ValueError:
        return default_value


def read_system_settings(db: Session) -> dict:
    rows = db.scalars(select(SystemSetting)).all()
    payload = SYSTEM_SETTING_DEFAULTS.copy()
    for row in rows:
        if row.setting_key == "active_grade_nos":
            try:
                payload[row.setting_key] = json.loads(row.setting_value or "[]")
            except json.JSONDecodeError:
                payload[row.setting_key] = SYSTEM_SETTING_DEFAULTS["active_grade_nos"]
        elif row.setting_key in BOOL_SETTING_KEYS:
            payload[row.setting_key] = row.setting_value.lower() == "true"
        elif row.setting_key in INT_SETTING_KEYS:
            try:
                payload[row.setting_key] = int(row.setting_value)
            except ValueError:
                payload[row.setting_key] = SYSTEM_SETTING_DEFAULTS[row.setting_key]
        elif row.setting_key == "group_drive_allowed_extensions":
            payload[row.setting_key] = normalize_allowed_extensions_text(row.setting_value)
        elif row.setting_key in {"class_transfer_review_note_presets_text", "class_transfer_unreview_reason_presets_text"}:
            payload[row.setting_key] = normalize_preset_template_text(row.setting_value)
        elif row.setting_key == "theme_code":
            payload[row.setting_key] = normalize_theme_code(row.setting_value)
        else:
            payload[row.setting_key] = row.setting_value
    payload["theme_code"] = normalize_theme_code(str(payload.get("theme_code") or DEFAULT_THEME_CODE))
    return payload


def build_system_setting_write_values(payload: Mapping[str, object]) -> dict[str, str]:
    values: dict[str, str] = {}

    if "school_name" in payload:
        school_name = str(payload.get("school_name") or "").strip() or str(SYSTEM_SETTING_DEFAULTS["school_name"])
        values["school_name"] = school_name
    if "active_grade_nos" in payload:
        raw_grade_nos = payload.get("active_grade_nos") or SYSTEM_SETTING_DEFAULTS["active_grade_nos"]
        grade_nos = sorted({int(item) for item in list(raw_grade_nos)})
        values["active_grade_nos"] = json.dumps(grade_nos, ensure_ascii=False)
    if "theme_code" in payload:
        values["theme_code"] = normalize_theme_code(str(payload.get("theme_code") or ""))
    for setting_key in BOOL_SETTING_KEYS:
        if setting_key in payload:
            values[setting_key] = str(bool(payload.get(setting_key))).lower()
    for setting_key in INT_SETTING_KEYS:
        if setting_key in payload:
            default_value = int(SYSTEM_SETTING_DEFAULTS[setting_key])
            values[setting_key] = str(max(1, int(payload.get(setting_key) or default_value)))
    if "group_drive_allowed_extensions" in payload:
        values["group_drive_allowed_extensions"] = normalize_allowed_extensions_text(
            str(payload.get("group_drive_allowed_extensions") or "")
        )
    if "class_transfer_review_note_presets_text" in payload:
        values["class_transfer_review_note_presets_text"] = normalize_preset_template_text(
            str(payload.get("class_transfer_review_note_presets_text") or "")
        )
    if "class_transfer_unreview_reason_presets_text" in payload:
        values["class_transfer_unreview_reason_presets_text"] = normalize_preset_template_text(
            str(payload.get("class_transfer_unreview_reason_presets_text") or "")
        )

    return values


def write_system_settings(payload: Mapping[str, object], db: Session) -> None:
    values = build_system_setting_write_values(payload)
    existing = {item.setting_key: item for item in db.scalars(select(SystemSetting)).all()}
    for setting_key, setting_value in values.items():
        row = existing.get(setting_key)
        if row is None:
            db.add(SystemSetting(setting_key=setting_key, setting_value=setting_value))
        else:
            row.setting_value = setting_value


def ensure_system_setting_defaults(db: Session) -> None:
    write_system_settings(SYSTEM_SETTING_DEFAULTS, db)


def read_archived_class_ids(db: Session) -> set[int]:
    raw = load_setting_value(ARCHIVED_CLASS_IDS_KEY, db)
    if not raw:
        return set()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return set()
    if not isinstance(payload, list):
        return set()
    archived_ids: set[int] = set()
    for item in payload:
        try:
            class_id = int(item)
        except (TypeError, ValueError):
            continue
        if class_id > 0:
            archived_ids.add(class_id)
    return archived_ids


def write_archived_class_ids(class_ids: set[int] | list[int], db: Session) -> None:
    normalized = sorted({int(item) for item in class_ids if int(item) > 0})
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == ARCHIVED_CLASS_IDS_KEY))
    payload = json.dumps(normalized, ensure_ascii=False)
    if row is None:
        db.add(SystemSetting(setting_key=ARCHIVED_CLASS_IDS_KEY, setting_value=payload))
    else:
        row.setting_value = payload


def read_class_archive_records(db: Session) -> list[dict]:
    raw = load_setting_value(CLASS_ARCHIVE_RECORDS_KEY, db)
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    records: list[dict] = []
    for item in payload:
        if isinstance(item, dict):
            records.append(item)
    return records


def write_class_archive_records(records: list[dict], db: Session) -> None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == CLASS_ARCHIVE_RECORDS_KEY))
    payload = json.dumps(records, ensure_ascii=False)
    if row is None:
        db.add(SystemSetting(setting_key=CLASS_ARCHIVE_RECORDS_KEY, setting_value=payload))
    else:
        row.setting_value = payload


def theme_presets_payload() -> list[dict[str, str]]:
    return [dict(item) for item in SYSTEM_THEME_PRESETS]


def load_group_drive_upload_limits(db: Session) -> dict[str, object]:
    max_file_count = load_int_setting(
        "group_drive_file_max_count",
        DEFAULT_GROUP_DRIVE_FILE_MAX_COUNT,
        db,
    )
    single_file_max_mb = load_int_setting(
        "group_drive_single_file_max_mb",
        DEFAULT_GROUP_DRIVE_SINGLE_FILE_MAX_MB,
        db,
    )
    allowed_extensions = parse_allowed_extensions_text(
        load_setting_value("group_drive_allowed_extensions", db)
        or str(SYSTEM_SETTING_DEFAULTS["group_drive_allowed_extensions"])
    )
    return {
        "max_file_count": max_file_count,
        "single_file_max_mb": single_file_max_mb,
        "allowed_extensions": allowed_extensions,
        "allowed_extensions_text": ",".join(allowed_extensions),
    }
