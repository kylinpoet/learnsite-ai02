from __future__ import annotations

import json
import re
from collections.abc import Mapping
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SystemSetting
from app.services.semester import (
    format_semester_key,
    is_valid_semester_no,
    resolve_semester_no_for_date,
)

SYSTEM_THEME_PRESETS: list[dict[str, str]] = [
    {"code": "emblem", "name": "墨绿画布", "description": "深墨绿侧栏与页头色带、鼠尾草画布、纸白墨线卡片，平台默认，重量在框架上"},
    {"code": "growth", "name": "科目色谱", "description": "浅色壳层 + 每页一个模块功能色（页头竖标、卡片顶边、导航选中），活泼但只用语义色"},
    {"code": "clay", "name": "粘土童趣", "description": "奶油底点阵、橙色缎带与胶囊导航、软立体卡片，适合学生端与低年级场景"},
]
SYSTEM_THEME_CODES = {item["code"] for item in SYSTEM_THEME_PRESETS}
DEFAULT_THEME_CODE = "emblem"

ARCHIVED_CLASS_IDS_KEY = "archived_class_ids"
CLASS_ARCHIVE_RECORDS_KEY = "class_archive_records"
STUDENT_PROFILE_EDIT_PERMISSIONS_BY_CLASS_KEY = "student_profile_edit_permissions_by_class"

DEFAULT_STUDENT_PROFILE_EDIT_PERMISSIONS: dict[str, bool] = {
    "can_edit_name": True,
    "can_edit_gender": True,
    "can_edit_photo": True,
    "can_edit_class": True,
}

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

def default_current_school_year() -> int:
    """按国内校历推算当前学年：9 月开学进入新学年，之前仍属上一学年。"""
    today = date.today()
    return today.year if today.month >= 9 else today.year - 1


def default_current_semester_no() -> int:
    """按国内校历推算当前学期：9~12 月与 1 月为第一学期，其余为第二学期。"""
    return resolve_semester_no_for_date(date.today())


# 学年是 4 位年份，不能走 INT_SETTING_KEYS 的「>=1」下限校验，单独约束范围。
CURRENT_SCHOOL_YEAR_KEY = "current_school_year"
MIN_SCHOOL_YEAR = 2000
MAX_SCHOOL_YEAR = 2100

# 学期序号只有 1（第一学期）与 2（第二学期），同样不走 INT_SETTING_KEYS 的通用校验。
CURRENT_SEMESTER_NO_KEY = "current_semester_no"


SYSTEM_SETTING_DEFAULTS: dict[str, object] = {
    "platform_name": "OW³教学评AI平台",
    "school_name": "信息科技学习平台测试校",
    "active_grade_nos": [7, 8],
    "theme_code": DEFAULT_THEME_CODE,
    "student_register_enabled": False,
    "assistant_enabled": True,
    "remote_proxy_url": "",
    "auto_attendance_on_login": True,
    "student_drive_quota_mb": 128,
    "group_drive_quota_mb": 256,
    "group_drive_file_max_count": DEFAULT_GROUP_DRIVE_FILE_MAX_COUNT,
    "group_drive_single_file_max_mb": DEFAULT_GROUP_DRIVE_SINGLE_FILE_MAX_MB,
    "group_drive_allowed_extensions": ",".join(DEFAULT_GROUP_DRIVE_ALLOWED_EXTENSIONS),
    "class_transfer_review_note_presets_text": DEFAULT_CLASS_TRANSFER_REVIEW_NOTE_PRESETS_TEXT,
    "class_transfer_unreview_reason_presets_text": DEFAULT_CLASS_TRANSFER_UNREVIEW_REASON_PRESETS_TEXT,
    # 当前学年：年级与届别的换算基准，随校历每年更新，不再硬编码。
    CURRENT_SCHOOL_YEAR_KEY: default_current_school_year(),
    # 当前学期：课堂教学与成绩汇总的统计范围基准，每学期开学时更新一次。
    CURRENT_SEMESTER_NO_KEY: default_current_semester_no(),
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


def normalize_school_year(value: object, fallback: int) -> int:
    """把任意输入收敛成合法的 4 位学年；无法解析时回退。"""
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return fallback
    if parsed < MIN_SCHOOL_YEAR or parsed > MAX_SCHOOL_YEAR:
        return fallback
    return parsed


def read_current_school_year(db: Session, *, fallback: int | None = None) -> int:
    """读取当前学年。用于年级/届别换算，缺省时按校历推算而不是写死年份。"""
    resolved_fallback = default_current_school_year() if fallback is None else fallback
    raw = load_setting_value(CURRENT_SCHOOL_YEAR_KEY, db)
    return normalize_school_year(raw, resolved_fallback)


def normalize_semester_no(value: object, fallback: int) -> int:
    """把任意输入收敛成合法的学期序号（1 或 2）；无法解析时回退。"""
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return fallback
    if not is_valid_semester_no(parsed):
        return fallback
    return parsed


def read_current_semester_no(db: Session, *, fallback: int | None = None) -> int:
    """读取当前学期序号。用于学案归类与成绩汇总范围，缺省时按校历推算。"""
    resolved_fallback = default_current_semester_no() if fallback is None else fallback
    raw = load_setting_value(CURRENT_SEMESTER_NO_KEY, db)
    return normalize_semester_no(raw, resolved_fallback)


def read_current_semester_key(db: Session) -> str:
    """当前学年 + 当前学期拼成的学期标识，例如 "2026-1"。"""
    return format_semester_key(
        read_current_school_year(db),
        read_current_semester_no(db),
    )


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
        elif row.setting_key == CURRENT_SCHOOL_YEAR_KEY:
            payload[row.setting_key] = normalize_school_year(
                row.setting_value,
                default_current_school_year(),
            )
        elif row.setting_key == CURRENT_SEMESTER_NO_KEY:
            payload[row.setting_key] = normalize_semester_no(
                row.setting_value,
                default_current_semester_no(),
            )
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
    if CURRENT_SCHOOL_YEAR_KEY in payload:
        values[CURRENT_SCHOOL_YEAR_KEY] = str(
            normalize_school_year(
                payload.get(CURRENT_SCHOOL_YEAR_KEY),
                default_current_school_year(),
            )
        )
    if CURRENT_SEMESTER_NO_KEY in payload:
        values[CURRENT_SEMESTER_NO_KEY] = str(
            normalize_semester_no(
                payload.get(CURRENT_SEMESTER_NO_KEY),
                default_current_semester_no(),
            )
        )
    if "remote_proxy_url" in payload:
        values["remote_proxy_url"] = str(payload.get("remote_proxy_url") or "").strip()
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
    """只为缺失的设置项补默认值，不覆盖已有值。

    历史实现直接调用 write_system_settings(SYSTEM_SETTING_DEFAULTS)，
    而该函数会无条件覆盖同名键，导致每次启动都把管理员保存过的
    设置（校名、开放年级、当前学年等）重置回默认值。
    """
    existing_keys = set(db.scalars(select(SystemSetting.setting_key)).all())
    missing = {
        setting_key: setting_value
        for setting_key, setting_value in SYSTEM_SETTING_DEFAULTS.items()
        if setting_key not in existing_keys
    }
    if missing:
        write_system_settings(missing, db)


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


def normalize_student_profile_edit_permissions(payload: Mapping[str, object] | None) -> dict[str, bool]:
    data = payload if isinstance(payload, Mapping) else {}
    return {
        key: bool(data.get(key, default_value))
        for key, default_value in DEFAULT_STUDENT_PROFILE_EDIT_PERMISSIONS.items()
    }


def read_student_profile_edit_permissions_by_class(db: Session) -> dict[int, dict[str, bool]]:
    raw = load_setting_value(STUDENT_PROFILE_EDIT_PERMISSIONS_BY_CLASS_KEY, db)
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}

    normalized: dict[int, dict[str, bool]] = {}
    for raw_class_id, raw_permissions in payload.items():
        try:
            class_id = int(raw_class_id)
        except (TypeError, ValueError):
            continue
        if class_id <= 0:
            continue
        normalized[class_id] = normalize_student_profile_edit_permissions(raw_permissions)
    return normalized


def resolve_student_profile_edit_permissions(class_id: int | None, db: Session) -> dict[str, bool]:
    if class_id is None or class_id <= 0:
        return dict(DEFAULT_STUDENT_PROFILE_EDIT_PERMISSIONS)
    permission_by_class = read_student_profile_edit_permissions_by_class(db)
    return dict(
        permission_by_class.get(
            class_id,
            DEFAULT_STUDENT_PROFILE_EDIT_PERMISSIONS,
        )
    )


def write_student_profile_edit_permissions_by_class(
    permissions_by_class: Mapping[int, Mapping[str, object]],
    db: Session,
) -> None:
    normalized_payload: dict[str, dict[str, bool]] = {}
    for raw_class_id, raw_permissions in permissions_by_class.items():
        try:
            class_id = int(raw_class_id)
        except (TypeError, ValueError):
            continue
        if class_id <= 0:
            continue
        normalized_payload[str(class_id)] = normalize_student_profile_edit_permissions(raw_permissions)

    serialized = json.dumps(normalized_payload, ensure_ascii=False)
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == STUDENT_PROFILE_EDIT_PERMISSIONS_BY_CLASS_KEY))
    if row is None:
        db.add(
            SystemSetting(
                setting_key=STUDENT_PROFILE_EDIT_PERMISSIONS_BY_CLASS_KEY,
                setting_value=serialized,
            )
        )
    else:
        row.setting_value = serialized


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
