from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import DriveFile, GroupOperationLog, SchoolClass, StudentGroup, Submission, Task, User

DEFAULT_GROUP_OPERATION_LOG_LIMIT = 6
DEFAULT_CLASS_GROUP_OPERATION_LOG_LIMIT = 12


def resolve_actor_role(actor: User | None, explicit_role: str | None = None) -> str | None:
    if explicit_role:
        return explicit_role
    if actor is None:
        return None
    if actor.staff_profile is not None:
        return "admin" if actor.staff_profile.is_admin else "teacher"
    if actor.student_profile is not None:
        return "student"
    return actor.user_type


def resolve_actor_student_no(actor: User | None) -> str | None:
    if actor is None:
        return None
    if actor.student_profile is not None:
        return actor.student_profile.student_no
    return actor.username


def log_group_operation(
    db: Session,
    *,
    event_type: str,
    event_label: str,
    title: str,
    description: str,
    actor: User | None = None,
    actor_role: str | None = None,
    school_class: SchoolClass | None = None,
    group: StudentGroup | None = None,
    class_id: int | None = None,
    group_id: int | None = None,
    group_no: int | None = None,
    group_name: str | None = None,
    task: Task | None = None,
    file: DriveFile | None = None,
    submission: Submission | None = None,
    version_no: int | None = None,
    occurred_at: datetime | None = None,
) -> GroupOperationLog:
    resolved_class_id = class_id or (group.class_id if group is not None else None) or (school_class.id if school_class is not None else None)
    resolved_group_id = group_id if group_id is not None else (group.id if group is not None else None)
    resolved_group_no = group_no if group_no is not None else (group.group_no if group is not None else None)
    resolved_group_name = group_name or (group.name if group is not None else None) or "未命名小组"

    if resolved_class_id is None:
        raise ValueError("class_id is required for group operation logs")

    log = GroupOperationLog(
        class_id=resolved_class_id,
        group_id=resolved_group_id,
        group_no=resolved_group_no,
        group_name=resolved_group_name,
        event_type=event_type,
        event_label=event_label,
        actor_user_id=actor.id if actor is not None else None,
        actor_name=actor.display_name if actor is not None else None,
        actor_role=resolve_actor_role(actor, actor_role),
        actor_student_no=resolve_actor_student_no(actor),
        title=title,
        description=description,
        task_id=task.id if task is not None else None,
        task_title=task.title if task is not None else None,
        file_id=file.id if file is not None else None,
        file_name=file.stored_name if file is not None else None,
        submission_id=submission.id if submission is not None else None,
        version_no=version_no,
        occurred_at=occurred_at or datetime.now(),
    )
    db.add(log)
    return log


def serialize_group_operation_log(log: GroupOperationLog) -> dict:
    return {
        "id": log.id,
        "event_type": log.event_type,
        "event_label": log.event_label,
        "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
        "group_id": log.group_id,
        "group_no": log.group_no,
        "group_name": log.group_name,
        "actor_user_id": log.actor_user_id,
        "actor_name": log.actor_name,
        "actor_role": log.actor_role,
        "actor_student_no": log.actor_student_no,
        "title": log.title,
        "description": log.description,
        "task_id": log.task_id,
        "task_title": log.task_title,
        "file_id": log.file_id,
        "file_name": log.file_name,
        "submission_id": log.submission_id,
        "version_no": log.version_no,
    }


def load_group_operation_logs_by_group_id(
    group_ids: list[int],
    db: Session,
    *,
    limit_per_group: int = DEFAULT_GROUP_OPERATION_LOG_LIMIT,
) -> dict[int, list[GroupOperationLog]]:
    if not group_ids:
        return {}

    logs = db.scalars(
        select(GroupOperationLog)
        .where(GroupOperationLog.group_id.in_(group_ids))
        .order_by(GroupOperationLog.occurred_at.desc(), GroupOperationLog.id.desc())
    ).all()

    grouped: dict[int, list[GroupOperationLog]] = defaultdict(list)
    for log in logs:
        if log.group_id is None:
            continue
        if len(grouped[log.group_id]) >= limit_per_group:
            continue
        grouped[log.group_id].append(log)

    return dict(grouped)


def load_recent_class_group_logs(
    class_id: int,
    db: Session,
    *,
    limit: int = DEFAULT_CLASS_GROUP_OPERATION_LOG_LIMIT,
) -> list[GroupOperationLog]:
    return list(
        db.scalars(
            select(GroupOperationLog)
            .where(GroupOperationLog.class_id == class_id)
            .order_by(GroupOperationLog.occurred_at.desc(), GroupOperationLog.id.desc())
            .limit(limit)
        ).all()
    )


def build_group_operation_log_filters(
    *,
    class_id: int,
    group_id: int | None = None,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    keyword: str | None = None,
) -> list:
    conditions = [GroupOperationLog.class_id == class_id]
    if group_id is not None:
        conditions.append(GroupOperationLog.group_id == group_id)
    if event_type:
        conditions.append(GroupOperationLog.event_type == event_type)
    if actor_user_id is not None:
        conditions.append(GroupOperationLog.actor_user_id == actor_user_id)

    normalized_keyword = (keyword or "").strip()
    if normalized_keyword:
        like_value = f"%{normalized_keyword}%"
        conditions.append(
            or_(
                GroupOperationLog.group_name.ilike(like_value),
                GroupOperationLog.actor_name.ilike(like_value),
                GroupOperationLog.actor_student_no.ilike(like_value),
                GroupOperationLog.title.ilike(like_value),
                GroupOperationLog.description.ilike(like_value),
                GroupOperationLog.task_title.ilike(like_value),
                GroupOperationLog.file_name.ilike(like_value),
            )
        )

    return conditions


def load_filtered_class_group_logs(
    class_id: int,
    db: Session,
    *,
    group_id: int | None = None,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    keyword: str | None = None,
    limit: int | None = None,
) -> list[GroupOperationLog]:
    query = (
        select(GroupOperationLog)
        .where(
            *build_group_operation_log_filters(
                class_id=class_id,
                group_id=group_id,
                event_type=event_type,
                actor_user_id=actor_user_id,
                keyword=keyword,
            )
        )
        .order_by(GroupOperationLog.occurred_at.desc(), GroupOperationLog.id.desc())
    )
    if limit is not None:
        query = query.limit(limit)
    return list(db.scalars(query).all())


def count_filtered_class_group_logs(
    class_id: int,
    db: Session,
    *,
    group_id: int | None = None,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    keyword: str | None = None,
) -> int:
    return int(
        db.scalar(
            select(func.count(GroupOperationLog.id)).where(
                *build_group_operation_log_filters(
                    class_id=class_id,
                    group_id=group_id,
                    event_type=event_type,
                    actor_user_id=actor_user_id,
                    keyword=keyword,
                )
            )
        )
        or 0
    )
