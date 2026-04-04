from __future__ import annotations

import re
from datetime import datetime
from math import ceil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_student
from app.api.deps.db import get_db
from app.models import (
    CurriculumLesson,
    CurriculumUnit,
    GroupTaskDraft,
    GroupTaskDraftVersion,
    LessonPlan,
    StudentGroup,
    StudentGroupMember,
    StudentProfile,
    Submission,
    SubmissionFile,
    Task,
    TaskReadRecord,
    User,
)
from app.schemas.common import ApiResponse
from app.services.classroom_switches import (
    build_student_classroom_context,
    ensure_feature_access,
    resolve_feature_access,
    serialize_classroom_capabilities,
)
from app.services.group_operation_logs import log_group_operation
from app.services.student_groups import load_student_group_membership
from app.services.submission_files import (
    guess_media_type,
    is_previewable_file,
    stored_file_path,
    submission_dir,
)

router = APIRouter()


class GroupTaskDraftUpdateRequest(BaseModel):
    submission_note: str | None = Field(default="")
    source_code: str | None = Field(default="")


def load_task(task_id: int, db: Session) -> Task:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book)
        )
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return task


def task_submission_scope(task: Task) -> str:
    return (task.submission_scope or "individual").strip().lower() or "individual"


def is_group_submission_task(task: Task) -> bool:
    return task_submission_scope(task) == "group"


def is_programming_task(task: Task) -> bool:
    return (task.task_type or "").strip().lower() in {"programming", "code_python"}


def load_student_group_for_task(student_id: int, db: Session):
    return load_student_group_membership(student_id, db, include_members=True)


def load_student_submission(task_id: int, student_id: int, db: Session) -> Submission | None:
    return db.scalar(
        select(Submission)
        .where(Submission.task_id == task_id, Submission.student_id == student_id)
        .options(
            selectinload(Submission.files),
            selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
        )
    )


def load_group_submission(task_id: int, group_id: int, db: Session) -> Submission | None:
    return db.scalar(
        select(Submission)
        .where(Submission.task_id == task_id, Submission.group_id == group_id)
        .options(
            selectinload(Submission.files),
            selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(Submission.student).selectinload(User.student_profile),
        )
    )


def load_group_task_draft(task_id: int, group_id: int, db: Session) -> GroupTaskDraft | None:
    return db.scalar(
        select(GroupTaskDraft)
        .where(GroupTaskDraft.task_id == task_id, GroupTaskDraft.group_id == group_id)
        .options(
            selectinload(GroupTaskDraft.updated_by_user).selectinload(User.student_profile),
        )
    )


def load_group_task_draft_history(
    task_id: int,
    group_id: int,
    db: Session,
) -> list[GroupTaskDraftVersion]:
    return list(
        db.scalars(
            select(GroupTaskDraftVersion)
            .where(
                GroupTaskDraftVersion.task_id == task_id,
                GroupTaskDraftVersion.group_id == group_id,
            )
            .options(
                selectinload(GroupTaskDraftVersion.updated_by_user).selectinload(User.student_profile),
            )
            .order_by(GroupTaskDraftVersion.version_no.desc(), GroupTaskDraftVersion.id.desc())
        ).all()
    )


def load_task_submission_for_student(
    task: Task,
    student: User,
    db: Session,
) -> tuple[Submission | None, StudentGroupMember | None]:
    if not is_group_submission_task(task):
        return load_student_submission(task.id, student.id, db), None

    membership = load_student_group_for_task(student.id, db)
    if membership is None:
        return None, None
    return load_group_submission(task.id, membership.group_id, db), membership


def load_group_task_draft_for_membership(
    task: Task,
    group_membership: StudentGroupMember | None,
    db: Session,
) -> GroupTaskDraft | None:
    if not is_group_submission_task(task) or group_membership is None:
        return None
    return load_group_task_draft(task.id, group_membership.group_id, db)


def load_task_read_record(task_id: int, student_id: int, db: Session) -> TaskReadRecord | None:
    return db.scalar(
        select(TaskReadRecord).where(TaskReadRecord.task_id == task_id, TaskReadRecord.student_id == student_id)
    )


def load_recommended_submissions(task_id: int, db: Session) -> list[Submission]:
    submissions = db.scalars(
        select(Submission)
        .where(
            Submission.task_id == task_id,
            Submission.submit_status == "reviewed",
            Submission.is_recommended.is_(True),
        )
        .options(
            selectinload(Submission.student)
            .selectinload(User.student_profile)
            .selectinload(StudentProfile.school_class),
            selectinload(Submission.files),
        )
        .order_by(Submission.submitted_at.desc(), Submission.id.desc())
    ).all()
    return list(submissions)


def latest_submission_time(submission: Submission) -> datetime | None:
    return submission.submitted_at or submission.updated_at


def build_default_description(task: Task) -> str:
    plan = task.lesson_plan
    lesson = plan.lesson
    return (
        f"<p>请围绕《{plan.title}》中的“{task.title}”完成学习作品。</p>"
        f"<p>你可以填写作品说明，也可以上传附件；提交后即保存，教师评价前可再次提交覆盖。</p>"
        f"<p>当前课次属于“{lesson.unit.title} / {lesson.title}”。</p>"
    )


def normalize_submission_note(submission_note: str | None) -> str | None:
    if submission_note is None:
        return None

    cleaned = submission_note.strip()
    if not cleaned:
        return None

    text_only = re.sub(r"<[^>]+>", "", cleaned).replace("&nbsp;", " ").strip()
    return cleaned if text_only else None


def normalize_draft_source_code(source_code: str | None) -> str | None:
    if source_code is None:
        return None
    normalized = source_code.replace("\r\n", "\n")
    return normalized if normalized.strip() else None


def serialize_submission_file(submission_file: SubmissionFile) -> dict:
    return {
        "id": submission_file.id,
        "name": submission_file.original_name,
        "ext": submission_file.file_ext,
        "size_kb": submission_file.size_kb,
        "role": submission_file.file_role,
        "mime_type": guess_media_type(submission_file),
        "previewable": is_previewable_file(submission_file),
    }


def serialize_group_collaboration(membership: StudentGroupMember | None) -> dict | None:
    if membership is None:
        return None

    group = membership.group
    return {
        "group_id": group.id,
        "group_name": group.name,
        "group_no": group.group_no,
        "class_name": group.school_class.class_name if group.school_class else None,
        "my_role": membership.role,
        "member_count": len(group.memberships),
        "members": [
            {
                "user_id": item.student.id,
                "display_name": item.student.display_name,
                "student_no": item.student.student_profile.student_no if item.student.student_profile else item.student.username,
                "role": item.role,
            }
            for item in group.memberships
        ],
    }


def serialize_group_task_draft(draft: GroupTaskDraft | None) -> dict | None:
    if draft is None:
        return None

    updated_by = draft.updated_by_user
    profile = updated_by.student_profile if updated_by else None
    return {
        "id": draft.id,
        "submission_note": draft.draft_note,
        "source_code": draft.draft_code,
        "version_no": draft.version_no,
        "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
        "updated_by_name": updated_by.display_name if updated_by else None,
        "updated_by_student_no": (
            profile.student_no if profile else (updated_by.username if updated_by else None)
        ),
    }


def serialize_group_task_draft_version(version: GroupTaskDraftVersion) -> dict:
    updated_by = version.updated_by_user
    profile = updated_by.student_profile if updated_by else None
    return {
        "id": version.id,
        "version_no": version.version_no,
        "previous_version_no": version.previous_version_no,
        "event_type": version.event_type,
        "event_label": version.event_label,
        "submission_note": version.draft_note,
        "source_code": version.draft_code,
        "occurred_at": version.occurred_at.isoformat() if version.occurred_at else None,
        "updated_by_name": updated_by.display_name if updated_by else None,
        "updated_by_student_no": (
            profile.student_no if profile else (updated_by.username if updated_by else None)
        ),
    }


def serialize_task_submission(submission: Submission) -> dict:
    latest_time = latest_submission_time(submission)
    return {
        "id": submission.id,
        "status": submission.submit_status,
        "score": submission.score,
        "is_recommended": submission.submit_status == "reviewed" and submission.is_recommended,
        "peer_review_score": submission.peer_review_score,
        "submission_note": submission.submission_note,
        "teacher_comment": submission.teacher_comment,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": latest_time.isoformat() if latest_time else None,
        "can_resubmit": submission.submit_status != "reviewed",
        "submission_scope": task_submission_scope(submission.task),
        "group_id": submission.group.id if submission.group else None,
        "group_name": submission.group.name if submission.group else None,
        "group_no": submission.group.group_no if submission.group else None,
        "submitted_by_name": submission.student.display_name if submission.student else None,
        "submitted_by_student_no": (
            submission.student.student_profile.student_no
            if submission.student and submission.student.student_profile
            else (submission.student.username if submission.student else None)
        ),
        "files": [serialize_submission_file(item) for item in submission.files],
    }


def serialize_recommended_submission(submission: Submission) -> dict:
    student = submission.student
    profile = student.student_profile
    school_class = profile.school_class if profile else None
    latest_time = latest_submission_time(submission)
    return {
        "submission_id": submission.id,
        "student_id": student.id,
        "student_name": student.display_name,
        "student_no": profile.student_no if profile else student.username,
        "class_name": school_class.class_name if school_class else "",
        "submission_scope": task_submission_scope(submission.task),
        "group_id": submission.group.id if submission.group else None,
        "group_name": submission.group.name if submission.group else None,
        "group_no": submission.group.group_no if submission.group else None,
        "score": submission.score,
        "submission_note": submission.submission_note,
        "teacher_comment": submission.teacher_comment,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": latest_time.isoformat() if latest_time else None,
        "files": [serialize_submission_file(item) for item in submission.files],
    }


def serialize_recommended_showcase(submissions: list[Submission]) -> dict:
    return {
        "count": len(submissions),
        "items": [serialize_recommended_submission(submission) for submission in submissions],
    }


def serialize_task_navigation(task: Task) -> dict:
    plan_tasks = sorted(task.lesson_plan.tasks, key=lambda item: (item.sort_order, item.id))
    current_index = next(
        (index for index, plan_task in enumerate(plan_tasks) if plan_task.id == task.id),
        0,
    )

    def serialize_nav_item(target: Task | None) -> dict | None:
        if target is None:
            return None
        return {
            "id": target.id,
            "title": target.title,
            "task_type": target.task_type,
        }

    previous_task = plan_tasks[current_index - 1] if current_index > 0 else None
    next_task = plan_tasks[current_index + 1] if current_index + 1 < len(plan_tasks) else None
    return {
        "previous_task": serialize_nav_item(previous_task),
        "next_task": serialize_nav_item(next_task),
    }


def serialize_reading_progress(task: Task, read_record: TaskReadRecord | None) -> dict | None:
    if task.task_type != "reading":
        return None
    return {
        "is_read": read_record is not None,
        "read_at": read_record.read_at.isoformat() if read_record else None,
        "can_mark_read": read_record is None,
    }


def serialize_task_detail(
    task: Task,
    submission: Submission | None,
    recommended_submissions: list[Submission],
    read_record: TaskReadRecord | None = None,
    group_membership: StudentGroupMember | None = None,
    group_draft: GroupTaskDraft | None = None,
    *,
    group_collaboration_enabled: bool = True,
    submit_allowed: bool = True,
    submit_blocked_message: str = "",
    classroom_capabilities: dict | None = None,
) -> dict:
    plan = task.lesson_plan
    lesson = plan.lesson
    can_submit = (
        False
        if is_group_submission_task(task) and group_membership is None
        else submission is None or submission.submit_status != "reviewed"
    )
    can_submit = can_submit and submit_allowed
    return {
        "id": task.id,
        "title": task.title,
        "task_type": task.task_type,
        "submission_scope": task_submission_scope(task),
        "description": task.description or build_default_description(task),
        "is_required": task.is_required,
        "course": {
            "id": plan.id,
            "title": plan.title,
            "assigned_date": plan.assigned_date.isoformat(),
            "lesson_title": lesson.title,
            "unit_title": lesson.unit.title,
            "book_title": lesson.unit.book.name,
            "content": plan.content or "",
        },
        "submission_policy": {
            "direct_submit": True,
            "allow_resubmit_until_reviewed": True,
            "draft_enabled": is_group_submission_task(task),
        },
        "task_navigation": serialize_task_navigation(task),
        "reading_progress": serialize_reading_progress(task, read_record),
        "group_collaboration": (
            serialize_group_collaboration(group_membership)
            if group_collaboration_enabled
            else None
        ),
        "group_draft": (
            serialize_group_task_draft(group_draft)
            if group_collaboration_enabled
            else None
        ),
        "current_submission": serialize_task_submission(submission) if submission else None,
        "recommended_showcase": serialize_recommended_showcase(recommended_submissions),
        "can_submit": can_submit,
        "submit_blocked_message": submit_blocked_message,
        "classroom_capabilities": classroom_capabilities or {},
    }


def next_submission_id(db: Session) -> int:
    current_max = db.scalar(select(func.coalesce(func.max(Submission.id), 0)))
    return int(current_max or 0) + 1


def clear_submission_files(submission: Submission, db: Session) -> None:
    directory = submission_dir(submission.id)

    for submission_file in list(submission.files):
        file_path = stored_file_path(submission_file)
        if file_path.exists():
            file_path.unlink()
        db.delete(submission_file)

    if directory.exists():
        for leftover in directory.iterdir():
            if leftover.is_file():
                leftover.unlink()
        if not any(directory.iterdir()):
            directory.rmdir()


async def save_submission_files(
    submission: Submission,
    uploads: list[UploadFile],
    db: Session,
) -> None:
    if not uploads:
        return

    target_dir = submission_dir(submission.id)
    target_dir.mkdir(parents=True, exist_ok=True)

    for upload in uploads:
        if not upload.filename:
            await upload.close()
            continue

        original_name = Path(upload.filename).name
        ext = Path(original_name).suffix.lstrip(".").lower() or "bin"
        submission_file = SubmissionFile(
            submission_id=submission.id,
            original_name=original_name,
            file_ext=ext,
            size_kb=0,
            file_role="attachment",
        )
        db.add(submission_file)
        db.flush()

        content = await upload.read()
        stored_file_path(submission_file).write_bytes(content)
        submission_file.size_kb = ceil(len(content) / 1024) if content else 0
        await upload.close()


def next_group_task_draft_version_no(
    task_id: int,
    group_id: int,
    db: Session,
    *,
    current_draft: GroupTaskDraft | None = None,
) -> int:
    if current_draft is not None:
        return current_draft.version_no + 1

    latest_version = db.scalar(
        select(func.coalesce(func.max(GroupTaskDraftVersion.version_no), 0)).where(
            GroupTaskDraftVersion.task_id == task_id,
            GroupTaskDraftVersion.group_id == group_id,
        )
    )
    return int(latest_version or 0) + 1


def create_group_task_draft_version(
    task: Task,
    group_membership: StudentGroupMember,
    student: User,
    db: Session,
    *,
    version_no: int,
    previous_version_no: int | None,
    event_type: str,
    event_label: str,
    submission_note: str | None,
    source_code: str | None,
) -> GroupTaskDraftVersion:
    version = GroupTaskDraftVersion(
        task_id=task.id,
        group_id=group_membership.group_id,
        updated_by_user_id=student.id,
        version_no=version_no,
        previous_version_no=previous_version_no,
        event_type=event_type,
        event_label=event_label,
        draft_note=submission_note,
        draft_code=source_code,
        occurred_at=datetime.now(),
    )
    db.add(version)
    db.flush()
    return version


def save_group_task_draft(
    task: Task,
    group_membership: StudentGroupMember,
    student: User,
    db: Session,
    *,
    event_type: str,
    event_label: str,
    submission_note: str | None,
    source_code: str | None,
) -> tuple[GroupTaskDraft | None, GroupTaskDraftVersion | None]:
    draft = load_group_task_draft(task.id, group_membership.group_id, db)

    if not submission_note and not source_code:
        if draft is None:
            return None, None

        version_no = next_group_task_draft_version_no(
            task.id,
            group_membership.group_id,
            db,
            current_draft=draft,
        )
        history_version = create_group_task_draft_version(
            task,
            group_membership,
            student,
            db,
            version_no=version_no,
            previous_version_no=draft.version_no,
            event_type=event_type,
            event_label=event_label,
            submission_note=None,
            source_code=None,
        )
        db.delete(draft)
        db.flush()
        return None, history_version

    if draft is None:
        version_no = next_group_task_draft_version_no(task.id, group_membership.group_id, db)
        draft = GroupTaskDraft(
            task_id=task.id,
            group_id=group_membership.group_id,
            updated_by_user_id=student.id,
            draft_note=submission_note,
            draft_code=source_code,
            version_no=version_no,
        )
        db.add(draft)
        db.flush()
        history_version = create_group_task_draft_version(
            task,
            group_membership,
            student,
            db,
            version_no=version_no,
            previous_version_no=version_no - 1 if version_no > 1 else None,
            event_type=event_type,
            event_label=event_label,
            submission_note=submission_note,
            source_code=source_code,
        )
        return draft, history_version

    previous_version_no = draft.version_no
    draft.updated_by_user_id = student.id
    draft.draft_note = submission_note
    draft.draft_code = source_code
    draft.version_no = next_group_task_draft_version_no(
        task.id,
        group_membership.group_id,
        db,
        current_draft=draft,
    )
    db.flush()
    history_version = create_group_task_draft_version(
        task,
        group_membership,
        student,
        db,
        version_no=draft.version_no,
        previous_version_no=previous_version_no,
        event_type=event_type,
        event_label=event_label,
        submission_note=submission_note,
        source_code=source_code,
    )
    return draft, history_version


@router.get("/{task_id}", response_model=ApiResponse)
def task_detail(
    task_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    capability_context = build_student_classroom_context(student, db, request)
    programming_enabled, programming_message = (
        resolve_feature_access(capability_context, "programming_control")
        if is_programming_task(task)
        else (True, "")
    )
    group_discussion_enabled, group_discussion_message = (
        resolve_feature_access(capability_context, "group_discussion")
        if is_group_submission_task(task)
        else (True, "")
    )
    classroom_capabilities = serialize_classroom_capabilities(
        capability_context,
        feature_states={
            "programming_control": (programming_enabled, programming_message),
            "group_discussion": (group_discussion_enabled, group_discussion_message),
        },
    )

    submission, group_membership = load_task_submission_for_student(task, student, db)
    group_draft = (
        load_group_task_draft_for_membership(task, group_membership, db)
        if group_discussion_enabled
        else None
    )
    read_record = load_task_read_record(task.id, student.id, db)
    recommended_submissions = load_recommended_submissions(task.id, db)
    return ApiResponse(
        data=serialize_task_detail(
            task,
            submission,
            recommended_submissions,
            read_record,
            group_membership,
            group_draft,
            group_collaboration_enabled=group_discussion_enabled,
            submit_allowed=programming_enabled,
            submit_blocked_message=programming_message if not programming_enabled else "",
            classroom_capabilities=classroom_capabilities,
        )
    )


@router.get("/{task_id}/prerequisites", response_model=ApiResponse)
def task_prerequisites(
    task_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    capability_context = build_student_classroom_context(student, db, request)
    blocked_items: list[dict] = []
    if is_programming_task(task):
        programming_enabled, programming_message = resolve_feature_access(
            capability_context,
            "programming_control",
        )
        if not programming_enabled:
            blocked_items.append(
                {
                    "code": "programming_control",
                    "message": programming_message,
                }
            )
    return ApiResponse(
        data={
            "task_id": task.id,
            "is_blocked": bool(blocked_items),
            "items": blocked_items,
        }
    )


@router.post("/{task_id}/mark-read", response_model=ApiResponse)
def mark_task_as_read(
    task_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    if task.task_type != "reading":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有阅读任务支持已读确认")

    read_record = load_task_read_record(task.id, student.id, db)
    if read_record is None:
        db.add(TaskReadRecord(task_id=task.id, student_id=student.id, read_at=datetime.now()))
        db.commit()

    latest_read_record = load_task_read_record(task.id, student.id, db)
    submission, group_membership = load_task_submission_for_student(task, student, db)
    group_draft = load_group_task_draft_for_membership(task, group_membership, db)
    recommended_submissions = load_recommended_submissions(task.id, db)
    return ApiResponse(
        message="已标记为已读",
        data=serialize_task_detail(
            task,
            submission,
            recommended_submissions,
            latest_read_record,
            group_membership,
            group_draft,
        ),
    )


@router.get("/{task_id}/group-draft/history", response_model=ApiResponse)
def group_task_draft_history(
    task_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    if not is_group_submission_task(task):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是小组共同提交任务")


    _, group_membership = load_task_submission_for_student(task, student, db)
    if group_membership is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前任务需要以小组为单位协作，请先完成分组后再查看共享草稿历史",
        )

    history_items = load_group_task_draft_history(task.id, group_membership.group_id, db)
    return ApiResponse(
        data={
            "task_id": task.id,
            "group_id": group_membership.group_id,
            "items": [serialize_group_task_draft_version(item) for item in history_items],
        }
    )


@router.put("/{task_id}/group-draft", response_model=ApiResponse)
def update_group_task_draft(
    task_id: int,
    payload: GroupTaskDraftUpdateRequest,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    if not is_group_submission_task(task):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是小组共同提交任务")

    capability_context = build_student_classroom_context(student, db, request)
    ensure_feature_access(capability_context, "group_discussion")

    submission, group_membership = load_task_submission_for_student(task, student, db)
    if group_membership is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前任务需要以小组为单位协作，请先完成分组后再编辑",
        )
    if submission is not None and submission.submit_status == "reviewed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="作业已评价，不能继续修改小组协作草稿",
        )

    normalized_note = normalize_submission_note(payload.submission_note)
    normalized_source_code = normalize_draft_source_code(payload.source_code)
    is_clear_request = not normalized_note and not normalized_source_code
    draft, history_version = save_group_task_draft(
        task,
        group_membership,
        student,
        db,
        event_type="cleared" if is_clear_request else "synced",
        event_label="清空草稿" if is_clear_request else "同步草稿",
        submission_note=normalized_note,
        source_code=normalized_source_code,
    )
    if draft is None:
        if history_version is not None:
            log_group_operation(
                db,
                event_type="group_draft_cleared",
                event_label="清空草稿",
                title=f"{student.display_name} 清空了《{task.title}》的共享草稿",
                description="组内共享草稿已被清空，后续成员将看到空白协作状态。",
                actor=student,
                actor_role=group_membership.role,
                group=group_membership.group,
                task=task,
                version_no=history_version.version_no,
            )
    else:
        log_group_operation(
            db,
            event_type="group_draft_synced",
            event_label="同步草稿",
            title=f"{student.display_name} 同步了《{task.title}》的共享草稿",
            description=(
                f"{'已同步说明' if draft.draft_note else '未同步说明'}；"
                f"{'已同步代码' if draft.draft_code else '未同步代码'}；"
                f"当前共享版本为 v{draft.version_no}。"
            ),
            actor=student,
            actor_role=group_membership.role,
            group=group_membership.group,
            task=task,
            version_no=history_version.version_no if history_version is not None else draft.version_no,
        )
    db.commit()
    latest_draft = load_group_task_draft_for_membership(task, group_membership, db)
    return ApiResponse(
        message="小组协作草稿已同步" if latest_draft else "小组协作草稿已清空",
        data=serialize_group_task_draft(latest_draft),
    )


@router.post("/{task_id}/submit", response_model=ApiResponse)
async def submit_task(
    task_id: int,
    request: Request,
    submission_note: str = Form(default=""),
    draft_source_code: str = Form(default=""),
    files: list[UploadFile] | None = File(default=None),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    capability_context = build_student_classroom_context(student, db, request)
    if is_programming_task(task):
        ensure_feature_access(capability_context, "programming_control")

    upload_items = [item for item in (files or []) if item.filename]
    note = normalize_submission_note(submission_note)
    normalized_draft_source_code = normalize_draft_source_code(draft_source_code)
    submission, group_membership = load_task_submission_for_student(task, student, db)
    if is_group_submission_task(task) and group_membership is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前任务需要以小组为单位提交，请先完成分组后再提交",
        )
    has_existing_files = submission is not None and bool(submission.files)

    if not note and not upload_items and not has_existing_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写作品说明或上传附件后再提交",
        )

    if submission is not None and submission.submit_status == "reviewed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="作业已评价，不能再次提交",
        )

    now = datetime.now()
    is_new_submission = submission is None
    if submission is None:
        submission = Submission(
            id=next_submission_id(db),
            task_id=task.id,
            student_id=student.id,
            group_id=group_membership.group_id if group_membership is not None else None,
            submit_status="submitted",
            is_recommended=False,
            submission_note=note or None,
            submitted_at=now,
        )
        db.add(submission)
        db.flush()
    else:
        submission.student_id = student.id
        submission.group_id = group_membership.group_id if group_membership is not None else None
        submission.submit_status = "submitted"
        submission.submission_note = note or None
        submission.teacher_comment = None
        submission.score = None
        submission.is_recommended = False
        submission.peer_review_score = None
        submission.submitted_at = now
        if upload_items:
            clear_submission_files(submission, db)
        db.flush()

    await save_submission_files(submission, upload_items, db)
    if is_group_submission_task(task) and group_membership is not None:
        latest_draft, latest_history_version = save_group_task_draft(
            task,
            group_membership,
            student,
            db,
            event_type="submitted",
            event_label="正式提交",
            submission_note=note,
            source_code=normalized_draft_source_code,
        )
        log_group_operation(
            db,
            event_type="group_submission_submitted",
            event_label="正式提交",
            title=f"{student.display_name} 提交了《{task.title}》",
            description=(
                f"{'首次提交' if is_new_submission else '重新提交'}；"
                f"附件 {len(submission.files)} 个；"
                f"{'已同步共享草稿 v' + str(latest_draft.version_no) if latest_draft is not None else '未保留共享草稿'}。"
            ),
            actor=student,
            actor_role=group_membership.role,
            group=group_membership.group,
            task=task,
            submission=submission,
            version_no=(
                latest_history_version.version_no
                if latest_history_version is not None
                else (latest_draft.version_no if latest_draft is not None else None)
            ),
        )
    db.commit()

    latest_submission, latest_group_membership = load_task_submission_for_student(task, student, db)
    latest_task = load_task(task.id, db)
    latest_context = build_student_classroom_context(student, db, request)
    latest_programming_enabled, latest_programming_message = (
        resolve_feature_access(latest_context, "programming_control")
        if is_programming_task(latest_task)
        else (True, "")
    )
    latest_group_discussion_enabled, latest_group_discussion_message = (
        resolve_feature_access(latest_context, "group_discussion")
        if is_group_submission_task(latest_task)
        else (True, "")
    )
    latest_group_draft = (
        load_group_task_draft_for_membership(task, latest_group_membership, db)
        if latest_group_discussion_enabled
        else None
    )
    read_record = load_task_read_record(task.id, student.id, db)
    recommended_submissions = load_recommended_submissions(task.id, db)
    return ApiResponse(
        message="提交成功" if is_new_submission else "重新提交成功",
        data=serialize_task_detail(
            latest_task,
            latest_submission,
            recommended_submissions,
            read_record,
            latest_group_membership,
            latest_group_draft,
            group_collaboration_enabled=latest_group_discussion_enabled,
            submit_allowed=latest_programming_enabled,
            submit_blocked_message=(
                latest_programming_message if not latest_programming_enabled else ""
            ),
            classroom_capabilities=serialize_classroom_capabilities(
                latest_context,
                feature_states={
                    "programming_control": (
                        latest_programming_enabled,
                        latest_programming_message,
                    ),
                    "group_discussion": (
                        latest_group_discussion_enabled,
                        latest_group_discussion_message,
                    ),
                },
            ),
        ),
    )
