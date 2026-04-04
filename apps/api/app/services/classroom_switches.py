from __future__ import annotations

import json
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ClassSeatAssignment, ClassroomSession, StudentProfile, SystemSetting, User
from app.services.attendance import LOOPBACK_IPS, resolve_client_ip

DEFAULT_SESSION_SWITCHES: dict[str, bool] = {
    "drive": True,
    "group_drive": True,
    "group_discussion": True,
    "peer_review": True,
    "ai_assistant": True,
    "programming_control": True,
    "ip_lock": False,
}
CLASSROOM_SWITCH_KEYS = tuple(DEFAULT_SESSION_SWITCHES.keys())

DEFAULT_SWITCH_DISABLED_MESSAGES: dict[str, str] = {
    "drive": "课堂暂时关闭了个人网盘，请按教师指引操作。",
    "group_drive": "课堂暂时关闭了小组网盘，请稍后再试。",
    "group_discussion": "课堂暂时关闭了小组讨论，请先完成个人学习任务。",
    "programming_control": "当前课堂暂未开放编程任务入口，请等待教师开启。",
    "ip_lock": "当前课堂已启用 IP 锁定，请在指定机位登录后重试。",
}


@dataclass(slots=True)
class StudentClassroomContext:
    class_id: int | None
    session_id: int | None
    switches: dict[str, bool]
    ip_lock_enabled: bool
    ip_allowed: bool
    ip_message: str
    client_ip: str

    @property
    def session_active(self) -> bool:
        return self.session_id is not None


def normalize_session_switches(raw: dict | None) -> dict[str, bool]:
    normalized = dict(DEFAULT_SESSION_SWITCHES)
    if not raw:
        return normalized

    for key in DEFAULT_SESSION_SWITCHES:
        if key in raw:
            normalized[key] = bool(raw[key])
    return normalized


def session_switches_setting_key(session_id: int) -> str:
    return f"classroom_session_switches:{session_id}"


def load_session_switches(session_id: int, db: Session) -> dict[str, bool]:
    row = db.scalar(
        select(SystemSetting).where(
            SystemSetting.setting_key == session_switches_setting_key(session_id)
        )
    )
    if row is None:
        return dict(DEFAULT_SESSION_SWITCHES)

    try:
        payload = json.loads(row.setting_value or "{}")
    except json.JSONDecodeError:
        payload = {}

    if not isinstance(payload, dict):
        payload = {}
    return normalize_session_switches(payload)


def resolve_student_class_id(student: User, db: Session) -> int | None:
    profile = student.student_profile
    if profile is not None:
        return profile.class_id

    profile = db.scalar(
        select(StudentProfile).where(StudentProfile.user_id == student.id)
    )
    return profile.class_id if profile is not None else None


def load_active_session_for_class(class_id: int, db: Session) -> ClassroomSession | None:
    return db.scalar(
        select(ClassroomSession)
        .where(
            ClassroomSession.class_id == class_id,
            ClassroomSession.status == "active",
        )
        .order_by(ClassroomSession.started_at.desc(), ClassroomSession.id.desc())
    )


def _evaluate_ip_lock(
    student: User,
    class_id: int,
    request: Request | None,
    db: Session,
) -> tuple[bool, str, str]:
    if request is None:
        return False, DEFAULT_SWITCH_DISABLED_MESSAGES["ip_lock"], ""

    client_ip = resolve_client_ip(request).strip()
    if not client_ip:
        return False, "当前课堂开启了 IP 锁定，未识别到设备 IP。", ""

    if client_ip in LOOPBACK_IPS:
        return True, "", client_ip

    seat_assignment = db.scalar(
        select(ClassSeatAssignment)
        .where(
            ClassSeatAssignment.class_id == class_id,
            ClassSeatAssignment.student_user_id == student.id,
        )
        .options(selectinload(ClassSeatAssignment.seat))
    )
    if seat_assignment is None:
        return False, "当前课堂开启了 IP 锁定，你的账号尚未绑定机位。", client_ip

    seat = seat_assignment.seat
    if seat is None or not seat.is_enabled:
        return False, "当前课堂开启了 IP 锁定，你的机位不可用，请联系教师。", client_ip

    expected_ip = (seat.ip_address or "").strip()
    if expected_ip and expected_ip == client_ip:
        return True, "", client_ip

    return (
        False,
        f"当前课堂开启了 IP 锁定，请在指定机位登录后重试（当前 IP：{client_ip}）。",
        client_ip,
    )


def build_student_classroom_context(
    student: User,
    db: Session,
    request: Request | None = None,
) -> StudentClassroomContext:
    class_id = resolve_student_class_id(student, db)
    if class_id is None:
        return StudentClassroomContext(
            class_id=None,
            session_id=None,
            switches=dict(DEFAULT_SESSION_SWITCHES),
            ip_lock_enabled=False,
            ip_allowed=True,
            ip_message="",
            client_ip="",
        )

    session = load_active_session_for_class(class_id, db)
    if session is None:
        return StudentClassroomContext(
            class_id=class_id,
            session_id=None,
            switches=dict(DEFAULT_SESSION_SWITCHES),
            ip_lock_enabled=False,
            ip_allowed=True,
            ip_message="",
            client_ip="",
        )

    switches = load_session_switches(session.id, db)
    ip_lock_enabled = bool(switches.get("ip_lock", False))
    ip_allowed = True
    ip_message = ""
    client_ip = ""
    if ip_lock_enabled:
        ip_allowed, ip_message, client_ip = _evaluate_ip_lock(student, class_id, request, db)

    return StudentClassroomContext(
        class_id=class_id,
        session_id=session.id,
        switches=switches,
        ip_lock_enabled=ip_lock_enabled,
        ip_allowed=ip_allowed,
        ip_message=ip_message,
        client_ip=client_ip,
    )


def resolve_feature_access(
    context: StudentClassroomContext,
    switch_key: str,
    *,
    disabled_message: str | None = None,
) -> tuple[bool, str]:
    if switch_key not in DEFAULT_SESSION_SWITCHES:
        raise ValueError(f"unsupported classroom switch key: {switch_key}")

    if not context.session_active:
        return True, ""

    if not context.switches.get(switch_key, DEFAULT_SESSION_SWITCHES[switch_key]):
        return False, disabled_message or DEFAULT_SWITCH_DISABLED_MESSAGES.get(switch_key, "当前课堂功能已关闭。")

    if context.ip_lock_enabled and not context.ip_allowed:
        return False, context.ip_message or DEFAULT_SWITCH_DISABLED_MESSAGES["ip_lock"]

    return True, ""


def ensure_feature_access(
    context: StudentClassroomContext,
    switch_key: str,
    *,
    disabled_message: str | None = None,
) -> None:
    enabled, message = resolve_feature_access(context, switch_key, disabled_message=disabled_message)
    if enabled:
        return

    blocked_by_ip = context.ip_lock_enabled and not context.ip_allowed
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN if blocked_by_ip else status.HTTP_409_CONFLICT,
        detail=message,
    )


def serialize_classroom_capabilities(
    context: StudentClassroomContext,
    *,
    feature_states: dict[str, tuple[bool, str]] | None = None,
) -> dict:
    payload = {
        "session_active": context.session_active,
        "session_id": context.session_id,
        "class_id": context.class_id,
        "switches": dict(context.switches),
        "ip_lock": {
            "enabled": context.ip_lock_enabled,
            "allowed": context.ip_allowed,
            "client_ip": context.client_ip or None,
            "message": context.ip_message,
        },
    }

    for key, (enabled, message) in (feature_states or {}).items():
        payload[key] = {
            "enabled": enabled,
            "message": message,
        }

    return payload
