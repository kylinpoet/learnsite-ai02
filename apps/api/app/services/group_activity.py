from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from math import ceil

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AttendanceRecord,
    CurriculumLesson,
    DriveFile,
    DriveSpace,
    LessonPlan,
    Submission,
    StudentGroup,
    StudentGroupMember,
    Task,
    User,
)

DEFAULT_GROUP_ACTIVITY_LIMIT = 8
DEFAULT_GROUP_ACTIVITY_FILE_LIMIT = 6
DEFAULT_GROUP_ACTIVITY_SUBMISSION_LIMIT = 6


def load_recent_group_submissions(group_ids: list[int], db: Session) -> dict[int, list[Submission]]:
    if not group_ids:
        return {}

    submissions = db.scalars(
        select(Submission)
        .where(Submission.group_id.in_(group_ids))
        .options(
            selectinload(Submission.student).selectinload(User.student_profile),
            selectinload(Submission.task)
            .selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
            selectinload(Submission.files),
        )
        .order_by(Submission.updated_at.desc(), Submission.id.desc())
    ).all()

    grouped: dict[int, list[Submission]] = defaultdict(list)
    for submission in submissions:
        if submission.group_id is not None:
            grouped[submission.group_id].append(submission)
    return dict(grouped)


def build_group_activity_feed(
    group: StudentGroup,
    attendance_by_student_id: dict[int, AttendanceRecord],
    drive_space: DriveSpace | None,
    submissions: list[Submission] | None,
    *,
    limit: int = DEFAULT_GROUP_ACTIVITY_LIMIT,
) -> list[dict]:
    events: list[tuple[datetime, str, dict]] = []

    for membership in group.memberships:
        attendance = attendance_by_student_id.get(membership.student_user_id)
        if attendance is None:
            continue
        events.append(
            (
                attendance.checked_in_at,
                f"attendance-{attendance.id}",
                serialize_group_attendance_event(group, membership, attendance),
            )
        )

    if drive_space is not None:
        files = sorted(
            drive_space.files,
            key=lambda item: (item.updated_at or item.created_at, item.id),
            reverse=True,
        )
        for drive_file in files[:DEFAULT_GROUP_ACTIVITY_FILE_LIMIT]:
            event_time = drive_file.updated_at or drive_file.created_at
            if event_time is None:
                continue
            events.append(
                (
                    event_time,
                    f"drive-{drive_file.id}",
                    serialize_group_drive_upload_event(group, drive_file),
                )
            )

    for submission in (submissions or [])[:DEFAULT_GROUP_ACTIVITY_SUBMISSION_LIMIT]:
        if submission.submitted_at is not None:
            events.append(
                (
                    submission.submitted_at,
                    f"submission-{submission.id}-submitted",
                    serialize_group_submission_event(group, submission),
                )
            )

        review_time = submission.updated_at if submission.submit_status == "reviewed" else None
        if review_time is not None:
            events.append(
                (
                    review_time,
                    f"submission-{submission.id}-reviewed",
                    serialize_group_submission_review_event(group, submission),
                )
            )

    events.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [payload for _, _, payload in events[:limit]]


def serialize_group_attendance_event(
    group: StudentGroup,
    membership: StudentGroupMember,
    attendance: AttendanceRecord,
) -> dict:
    student = membership.student
    profile = student.student_profile
    role_label = "组长" if membership.role == "leader" else "组员"
    return {
        "id": f"attendance-{attendance.id}",
        "event_type": "attendance",
        "event_label": "课堂签到",
        "occurred_at": attendance.checked_in_at.isoformat(),
        "group_id": group.id,
        "group_name": group.name,
        "group_no": group.group_no,
        "actor_name": student.display_name,
        "actor_student_no": profile.student_no if profile else student.username,
        "title": f"{student.display_name} 已完成签到",
        "description": f"{role_label}已加入本节课堂，签到来源：{attendance.signin_source}",
        "file_id": None,
        "submission_id": None,
        "task_id": None,
    }


def serialize_group_drive_upload_event(group: StudentGroup, drive_file: DriveFile) -> dict:
    uploaded_by = drive_file.uploaded_by_user
    profile = uploaded_by.student_profile if uploaded_by else None
    actor_name = uploaded_by.display_name if uploaded_by else "未知成员"
    actor_student_no = (
        profile.student_no if profile else (uploaded_by.username if uploaded_by else None)
    )
    size_kb = max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0
    return {
        "id": f"drive-{drive_file.id}",
        "event_type": "drive_upload",
        "event_label": "共享文件",
        "occurred_at": (drive_file.updated_at or drive_file.created_at).isoformat(),
        "group_id": group.id,
        "group_name": group.name,
        "group_no": group.group_no,
        "actor_name": actor_name,
        "actor_student_no": actor_student_no,
        "title": f"{actor_name} 上传了《{drive_file.stored_name}》",
        "description": f"{drive_file.file_ext.upper()} · {size_kb} KB · 已同步到小组共享网盘",
        "file_id": drive_file.id,
        "submission_id": None,
        "task_id": None,
    }


def serialize_group_submission_event(group: StudentGroup, submission: Submission) -> dict:
    student = submission.student
    profile = student.student_profile if student else None
    file_count = len(submission.files)
    return {
        "id": f"submission-{submission.id}-submitted",
        "event_type": "group_submission",
        "event_label": "共同提交",
        "occurred_at": submission.submitted_at.isoformat(),
        "group_id": group.id,
        "group_name": group.name,
        "group_no": group.group_no,
        "actor_name": student.display_name if student else None,
        "actor_student_no": profile.student_no if profile else (student.username if student else None),
        "title": f"{student.display_name if student else '小组成员'} 提交了《{submission.task.title}》",
        "description": f"{file_count} 个附件 · 当前为小组共同提交版本",
        "file_id": None,
        "submission_id": submission.id,
        "task_id": submission.task_id,
    }


def serialize_group_submission_review_event(group: StudentGroup, submission: Submission) -> dict:
    description_parts = [f"《{submission.task.title}》已完成教师评阅"]
    if submission.score is not None:
        description_parts.append(f"当前得分 {submission.score} 分")
    if submission.is_recommended:
        description_parts.append("已进入推荐展示")

    return {
        "id": f"submission-{submission.id}-reviewed",
        "event_type": "submission_reviewed",
        "event_label": "教师评阅",
        "occurred_at": submission.updated_at.isoformat(),
        "group_id": group.id,
        "group_name": group.name,
        "group_no": group.group_no,
        "actor_name": None,
        "actor_student_no": None,
        "title": f"《{submission.task.title}》已返回评阅结果",
        "description": " · ".join(description_parts),
        "file_id": None,
        "submission_id": submission.id,
        "task_id": submission.task_id,
    }
