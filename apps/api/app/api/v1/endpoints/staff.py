from __future__ import annotations

from collections import defaultdict
from datetime import date
from math import ceil
from urllib.parse import quote

import csv
from io import StringIO
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff
from app.api.deps.db import get_db
from app.core.security import hash_password
from app.models import (
    AttendanceRecord,
    ClassSeatAssignment,
    ClassroomSession,
    ComputerRoom,
    ComputerSeat,
    CurriculumBook,
    CurriculumLesson,
    CurriculumUnit,
    DriveFile,
    DriveSpace,
    LessonPlan,
    SchoolClass,
    StudentGroup,
    StudentGroupMember,
    StudentProfile,
    StudentLessonPlanProgress,
    Submission,
    Task,
    User,
)
from app.schemas.common import ApiResponse
from app.services.drive_files import (
    guess_drive_media_type,
    stored_drive_file_path,
    upload_files_to_drive_space,
)
from app.services.group_activity import build_group_activity_feed, load_recent_group_submissions
from app.services.group_operation_logs import (
    count_filtered_class_group_logs,
    load_filtered_class_group_logs,
    load_group_operation_logs_by_group_id,
    load_recent_class_group_logs,
    log_group_operation,
    serialize_group_operation_log,
)
from app.services.staff_access import build_staff_roles, get_accessible_class_ids, staff_can_access_class
from app.services.system_settings import load_group_drive_upload_limits
from app.services.student_groups import ensure_group_drive_space

router = APIRouter()


class SeatAssignmentSaveItem(BaseModel):
    seat_id: int = Field(ge=1)
    student_user_id: int | None = Field(default=None, ge=1)


class SeatMapSavePayload(BaseModel):
    room_id: int = Field(ge=1)
    assignments: list[SeatAssignmentSaveItem] = Field(default_factory=list)


class StaffGroupCreatePayload(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class StaffGroupRebuildPayload(BaseModel):
    group_count: int = Field(ge=1, le=20)


class StaffGroupSaveItem(BaseModel):
    id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    leader_user_id: int | None = Field(default=None, ge=1)
    member_user_ids: list[int] = Field(default_factory=list)


class StaffGroupSavePayload(BaseModel):
    groups: list[StaffGroupSaveItem] = Field(default_factory=list)


class StaffStudentResetPasswordPayload(BaseModel):
    new_password: str | None = Field(default=None, max_length=50)

    @field_validator("new_password", mode="before")
    @classmethod
    def normalize_password(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("new_password")
    @classmethod
    def validate_password_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 6:
            raise ValueError("重置密码长度不能少于 6 位")
        return value


class StaffStudentStatusPayload(BaseModel):
    is_active: bool


class StaffStudentBatchActionPayload(BaseModel):
    student_user_ids: list[int] = Field(min_length=1, max_length=200)
    action: str = Field(min_length=1, max_length=30)
    new_password: str | None = Field(default=None, max_length=50)

    @field_validator("student_user_ids")
    @classmethod
    def deduplicate_student_ids(cls, value: list[int]) -> list[int]:
        unique_ids: list[int] = []
        seen: set[int] = set()
        for student_user_id in value:
            if student_user_id in seen:
                continue
            seen.add(student_user_id)
            unique_ids.append(student_user_id)
        if not unique_ids:
            raise ValueError("至少选择 1 名学生")
        return unique_ids

    @field_validator("action", mode="before")
    @classmethod
    def normalize_action(cls, value: str | None) -> str:
        return (value or "").strip().lower()

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        if value not in {"activate", "deactivate", "ungroup", "reset_password"}:
            raise ValueError("不支持的批量操作")
        return value

    @field_validator("new_password", mode="before")
    @classmethod
    def normalize_password(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("new_password")
    @classmethod
    def validate_password_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 6:
            raise ValueError("重置密码长度不能少于 6 位")
        return value


def summarize_plan_progress(plan: LessonPlan) -> tuple[int, int]:
    pending_count = sum(1 for item in plan.progresses if item.progress_status == "pending")
    completed_count = sum(1 for item in plan.progresses if item.progress_status == "completed")
    return pending_count, completed_count


def serialize_recent_plan(plan: LessonPlan) -> dict:
    pending_count, completed_count = summarize_plan_progress(plan)
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "assigned_date": plan.assigned_date.isoformat(),
        "book_name": plan.lesson.unit.book.name,
        "unit_title": plan.lesson.unit.title,
        "lesson_title": plan.lesson.title,
        "task_count": len(plan.tasks),
        "pending_count": pending_count,
        "completed_count": completed_count,
    }


def serialize_launchpad_plan(plan: LessonPlan) -> dict:
    pending_count, completed_count = summarize_plan_progress(plan)
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "assigned_date": plan.assigned_date.isoformat(),
        "task_count": len(plan.tasks),
        "pending_count": pending_count,
        "completed_count": completed_count,
        "book_name": plan.lesson.unit.book.name,
        "unit_title": plan.lesson.unit.title,
        "lesson_title": plan.lesson.title,
    }


def build_submission_summary(
    submissions: list[Submission],
    student_id_to_class_id: dict[int, int],
) -> tuple[dict[int, dict], dict[tuple[int, int], dict]]:
    summary_by_class: dict[int, dict] = defaultdict(
        lambda: {
            "submission_count": 0,
            "pending_review_count": 0,
            "reviewed_count": 0,
            "recommended_count": 0,
        }
    )
    summary_by_plan_class: dict[tuple[int, int], dict] = defaultdict(
        lambda: {
            "submission_count": 0,
            "pending_review_count": 0,
            "reviewed_count": 0,
            "recommended_count": 0,
        }
    )

    for submission in submissions:
        class_id = student_id_to_class_id.get(submission.student_id)
        if class_id is None:
            continue

        target_summaries = (
            summary_by_class[class_id],
            summary_by_plan_class[(submission.task.plan_id, class_id)],
        )

        for item in target_summaries:
            item["submission_count"] += 1
            if submission.submit_status == "submitted":
                item["pending_review_count"] += 1
            if submission.submit_status == "reviewed":
                item["reviewed_count"] += 1
            if submission.is_recommended:
                item["recommended_count"] += 1

    return dict(summary_by_class), dict(summary_by_plan_class)


def build_student_submission_summaries(
    submissions: list[Submission],
) -> tuple[dict[int, dict[str, Any]], dict[tuple[int, int], dict[str, Any]]]:
    summary_by_student: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "submission_count": 0,
            "reviewed_submission_count": 0,
            "pending_review_count": 0,
            "latest_submission_at": None,
        }
    )
    summary_by_plan_student: dict[tuple[int, int], dict[str, Any]] = defaultdict(
        lambda: {
            "submission_count": 0,
            "reviewed_submission_count": 0,
            "pending_review_count": 0,
            "latest_submission_at": None,
        }
    )

    for submission in submissions:
        latest_value = submission.submitted_at or submission.updated_at
        plan_id = submission.task.plan_id if submission.task is not None else None

        student_summary = summary_by_student[submission.student_id]
        student_summary["submission_count"] += 1
        if submission.submit_status == "reviewed":
            student_summary["reviewed_submission_count"] += 1
        if submission.submit_status == "submitted":
            student_summary["pending_review_count"] += 1
        if latest_value is not None:
            previous = student_summary["latest_submission_at"]
            if previous is None or previous < latest_value:
                student_summary["latest_submission_at"] = latest_value

        if plan_id is None:
            continue

        plan_summary = summary_by_plan_student[(plan_id, submission.student_id)]
        plan_summary["submission_count"] += 1
        if submission.submit_status == "reviewed":
            plan_summary["reviewed_submission_count"] += 1
        if submission.submit_status == "submitted":
            plan_summary["pending_review_count"] += 1
        if latest_value is not None:
            previous_plan = plan_summary["latest_submission_at"]
            if previous_plan is None or previous_plan < latest_value:
                plan_summary["latest_submission_at"] = latest_value

    for summary in summary_by_student.values():
        summary["latest_submission_at"] = iso_or_none(summary.get("latest_submission_at"))
    for summary in summary_by_plan_student.values():
        summary["latest_submission_at"] = iso_or_none(summary.get("latest_submission_at"))

    return dict(summary_by_student), dict(summary_by_plan_student)


def resolve_plan_submission_status(summary: dict[str, Any] | None) -> str | None:
    if summary is None:
        return None
    if int(summary.get("reviewed_submission_count", 0)) > 0:
        return "reviewed"
    if int(summary.get("submission_count", 0)) > 0:
        return "submitted"
    return "not_started"


def resolve_focus_plan_submission_stage(
    focus_plan_summary: dict[str, Any] | None,
    focus_plan_task_count: int | None,
) -> str:
    submitted_task_count = int((focus_plan_summary or {}).get("submission_count", 0))
    total_task_count = max(int(focus_plan_task_count or 0), 0)
    if submitted_task_count <= 0:
        return "none"
    if total_task_count > 0 and submitted_task_count >= total_task_count:
        return "completed"
    return "partial"


def serialize_session_summary(
    session: ClassroomSession,
    student_count: int,
    checked_in_count: int,
    submission_summary: dict | None,
) -> dict:
    submission_summary = submission_summary or {
        "submission_count": 0,
        "pending_review_count": 0,
        "reviewed_count": 0,
        "recommended_count": 0,
    }
    pending_signin_count = max(student_count - checked_in_count, 0)

    return {
        "session_id": session.id,
        "status": session.status,
        "started_at": session.started_at.isoformat(),
        "class": {
            "id": session.school_class.id,
            "name": session.school_class.class_name,
            "student_count": student_count,
        },
        "plan": {
            "id": session.lesson_plan.id,
            "title": session.lesson_plan.title,
            "lesson_title": session.lesson_plan.lesson.title,
            "unit_title": session.lesson_plan.lesson.unit.title,
            "book_name": session.lesson_plan.lesson.unit.book.name,
        },
        "task_count": len(session.lesson_plan.tasks),
        "submission_count": submission_summary["submission_count"],
        "pending_review_count": submission_summary["pending_review_count"],
        "reviewed_count": submission_summary["reviewed_count"],
        "recommended_count": submission_summary["recommended_count"],
        "checked_in_count": checked_in_count,
        "pending_signin_count": pending_signin_count,
    }


def serialize_student(
    profile: StudentProfile,
    checked_in_at: str | None,
    submission_summary: dict[str, Any] | None = None,
    focus_plan_summary: dict[str, Any] | None = None,
    focus_plan_task_count: int | None = None,
) -> dict:
    submission_summary = submission_summary or {}
    focus_plan_submitted_task_count = int((focus_plan_summary or {}).get("submission_count", 0))
    return {
        "user_id": profile.user_id,
        "student_no": profile.student_no,
        "display_name": profile.user.display_name,
        "signed_in_today": checked_in_at is not None,
        "checked_in_at": checked_in_at,
        "submission_count": int(submission_summary.get("submission_count", 0)),
        "reviewed_submission_count": int(submission_summary.get("reviewed_submission_count", 0)),
        "pending_review_count": int(submission_summary.get("pending_review_count", 0)),
        "latest_submission_at": submission_summary.get("latest_submission_at"),
        "focus_plan_submission_status": resolve_plan_submission_status(focus_plan_summary),
        "focus_plan_submitted_at": (
            focus_plan_summary.get("latest_submission_at")
            if isinstance(focus_plan_summary, dict)
            else None
        ),
        "focus_plan_submitted_task_count": focus_plan_submitted_task_count,
        "focus_plan_task_count": max(int(focus_plan_task_count or 0), 0),
        "focus_plan_submission_stage": resolve_focus_plan_submission_stage(
            focus_plan_summary,
            focus_plan_task_count,
        ),
    }


def serialize_seat_map(
    school_class: SchoolClass,
    checked_in_at_by_student: dict[int, str],
    checked_in_record_by_seat_id: dict[int, AttendanceRecord],
    student_submission_summary_by_id: dict[int, dict[str, Any]],
    plan_submission_summary_by_student: dict[tuple[int, int], dict[str, Any]],
    *,
    focus_plan_id: int | None = None,
    focus_plan_title: str | None = None,
    focus_plan_task_count: int | None = None,
) -> dict:
    profile_by_user_id = {profile.user_id: profile for profile in school_class.students}

    seats: list[dict] = []
    room = school_class.default_room
    seat_by_position: dict[tuple[int, int], ComputerSeat] = {}
    if room is not None:
        for seat in room.seats:
            seat_by_position[(seat.row_no, seat.col_no)] = seat

        max_row = max(room.row_count, max((seat.row_no for seat in room.seats), default=0))
        max_col = max(room.col_count, max((seat.col_no for seat in room.seats), default=0))
        for row_no in range(1, max_row + 1):
            for col_no in range(1, max_col + 1):
                seat = seat_by_position.get((row_no, col_no))
                if seat is None:
                    seats.append(
                        {
                            "seat_key": f"virtual-{school_class.id}-{row_no}-{col_no}",
                            "seat_id": None,
                            "seat_label": f"{row_no}-{col_no}",
                            "row_no": row_no,
                            "col_no": col_no,
                            "ip_address": "--",
                            "hostname": None,
                            "is_enabled": False,
                            "is_virtual": True,
                            "signed_in_today": False,
                            "checked_in_at": None,
                            "student": None,
                        }
                    )
                    continue

                record = checked_in_record_by_seat_id.get(seat.id)
                student_payload = None
                checked_in_at = None
                if record is not None and record.student_id in profile_by_user_id:
                    profile = profile_by_user_id[record.student_id]
                    checked_in_at = record.checked_in_at.isoformat()
                    focus_plan_summary = (
                        plan_submission_summary_by_student.get((focus_plan_id, profile.user_id))
                        if focus_plan_id is not None
                        else None
                    )
                    student_payload = serialize_student(
                        profile,
                        checked_in_at,
                        student_submission_summary_by_id.get(profile.user_id),
                        focus_plan_summary,
                        focus_plan_task_count,
                    )

                seats.append(
                    {
                        "seat_key": f"seat-{seat.id}",
                        "seat_id": seat.id,
                        "seat_label": seat.seat_label,
                        "row_no": seat.row_no,
                        "col_no": seat.col_no,
                        "ip_address": seat.ip_address,
                        "hostname": seat.hostname,
                        "is_enabled": seat.is_enabled,
                        "is_virtual": False,
                        "signed_in_today": checked_in_at is not None,
                        "checked_in_at": checked_in_at,
                        "student": student_payload,
                    }
                )

    pending_students = [
        serialize_student(
            profile,
            checked_in_at_by_student.get(profile.user_id),
            student_submission_summary_by_id.get(profile.user_id),
            (
                plan_submission_summary_by_student.get((focus_plan_id, profile.user_id))
                if focus_plan_id is not None
                else None
            ),
            focus_plan_task_count,
        )
        for profile in sorted(school_class.students, key=lambda item: item.student_no)
        if not checked_in_at_by_student.get(profile.user_id)
    ]
    checked_in_count = sum(1 for profile in school_class.students if checked_in_at_by_student.get(profile.user_id))

    return {
        "class_id": school_class.id,
        "class_name": school_class.class_name,
        "grade_no": school_class.grade_no,
        "class_no": school_class.class_no,
        "student_count": len(school_class.students),
        "checked_in_count": checked_in_count,
        "pending_signin_count": max(len(school_class.students) - checked_in_count, 0),
        "room": (
            {
                "id": room.id,
                "name": room.name,
                "row_count": max(room.row_count, max((seat.row_no for seat in room.seats), default=0)),
                "col_count": max(room.col_count, max((seat.col_no for seat in room.seats), default=0)),
            }
            if room is not None
            else None
        ),
        "focus_plan": (
            {"id": focus_plan_id, "title": focus_plan_title}
            if focus_plan_id is not None and focus_plan_title
            else None
        ),
        "students": [
            serialize_student(
                profile,
                checked_in_at_by_student.get(profile.user_id),
                student_submission_summary_by_id.get(profile.user_id),
                (
                    plan_submission_summary_by_student.get((focus_plan_id, profile.user_id))
                    if focus_plan_id is not None
                    else None
                ),
                focus_plan_task_count,
            )
            for profile in sorted(school_class.students, key=lambda item: item.student_no)
        ],
        "seats": seats,
        "unassigned_students": pending_students,
    }


def build_content_disposition(filename: str, disposition: str = "attachment") -> str:
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip() or "download.bin"
    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'


def serialize_group_drive_limits(db: Session) -> dict:
    limits = load_group_drive_upload_limits(db)
    return {
        "max_file_count": limits["max_file_count"],
        "single_file_max_mb": limits["single_file_max_mb"],
        "allowed_extensions": limits["allowed_extensions"],
        "allowed_extensions_text": limits["allowed_extensions_text"],
    }


def serialize_group_operation_log_collection(logs: list) -> list[dict]:
    return [serialize_group_operation_log(item) for item in logs]


def build_group_operation_log_csv(logs: list) -> str:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "日志ID",
            "时间",
            "事件类型",
            "事件标签",
            "小组编号",
            "小组名称",
            "操作人",
            "操作人角色",
            "操作人学号",
            "任务标题",
            "文件名称",
            "版本号",
            "标题",
            "说明",
        ]
    )
    for log in logs:
        writer.writerow(
            [
                log.id,
                log.occurred_at.isoformat() if log.occurred_at else "",
                log.event_type,
                log.event_label,
                log.group_no or "",
                log.group_name,
                log.actor_name or "",
                log.actor_role or "",
                log.actor_student_no or "",
                log.task_title or "",
                log.file_name or "",
                log.version_no or "",
                log.title,
                log.description,
            ]
        )
    return buffer.getvalue()


def default_group_name(school_class: SchoolClass, group_no: int) -> str:
    return f"{school_class.class_name} 第{group_no}组"


def build_group_drive_name(group_name: str) -> str:
    return f"{group_name}共享网盘"


def chunk_students_evenly(students: list[StudentProfile], group_count: int) -> list[list[StudentProfile]]:
    if group_count <= 0:
        return []

    students = list(students)
    total_count = len(students)
    if total_count == 0:
        return [[] for _ in range(group_count)]

    base_size = total_count // group_count
    remainder = total_count % group_count
    chunks: list[list[StudentProfile]] = []
    start = 0

    for index in range(group_count):
        chunk_size = base_size + (1 if index < remainder else 0)
        chunks.append(students[start : start + chunk_size])
        start += chunk_size

    return chunks


def load_attendance_by_student_id(class_id: int, db: Session) -> dict[int, AttendanceRecord]:
    attendance_rows = db.scalars(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.class_id == class_id,
            AttendanceRecord.attendance_date == date.today(),
        )
        .order_by(AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
    ).all()

    attendance_by_student_id: dict[int, AttendanceRecord] = {}
    for record in attendance_rows:
        attendance_by_student_id.setdefault(record.student_id, record)
    return attendance_by_student_id


def load_attendance_by_student_id_for_date(
    class_id: int,
    target_date: date,
    db: Session,
) -> dict[int, AttendanceRecord]:
    attendance_rows = db.scalars(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.class_id == class_id,
            AttendanceRecord.attendance_date == target_date,
        )
        .order_by(AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
    ).all()

    attendance_by_student_id: dict[int, AttendanceRecord] = {}
    for record in attendance_rows:
        attendance_by_student_id.setdefault(record.student_id, record)
    return attendance_by_student_id


def load_staff_classes_for_selector(staff: User, db: Session) -> list[SchoolClass]:
    accessible_class_ids = sorted(get_accessible_class_ids(staff, db))
    if not accessible_class_ids:
        return []

    return db.scalars(
        select(SchoolClass)
        .where(SchoolClass.id.in_(accessible_class_ids))
        .options(selectinload(SchoolClass.students).selectinload(StudentProfile.user))
        .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
    ).all()


def load_staff_student_profile_or_404(student_user_id: int, staff: User, db: Session) -> StudentProfile:
    profile = db.scalar(
        select(StudentProfile)
        .where(StudentProfile.user_id == student_user_id)
        .options(
            selectinload(StudentProfile.user),
            selectinload(StudentProfile.school_class),
        )
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生不存在")
    if not staff_can_access_class(staff, profile.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该学生")
    return profile


def normalize_reset_password(new_password: str | None, student_no: str) -> str:
    if new_password:
        return new_password
    fallback = student_no[-6:]
    if len(fallback) >= 6:
        return fallback
    return f"{student_no}123456"[-6:]


def rebalance_group_after_member_removed(group: StudentGroup, db: Session) -> None:
    remaining_members = db.scalars(
        select(StudentGroupMember)
        .where(StudentGroupMember.group_id == group.id)
        .options(selectinload(StudentGroupMember.student).selectinload(User.student_profile))
    ).all()
    if not remaining_members:
        group.leader_user_id = None
        return

    remaining_members = sorted(
        remaining_members,
        key=lambda item: (
            item.student.student_profile.student_no if item.student.student_profile else item.student.username
        ),
    )
    remaining_ids = {item.student_user_id for item in remaining_members}
    if group.leader_user_id not in remaining_ids:
        group.leader_user_id = remaining_members[0].student_user_id
    for item in remaining_members:
        item.role = "leader" if item.student_user_id == group.leader_user_id else "member"


def iso_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def build_staff_attendance_payload(
    staff: User,
    db: Session,
    *,
    class_id: int | None = None,
    attendance_date: date | None = None,
) -> dict:
    classes = load_staff_classes_for_selector(staff, db)
    target_date = attendance_date or date.today()
    if not classes:
        return {
            "attendance_date": target_date.isoformat(),
            "classes": [],
            "selected_class_id": None,
            "selected_class": None,
            "summary": {
                "class_count": 0,
                "student_count": 0,
                "present_count": 0,
                "absent_count": 0,
            },
            "records": [],
        }

    class_by_id = {item.id: item for item in classes}
    if class_id is not None and class_id not in class_by_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级签到")

    selected_class_id = class_id or classes[0].id
    selected_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == selected_class_id)
        .options(
            selectinload(SchoolClass.students).selectinload(StudentProfile.user),
            selectinload(SchoolClass.seat_assignments)
            .selectinload(ClassSeatAssignment.seat)
            .selectinload(ComputerSeat.room),
        )
    )
    if selected_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")
    accessible_class_ids = [item.id for item in classes]
    attendance_rows = db.scalars(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.class_id.in_(accessible_class_ids),
            AttendanceRecord.attendance_date == target_date,
        )
        .order_by(AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
    ).all()

    attendance_by_class_student: dict[int, dict[int, AttendanceRecord]] = defaultdict(dict)
    present_student_ids_by_class: dict[int, set[int]] = defaultdict(set)
    for record in attendance_rows:
        attendance_by_class_student[record.class_id].setdefault(record.student_id, record)
        present_student_ids_by_class[record.class_id].add(record.student_id)

    selected_attendance_map = attendance_by_class_student.get(selected_class.id, {})
    seat_by_student_id = {item.student_user_id: item for item in selected_class.seat_assignments}
    records: list[dict] = []
    for profile in sorted(selected_class.students, key=lambda item: item.student_no):
        attendance = selected_attendance_map.get(profile.user_id)
        seat_assignment = seat_by_student_id.get(profile.user_id)
        records.append(
            {
                "user_id": profile.user_id,
                "student_no": profile.student_no,
                "username": profile.user.username,
                "display_name": profile.user.display_name,
                "is_active": profile.user.is_active,
                "seat_label": (
                    seat_assignment.seat.seat_label
                    if seat_assignment and seat_assignment.seat
                    else None
                ),
                "room_name": (
                    seat_assignment.seat.room.name
                    if seat_assignment and seat_assignment.seat and seat_assignment.seat.room
                    else None
                ),
                "status": "present" if attendance is not None else "absent",
                "checked_in_at": iso_or_none(attendance.checked_in_at if attendance else None),
                "signin_source": attendance.signin_source if attendance else None,
                "client_ip": attendance.client_ip if attendance else None,
            }
        )

    class_payload = []
    total_students = 0
    total_present = 0
    for school_class in classes:
        student_count = len(school_class.students)
        present_count = len(present_student_ids_by_class.get(school_class.id, set()))
        total_students += student_count
        total_present += present_count
        class_payload.append(
            {
                "id": school_class.id,
                "class_name": school_class.class_name,
                "grade_no": school_class.grade_no,
                "class_no": school_class.class_no,
                "student_count": student_count,
                "present_count": present_count,
                "absent_count": max(student_count - present_count, 0),
            }
        )

    selected_present_count = len(present_student_ids_by_class.get(selected_class.id, set()))
    return {
        "attendance_date": target_date.isoformat(),
        "classes": class_payload,
        "selected_class_id": selected_class.id,
        "selected_class": {
            "id": selected_class.id,
            "class_name": selected_class.class_name,
            "grade_no": selected_class.grade_no,
            "class_no": selected_class.class_no,
            "student_count": len(selected_class.students),
            "present_count": selected_present_count,
            "absent_count": max(len(selected_class.students) - selected_present_count, 0),
        },
        "summary": {
            "class_count": len(classes),
            "student_count": total_students,
            "present_count": total_present,
            "absent_count": max(total_students - total_present, 0),
        },
        "records": records,
    }


def build_staff_attendance_csv(
    payload: dict,
    *,
    mode: str,
) -> str:
    records = payload.get("records", [])
    if mode == "present":
        records = [item for item in records if item.get("status") == "present"]
    elif mode == "absent":
        records = [item for item in records if item.get("status") == "absent"]

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "日期",
            "班级",
            "学号",
            "姓名",
            "账号",
            "状态",
            "签到时间",
            "签到来源",
            "座位号",
            "机房",
            "登录IP",
        ]
    )
    class_name = payload.get("selected_class", {}).get("class_name") or ""
    attendance_date = payload.get("attendance_date") or ""
    for item in records:
        writer.writerow(
            [
                attendance_date,
                class_name,
                item.get("student_no") or "",
                item.get("display_name") or "",
                item.get("username") or "",
                "已签到" if item.get("status") == "present" else "未签到",
                item.get("checked_in_at") or "",
                item.get("signin_source") or "",
                item.get("seat_label") or "",
                item.get("room_name") or "",
                item.get("client_ip") or "",
            ]
        )
    return buffer.getvalue()


def build_staff_students_payload(
    staff: User,
    db: Session,
    *,
    class_id: int | None = None,
    keyword: str | None = None,
    include_inactive: bool = False,
) -> dict:
    classes = load_staff_classes_for_selector(staff, db)
    if not classes:
        return {
            "classes": [],
            "selected_class_id": None,
            "selected_class": None,
            "summary": {
                "student_count": 0,
                "active_count": 0,
                "inactive_count": 0,
                "checked_in_today": 0,
                "grouped_count": 0,
            },
            "items": [],
        }

    class_by_id = {item.id: item for item in classes}
    if class_id is not None and class_id not in class_by_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级学生")

    selected_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == (class_id or classes[0].id))
        .options(
            selectinload(SchoolClass.students).selectinload(StudentProfile.user),
            selectinload(SchoolClass.seat_assignments)
            .selectinload(ClassSeatAssignment.seat)
            .selectinload(ComputerSeat.room),
            selectinload(SchoolClass.student_groups)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
        )
    )
    if selected_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    attendance_map = load_attendance_by_student_id_for_date(selected_class.id, date.today(), db)
    seat_by_student_id = {item.student_user_id: item for item in selected_class.seat_assignments}
    group_info_by_student_id: dict[int, dict] = {}
    for group in selected_class.student_groups:
        for membership in group.memberships:
            group_info_by_student_id[membership.student_user_id] = {
                "group_id": group.id,
                "group_no": group.group_no,
                "group_name": group.name,
                "role": membership.role,
            }

    student_ids = [item.user_id for item in selected_class.students]
    submissions = db.scalars(
        select(Submission).where(Submission.student_id.in_(student_ids or [-1]))
    ).all()
    submission_summary: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "submission_count": 0,
            "reviewed_submission_count": 0,
            "pending_review_count": 0,
            "latest_submission_at": None,
        }
    )
    for submission in submissions:
        item = submission_summary[submission.student_id]
        item["submission_count"] += 1
        if submission.submit_status == "reviewed":
            item["reviewed_submission_count"] += 1
        if submission.submit_status == "submitted":
            item["pending_review_count"] += 1
        latest_value = submission.submitted_at or submission.updated_at
        if latest_value is None:
            continue
        previous = item["latest_submission_at"]
        if previous is None or latest_value > previous:
            item["latest_submission_at"] = latest_value

    normalized_keyword = (keyword or "").strip().lower()
    items: list[dict] = []
    for profile in sorted(selected_class.students, key=lambda item: item.student_no):
        user = profile.user
        if not include_inactive and not user.is_active:
            continue
        if normalized_keyword and all(
            normalized_keyword not in value.lower()
            for value in (profile.student_no, user.username, user.display_name)
        ):
            continue

        attendance = attendance_map.get(profile.user_id)
        seat_assignment = seat_by_student_id.get(profile.user_id)
        group_info = group_info_by_student_id.get(profile.user_id)
        submission_item = submission_summary.get(profile.user_id, {})
        items.append(
            {
                "user_id": profile.user_id,
                "student_no": profile.student_no,
                "username": user.username,
                "display_name": user.display_name,
                "gender": profile.gender,
                "is_active": user.is_active,
                "class_id": selected_class.id,
                "class_name": selected_class.class_name,
                "checked_in_today": attendance is not None,
                "checked_in_at": iso_or_none(attendance.checked_in_at if attendance else None),
                "seat_label": (
                    seat_assignment.seat.seat_label
                    if seat_assignment and seat_assignment.seat
                    else None
                ),
                "room_name": (
                    seat_assignment.seat.room.name
                    if seat_assignment and seat_assignment.seat and seat_assignment.seat.room
                    else None
                ),
                "current_group_id": group_info.get("group_id") if group_info else None,
                "current_group_no": group_info.get("group_no") if group_info else None,
                "current_group_name": group_info.get("group_name") if group_info else None,
                "current_role": group_info.get("role") if group_info else None,
                "submission_count": int(submission_item.get("submission_count", 0)),
                "reviewed_submission_count": int(submission_item.get("reviewed_submission_count", 0)),
                "pending_review_count": int(submission_item.get("pending_review_count", 0)),
                "latest_submission_at": iso_or_none(submission_item.get("latest_submission_at")),
            }
        )

    class_payload = [
        {
            "id": school_class.id,
            "class_name": school_class.class_name,
            "grade_no": school_class.grade_no,
            "class_no": school_class.class_no,
            "student_count": len(school_class.students),
            "active_count": sum(1 for item in school_class.students if item.user.is_active),
            "inactive_count": sum(1 for item in school_class.students if not item.user.is_active),
        }
        for school_class in classes
    ]

    return {
        "classes": class_payload,
        "selected_class_id": selected_class.id,
        "selected_class": {
            "id": selected_class.id,
            "class_name": selected_class.class_name,
            "grade_no": selected_class.grade_no,
            "class_no": selected_class.class_no,
            "student_count": len(selected_class.students),
        },
        "summary": {
            "student_count": len(items),
            "active_count": sum(1 for item in items if item["is_active"]),
            "inactive_count": sum(1 for item in items if not item["is_active"]),
            "checked_in_today": sum(1 for item in items if item["checked_in_today"]),
            "grouped_count": sum(1 for item in items if item["current_group_id"] is not None),
        },
        "items": items,
    }


def build_staff_students_csv(payload: dict) -> str:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "班级",
            "学号",
            "账号",
            "姓名",
            "性别",
            "账号状态",
            "小组",
            "角色",
            "座位号",
            "机房",
            "今日签到",
            "签到时间",
            "提交次数",
            "已评阅次数",
            "待评阅次数",
            "最近提交时间",
        ]
    )
    for item in payload.get("items", []):
        writer.writerow(
            [
                item.get("class_name") or "",
                item.get("student_no") or "",
                item.get("username") or "",
                item.get("display_name") or "",
                item.get("gender") or "",
                "启用" if item.get("is_active") else "停用",
                item.get("current_group_name") or "",
                "组长" if item.get("current_role") == "leader" else ("组员" if item.get("current_role") else ""),
                item.get("seat_label") or "",
                item.get("room_name") or "",
                "是" if item.get("checked_in_today") else "否",
                item.get("checked_in_at") or "",
                item.get("submission_count") or 0,
                item.get("reviewed_submission_count") or 0,
                item.get("pending_review_count") or 0,
                item.get("latest_submission_at") or "",
            ]
        )
    return buffer.getvalue()


def load_group_drive_space_by_group_id(group_ids: list[int], db: Session) -> dict[int, DriveSpace]:
    if not group_ids:
        return {}

    spaces = db.scalars(
        select(DriveSpace)
        .where(
            DriveSpace.owner_type == "group",
            DriveSpace.owner_id.in_(group_ids),
        )
        .options(
            selectinload(DriveSpace.files)
            .selectinload(DriveFile.uploaded_by_user)
            .selectinload(User.student_profile)
        )
    ).all()
    return {space.owner_id: space for space in spaces}


def sync_group_drive_space_name(group: StudentGroup, db: Session) -> None:
    space = db.scalar(
        select(DriveSpace).where(
            DriveSpace.owner_type == "group",
            DriveSpace.owner_id == group.id,
        )
    )
    if space is None:
        return

    expected_name = build_group_drive_name(group.name)
    if space.display_name != expected_name:
        space.display_name = expected_name


def serialize_staff_drive_file(drive_file: DriveFile) -> dict:
    uploaded_by = drive_file.uploaded_by_user
    profile = uploaded_by.student_profile if uploaded_by else None
    return {
        "id": drive_file.id,
        "name": drive_file.stored_name,
        "original_name": drive_file.original_name,
        "ext": drive_file.file_ext,
        "size_bytes": drive_file.size_bytes,
        "size_kb": max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0,
        "updated_at": drive_file.updated_at.isoformat() if drive_file.updated_at else None,
        "uploaded_by_user_id": drive_file.uploaded_by_user_id,
        "uploaded_by_name": uploaded_by.display_name if uploaded_by else None,
        "uploaded_by_student_no": (
            profile.student_no if profile else (uploaded_by.username if uploaded_by else None)
        ),
    }


def serialize_staff_group_member(
    member: StudentGroupMember,
    seat_by_student_id: dict[int, ClassSeatAssignment],
    attendance_by_student_id: dict[int, AttendanceRecord],
) -> dict:
    seat_assignment = seat_by_student_id.get(member.student_user_id)
    attendance = attendance_by_student_id.get(member.student_user_id)
    profile = member.student.student_profile
    return {
        "user_id": member.student.id,
        "student_no": profile.student_no if profile else member.student.username,
        "display_name": member.student.display_name,
        "role": member.role,
        "seat_label": seat_assignment.seat.seat_label if seat_assignment and seat_assignment.seat else None,
        "room_name": (
            seat_assignment.seat.room.name
            if seat_assignment and seat_assignment.seat and seat_assignment.seat.room
            else None
        ),
        "checked_in_today": attendance is not None,
        "checked_in_at": attendance.checked_in_at.isoformat() if attendance else None,
    }


def serialize_staff_group(
    group: StudentGroup,
    seat_by_student_id: dict[int, ClassSeatAssignment],
    attendance_by_student_id: dict[int, AttendanceRecord],
    drive_space: DriveSpace,
    drive_limits: dict,
    submissions: list[Submission] | None = None,
    operation_logs: list[dict] | None = None,
) -> dict:
    members = sorted(
        group.memberships,
        key=lambda item: (item.role != "leader", item.student.student_profile.student_no),
    )
    member_payload = [
        serialize_staff_group_member(item, seat_by_student_id, attendance_by_student_id)
        for item in members
    ]
    checked_in_count = sum(1 for item in member_payload if item["checked_in_today"])
    files = sorted(drive_space.files, key=lambda item: (item.updated_at, item.id), reverse=True)
    quota_bytes = drive_space.quota_mb * 1024 * 1024
    remaining_bytes = max(quota_bytes - drive_space.used_bytes, 0)
    usage_percent = round((drive_space.used_bytes / quota_bytes) * 100, 1) if quota_bytes else 0
    leader = next((item for item in member_payload if item["role"] == "leader"), None)

    return {
        "id": group.id,
        "group_no": group.group_no,
        "name": group.name,
        "description": group.description,
        "leader_name": leader["display_name"] if leader else None,
        "leader_student_no": leader["student_no"] if leader else None,
        "member_count": len(member_payload),
        "checked_in_count": checked_in_count,
        "pending_count": max(len(member_payload) - checked_in_count, 0),
        "members": member_payload,
        "shared_drive": {
            "space_id": drive_space.id,
            "display_name": drive_space.display_name,
            "quota_mb": drive_space.quota_mb,
            "used_bytes": drive_space.used_bytes,
            "remaining_bytes": remaining_bytes,
            "usage_percent": usage_percent,
            "file_count": len(files),
            "limits": drive_limits,
            "files": [serialize_staff_drive_file(item) for item in files],
        },
        "activity_feed": build_group_activity_feed(
            group,
            attendance_by_student_id,
            drive_space,
            submissions,
        ),
        "operation_logs": operation_logs or [],
    }


def serialize_group_management_student(
    profile: StudentProfile,
    membership_by_student_id: dict[int, StudentGroupMember],
    seat_by_student_id: dict[int, ClassSeatAssignment],
    attendance_by_student_id: dict[int, AttendanceRecord],
) -> dict:
    membership = membership_by_student_id.get(profile.user_id)
    seat_assignment = seat_by_student_id.get(profile.user_id)
    attendance = attendance_by_student_id.get(profile.user_id)

    return {
        "user_id": profile.user_id,
        "student_no": profile.student_no,
        "display_name": profile.user.display_name,
        "checked_in_today": attendance is not None,
        "checked_in_at": attendance.checked_in_at.isoformat() if attendance else None,
        "seat_label": seat_assignment.seat.seat_label if seat_assignment and seat_assignment.seat else None,
        "room_name": (
            seat_assignment.seat.room.name
            if seat_assignment and seat_assignment.seat and seat_assignment.seat.room
            else None
        ),
        "current_group_id": membership.group_id if membership else None,
        "current_group_no": membership.group.group_no if membership else None,
        "current_group_name": membership.group.name if membership else None,
        "current_role": membership.role if membership else None,
    }


def serialize_group_management_group(
    group: StudentGroup,
    seat_by_student_id: dict[int, ClassSeatAssignment],
    attendance_by_student_id: dict[int, AttendanceRecord],
    drive_space: DriveSpace | None,
) -> dict:
    members = sorted(
        group.memberships,
        key=lambda item: (item.role != "leader", item.student.student_profile.student_no),
    )
    member_payload = [
        serialize_staff_group_member(item, seat_by_student_id, attendance_by_student_id)
        for item in members
    ]
    leader = next((item for item in member_payload if item["role"] == "leader"), None)
    file_count = len(drive_space.files) if drive_space else 0

    return {
        "id": group.id,
        "group_no": group.group_no,
        "name": group.name,
        "description": group.description,
        "leader_user_id": group.leader_user_id,
        "leader_name": leader["display_name"] if leader else None,
        "leader_student_no": leader["student_no"] if leader else None,
        "member_count": len(member_payload),
        "file_count": file_count,
        "used_bytes": drive_space.used_bytes if drive_space else 0,
        "has_shared_files": file_count > 0,
        "members": member_payload,
    }


def load_staff_group_class_or_404(class_id: int, staff: User, db: Session) -> SchoolClass:
    if not staff_can_access_class(staff, class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级的小组信息")

    school_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == class_id)
        .options(
            selectinload(SchoolClass.students).selectinload(StudentProfile.user),
            selectinload(SchoolClass.seat_assignments)
            .selectinload(ClassSeatAssignment.seat)
            .selectinload(ComputerSeat.room),
            selectinload(SchoolClass.student_groups)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(SchoolClass.student_groups).selectinload(StudentGroup.leader),
        )
    )
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    return school_class


def build_class_group_overview_payload(school_class: SchoolClass, db: Session) -> dict:
    attendance_by_student_id = load_attendance_by_student_id(school_class.id, db)
    seat_by_student_id = {assignment.student_user_id: assignment for assignment in school_class.seat_assignments}
    submission_map = load_recent_group_submissions(
        [group.id for group in school_class.student_groups],
        db,
    )
    drive_limits = serialize_group_drive_limits(db)
    operation_log_map = load_group_operation_logs_by_group_id(
        [group.id for group in school_class.student_groups],
        db,
    )
    group_payload = []
    shared_file_count = 0

    for group in school_class.student_groups:
        drive_space = ensure_group_drive_space(group, db)
        payload = serialize_staff_group(
            group,
            seat_by_student_id,
            attendance_by_student_id,
            drive_space,
            drive_limits,
            submission_map.get(group.id),
            serialize_group_operation_log_collection(operation_log_map.get(group.id, [])),
        )
        shared_file_count += payload["shared_drive"]["file_count"]
        group_payload.append(payload)

    checked_in_count = sum(
        1 for profile in school_class.students if profile.user_id in attendance_by_student_id
    )

    return {
        "class": {
            "id": school_class.id,
            "class_name": school_class.class_name,
            "grade_no": school_class.grade_no,
            "class_no": school_class.class_no,
            "student_count": len(school_class.students),
            "checked_in_count": checked_in_count,
            "group_count": len(group_payload),
            "shared_file_count": shared_file_count,
        },
        "groups": group_payload,
    }


def build_group_management_payload(school_class: SchoolClass, db: Session) -> dict:
    attendance_by_student_id = load_attendance_by_student_id(school_class.id, db)
    seat_by_student_id = {assignment.student_user_id: assignment for assignment in school_class.seat_assignments}
    groups = sorted(school_class.student_groups, key=lambda item: (item.group_no, item.id))
    drive_space_by_group_id = load_group_drive_space_by_group_id([group.id for group in groups], db)

    membership_by_student_id: dict[int, StudentGroupMember] = {}
    group_payload = []
    for group in groups:
        for membership in group.memberships:
            membership_by_student_id[membership.student_user_id] = membership
        group_payload.append(
            serialize_group_management_group(
                group,
                seat_by_student_id,
                attendance_by_student_id,
                drive_space_by_group_id.get(group.id),
            )
        )

    students = [
        serialize_group_management_student(
            profile,
            membership_by_student_id,
            seat_by_student_id,
            attendance_by_student_id,
        )
        for profile in sorted(school_class.students, key=lambda item: item.student_no)
    ]
    checked_in_count = sum(1 for student in students if student["checked_in_today"])
    unassigned_count = sum(1 for student in students if student["current_group_id"] is None)

    return {
        "class": {
            "id": school_class.id,
            "class_name": school_class.class_name,
            "grade_no": school_class.grade_no,
            "class_no": school_class.class_no,
            "student_count": len(students),
            "checked_in_count": checked_in_count,
            "group_count": len(group_payload),
            "unassigned_count": unassigned_count,
        },
        "groups": group_payload,
        "students": students,
        "operation_logs": [
            serialize_group_operation_log(item)
            for item in load_recent_class_group_logs(school_class.id, db)
        ],
    }


def format_member_name_list(user_ids: list[int], user_name_by_id: dict[int, str]) -> str:
    if not user_ids:
        return "无成员"

    names = [user_name_by_id.get(user_id, f"用户{user_id}") for user_id in user_ids]
    if len(names) <= 4:
        return "、".join(names)
    return f"{'、'.join(names[:4])} 等{len(names)}人"


def capture_group_snapshots(school_class: SchoolClass) -> dict[int, dict]:
    snapshots: dict[int, dict] = {}
    for group in school_class.student_groups:
        snapshots[group.id] = {
            "group_no": group.group_no,
            "name": group.name,
            "description": group.description or "",
            "leader_user_id": group.leader_user_id,
            "member_user_ids": [membership.student_user_id for membership in group.memberships],
        }
    return snapshots


def build_group_configuration_change_summary(
    previous_snapshot: dict | None,
    *,
    name: str,
    description: str | None,
    leader_user_id: int | None,
    member_user_ids: list[int],
    user_name_by_id: dict[int, str],
) -> str | None:
    leader_name = user_name_by_id.get(leader_user_id, "未设置") if leader_user_id is not None else "未设置"
    normalized_description = (description or "").strip()

    if previous_snapshot is None:
        return (
            f"已建立新的小组配置，当前组长为 {leader_name}；"
            f"成员：{format_member_name_list(member_user_ids, user_name_by_id)}。"
        )

    changes: list[str] = []
    if previous_snapshot["name"] != name:
        changes.append(f"组名由“{previous_snapshot['name']}”改为“{name}”")
    if (previous_snapshot["description"] or "") != normalized_description:
        changes.append("更新了小组说明")

    previous_leader_user_id = previous_snapshot["leader_user_id"]
    if previous_leader_user_id != leader_user_id:
        previous_leader_name = (
            user_name_by_id.get(previous_leader_user_id, "未设置")
            if previous_leader_user_id is not None
            else "未设置"
        )
        changes.append(f"组长由 {previous_leader_name} 调整为 {leader_name}")

    previous_member_ids = set(previous_snapshot["member_user_ids"])
    current_member_ids = set(member_user_ids)
    added_ids = [user_id for user_id in member_user_ids if user_id not in previous_member_ids]
    removed_ids = [user_id for user_id in previous_snapshot["member_user_ids"] if user_id not in current_member_ids]

    if added_ids:
        changes.append(f"新增成员：{format_member_name_list(added_ids, user_name_by_id)}")
    if removed_ids:
        changes.append(f"移出成员：{format_member_name_list(removed_ids, user_name_by_id)}")

    if not changes:
        return None

    return "；".join(changes)


def load_staff_plan_or_404(plan_id: int, db: Session) -> LessonPlan:
    plan = db.scalar(
        select(LessonPlan)
        .where(LessonPlan.id == plan_id)
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
        )
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")
    return plan


def build_group_task_progress_payload(school_class: SchoolClass, plan: LessonPlan, db: Session) -> dict:
    groups = [group for group in sorted(school_class.student_groups, key=lambda item: (item.group_no, item.id)) if group.memberships]
    group_tasks = [
        task
        for task in sorted(plan.tasks, key=lambda item: (item.sort_order, item.id))
        if (task.submission_scope or "individual") == "group" and task.task_type != "reading"
    ]

    if not groups or not group_tasks:
        return {
            "class": {
                "id": school_class.id,
                "class_name": school_class.class_name,
            },
            "plan": {
                "id": plan.id,
                "title": plan.title,
                "lesson_title": plan.lesson.title,
                "unit_title": plan.lesson.unit.title,
            },
            "summary": {
                "group_count": len(groups),
                "task_count": len(group_tasks),
                "slot_count": 0,
                "submitted_count": 0,
                "reviewed_count": 0,
                "pending_count": 0,
            },
            "tasks": [],
        }

    submissions = db.scalars(
        select(Submission)
        .where(
            Submission.task_id.in_([task.id for task in group_tasks]),
            Submission.group_id.in_([group.id for group in groups]),
        )
        .options(
            selectinload(Submission.group),
            selectinload(Submission.student).selectinload(User.student_profile),
            selectinload(Submission.files),
        )
    ).all()
    submission_by_task_group = {(submission.task_id, submission.group_id): submission for submission in submissions if submission.group_id is not None}

    task_payload = []
    total_slots = len(groups) * len(group_tasks)
    submitted_count = 0
    reviewed_count = 0

    for task in group_tasks:
        items = []
        task_submitted_count = 0
        task_reviewed_count = 0
        for group in groups:
            submission = submission_by_task_group.get((task.id, group.id))
            status_value = "not_started"
            if submission is not None:
                status_value = "reviewed" if submission.submit_status == "reviewed" else "submitted"
                task_submitted_count += 1
                submitted_count += 1
                if submission.submit_status == "reviewed":
                    task_reviewed_count += 1
                    reviewed_count += 1

            items.append(
                {
                    "group_id": group.id,
                    "group_no": group.group_no,
                    "group_name": group.name,
                    "leader_name": group.leader.display_name if group.leader else None,
                    "member_count": len(group.memberships),
                    "status": status_value,
                    "submission_id": submission.id if submission else None,
                    "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
                    "updated_at": (
                        (submission.submitted_at or submission.updated_at).isoformat()
                        if submission and (submission.submitted_at or submission.updated_at)
                        else None
                    ),
                    "submitted_by_name": submission.student.display_name if submission and submission.student else None,
                    "score": submission.score if submission else None,
                    "file_count": len(submission.files) if submission else 0,
                    "is_recommended": bool(submission and submission.submit_status == "reviewed" and submission.is_recommended),
                }
            )

        task_payload.append(
            {
                "task_id": task.id,
                "task_title": task.title,
                "task_type": task.task_type,
                "submission_scope": task.submission_scope,
                "submitted_count": task_submitted_count,
                "reviewed_count": task_reviewed_count,
                "pending_count": len(groups) - task_reviewed_count,
                "items": items,
            }
        )

    return {
        "class": {
            "id": school_class.id,
            "class_name": school_class.class_name,
        },
        "plan": {
            "id": plan.id,
            "title": plan.title,
            "lesson_title": plan.lesson.title,
            "unit_title": plan.lesson.unit.title,
        },
        "summary": {
            "group_count": len(groups),
            "task_count": len(group_tasks),
            "slot_count": total_slots,
            "submitted_count": submitted_count,
            "reviewed_count": reviewed_count,
            "pending_count": total_slots - reviewed_count,
        },
        "tasks": task_payload,
    }


def load_staff_group_drive_file(file_id: int, staff: User, db: Session) -> DriveFile:
    drive_file = db.scalar(
        select(DriveFile)
        .where(DriveFile.id == file_id)
        .options(selectinload(DriveFile.space))
    )
    if drive_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="共享文件不存在")
    if drive_file.space.owner_type != "group":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前文件不是小组共享文件")

    group = db.get(StudentGroup, drive_file.space.owner_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="小组不存在")
    if not staff_can_access_class(staff, group.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级的小组共享文件")
    return drive_file


@router.get("/dashboard", response_model=ApiResponse)
def dashboard(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    today = date.today()
    roles = build_staff_roles(staff)

    classes = db.scalars(
        select(SchoolClass)
        .where(SchoolClass.id.in_(get_accessible_class_ids(staff, db)))
        .options(
            selectinload(SchoolClass.students).selectinload(StudentProfile.user),
            selectinload(SchoolClass.default_room).selectinload(ComputerRoom.seats),  # type: ignore[name-defined]
            selectinload(SchoolClass.seat_assignments).selectinload(ClassSeatAssignment.seat),
        )
        .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
    ).unique().all()

    class_student_ids: dict[int, set[int]] = {}
    student_id_to_class_id: dict[int, int] = {}
    for school_class in classes:
        student_ids = {profile.user_id for profile in school_class.students}
        class_student_ids[school_class.id] = student_ids
        for student_id in student_ids:
            student_id_to_class_id[student_id] = school_class.id
    accessible_class_id_list = list(class_student_ids.keys()) or [-1]
    accessible_student_id_list = list(student_id_to_class_id.keys()) or [-1]

    total_classes = len(classes)
    total_students = sum(len(student_ids) for student_ids in class_student_ids.values())
    total_plans = db.scalar(select(func.count(LessonPlan.id))) or 0

    recent_plans = db.scalars(
        select(LessonPlan)
        .options(
            selectinload(LessonPlan.lesson).selectinload(CurriculumLesson.unit).selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
            selectinload(LessonPlan.progresses),
        )
        .order_by(LessonPlan.assigned_date.desc(), LessonPlan.id.desc())
        .limit(6)
    ).all()

    launchpad_plans = db.scalars(
        select(LessonPlan)
        .where(LessonPlan.status.in_(("published", "active")))
        .options(
            selectinload(LessonPlan.lesson).selectinload(CurriculumLesson.unit).selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
            selectinload(LessonPlan.progresses),
        )
        .order_by(
            case((LessonPlan.status == "active", 0), else_=1),
            LessonPlan.assigned_date.desc(),
            LessonPlan.id.desc(),
        )
        .limit(10)
    ).all()

    attendance_rows = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.attendance_date == today,
            AttendanceRecord.class_id.in_(accessible_class_id_list),
        )
    ).all()
    checked_in_by_class: dict[int, int] = defaultdict(int)
    checked_in_student_ids: set[int] = set()
    checked_in_at_by_student: dict[int, str] = {}
    checked_in_record_by_class_seat: dict[int, dict[int, AttendanceRecord]] = defaultdict(dict)
    for record in attendance_rows:
        checked_in_by_class[record.class_id] += 1
        checked_in_student_ids.add(record.student_id)
        checked_in_at_by_student[record.student_id] = record.checked_in_at.isoformat()
        if record.seat_id is None:
            continue
        existing_record = checked_in_record_by_class_seat[record.class_id].get(record.seat_id)
        if existing_record is None or existing_record.checked_in_at <= record.checked_in_at:
            checked_in_record_by_class_seat[record.class_id][record.seat_id] = record

    progress_rows = db.scalars(
        select(StudentLessonPlanProgress).where(
            StudentLessonPlanProgress.student_id.in_(accessible_student_id_list)
        )
    ).all()
    progress_by_class: dict[int, dict] = defaultdict(lambda: {"pending_count": 0, "completed_count": 0})
    for progress in progress_rows:
        class_id = student_id_to_class_id.get(progress.student_id)
        if class_id is None:
            continue
        if progress.progress_status == "pending":
            progress_by_class[class_id]["pending_count"] += 1
        if progress.progress_status == "completed":
            progress_by_class[class_id]["completed_count"] += 1

    submissions = db.scalars(
        select(Submission)
        .where(Submission.student_id.in_(accessible_student_id_list))
        .options(selectinload(Submission.task))
    ).all()
    submission_by_class, submission_by_plan_class = build_submission_summary(list(submissions), student_id_to_class_id)
    student_submission_summary_by_id, plan_submission_summary_by_student = build_student_submission_summaries(
        list(submissions)
    )

    sessions = db.scalars(
        select(ClassroomSession)
        .where(ClassroomSession.class_id.in_(accessible_class_id_list))
        .options(
            selectinload(ClassroomSession.school_class),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(ClassroomSession.lesson_plan).selectinload(LessonPlan.tasks),
        )
        .order_by(ClassroomSession.started_at.desc(), ClassroomSession.id.desc())
    ).all()

    latest_session_by_class: dict[int, ClassroomSession] = {}
    active_session_count_by_class: dict[int, int] = {}
    for session in sessions:
        latest_session_by_class.setdefault(session.class_id, session)
    for class_id, latest_session in latest_session_by_class.items():
        active_session_count_by_class[class_id] = 1 if latest_session.status == "active" else 0

    recent_sessions = [
        serialize_session_summary(
            session=session,
            student_count=len(class_student_ids.get(session.class_id, set())),
            checked_in_count=checked_in_by_class.get(session.class_id, 0),
            submission_summary=submission_by_plan_class.get((session.plan_id, session.class_id)),
        )
        for session in sessions[:6]
    ]

    current_session_model = next((item for item in sessions if item.status == "active"), None)
    if current_session_model is None and sessions:
        current_session_model = sessions[0]

    current_session = None
    if current_session_model is not None:
        current_session = serialize_session_summary(
            session=current_session_model,
            student_count=len(class_student_ids.get(current_session_model.class_id, set())),
            checked_in_count=checked_in_by_class.get(current_session_model.class_id, 0),
            submission_summary=submission_by_plan_class.get((current_session_model.plan_id, current_session_model.class_id)),
        )

    class_rosters = []
    for school_class in classes:
        focus_session = latest_session_by_class.get(school_class.id)
        class_rosters.append(
            serialize_seat_map(
                school_class,
                checked_in_at_by_student,
                checked_in_record_by_class_seat.get(school_class.id, {}),
                student_submission_summary_by_id,
                plan_submission_summary_by_student,
                focus_plan_id=(focus_session.plan_id if focus_session is not None else None),
                focus_plan_title=(
                    focus_session.lesson_plan.title
                    if focus_session is not None and focus_session.lesson_plan is not None
                    else None
                ),
                focus_plan_task_count=(
                    len(focus_session.lesson_plan.tasks)
                    if focus_session is not None and focus_session.lesson_plan is not None
                    else None
                ),
            )
        )

    classroom_board = []
    for school_class in classes:
        latest_session = latest_session_by_class.get(school_class.id)
        latest_session_payload = None
        if latest_session is not None:
            latest_session_payload = serialize_session_summary(
                session=latest_session,
                student_count=len(class_student_ids.get(school_class.id, set())),
                checked_in_count=checked_in_by_class.get(school_class.id, 0),
                submission_summary=submission_by_plan_class.get((latest_session.plan_id, school_class.id)),
            )

        classroom_board.append(
            {
                "class_id": school_class.id,
                "class_name": school_class.class_name,
                "grade_no": school_class.grade_no,
                "class_no": school_class.class_no,
                "student_count": len(class_student_ids.get(school_class.id, set())),
                "checked_in_count": checked_in_by_class.get(school_class.id, 0),
                "pending_signin_count": max(
                    len(class_student_ids.get(school_class.id, set())) - checked_in_by_class.get(school_class.id, 0),
                    0,
                ),
                "active_session_count": active_session_count_by_class.get(school_class.id, 0),
                "progress": progress_by_class.get(school_class.id, {"pending_count": 0, "completed_count": 0}),
                "submissions": submission_by_class.get(
                    school_class.id,
                    {
                        "submission_count": 0,
                        "pending_review_count": 0,
                        "reviewed_count": 0,
                        "recommended_count": 0,
                    },
                ),
                "latest_session": latest_session_payload,
            }
        )

    curriculum_books = (
        db.scalars(
            select(CurriculumBook)
            .options(
                selectinload(CurriculumBook.units)
                .selectinload(CurriculumUnit.lessons)
                .selectinload(CurriculumLesson.lesson_plans)
            )
            .order_by(CurriculumBook.id)
        )
        .unique()
        .all()
    )
    curriculum_snapshot = []
    for book in curriculum_books[:4]:
        plans = [plan for unit in book.units for lesson in unit.lessons for plan in lesson.lesson_plans]
        latest_plan = max(plans, key=lambda item: (item.assigned_date, item.id), default=None)
        curriculum_snapshot.append(
            {
                "id": book.id,
                "name": book.name,
                "subject": book.subject,
                "unit_count": len(book.units),
                "lesson_count": sum(len(unit.lessons) for unit in book.units),
                "plan_count": len(plans),
                "latest_plan_title": latest_plan.title if latest_plan else None,
            }
        )

    checked_in_today = len(checked_in_student_ids)
    pending_signin_count = max(total_students - checked_in_today, 0)
    pending_progress_total = sum(item["pending_count"] for item in progress_by_class.values())
    pending_review_total = sum(item["pending_review_count"] for item in submission_by_class.values())
    reviewed_submission_total = sum(item["reviewed_count"] for item in submission_by_class.values())
    recommended_total = sum(item["recommended_count"] for item in submission_by_class.values())
    active_session_total = sum(1 for item in latest_session_by_class.values() if item.status == "active")

    return ApiResponse(
        data={
            "current_user": {
                "id": staff.id,
                "display_name": staff.display_name,
                "title": staff.staff_profile.title if staff.staff_profile else None,
                "roles": roles,
            },
            "stats": {
                "class_count": total_classes,
                "student_count": total_students,
                "lesson_plan_count": total_plans,
                "pending_plan_count": pending_progress_total,
                "checked_in_today": checked_in_today,
                "active_session_count": active_session_total,
                "pending_review_count": pending_review_total,
                "reviewed_submission_count": reviewed_submission_total,
                "recommended_count": recommended_total,
            },
            "today_overview": {
                "checked_in_today": checked_in_today,
                "pending_signin_count": pending_signin_count,
                "active_session_count": active_session_total,
                "active_class_count": active_session_total,
                "pending_review_count": pending_review_total,
                "recommended_count": recommended_total,
            },
            "launchpad": {
                "default_class_id": classes[0].id if classes else None,
                "default_plan_id": launchpad_plans[0].id if launchpad_plans else None,
                "classes": [
                    {
                        "id": school_class.id,
                        "class_name": school_class.class_name,
                        "grade_no": school_class.grade_no,
                        "class_no": school_class.class_no,
                        "student_count": len(class_student_ids.get(school_class.id, set())),
                        "checked_in_count": checked_in_by_class.get(school_class.id, 0),
                        "pending_signin_count": max(
                            len(class_student_ids.get(school_class.id, set())) - checked_in_by_class.get(school_class.id, 0),
                            0,
                        ),
                    }
                    for school_class in classes
                ],
                "ready_plans": [serialize_launchpad_plan(plan) for plan in launchpad_plans],
            },
            "focus_class_id": (
                current_session_model.class_id
                if current_session_model is not None
                else (classes[0].id if classes else None)
            ),
            "class_rosters": class_rosters,
            "current_session": current_session,
            "classroom_board": classroom_board,
            "recent_sessions": recent_sessions,
            "recent_plans": [serialize_recent_plan(plan) for plan in recent_plans],
            "curriculum_snapshot": curriculum_snapshot,
        }
    )


@router.get("/classes/{class_id}/groups", response_model=ApiResponse)
def class_group_overview(
    class_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(data=build_class_group_overview_payload(school_class, db))


@router.get("/classes/{class_id}/group-management", response_model=ApiResponse)
def class_group_management(
    class_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(data=build_group_management_payload(school_class, db))


@router.get("/classes/{class_id}/group-operation-logs", response_model=ApiResponse)
def class_group_operation_logs(
    class_id: int,
    group_id: int | None = Query(default=None, ge=1),
    event_type: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=60, ge=1, le=300),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    if group_id is not None:
        group = db.scalar(select(StudentGroup).where(StudentGroup.id == group_id, StudentGroup.class_id == school_class.id))
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="小组不存在")

    logs = load_filtered_class_group_logs(
        school_class.id,
        db,
        group_id=group_id,
        event_type=(event_type or "").strip() or None,
        actor_user_id=actor_user_id,
        keyword=keyword,
        limit=limit,
    )
    total_count = count_filtered_class_group_logs(
        school_class.id,
        db,
        group_id=group_id,
        event_type=(event_type or "").strip() or None,
        actor_user_id=actor_user_id,
        keyword=keyword,
    )
    return ApiResponse(
        data={
            "items": serialize_group_operation_log_collection(logs),
            "total_count": total_count,
            "limit": limit,
        }
    )


@router.get("/classes/{class_id}/group-operation-logs/export")
def export_class_group_operation_logs(
    class_id: int,
    group_id: int | None = Query(default=None, ge=1),
    event_type: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=100),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    if group_id is not None:
        group = db.scalar(select(StudentGroup).where(StudentGroup.id == group_id, StudentGroup.class_id == school_class.id))
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="小组不存在")

    logs = load_filtered_class_group_logs(
        school_class.id,
        db,
        group_id=group_id,
        event_type=(event_type or "").strip() or None,
        actor_user_id=actor_user_id,
        keyword=keyword,
        limit=None,
    )
    file_name = f"{school_class.class_name}-group-operation-logs-{date.today().isoformat()}.csv"
    return Response(
        content=("\ufeff" + build_group_operation_log_csv(logs)).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": build_content_disposition(file_name)},
    )


@router.get("/classes/{class_id}/plans/{plan_id}/group-task-progress", response_model=ApiResponse)
def class_group_task_progress(
    class_id: int,
    plan_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    plan = load_staff_plan_or_404(plan_id, db)
    return ApiResponse(data=build_group_task_progress_payload(school_class, plan, db))


@router.post("/classes/{class_id}/groups", response_model=ApiResponse)
def create_class_group(
    class_id: int,
    payload: StaffGroupCreatePayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    next_group_no = max((group.group_no for group in school_class.student_groups), default=0) + 1
    name = (payload.name or "").strip() or default_group_name(school_class, next_group_no)
    description = (payload.description or "").strip() or "负责课堂协作、资料共享与作品共创。"

    new_group = StudentGroup(
        class_id=school_class.id,
        group_no=next_group_no,
        name=name,
        description=description,
        leader_user_id=None,
    )
    db.add(new_group)
    db.flush()
    log_group_operation(
        db,
        event_type="group_created",
        event_label="新建小组",
        title=f"{staff.display_name} 新建了 {name}",
        description="已创建空组，可继续拖拽分配成员、设置组长与共享空间名称。",
        actor=staff,
        school_class=school_class,
        group=new_group,
    )
    db.commit()

    refreshed_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(message="小组已创建", data=build_group_management_payload(refreshed_class, db))


@router.post("/classes/{class_id}/groups/rebuild", response_model=ApiResponse)
def rebuild_class_groups(
    class_id: int,
    payload: StaffGroupRebuildPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    students = sorted(school_class.students, key=lambda item: item.student_no)
    previous_snapshots = capture_group_snapshots(school_class)
    user_name_by_id = {profile.user_id: profile.user.display_name for profile in school_class.students}
    if payload.group_count > len(students):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分组数不能超过班级学生数")

    groups = sorted(school_class.student_groups, key=lambda item: (item.group_no, item.id))
    for group_no in range(len(groups) + 1, payload.group_count + 1):
        new_group = StudentGroup(
            class_id=school_class.id,
            group_no=group_no,
            name=default_group_name(school_class, group_no),
            description="负责课堂协作、资料共享与作品共创。",
            leader_user_id=None,
        )
        db.add(new_group)
        db.flush()
        groups.append(new_group)

    for group in groups:
        for membership in list(group.memberships):
            db.delete(membership)
    db.flush()

    target_groups = groups[: payload.group_count]
    student_chunks = chunk_students_evenly(students, payload.group_count)
    rebuilt_member_ids_by_group_id = {
        group.id: [profile.user_id for profile in members]
        for group, members in zip(target_groups, student_chunks, strict=False)
    }

    for group, members in zip(target_groups, student_chunks, strict=False):
        leader_user_id = members[0].user_id if members else None
        group.leader_user_id = leader_user_id
        sync_group_drive_space_name(group, db)
        for index, profile in enumerate(members):
            db.add(
                StudentGroupMember(
                    group_id=group.id,
                    student_user_id=profile.user_id,
                    role="leader" if index == 0 else "member",
                )
            )

    for group in groups[payload.group_count :]:
        group.leader_user_id = None

    for group in groups:
        member_user_ids = rebuilt_member_ids_by_group_id.get(group.id, [])
        leader_user_id = member_user_ids[0] if member_user_ids else None
        summary = build_group_configuration_change_summary(
            previous_snapshots.get(group.id),
            name=group.name,
            description=group.description,
            leader_user_id=leader_user_id,
            member_user_ids=member_user_ids,
            user_name_by_id=user_name_by_id,
        )
        if not summary:
            continue
        log_group_operation(
            db,
            event_type="group_rebuilt",
            event_label="重新分组",
            title=f"{staff.display_name} 重组了 {group.name}",
            description=summary,
            actor=staff,
            school_class=school_class,
            group=group,
        )

    db.commit()

    refreshed_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(message="小组已按人数重新分配", data=build_group_management_payload(refreshed_class, db))


@router.put("/classes/{class_id}/group-management", response_model=ApiResponse)
def save_class_group_management(
    class_id: int,
    payload: StaffGroupSavePayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = load_staff_group_class_or_404(class_id, staff, db)
    previous_snapshots = capture_group_snapshots(school_class)
    groups_by_id = {group.id: group for group in school_class.student_groups}
    class_student_ids = {profile.user_id for profile in school_class.students}
    user_name_by_id = {profile.user_id: profile.user.display_name for profile in school_class.students}
    seen_students: set[int] = set()

    for item in payload.groups:
        group = groups_by_id.get(item.id)
        if group is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存在不属于当前班级的小组")
        if not item.name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="小组名称不能为空")

        member_user_ids = list(item.member_user_ids)
        if len(member_user_ids) != len(set(member_user_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="同一学生不能重复出现在同一小组")

        for student_user_id in member_user_ids:
            if student_user_id not in class_student_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存在不属于当前班级的学生")
            if student_user_id in seen_students:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="同一学生不能分配到多个小组")
            seen_students.add(student_user_id)

        if item.leader_user_id is not None and item.leader_user_id not in member_user_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="组长必须是当前小组成员")

    for group in school_class.student_groups:
        for membership in list(group.memberships):
            db.delete(membership)
    db.flush()

    payload_group_ids = {item.id for item in payload.groups}
    for item in payload.groups:
        group = groups_by_id[item.id]
        member_user_ids = list(item.member_user_ids)
        leader_user_id = item.leader_user_id if item.leader_user_id in member_user_ids else (
            member_user_ids[0] if member_user_ids else None
        )
        group.name = item.name.strip()
        group.description = (item.description or "").strip() or None
        group.leader_user_id = leader_user_id
        sync_group_drive_space_name(group, db)

        for student_user_id in member_user_ids:
            db.add(
                StudentGroupMember(
                    group_id=group.id,
                    student_user_id=student_user_id,
                    role="leader" if student_user_id == leader_user_id else "member",
                )
            )

        summary = build_group_configuration_change_summary(
            previous_snapshots.get(group.id),
            name=group.name,
            description=group.description,
            leader_user_id=leader_user_id,
            member_user_ids=member_user_ids,
            user_name_by_id=user_name_by_id,
        )
        if summary:
            log_group_operation(
                db,
                event_type="group_saved",
                event_label="调整分组",
                title=f"{staff.display_name} 更新了 {group.name} 的分组配置",
                description=summary,
                actor=staff,
                school_class=school_class,
                group=group,
            )

    for group in school_class.student_groups:
        if group.id not in payload_group_ids:
            group.leader_user_id = None

    db.commit()

    refreshed_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(message="小组调整已保存", data=build_group_management_payload(refreshed_class, db))


@router.delete("/groups/{group_id}", response_model=ApiResponse)
def delete_class_group(
    group_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    group = db.scalar(
        select(StudentGroup)
        .where(StudentGroup.id == group_id)
        .options(
            selectinload(StudentGroup.school_class),
            selectinload(StudentGroup.memberships),
        )
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="小组不存在")
    if not staff_can_access_class(staff, group.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该班级的小组")

    drive_space = db.scalar(
        select(DriveSpace)
        .where(
            DriveSpace.owner_type == "group",
            DriveSpace.owner_id == group.id,
        )
        .options(selectinload(DriveSpace.files))
    )
    if group.memberships:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先移出该组成员，再删除小组")
    if drive_space is not None and drive_space.files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该小组共享网盘还有文件，暂不能删除")

    class_id = group.class_id
    log_group_operation(
        db,
        event_type="group_deleted",
        event_label="删除小组",
        title=f"{staff.display_name} 删除了 {group.name}",
        description="该小组为空组且没有共享文件，已从当前班级移除。",
        actor=staff,
        class_id=group.class_id,
        group_id=group.id,
        group_no=group.group_no,
        group_name=group.name,
    )
    if drive_space is not None:
        db.delete(drive_space)
    db.delete(group)
    db.commit()

    refreshed_class = load_staff_group_class_or_404(class_id, staff, db)
    return ApiResponse(message="小组已删除", data=build_group_management_payload(refreshed_class, db))


@router.post("/groups/{group_id}/drive/files", response_model=ApiResponse)
async def upload_group_shared_files_for_staff(
    group_id: int,
    files: list[UploadFile] | None = File(default=None),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    upload_items = [item for item in (files or []) if item.filename]
    if not upload_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择要上传的文件")

    group = db.scalar(
        select(StudentGroup)
        .where(StudentGroup.id == group_id)
        .options(selectinload(StudentGroup.school_class))
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="小组不存在")
    if not staff_can_access_class(staff, group.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该班级的小组共享空间")

    drive_space = ensure_group_drive_space(group, db)
    created_files = await upload_files_to_drive_space(drive_space, upload_items, staff, db)
    actor_role = "admin" if staff.staff_profile and staff.staff_profile.is_admin else "teacher"

    for drive_file in created_files:
        log_group_operation(
            db,
            event_type="teacher_group_file_uploaded",
            event_label="教师上传共享文件",
            title=f"{staff.display_name} 上传了 {drive_file.stored_name}",
            description=(
                "教师已将共享资料同步到本组共享空间，"
                f"当前文件大小约 {max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0} KB。"
            ),
            actor=staff,
            actor_role=actor_role,
            school_class=group.school_class,
            group=group,
            file=drive_file,
        )
    db.commit()

    refreshed_class = load_staff_group_class_or_404(group.class_id, staff, db)
    return ApiResponse(
        message="文件已上传到小组共享空间",
        data=build_class_group_overview_payload(refreshed_class, db),
    )


@router.get("/drives/files/{file_id}")
def download_group_shared_file_for_staff(
    file_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> FileResponse:
    drive_file = load_staff_group_drive_file(file_id, staff, db)
    file_path = stored_drive_file_path(drive_file)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="共享文件不存在")

    response = FileResponse(
        path=file_path,
        media_type=guess_drive_media_type(drive_file),
        filename=drive_file.stored_name,
    )
    response.headers["Content-Disposition"] = build_content_disposition(drive_file.stored_name)
    return response


@router.get("/attendance", response_model=ApiResponse)
def staff_attendance(
    class_id: int | None = Query(default=None, ge=1),
    attendance_date: date | None = Query(default=None),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    payload = build_staff_attendance_payload(
        staff,
        db,
        class_id=class_id,
        attendance_date=attendance_date,
    )
    return ApiResponse(data=payload)


@router.get("/attendance/export")
def export_staff_attendance(
    class_id: int | None = Query(default=None, ge=1),
    attendance_date: date | None = Query(default=None),
    mode: str = Query(default="all"),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    normalized_mode = (mode or "all").strip().lower()
    if normalized_mode not in {"all", "present", "absent"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="导出模式只支持 all / present / absent")

    payload = build_staff_attendance_payload(
        staff,
        db,
        class_id=class_id,
        attendance_date=attendance_date,
    )
    selected_class = payload.get("selected_class")
    if selected_class is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前没有可导出的签到数据")

    mode_label = {"all": "all", "present": "present", "absent": "absent"}[normalized_mode]
    file_name = (
        f"{selected_class['class_name']}-attendance-{payload['attendance_date']}-{mode_label}.csv"
    )
    csv_text = build_staff_attendance_csv(payload, mode=normalized_mode)
    return Response(
        content=("\ufeff" + csv_text).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": build_content_disposition(file_name)},
    )


@router.get("/students", response_model=ApiResponse)
def staff_students(
    class_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=80),
    include_inactive: bool = Query(default=False),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    payload = build_staff_students_payload(
        staff,
        db,
        class_id=class_id,
        keyword=keyword,
        include_inactive=include_inactive,
    )
    return ApiResponse(data=payload)


@router.get("/students/export")
def export_staff_students(
    class_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=80),
    include_inactive: bool = Query(default=False),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    payload = build_staff_students_payload(
        staff,
        db,
        class_id=class_id,
        keyword=keyword,
        include_inactive=include_inactive,
    )
    selected_class = payload.get("selected_class")
    if selected_class is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前没有可导出的学生数据")
    file_name = f"{selected_class['class_name']}-students-{date.today().isoformat()}.csv"
    csv_text = build_staff_students_csv(payload)
    return Response(
        content=("\ufeff" + csv_text).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": build_content_disposition(file_name)},
    )


@router.post("/students/batch-action", response_model=ApiResponse)
def batch_action_staff_students(
    payload: StaffStudentBatchActionPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_user_ids = payload.student_user_ids
    profiles = db.scalars(
        select(StudentProfile)
        .where(StudentProfile.user_id.in_(student_user_ids))
        .options(
            selectinload(StudentProfile.user),
            selectinload(StudentProfile.school_class),
        )
    ).all()
    profile_by_user_id = {item.user_id: item for item in profiles}

    missing_ids = [item for item in student_user_ids if item not in profile_by_user_id]
    if missing_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"存在不存在的学生 ID：{missing_ids}")

    forbidden_ids = [
        item
        for item in student_user_ids
        if not staff_can_access_class(staff, profile_by_user_id[item].class_id, db)
    ]
    if forbidden_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"无权管理这些学生：{forbidden_ids}")

    processed_count = len(student_user_ids)
    affected_count = 0
    skipped_count = 0
    actor_role = "admin" if staff.staff_profile and staff.staff_profile.is_admin else "teacher"

    if payload.action in {"activate", "deactivate"}:
        next_status = payload.action == "activate"
        for student_user_id in student_user_ids:
            profile = profile_by_user_id[student_user_id]
            if profile.user.is_active == next_status:
                skipped_count += 1
                continue
            profile.user.is_active = next_status
            affected_count += 1

    elif payload.action == "reset_password":
        for student_user_id in student_user_ids:
            profile = profile_by_user_id[student_user_id]
            next_password = normalize_reset_password(payload.new_password, profile.student_no)
            profile.user.password_hash = hash_password(next_password)
            affected_count += 1

    elif payload.action == "ungroup":
        memberships = db.scalars(
            select(StudentGroupMember)
            .where(StudentGroupMember.student_user_id.in_(student_user_ids))
            .options(
                selectinload(StudentGroupMember.group).selectinload(StudentGroup.school_class),
                selectinload(StudentGroupMember.student).selectinload(User.student_profile),
            )
        ).all()
        membership_by_student = {item.student_user_id: item for item in memberships}
        for student_user_id in student_user_ids:
            membership = membership_by_student.get(student_user_id)
            if membership is None:
                skipped_count += 1
                continue

            group = membership.group
            removed_student_name = membership.student.display_name
            removed_student_no = (
                membership.student.student_profile.student_no
                if membership.student.student_profile
                else membership.student.username
            )
            db.delete(membership)
            db.flush()
            rebalance_group_after_member_removed(group, db)
            log_group_operation(
                db,
                event_type="group_member_removed_by_teacher_batch",
                event_label="教师批量移出组员",
                title=f"{staff.display_name} 批量将 {removed_student_name} 移出了 {group.name}",
                description=f"已批量移出成员：{removed_student_name}（{removed_student_no}）。",
                actor=staff,
                actor_role=actor_role,
                group=group,
            )
            affected_count += 1

    db.commit()

    action_text = {
        "activate": "恢复账号",
        "deactivate": "停用账号",
        "reset_password": "重置密码",
        "ungroup": "解除分组",
    }[payload.action]

    return ApiResponse(
        message=f"批量{action_text}完成：处理 {processed_count} 人，生效 {affected_count} 人，跳过 {skipped_count} 人。",
        data={
            "batch_result": {
                "action": payload.action,
                "processed_count": processed_count,
                "affected_count": affected_count,
                "skipped_count": skipped_count,
                "used_default_password_rule": payload.action == "reset_password" and payload.new_password is None,
            }
        },
    )


@router.get("/students/{student_user_id}/submissions", response_model=ApiResponse)
def staff_student_submissions(
    student_user_id: int,
    limit: int = Query(default=60, ge=1, le=200),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_staff_student_profile_or_404(student_user_id, staff, db)
    submissions = db.scalars(
        select(Submission)
        .where(Submission.student_id == student_user_id)
        .options(
            selectinload(Submission.task).selectinload(Task.lesson_plan),
            selectinload(Submission.files),
            selectinload(Submission.group),
        )
        .order_by(Submission.submitted_at.desc(), Submission.updated_at.desc(), Submission.id.desc())
        .limit(limit)
    ).all()
    return ApiResponse(
        data={
            "student": {
                "user_id": profile.user_id,
                "student_no": profile.student_no,
                "display_name": profile.user.display_name,
                "class_id": profile.class_id,
                "class_name": profile.school_class.class_name,
            },
            "items": [
                {
                    "submission_id": item.id,
                    "task_id": item.task_id,
                    "task_title": item.task.title,
                    "plan_id": item.task.plan_id,
                    "plan_title": item.task.lesson_plan.title,
                    "status": item.submit_status,
                    "score": item.score,
                    "is_recommended": item.is_recommended,
                    "submission_scope": item.task.submission_scope or "individual",
                    "group_id": item.group_id,
                    "group_name": item.group.name if item.group else None,
                    "file_count": len(item.files),
                    "submitted_at": iso_or_none(item.submitted_at),
                    "updated_at": iso_or_none(item.updated_at),
                }
                for item in submissions
            ],
        }
    )


@router.post("/students/{student_user_id}/reset-password", response_model=ApiResponse)
def reset_staff_student_password(
    student_user_id: int,
    payload: StaffStudentResetPasswordPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_staff_student_profile_or_404(student_user_id, staff, db)
    next_password = normalize_reset_password(payload.new_password, profile.student_no)

    profile.user.password_hash = hash_password(next_password)
    db.commit()
    return ApiResponse(
        message=f"已重置 {profile.user.display_name} 的密码",
        data={
            "student_user_id": profile.user_id,
            "student_no": profile.student_no,
            "display_name": profile.user.display_name,
            "new_password": next_password,
        },
    )


@router.post("/students/{student_user_id}/status", response_model=ApiResponse)
def update_staff_student_status(
    student_user_id: int,
    payload: StaffStudentStatusPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_staff_student_profile_or_404(student_user_id, staff, db)
    profile.user.is_active = payload.is_active
    db.commit()
    return ApiResponse(
        message=f"{profile.user.display_name} 账号状态已更新",
        data={
            "student_user_id": profile.user_id,
            "display_name": profile.user.display_name,
            "is_active": profile.user.is_active,
        },
    )


@router.post("/students/{student_user_id}/ungroup", response_model=ApiResponse)
def ungroup_staff_student(
    student_user_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_staff_student_profile_or_404(student_user_id, staff, db)
    membership = db.scalar(
        select(StudentGroupMember)
        .where(StudentGroupMember.student_user_id == student_user_id)
        .options(
            selectinload(StudentGroupMember.group).selectinload(StudentGroup.school_class),
            selectinload(StudentGroupMember.student).selectinload(User.student_profile),
        )
    )
    if membership is None:
        return ApiResponse(
            message=f"{profile.user.display_name} 当前不在任何小组",
            data={"student_user_id": profile.user_id, "removed": False},
        )

    group = membership.group
    if not staff_can_access_class(staff, group.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权调整该班级分组")

    removed_student_name = membership.student.display_name
    removed_student_no = membership.student.student_profile.student_no if membership.student.student_profile else membership.student.username
    db.delete(membership)
    db.flush()
    rebalance_group_after_member_removed(group, db)

    actor_role = "admin" if staff.staff_profile and staff.staff_profile.is_admin else "teacher"
    log_group_operation(
        db,
        event_type="group_member_removed_by_teacher",
        event_label="教师移出组员",
        title=f"{staff.display_name} 将 {removed_student_name} 移出了 {group.name}",
        description=f"已移出成员：{removed_student_name}（{removed_student_no}）。",
        actor=staff,
        actor_role=actor_role,
        school_class=group.school_class,
        group=group,
    )
    db.commit()
    return ApiResponse(
        message=f"已将 {removed_student_name} 移出当前小组",
        data={"student_user_id": profile.user_id, "removed": True, "group_id": group.id},
    )


@router.get("/classes/{class_id}/seat-map", response_model=ApiResponse)
def class_seat_map(
    class_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not staff_can_access_class(staff, class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该班级座位表")

    school_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == class_id)
        .options(
            selectinload(SchoolClass.students).selectinload(StudentProfile.user),
            selectinload(SchoolClass.default_room).selectinload(ComputerRoom.seats),  # type: ignore[name-defined]
            selectinload(SchoolClass.seat_assignments).selectinload(ClassSeatAssignment.seat),
        )
    )
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    rooms = (
        db.scalars(select(ComputerRoom).options(selectinload(ComputerRoom.seats)).order_by(ComputerRoom.id.asc()))
        .unique()
        .all()
    )
    seat_map = serialize_seat_map(school_class, {}, {})
    return ApiResponse(
        data={
            "class": {
                "id": school_class.id,
                "class_name": school_class.class_name,
                "grade_no": school_class.grade_no,
                "class_no": school_class.class_no,
                "default_room_id": school_class.default_room_id,
            },
            "students": seat_map["students"],
            "current_room_id": school_class.default_room_id,
            "current_assignments": [
                {
                    "seat_id": assignment.seat_id,
                    "student_user_id": assignment.student_user_id,
                }
                for assignment in school_class.seat_assignments
            ],
            "rooms": [
                {
                    "id": room.id,
                    "name": room.name,
                    "row_count": room.row_count,
                    "col_count": room.col_count,
                    "seats": [
                        {
                            "id": seat.id,
                            "row_no": seat.row_no,
                            "col_no": seat.col_no,
                            "seat_label": seat.seat_label,
                            "ip_address": seat.ip_address,
                            "hostname": seat.hostname,
                            "is_enabled": seat.is_enabled,
                        }
                        for seat in sorted(room.seats, key=lambda item: (item.row_no, item.col_no, item.id))
                    ],
                }
                for room in rooms
            ],
        }
    )


@router.put("/classes/{class_id}/seat-map", response_model=ApiResponse)
def save_class_seat_map(
    class_id: int,
    payload: SeatMapSavePayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not staff_can_access_class(staff, class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该班级座位表")

    school_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == class_id)
        .options(
            selectinload(SchoolClass.students),
            selectinload(SchoolClass.seat_assignments),
        )
    )
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    room = db.scalar(
        select(ComputerRoom)
        .where(ComputerRoom.id == payload.room_id)
        .options(selectinload(ComputerRoom.seats))
    )
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="机房不存在")

    room_seat_ids = {seat.id for seat in room.seats}
    class_student_ids = {profile.user_id for profile in school_class.students}
    seen_students: set[int] = set()
    seen_seats: set[int] = set()

    for item in payload.assignments:
        if item.seat_id not in room_seat_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存在不属于所选机房的座位")
        if item.student_user_id is None:
            continue
        if item.student_user_id not in class_student_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存在不属于当前班级的学生")
        if item.student_user_id in seen_students:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="同一学生不能重复绑定多个座位")
        if item.seat_id in seen_seats:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="同一座位不能重复绑定多个学生")
        seen_students.add(item.student_user_id)
        seen_seats.add(item.seat_id)

    for assignment in list(school_class.seat_assignments):
        db.delete(assignment)
    db.flush()

    for item in payload.assignments:
        if item.student_user_id is None:
            continue
        db.add(
            ClassSeatAssignment(
                class_id=school_class.id,
                seat_id=item.seat_id,
                student_user_id=item.student_user_id,
            )
        )

    school_class.default_room_id = room.id
    db.commit()
    return ApiResponse(message="班级座位表已更新", data={"class_id": class_id, "room_id": room.id})
