from __future__ import annotations

import csv
from datetime import date, datetime
from io import StringIO
from pathlib import Path
from typing import Literal
import mimetypes
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import (
    AttendanceRecord,
    ClassSeatAssignment,
    ComputerSeat,
    ProfileChangeAuditLog,
    SchoolClass,
    StudentClassTransferRequest,
    StudentGroupMember,
    StudentProfile,
    User,
)
from app.schemas.common import ApiResponse
from app.services.staff_access import get_accessible_class_ids, is_admin_staff
from app.services.system_settings import read_archived_class_ids

router = APIRouter()

ALLOWED_PROFILE_PHOTO_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024
ALLOWED_GENDERS = {"男", "女", "未知"}
ALLOWED_CLASS_TRANSFER_STATUSES = {"pending", "approved", "rejected"}
PROFILE_CHANGE_AUDIT_EVENT_LABELS = {
    "student_password_changed": "学生修改密码",
    "student_name_updated": "学生修改姓名",
    "student_gender_updated": "学生修改性别",
    "student_photo_uploaded": "学生上传相片",
    "student_photo_deleted": "学生删除相片",
    "class_transfer_requested": "提交转班申请",
    "class_transfer_reviewed": "审核转班申请",
    "class_transfer_unreviewed": "撤销转班审核",
}


class StudentPasswordChangePayload(BaseModel):
    current_password: str = Field(min_length=1, max_length=50)
    new_password: str = Field(min_length=6, max_length=50)
    confirm_password: str = Field(min_length=6, max_length=50)


class StudentNameUpdatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class StudentGenderUpdatePayload(BaseModel):
    gender: str = Field(min_length=1, max_length=10)


class StudentClassTransferCreatePayload(BaseModel):
    target_class_id: int = Field(ge=1)
    reason: str | None = Field(default=None, max_length=300)


class StaffClassTransferReviewPayload(BaseModel):
    decision: Literal["approve", "reject"]
    review_note: str | None = Field(default=None, max_length=300)


class StaffClassTransferBatchReviewPayload(BaseModel):
    request_ids: list[int] = Field(min_length=1, max_length=200)
    decision: Literal["approve", "reject"]
    review_note: str | None = Field(default=None, max_length=300)


class StaffClassTransferBatchUnreviewPayload(BaseModel):
    request_ids: list[int] = Field(min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=300)


def load_student_with_profile(student_user_id: int, db: Session) -> User:
    student = db.scalar(
        select(User)
        .where(User.id == student_user_id, User.user_type == "student")
        .options(
            selectinload(User.student_profile).selectinload(StudentProfile.school_class),
            selectinload(User.seat_assignments)
            .selectinload(ClassSeatAssignment.seat)
            .selectinload(ComputerSeat.room),
        )
    )
    if student is None or student.student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")
    return student


def normalize_student_name(raw_value: str) -> str:
    normalized = raw_value.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="姓名不能为空")
    return normalized


def normalize_gender(raw_value: str) -> str:
    normalized = raw_value.strip()
    if normalized not in ALLOWED_GENDERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="性别仅支持：男 / 女 / 未知")
    return normalized


def normalize_optional_text(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    cleaned = raw_value.strip()
    return cleaned or None


def build_content_disposition(filename: str, disposition: str = "attachment") -> str:
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip() or "download.csv"
    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'


def normalize_profile_audit_event_type(raw_value: str | None) -> str | None:
    if raw_value is None:
        return None
    normalized = raw_value.strip()
    if not normalized:
        return None
    if normalized not in PROFILE_CHANGE_AUDIT_EVENT_LABELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的资料变更事件类型")
    return normalized


def actor_role_for_profile_audit(actor: User) -> str:
    if actor.user_type == "staff":
        if actor.staff_profile is not None and actor.staff_profile.is_admin:
            return "admin"
        return "teacher"
    if actor.user_type == "student":
        return "student"
    return actor.user_type


def profile_audit_event_type_options() -> list[dict]:
    return [
        {"value": event_type, "label": label}
        for event_type, label in PROFILE_CHANGE_AUDIT_EVENT_LABELS.items()
    ]


def generate_profile_audit_batch_token(prefix: str = "batch") -> str:
    return f"{prefix}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"


def log_profile_change_audit(
    db: Session,
    *,
    event_type: str,
    actor: User,
    target_student: User,
    class_id: int | None = None,
    class_name: str | None = None,
    target_class_name: str | None = None,
    field_key: str | None = None,
    field_label: str | None = None,
    before_value: str | None = None,
    after_value: str | None = None,
    description: str | None = None,
    batch_token: str | None = None,
) -> None:
    if event_type not in PROFILE_CHANGE_AUDIT_EVENT_LABELS:
        raise ValueError(f"Unsupported profile audit event type: {event_type}")

    target_profile = target_student.student_profile
    resolved_class_id = class_id if class_id is not None else (target_profile.class_id if target_profile else None)
    resolved_class_name = class_name
    if resolved_class_name is None and target_profile is not None and target_profile.school_class is not None:
        resolved_class_name = target_profile.school_class.class_name

    target_student_no = (
        target_profile.student_no
        if target_profile is not None
        else (target_student.username if target_student is not None else None)
    )

    db.add(
        ProfileChangeAuditLog(
            event_type=event_type,
            event_label=PROFILE_CHANGE_AUDIT_EVENT_LABELS[event_type],
            actor_user_id=actor.id,
            actor_name=actor.display_name,
            actor_username=actor.username,
            actor_role=actor_role_for_profile_audit(actor),
            target_student_user_id=target_student.id,
            target_student_name=target_student.display_name,
            target_student_no=target_student_no,
            class_id=resolved_class_id,
            class_name=resolved_class_name,
            target_class_name=target_class_name,
            field_key=field_key,
            field_label=field_label,
            before_value=before_value,
            after_value=after_value,
            batch_token=batch_token,
            description=description or "",
            occurred_at=datetime.now(),
        )
    )


def serialize_profile_change_audit(item: ProfileChangeAuditLog) -> dict:
    return {
        "id": item.id,
        "occurred_at": item.occurred_at.isoformat() if item.occurred_at else None,
        "event_type": item.event_type,
        "event_label": item.event_label,
        "actor_user_id": item.actor_user_id,
        "actor_name": item.actor_name,
        "actor_username": item.actor_username,
        "actor_role": item.actor_role,
        "target_student_user_id": item.target_student_user_id,
        "target_student_name": item.target_student_name,
        "target_student_no": item.target_student_no,
        "class_id": item.class_id,
        "class_name": item.class_name,
        "target_class_name": item.target_class_name,
        "field_key": item.field_key,
        "field_label": item.field_label,
        "before_value": item.before_value,
        "after_value": item.after_value,
        "batch_token": item.batch_token,
        "description": item.description,
    }


def build_profile_change_audit_csv(items: list[ProfileChangeAuditLog]) -> str:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "日志ID",
            "时间",
            "事件类型",
            "事件标签",
            "班级",
            "目标班级",
            "操作人",
            "操作者账号",
            "操作角色",
            "学生",
            "学号",
            "字段",
            "变更前",
            "变更后",
            "处理批次号",
            "说明",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.id,
                item.occurred_at.isoformat(timespec="seconds") if item.occurred_at else "",
                item.event_type,
                item.event_label,
                item.class_name or "",
                item.target_class_name or "",
                item.actor_name or "",
                item.actor_username or "",
                item.actor_role or "",
                item.target_student_name or "",
                item.target_student_no or "",
                item.field_label or item.field_key or "",
                item.before_value or "",
                item.after_value or "",
                item.batch_token or "",
                item.description or "",
            ]
        )
    return buffer.getvalue()


def load_profile_change_audits_for_staff(
    *,
    staff: User,
    db: Session,
    class_id: int | None = None,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    student_user_id: int | None = None,
    keyword: str | None = None,
    batch_token: str | None = None,
    limit: int | None = 200,
) -> tuple[list[ProfileChangeAuditLog], int]:
    admin_mode = is_admin_staff(staff)
    accessible_class_ids = get_accessible_class_ids(staff, db)

    if not admin_mode and not accessible_class_ids:
        return [], 0

    if class_id is not None and (not admin_mode and class_id not in accessible_class_ids):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级资料变更审计")

    search_keyword = (keyword or "").strip()
    normalized_batch_token = (batch_token or "").strip()
    normalized_event_type = normalize_profile_audit_event_type(event_type)
    like_pattern = f"%{search_keyword}%"

    def apply_filters(stmt):
        next_stmt = stmt
        if not admin_mode:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.class_id.in_(accessible_class_ids))
        if class_id is not None:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.class_id == class_id)
        if normalized_event_type is not None:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.event_type == normalized_event_type)
        if actor_user_id is not None:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.actor_user_id == actor_user_id)
        if student_user_id is not None:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.target_student_user_id == student_user_id)
        if normalized_batch_token:
            next_stmt = next_stmt.where(ProfileChangeAuditLog.batch_token == normalized_batch_token)
        if search_keyword:
            next_stmt = next_stmt.where(
                or_(
                    ProfileChangeAuditLog.actor_name.like(like_pattern),
                    ProfileChangeAuditLog.actor_username.like(like_pattern),
                    ProfileChangeAuditLog.target_student_name.like(like_pattern),
                    ProfileChangeAuditLog.target_student_no.like(like_pattern),
                    ProfileChangeAuditLog.class_name.like(like_pattern),
                    ProfileChangeAuditLog.target_class_name.like(like_pattern),
                    ProfileChangeAuditLog.event_label.like(like_pattern),
                    ProfileChangeAuditLog.batch_token.like(like_pattern),
                    ProfileChangeAuditLog.description.like(like_pattern),
                    ProfileChangeAuditLog.before_value.like(like_pattern),
                    ProfileChangeAuditLog.after_value.like(like_pattern),
                )
            )
        return next_stmt

    count_stmt = apply_filters(select(func.count(ProfileChangeAuditLog.id)))
    total_count = db.scalar(count_stmt) or 0

    item_stmt = apply_filters(
        select(ProfileChangeAuditLog).order_by(
            ProfileChangeAuditLog.occurred_at.desc(),
            ProfileChangeAuditLog.id.desc(),
        )
    )
    if limit is not None:
        item_stmt = item_stmt.limit(limit)
    items = db.scalars(item_stmt).all()
    return items, int(total_count)


def resolve_photo_path(profile: StudentProfile) -> Path | None:
    if not profile.photo_path:
        return None
    relative_path = Path(profile.photo_path)
    return settings.storage_root / relative_path


def serialize_class_transfer_request(item: StudentClassTransferRequest) -> dict:
    student = item.student
    student_profile = student.student_profile if student else None
    reviewer = item.reviewed_by_staff
    return {
        "id": item.id,
        "status": item.status,
        "reason": item.reason,
        "review_note": item.review_note,
        "created_at": item.created_at.isoformat(),
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "student": {
            "user_id": student.id if student else item.student_user_id,
            "name": student.display_name if student else "",
            "student_no": (
                student_profile.student_no
                if student_profile is not None
                else (student.username if student else "")
            ),
        },
        "current_class": {
            "id": item.current_class.id,
            "class_name": item.current_class.class_name,
            "grade_no": item.current_class.grade_no,
        },
        "target_class": {
            "id": item.target_class.id,
            "class_name": item.target_class.class_name,
            "grade_no": item.target_class.grade_no,
        },
        "reviewed_by_name": reviewer.display_name if reviewer else None,
    }


def ensure_staff_can_access_transfer_request(
    staff: User,
    request_item: StudentClassTransferRequest,
    db: Session,
) -> None:
    if is_admin_staff(staff):
        return

    accessible_class_ids = get_accessible_class_ids(staff, db)
    if (
        request_item.current_class_id not in accessible_class_ids
        and request_item.target_class_id not in accessible_class_ids
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权审核该转班申请")


def load_transfer_request_or_404(request_id: int, db: Session) -> StudentClassTransferRequest:
    request_item = db.scalar(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.id == request_id)
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
    )
    if request_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="转班申请不存在")
    return request_item


def clear_student_transfer_related_memberships(student_user_id: int, db: Session) -> None:
    db.execute(delete(ClassSeatAssignment).where(ClassSeatAssignment.student_user_id == student_user_id))
    memberships = db.scalars(
        select(StudentGroupMember)
        .where(StudentGroupMember.student_user_id == student_user_id)
        .options(selectinload(StudentGroupMember.group))
    ).all()
    for membership in memberships:
        if membership.group and membership.group.leader_user_id == student_user_id:
            membership.group.leader_user_id = None
        db.delete(membership)


def apply_class_transfer_review(
    request_item: StudentClassTransferRequest,
    *,
    decision: Literal["approve", "reject"],
    review_note: str | None,
    audit_batch_token: str | None,
    staff: User,
    db: Session,
) -> StudentClassTransferRequest:
    ensure_staff_can_access_transfer_request(staff, request_item, db)

    if request_item.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该申请已处理，请勿重复操作")

    student_user = request_item.student
    if student_user is None or student_user.student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    previous_class_name = request_item.current_class.class_name if request_item.current_class else None
    target_class_name = request_item.target_class.class_name if request_item.target_class else None
    next_class_id = request_item.current_class_id
    next_class_name = previous_class_name
    field_key = "class_transfer_status"
    field_label = "转班审核状态"
    before_value = "pending"
    after_value = "approved" if decision == "approve" else "rejected"
    audit_description = (
        f"{staff.display_name} 审核转班申请，结果：{'通过' if decision == 'approve' else '拒绝'}。"
    )

    if decision == "approve":
        archived_class_ids = read_archived_class_ids(db)
        if request_item.target_class_id in archived_class_ids:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="目标班级已归档，无法通过申请")

        target_class = request_item.target_class
        if target_class is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标班级不存在")

        student_with_profile = load_student_with_profile(request_item.student_user_id, db)
        profile = student_with_profile.student_profile
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

        profile.class_id = target_class.id
        profile.grade_no = target_class.grade_no
        clear_student_transfer_related_memberships(student_with_profile.id, db)

        request_item.status = "approved"
        next_class_id = target_class.id
        next_class_name = target_class.class_name
        field_key = "class_id"
        field_label = "班级"
        before_value = previous_class_name
        after_value = target_class_name
        audit_description = f"{staff.display_name} 通过转班申请，学生班级由 {previous_class_name} 调整为 {target_class_name}。"
    else:
        request_item.status = "rejected"
        audit_description = f"{staff.display_name} 拒绝转班申请。"

    request_item.review_note = normalize_optional_text(review_note)
    request_item.reviewed_by_staff_user_id = staff.id
    request_item.reviewed_at = datetime.now()
    if request_item.review_note:
        audit_description = f"{audit_description} 审核备注：{request_item.review_note}"

    log_profile_change_audit(
        db,
        event_type="class_transfer_reviewed",
        actor=staff,
        target_student=student_user,
        class_id=next_class_id,
        class_name=next_class_name,
        target_class_name=target_class_name,
        field_key=field_key,
        field_label=field_label,
        before_value=before_value,
        after_value=after_value,
        batch_token=audit_batch_token,
        description=audit_description,
    )
    return request_item


def apply_class_transfer_unreview(
    request_item: StudentClassTransferRequest,
    *,
    reason: str | None,
    audit_batch_token: str | None,
    staff: User,
    db: Session,
) -> Literal["rolled_back_approved", "reopened_rejected"]:
    ensure_staff_can_access_transfer_request(staff, request_item, db)

    if request_item.status == "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该申请尚未审核，无需撤销")

    student_user = request_item.student
    if student_user is None or student_user.student_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    previous_status = request_item.status
    current_class = request_item.current_class
    target_class = request_item.target_class
    current_class_name = current_class.class_name if current_class else None
    target_class_name = target_class.class_name if target_class else None
    field_key = "class_transfer_status"
    field_label = "转班审核状态"
    before_value = previous_status
    after_value = "pending"
    next_class_id = request_item.current_class_id
    next_class_name = current_class_name
    transition: Literal["rolled_back_approved", "reopened_rejected"] = "reopened_rejected"
    audit_description = f"{staff.display_name} 撤销转班审核，申请恢复为待审核。"

    if previous_status == "approved":
        if current_class is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="原班级不存在，无法撤销通过结果")
        if target_class is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标班级不存在，无法撤销通过结果")

        student_with_profile = load_student_with_profile(request_item.student_user_id, db)
        profile = student_with_profile.student_profile
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")
        if profile.class_id != target_class.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="学生当前班级与审批结果不一致，暂无法自动撤销该通过记录",
            )

        profile.class_id = current_class.id
        profile.grade_no = current_class.grade_no
        clear_student_transfer_related_memberships(student_with_profile.id, db)

        field_key = "class_id"
        field_label = "班级"
        before_value = target_class_name
        after_value = current_class_name
        next_class_id = current_class.id
        next_class_name = current_class_name
        transition = "rolled_back_approved"
        audit_description = (
            f"{staff.display_name} 撤销已通过转班审核，学生班级由 {target_class_name} 回退为 {current_class_name}。"
        )
    elif previous_status == "rejected":
        transition = "reopened_rejected"
        audit_description = f"{staff.display_name} 撤销已拒绝转班审核，申请恢复为待审核。"

    request_item.status = "pending"
    request_item.review_note = None
    request_item.reviewed_by_staff_user_id = None
    request_item.reviewed_at = None

    normalized_reason = normalize_optional_text(reason)
    if normalized_reason:
        audit_description = f"{audit_description} 撤销备注：{normalized_reason}"

    log_profile_change_audit(
        db,
        event_type="class_transfer_unreviewed",
        actor=staff,
        target_student=student_user,
        class_id=next_class_id,
        class_name=next_class_name,
        target_class_name=target_class_name,
        field_key=field_key,
        field_label=field_label,
        before_value=before_value,
        after_value=after_value,
        batch_token=audit_batch_token,
        description=audit_description,
    )
    return transition


def build_profile_payload(student: User, db: Session) -> dict:
    profile = student.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    latest_assignment = next(
        (
            assignment
            for assignment in sorted(student.seat_assignments, key=lambda item: item.id, reverse=True)
            if assignment.seat is not None
        ),
        None,
    )
    latest_attendance = db.scalar(
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == student.id)
        .options(selectinload(AttendanceRecord.seat).selectinload(ComputerSeat.room))
        .order_by(AttendanceRecord.attendance_date.desc(), AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
    )
    attendance_records = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.student_id == student.id)
        .options(selectinload(AttendanceRecord.seat).selectinload(ComputerSeat.room))
        .order_by(AttendanceRecord.attendance_date.desc(), AttendanceRecord.checked_in_at.desc(), AttendanceRecord.id.desc())
        .limit(20)
    ).all()
    attendance_count = db.scalar(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.student_id == student.id)
    ) or 0

    latest_seat = latest_attendance.seat if latest_attendance and latest_attendance.seat else latest_assignment.seat if latest_assignment else None
    checked_in_today = bool(latest_attendance and latest_attendance.attendance_date == date.today())

    return {
        "profile": {
            "name": student.display_name,
            "username": student.username,
            "student_no": profile.student_no,
            "class_id": profile.class_id,
            "class_name": profile.school_class.class_name,
            "grade_no": profile.grade_no,
            "gender": profile.gender,
            "entry_year": profile.entry_year,
            "seat_label": latest_seat.seat_label if latest_seat else None,
            "room_name": latest_seat.room.name if latest_seat and latest_seat.room else None,
            "photo_available": bool(profile.photo_path),
        },
        "attendance_summary": {
            "total_count": int(attendance_count),
            "checked_in_today": checked_in_today,
            "latest_checked_in_at": latest_attendance.checked_in_at.isoformat() if latest_attendance else None,
            "latest_signin_source": latest_attendance.signin_source if latest_attendance else None,
        },
        "attendance_records": [
            {
                "id": record.id,
                "attendance_date": record.attendance_date.isoformat(),
                "checked_in_at": record.checked_in_at.isoformat(),
                "class_name": profile.school_class.class_name,
                "seat_label": record.seat.seat_label if record.seat else None,
                "room_name": record.seat.room.name if record.seat and record.seat.room else None,
                "client_ip": record.client_ip,
                "signin_source": record.signin_source,
            }
            for record in attendance_records
        ],
    }


@router.get("/student/me", response_model=ApiResponse)
def student_profile(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    return ApiResponse(data=build_profile_payload(student_with_profile, db))


@router.post("/student/password", response_model=ApiResponse)
def change_student_password(
    payload: StudentPasswordChangePayload,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)

    if not verify_password(payload.current_password, student_with_profile.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前密码不正确")
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="两次输入的新密码不一致")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新密码不能与当前密码相同")

    student_with_profile.password_hash = hash_password(payload.new_password)
    profile = student_with_profile.student_profile
    class_name = profile.school_class.class_name if profile and profile.school_class else None
    log_profile_change_audit(
        db,
        event_type="student_password_changed",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id if profile else None,
        class_name=class_name,
        field_key="password",
        field_label="登录密码",
        before_value="",
        after_value="已更新",
        description="学生自行修改登录密码。",
    )
    db.commit()
    return ApiResponse(message="密码已更新，请使用新密码继续登录")


@router.put("/student/name", response_model=ApiResponse)
def update_student_name(
    payload: StudentNameUpdatePayload,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    previous_name = student_with_profile.display_name
    next_name = normalize_student_name(payload.name)
    student_with_profile.display_name = next_name
    profile = student_with_profile.student_profile
    class_name = profile.school_class.class_name if profile and profile.school_class else None
    log_profile_change_audit(
        db,
        event_type="student_name_updated",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id if profile else None,
        class_name=class_name,
        field_key="name",
        field_label="姓名",
        before_value=previous_name,
        after_value=next_name,
        description="学生更新个人姓名。",
    )
    db.commit()
    return ApiResponse(
        message="姓名已更新",
        data={"name": student_with_profile.display_name},
    )


@router.put("/student/gender", response_model=ApiResponse)
def update_student_gender(
    payload: StudentGenderUpdatePayload,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")
    previous_gender = profile.gender
    next_gender = normalize_gender(payload.gender)
    profile.gender = next_gender
    log_profile_change_audit(
        db,
        event_type="student_gender_updated",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id,
        class_name=profile.school_class.class_name if profile.school_class else None,
        field_key="gender",
        field_label="性别",
        before_value=previous_gender,
        after_value=next_gender,
        description="学生更新个人性别。",
    )
    db.commit()
    return ApiResponse(
        message="性别已更新",
        data={"gender": profile.gender},
    )


@router.post("/student/photo", response_model=ApiResponse)
async def upload_student_photo(
    file: UploadFile | None = File(default=None),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择要上传的照片")

    original_name = Path(file.filename or "photo").name
    ext = Path(original_name).suffix.lstrip(".").lower()
    if ext not in ALLOWED_PROFILE_PHOTO_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 JPG/JPEG/PNG/WEBP/GIF 图片")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传文件不是有效图片")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传内容为空")
    if len(content) > MAX_PROFILE_PHOTO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片大小不能超过 2MB")

    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    old_file_path = resolve_photo_path(profile)
    target_dir = settings.storage_root / "profile_photos" / str(student.id)
    target_dir.mkdir(parents=True, exist_ok=True)
    file_stamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
    file_name = f"avatar_{file_stamp}.{ext}"
    target_file_path = target_dir / file_name
    target_file_path.write_bytes(content)

    relative_path = Path("profile_photos") / str(student.id) / file_name
    profile.photo_path = relative_path.as_posix()
    log_profile_change_audit(
        db,
        event_type="student_photo_uploaded",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id,
        class_name=profile.school_class.class_name if profile.school_class else None,
        field_key="photo",
        field_label="个人相片",
        before_value="已上传" if old_file_path is not None and old_file_path.exists() else "未上传",
        after_value="已上传",
        description=f"学生上传相片：{original_name}",
    )

    if old_file_path is not None and old_file_path != target_file_path and old_file_path.exists():
        old_file_path.unlink(missing_ok=True)

    db.commit()
    return ApiResponse(message="相片已上传", data={"photo_available": True})


@router.get("/student/photo")
def get_student_photo(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> FileResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    photo_path = resolve_photo_path(profile)
    if photo_path is None or not photo_path.exists() or not photo_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未上传相片")

    media_type, _ = mimetypes.guess_type(photo_path.name)
    return FileResponse(photo_path, media_type=media_type or "application/octet-stream")


@router.delete("/student/photo", response_model=ApiResponse)
def delete_student_photo(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    photo_path = resolve_photo_path(profile)
    profile.photo_path = None
    log_profile_change_audit(
        db,
        event_type="student_photo_deleted",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id,
        class_name=profile.school_class.class_name if profile.school_class else None,
        field_key="photo",
        field_label="个人相片",
        before_value="已上传" if photo_path is not None and photo_path.exists() else "未上传",
        after_value="未上传",
        description="学生删除个人相片。",
    )
    db.commit()

    if photo_path is not None and photo_path.exists():
        photo_path.unlink(missing_ok=True)

    return ApiResponse(message="相片已删除", data={"photo_available": False})


@router.get("/student/class-transfer/options", response_model=ApiResponse)
def student_class_transfer_options(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    archived_class_ids = read_archived_class_ids(db)
    class_options = db.scalars(
        select(SchoolClass)
        .where(SchoolClass.grade_no == profile.grade_no)
        .order_by(SchoolClass.class_no.asc(), SchoolClass.id.asc())
    ).all()
    visible_options = [
        {
            "id": item.id,
            "class_name": item.class_name,
            "grade_no": item.grade_no,
        }
        for item in class_options
        if item.id not in archived_class_ids
    ]

    has_pending_request = db.scalar(
        select(func.count(StudentClassTransferRequest.id)).where(
            StudentClassTransferRequest.student_user_id == student.id,
            StudentClassTransferRequest.status == "pending",
        )
    ) or 0

    return ApiResponse(
        data={
            "current_class_id": profile.class_id,
            "current_class_name": profile.school_class.class_name,
            "grade_no": profile.grade_no,
            "has_pending_request": bool(has_pending_request),
            "classes": visible_options,
        }
    )


@router.get("/student/class-transfer/requests", response_model=ApiResponse)
def student_class_transfer_requests(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    request_items = db.scalars(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.student_user_id == student.id)
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
        .order_by(StudentClassTransferRequest.created_at.desc(), StudentClassTransferRequest.id.desc())
        .limit(20)
    ).all()
    return ApiResponse(data={"requests": [serialize_class_transfer_request(item) for item in request_items]})


@router.post("/student/class-transfer/requests", response_model=ApiResponse)
def create_student_class_transfer_request(
    payload: StudentClassTransferCreatePayload,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    student_with_profile = load_student_with_profile(student.id, db)
    profile = student_with_profile.student_profile
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")

    archived_class_ids = read_archived_class_ids(db)
    if payload.target_class_id in archived_class_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="目标班级已归档，无法申请")

    target_class = db.scalar(select(SchoolClass).where(SchoolClass.id == payload.target_class_id))
    if target_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标班级不存在")
    if target_class.id == profile.class_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="目标班级不能与当前班级相同")
    if target_class.grade_no != profile.grade_no:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持同年级班级之间申请调整")

    pending_count = db.scalar(
        select(func.count(StudentClassTransferRequest.id)).where(
            StudentClassTransferRequest.student_user_id == student.id,
            StudentClassTransferRequest.status == "pending",
        )
    ) or 0
    if pending_count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="你已有待审核的转班申请，请等待处理")

    request_item = StudentClassTransferRequest(
        student_user_id=student.id,
        current_class_id=profile.class_id,
        target_class_id=target_class.id,
        reason=normalize_optional_text(payload.reason),
        status="pending",
    )
    db.add(request_item)
    log_profile_change_audit(
        db,
        event_type="class_transfer_requested",
        actor=student_with_profile,
        target_student=student_with_profile,
        class_id=profile.class_id,
        class_name=profile.school_class.class_name if profile.school_class else None,
        target_class_name=target_class.class_name,
        field_key="class_id",
        field_label="班级",
        before_value=profile.school_class.class_name if profile.school_class else None,
        after_value=target_class.class_name,
        description=f"提交转班申请。理由：{request_item.reason or '未填写'}",
    )
    db.commit()

    latest_request = load_transfer_request_or_404(request_item.id, db)
    return ApiResponse(
        message="转班申请已提交，等待教师或管理员审核",
        data={"request": serialize_class_transfer_request(latest_request)},
    )


@router.get("/staff/class-transfer/requests", response_model=ApiResponse)
def list_class_transfer_requests_for_staff(
    status_filter: str | None = None,
    class_id: int | None = None,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if status_filter is not None:
        normalized = status_filter.strip().lower()
        if normalized not in ALLOWED_CLASS_TRANSFER_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的状态筛选条件")
        status_filter = normalized

    accessible_class_ids = get_accessible_class_ids(staff, db)
    admin_mode = is_admin_staff(staff)
    if not admin_mode and not accessible_class_ids:
        return ApiResponse(data={"items": []})

    if class_id is not None and (not admin_mode and class_id not in accessible_class_ids):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级转班申请")

    stmt = (
        select(StudentClassTransferRequest)
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
        .order_by(StudentClassTransferRequest.created_at.desc(), StudentClassTransferRequest.id.desc())
    )

    if not admin_mode:
        stmt = stmt.where(
            or_(
                StudentClassTransferRequest.current_class_id.in_(accessible_class_ids),
                StudentClassTransferRequest.target_class_id.in_(accessible_class_ids),
            )
        )

    if class_id is not None:
        stmt = stmt.where(
            or_(
                StudentClassTransferRequest.current_class_id == class_id,
                StudentClassTransferRequest.target_class_id == class_id,
            )
        )
    if status_filter is not None:
        stmt = stmt.where(StudentClassTransferRequest.status == status_filter)

    items = db.scalars(stmt.limit(200)).all()
    return ApiResponse(data={"items": [serialize_class_transfer_request(item) for item in items]})


@router.post("/staff/class-transfer/requests/{request_id}/review", response_model=ApiResponse)
def review_class_transfer_request(
    request_id: int,
    payload: StaffClassTransferReviewPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    request_item = load_transfer_request_or_404(request_id, db)
    apply_class_transfer_review(
        request_item,
        decision=payload.decision,
        review_note=payload.review_note,
        audit_batch_token=None,
        staff=staff,
        db=db,
    )
    db.commit()

    latest_request = load_transfer_request_or_404(request_id, db)
    if latest_request.status == "approved":
        message = "转班申请已通过，学生班级信息已更新"
    else:
        message = "转班申请已拒绝"
    return ApiResponse(message=message, data={"request": serialize_class_transfer_request(latest_request)})


@router.post("/staff/class-transfer/requests/batch-review", response_model=ApiResponse)
def batch_review_class_transfer_requests(
    payload: StaffClassTransferBatchReviewPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    normalized_ids = list(dict.fromkeys(payload.request_ids))
    if not normalized_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少选择一条转班申请")

    request_items = db.scalars(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.id.in_(normalized_ids))
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
    ).all()
    item_by_id = {item.id: item for item in request_items}

    processed_count = 0
    skipped_count = 0
    approved_count = 0
    rejected_count = 0
    audit_batch_token = generate_profile_audit_batch_token("ctr-review")

    for request_id in normalized_ids:
        request_item = item_by_id.get(request_id)
        if request_item is None:
            skipped_count += 1
            continue
        if request_item.status != "pending":
            skipped_count += 1
            continue

        apply_class_transfer_review(
            request_item,
            decision=payload.decision,
            review_note=payload.review_note,
            audit_batch_token=audit_batch_token,
            staff=staff,
            db=db,
        )
        processed_count += 1
        if payload.decision == "approve":
            approved_count += 1
        else:
            rejected_count += 1

    db.commit()

    refreshed_items = db.scalars(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.id.in_(normalized_ids))
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
        .order_by(StudentClassTransferRequest.created_at.desc(), StudentClassTransferRequest.id.desc())
    ).all()

    decision_label = "通过" if payload.decision == "approve" else "拒绝"
    return ApiResponse(
        message=f"批量{decision_label}完成：生效 {processed_count} 条，跳过 {skipped_count} 条",
        data={
            "batch_result": {
                "decision": payload.decision,
                "selected_count": len(normalized_ids),
                "processed_count": processed_count,
                "skipped_count": skipped_count,
                "approved_count": approved_count,
                "rejected_count": rejected_count,
                "audit_batch_token": audit_batch_token if processed_count else None,
            },
            "items": [serialize_class_transfer_request(item) for item in refreshed_items],
        },
    )


@router.post("/staff/class-transfer/requests/batch-unreview", response_model=ApiResponse)
def batch_unreview_class_transfer_requests(
    payload: StaffClassTransferBatchUnreviewPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    normalized_ids = list(dict.fromkeys(payload.request_ids))
    if not normalized_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少选择一条转班申请")

    request_items = db.scalars(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.id.in_(normalized_ids))
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
    ).all()
    item_by_id = {item.id: item for item in request_items}

    processed_count = 0
    skipped_count = 0
    rolled_back_approved_count = 0
    reopened_rejected_count = 0
    audit_batch_token = generate_profile_audit_batch_token("ctr-unreview")

    for request_id in normalized_ids:
        request_item = item_by_id.get(request_id)
        if request_item is None:
            skipped_count += 1
            continue
        if request_item.status == "pending":
            skipped_count += 1
            continue

        try:
            transition = apply_class_transfer_unreview(
                request_item,
                reason=payload.reason,
                audit_batch_token=audit_batch_token,
                staff=staff,
                db=db,
            )
        except HTTPException as exc:
            if exc.status_code == status.HTTP_409_CONFLICT:
                skipped_count += 1
                continue
            raise

        processed_count += 1
        if transition == "rolled_back_approved":
            rolled_back_approved_count += 1
        else:
            reopened_rejected_count += 1

    db.commit()

    refreshed_items = db.scalars(
        select(StudentClassTransferRequest)
        .where(StudentClassTransferRequest.id.in_(normalized_ids))
        .options(
            selectinload(StudentClassTransferRequest.student).selectinload(User.student_profile),
            selectinload(StudentClassTransferRequest.current_class),
            selectinload(StudentClassTransferRequest.target_class),
            selectinload(StudentClassTransferRequest.reviewed_by_staff),
        )
        .order_by(StudentClassTransferRequest.created_at.desc(), StudentClassTransferRequest.id.desc())
    ).all()

    return ApiResponse(
        message=f"批量撤销审核完成：生效 {processed_count} 条，跳过 {skipped_count} 条",
        data={
            "batch_result": {
                "selected_count": len(normalized_ids),
                "processed_count": processed_count,
                "skipped_count": skipped_count,
                "rolled_back_approved_count": rolled_back_approved_count,
                "reopened_rejected_count": reopened_rejected_count,
                "audit_batch_token": audit_batch_token if processed_count else None,
            },
            "items": [serialize_class_transfer_request(item) for item in refreshed_items],
        },
    )


@router.get("/staff/profile-change-audits", response_model=ApiResponse)
def list_profile_change_audits_for_staff(
    class_id: int | None = Query(default=None, ge=1),
    event_type: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None, ge=1),
    student_user_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=100),
    batch_token: str | None = Query(default=None, max_length=48),
    limit: int = Query(default=200, ge=1, le=500),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    items, total_count = load_profile_change_audits_for_staff(
        staff=staff,
        db=db,
        class_id=class_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        student_user_id=student_user_id,
        keyword=keyword,
        batch_token=batch_token,
        limit=limit,
    )
    classes_query = select(SchoolClass).order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc(), SchoolClass.id.asc())
    if not is_admin_staff(staff):
        accessible_class_ids = get_accessible_class_ids(staff, db)
        if not accessible_class_ids:
            classes = []
        else:
            classes = db.scalars(classes_query.where(SchoolClass.id.in_(accessible_class_ids))).all()
    else:
        classes = db.scalars(classes_query).all()

    return ApiResponse(
        data={
            "items": [serialize_profile_change_audit(item) for item in items],
            "total_count": total_count,
            "limit": limit,
            "event_types": profile_audit_event_type_options(),
            "classes": [
                {
                    "id": item.id,
                    "class_name": item.class_name,
                    "grade_no": item.grade_no,
                    "class_no": item.class_no,
                }
                for item in classes
            ],
        }
    )


@router.get("/staff/profile-change-audits/export")
def export_profile_change_audits_for_staff(
    class_id: int | None = Query(default=None, ge=1),
    event_type: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None, ge=1),
    student_user_id: int | None = Query(default=None, ge=1),
    keyword: str | None = Query(default=None, max_length=100),
    batch_token: str | None = Query(default=None, max_length=48),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    items, _ = load_profile_change_audits_for_staff(
        staff=staff,
        db=db,
        class_id=class_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        student_user_id=student_user_id,
        keyword=keyword,
        batch_token=batch_token,
        limit=None,
    )
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前筛选条件下没有可导出的资料变更审计记录")

    file_name = f"profile-change-audits-{date.today().isoformat()}.csv"
    return Response(
        content=("\ufeff" + build_profile_change_audit_csv(items)).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": build_content_disposition(file_name)},
    )
