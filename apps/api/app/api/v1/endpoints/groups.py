from __future__ import annotations

from datetime import date
from math import ceil

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_student
from app.api.deps.db import get_db
from app.models import AttendanceRecord, ClassSeatAssignment, ComputerSeat, User
from app.schemas.common import ApiResponse
from app.services.group_activity import build_group_activity_feed, load_recent_group_submissions
from app.services.classroom_switches import (
    build_student_classroom_context,
    resolve_feature_access,
    serialize_classroom_capabilities,
)
from app.services.group_operation_logs import (
    load_group_operation_logs_by_group_id,
    serialize_group_operation_log,
)
from app.services.student_groups import ensure_group_drive_space, load_student_group_membership

router = APIRouter()


def serialize_recent_file(drive_file) -> dict:
    return {
        "id": drive_file.id,
        "name": drive_file.stored_name,
        "original_name": drive_file.original_name,
        "ext": drive_file.file_ext,
        "size_kb": max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0,
        "updated_at": drive_file.updated_at.isoformat() if drive_file.updated_at else None,
    }


def empty_group_payload(classroom_capabilities: dict | None = None) -> dict:
    return {
        "group": None,
        "today_summary": {
            "member_count": 0,
            "checked_in_count": 0,
            "pending_count": 0,
        },
        "members": [],
        "shared_drive": {
            "enabled": False,
            "message": "你当前还没有加入小组，暂时无法使用小组协作空间。",
            "recent_files": [],
        },
        "activity_feed": [],
        "operation_logs": [],
        "classroom_capabilities": classroom_capabilities or {},
    }


def build_member_seat_map(group_id: int, class_id: int, member_user_ids: list[int], db: Session) -> dict[int, ClassSeatAssignment]:
    if not member_user_ids:
        return {}

    assignments = db.scalars(
        select(ClassSeatAssignment)
        .where(
            ClassSeatAssignment.class_id == class_id,
            ClassSeatAssignment.student_user_id.in_(member_user_ids),
        )
        .options(selectinload(ClassSeatAssignment.seat).selectinload(ComputerSeat.room))
    ).all()
    return {assignment.student_user_id: assignment for assignment in assignments}


def build_today_attendance_map(member_user_ids: list[int], db: Session) -> dict[int, AttendanceRecord]:
    if not member_user_ids:
        return {}

    records = db.scalars(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.student_id.in_(member_user_ids),
            AttendanceRecord.attendance_date == date.today(),
        )
        .order_by(AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
    ).all()

    result: dict[int, AttendanceRecord] = {}
    for record in records:
        result.setdefault(record.student_id, record)
    return result


@router.get("/me", response_model=ApiResponse)
def my_group(
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    capability_context = build_student_classroom_context(student, db, request)
    discussion_enabled, discussion_message = resolve_feature_access(capability_context, "group_discussion")
    group_drive_enabled, group_drive_message = resolve_feature_access(capability_context, "group_drive")
    classroom_capabilities = serialize_classroom_capabilities(
        capability_context,
        feature_states={
            "group_discussion": (discussion_enabled, discussion_message),
            "group_drive": (group_drive_enabled, group_drive_message),
        },
    )

    membership = load_student_group_membership(student.id, db, include_members=True)
    if membership is None:
        return ApiResponse(data=empty_group_payload(classroom_capabilities))

    group = membership.group
    group_space = ensure_group_drive_space(group, db)
    member_user_ids = [item.student_user_id for item in group.memberships]
    seat_map = build_member_seat_map(group.id, group.class_id, member_user_ids, db)
    attendance_map = build_today_attendance_map(member_user_ids, db)

    sorted_members = sorted(
        group.memberships,
        key=lambda item: (item.role != "leader", item.student.student_profile.student_no),
    )

    members_payload = []
    checked_in_count = 0
    for item in sorted_members:
        profile = item.student.student_profile
        seat_assignment = seat_map.get(item.student_user_id)
        attendance = attendance_map.get(item.student_user_id)
        checked_in_today = attendance is not None
        if checked_in_today:
            checked_in_count += 1

        members_payload.append(
            {
                "user_id": item.student.id,
                "student_no": profile.student_no if profile else item.student.username,
                "name": item.student.display_name,
                "role": item.role,
                "seat_label": seat_assignment.seat.seat_label if seat_assignment and seat_assignment.seat else None,
                "room_name": (
                    seat_assignment.seat.room.name
                    if seat_assignment and seat_assignment.seat and seat_assignment.seat.room
                    else None
                ),
                "checked_in_today": checked_in_today,
                "checked_in_at": attendance.checked_in_at.isoformat() if attendance else None,
            }
        )

    recent_files = sorted(group_space.files, key=lambda item: (item.updated_at, item.id), reverse=True)[:5]
    quota_bytes = group_space.quota_mb * 1024 * 1024
    remaining_bytes = max(quota_bytes - group_space.used_bytes, 0)
    usage_percent = round((group_space.used_bytes / quota_bytes) * 100, 1) if quota_bytes else 0
    submission_map = load_recent_group_submissions([group.id], db)
    operation_logs = load_group_operation_logs_by_group_id([group.id], db)

    leader = next((item for item in members_payload if item["role"] == "leader"), None)

    return ApiResponse(
        data={
            "group": {
                "id": group.id,
                "name": group.name,
                "group_no": group.group_no,
                "description": group.description,
                "class_id": group.class_id,
                "class_name": group.school_class.class_name,
                "member_count": len(members_payload),
                "me_role": membership.role,
                "leader_name": leader["name"] if leader else None,
                "leader_student_no": leader["student_no"] if leader else None,
            },
            "today_summary": {
                "member_count": len(members_payload),
                "checked_in_count": checked_in_count,
                "pending_count": max(len(members_payload) - checked_in_count, 0),
            },
            "members": members_payload,
            "shared_drive": {
                "enabled": group_drive_enabled,
                "message": group_drive_message,
                "display_name": group_space.display_name,
                "quota_mb": group_space.quota_mb,
                "used_bytes": group_space.used_bytes,
                "remaining_bytes": remaining_bytes,
                "usage_percent": usage_percent,
                "file_count": len(group_space.files),
                "recent_files": [serialize_recent_file(item) for item in recent_files],
            },
            "activity_feed": (
                build_group_activity_feed(
                    group,
                    attendance_map,
                    group_space,
                    submission_map.get(group.id),
                )
                if discussion_enabled
                else []
            ),
            "operation_logs": (
                [
                    serialize_group_operation_log(item)
                    for item in operation_logs.get(group.id, [])
                ]
                if discussion_enabled
                else []
            ),
            "classroom_capabilities": classroom_capabilities,
        }
    )
