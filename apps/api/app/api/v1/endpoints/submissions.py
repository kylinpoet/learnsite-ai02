import re
from datetime import datetime
from typing import Literal
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import get_current_user, require_staff, require_student
from app.api.deps.db import get_db
from app.models import (
    CurriculumLesson,
    LessonPlan,
    ReviewTemplate,
    StudentGroup,
    StudentGroupMember,
    StudentProfile,
    Submission,
    SubmissionFile,
    Task,
    User,
)
from app.schemas.common import ApiResponse
from app.services.group_operation_logs import log_group_operation
from app.services.staff_access import get_accessible_class_ids, is_admin_staff
from app.services.student_groups import load_student_group_membership
from app.services.submission_files import guess_media_type, is_previewable_file, stored_file_path

router = APIRouter()


class SubmissionScoreRequest(BaseModel):
    score: int | None = Field(default=None, ge=0, le=120)
    teacher_comment: str | None = Field(default=None, max_length=1000)


class BatchSubmissionScoreRequest(BaseModel):
    submission_ids: list[int] = Field(min_length=1)
    score: int | None = Field(default=None, ge=0, le=120)
    teacher_comment: str | None = Field(default=None, max_length=1000)


class BatchSubmissionFileDownloadRequest(BaseModel):
    submission_ids: list[int] = Field(min_length=1)


class ReviewTemplateUpsertRequest(BaseModel):
    title: str = Field(min_length=1, max_length=30)
    group_name: str | None = Field(default=None, max_length=40)
    sort_order: int | None = Field(default=None, ge=0, le=9999)
    score: int | None = Field(default=None, ge=0, le=120)
    comment: str | None = Field(default=None, max_length=1000)


def accessible_student_ids_for_staff(staff: User, db: Session) -> set[int]:
    if is_admin_staff(staff):
        return set(db.scalars(select(User.id).where(User.user_type == "student")).all())

    class_ids = get_accessible_class_ids(staff, db)
    if not class_ids:
        return set()
    return set(
        db.scalars(
            select(StudentProfile.user_id).where(StudentProfile.class_id.in_(class_ids))
        ).all()
    )


def ensure_staff_can_access_submission(staff: User, submission: Submission, db: Session) -> None:
    if is_admin_staff(staff):
        return
    profile = submission.student.student_profile
    if profile is None or profile.class_id not in get_accessible_class_ids(staff, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该作品")


def filter_task_submissions_for_staff(task: Task, staff: User, db: Session) -> list[Submission]:
    accessible_student_ids = accessible_student_ids_for_staff(staff, db)
    return [submission for submission in task.submissions if submission.student_id in accessible_student_ids]


def latest_submission_time(submission: Submission) -> datetime | None:
    return submission.submitted_at or submission.updated_at


def task_submission_scope(task: Task) -> str:
    return (task.submission_scope or "individual").strip().lower() or "individual"


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


def is_recommended_submission(submission: Submission) -> bool:
    return submission.submit_status == "reviewed" and submission.is_recommended


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
        "files": [serialize_submission_file(file) for file in submission.files],
    }


def serialize_recommended_showcase(submissions: list[Submission]) -> dict:
    return {
        "count": len(submissions),
        "items": [serialize_recommended_submission(submission) for submission in submissions],
    }


def serialize_review_template(template: ReviewTemplate) -> dict:
    return {
        "id": str(template.id),
        "title": template.title,
        "group_name": template.group_name,
        "sort_order": template.sort_order,
        "score": template.score,
        "comment": template.comment,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }


def serialize_submission_item(submission: Submission) -> dict:
    task = submission.task
    plan = task.lesson_plan
    latest_time = latest_submission_time(submission)
    return {
        "submission_id": submission.id,
        "course_id": plan.id,
        "course_title": plan.title,
        "task_id": task.id,
        "task_title": task.title,
        "task_type": task.task_type,
        "submission_scope": task_submission_scope(task),
        "status": submission.submit_status,
        "score": submission.score,
        "peer_review_score": submission.peer_review_score,
        "is_recommended": is_recommended_submission(submission),
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": latest_time.isoformat() if latest_time else None,
        "group_id": submission.group.id if submission.group else None,
        "group_name": submission.group.name if submission.group else None,
        "group_no": submission.group.group_no if submission.group else None,
        "submitted_by_name": submission.student.display_name,
        "file_count": len(submission.files),
        "primary_file_name": submission.files[0].original_name if submission.files else None,
        "can_resubmit": submission.submit_status != "reviewed",
    }


def serialize_submission_detail(submission: Submission) -> dict:
    task = submission.task
    plan = task.lesson_plan
    latest_time = latest_submission_time(submission)
    return {
        "submission": {
            "id": submission.id,
            "status": submission.submit_status,
            "score": submission.score,
            "peer_review_score": submission.peer_review_score,
            "is_recommended": is_recommended_submission(submission),
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "updated_at": latest_time.isoformat() if latest_time else None,
            "submission_note": submission.submission_note,
            "teacher_comment": submission.teacher_comment,
            "can_resubmit": submission.submit_status != "reviewed",
            "submission_scope": task_submission_scope(task),
            "group_id": submission.group.id if submission.group else None,
            "group_name": submission.group.name if submission.group else None,
            "group_no": submission.group.group_no if submission.group else None,
            "submitted_by_name": submission.student.display_name,
        },
        "course": {
            "id": plan.id,
            "title": plan.title,
            "assigned_date": plan.assigned_date.isoformat(),
        },
        "task": {
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "submission_scope": task_submission_scope(task),
            "description": task.description,
        },
        "files": [serialize_submission_file(file) for file in submission.files],
    }


def serialize_teacher_task_item(task: Task, submissions_override: list[Submission] | None = None) -> dict:
    plan = task.lesson_plan
    lesson = plan.lesson
    submissions = sorted(submissions_override or task.submissions, key=latest_submission_time, reverse=True)
    reviewed_count = sum(1 for item in submissions if item.submit_status == "reviewed")
    pending_count = sum(1 for item in submissions if item.submit_status != "reviewed")
    recommended_count = sum(1 for item in submissions if is_recommended_submission(item))
    scored_items = [item.score for item in submissions if item.score is not None]
    latest_item = submissions[0] if submissions else None

    return {
        "task_id": task.id,
        "task_title": task.title,
        "task_type": task.task_type,
        "submission_scope": task_submission_scope(task),
        "course_id": plan.id,
        "course_title": plan.title,
        "assigned_date": plan.assigned_date.isoformat(),
        "lesson_title": lesson.title,
        "unit_title": lesson.unit.title,
        "submission_count": len(submissions),
        "reviewed_count": reviewed_count,
        "pending_count": pending_count,
        "recommended_count": recommended_count,
        "average_score": round(sum(scored_items) / len(scored_items), 1) if scored_items else None,
        "latest_submitted_at": (
            latest_submission_time(latest_item).isoformat() if latest_item and latest_submission_time(latest_item) else None
        ),
    }


def serialize_teacher_submission(submission: Submission) -> dict:
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
        "status": submission.submit_status,
        "score": submission.score,
        "peer_review_score": submission.peer_review_score,
        "is_recommended": is_recommended_submission(submission),
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": latest_time.isoformat() if latest_time else None,
        "submission_note": submission.submission_note,
        "teacher_comment": submission.teacher_comment,
        "submitted_by_name": student.display_name,
        "file_count": len(submission.files),
        "files": [serialize_submission_file(file) for file in submission.files],
    }


def normalize_teacher_comment(teacher_comment: str | None) -> str:
    return teacher_comment.strip() if teacher_comment else ""


def normalize_template_title(title: str) -> str:
    return title.strip()


def normalize_template_group_name(group_name: str | None) -> str:
    return group_name.strip() if group_name else ""


def normalize_template_comment(comment: str | None) -> str:
    return comment.strip() if comment else ""


def ensure_review_payload(score: int | None, teacher_comment: str) -> None:
    if score is None and not teacher_comment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写评分或教师评语后再保存",
        )


def ensure_template_payload(title: str, score: int | None, comment: str) -> None:
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写模板名称",
        )
    if score is None and not comment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模板至少需要包含推荐分数或模板评语",
        )


def apply_review_update(submission: Submission, score: int | None, teacher_comment: str) -> None:
    if score is not None:
        submission.score = score
        submission.is_recommended = score == 120
    submission.teacher_comment = teacher_comment or None
    submission.submit_status = "reviewed"
    if submission.submitted_at is None:
        submission.submitted_at = datetime.now()


def log_group_review_operation(db: Session, submission: Submission, staff: User, teacher_comment: str) -> None:
    if submission.group is None:
        return

    description_parts: list[str] = []
    if submission.score is not None:
        description_parts.append(f"评分 {submission.score} 分")
    if teacher_comment:
        description_parts.append("已填写教师评语")
    if submission.is_recommended:
        description_parts.append("已进入推荐展示")

    log_group_operation(
        db,
        event_type="group_submission_reviewed",
        event_label="教师评阅",
        title=f"{staff.display_name} 评阅了《{submission.task.title}》",
        description="；".join(description_parts) if description_parts else "已完成教师评阅。",
        actor=staff,
        group=submission.group,
        task=submission.task,
        submission=submission,
    )


def next_review_template_sort_order(staff_user_id: int, group_name: str, db: Session) -> int:
    templates = db.scalars(
        select(ReviewTemplate)
        .where(
            ReviewTemplate.staff_user_id == staff_user_id,
            ReviewTemplate.group_name == group_name,
        )
        .order_by(ReviewTemplate.sort_order.desc(), ReviewTemplate.id.desc())
    ).all()
    if not templates:
        return 10
    return max(template.sort_order for template in templates) + 10


def build_content_disposition(filename: str, disposition: Literal["inline", "attachment"]) -> str:
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip()
    if not fallback_name:
        suffix = ""
        if "." in filename:
            suffix = f".{filename.rsplit('.', 1)[1]}"
        fallback_name = f"attachment{suffix}"
    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'


def sanitize_archive_part(value: str, fallback: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", value).strip().strip(".")
    return cleaned or fallback


def split_filename(filename: str) -> tuple[str, str]:
    if "." not in filename.strip("."):
        return filename, ""
    stem, suffix = filename.rsplit(".", 1)
    return stem, f".{suffix}"


def make_unique_archive_name(folder_name: str, filename: str, used_names: set[str], fallback: str) -> str:
    safe_filename = sanitize_archive_part(filename, fallback)
    stem, suffix = split_filename(safe_filename)
    candidate = f"{folder_name}/{safe_filename}"
    index = 2
    while candidate in used_names:
        candidate = f"{folder_name}/{stem} ({index}){suffix}"
        index += 1
    used_names.add(candidate)
    return candidate


def build_submission_archive_folder(submission: Submission) -> str:
    student = submission.student
    profile = student.student_profile
    student_no = profile.student_no if profile else student.username
    task_part = sanitize_archive_part(
        f"任务{submission.task.id}_{submission.task.title}",
        f"task_{submission.task.id}",
    )
    student_part = sanitize_archive_part(
        f"{student_no}_{student.display_name}_{submission.id}",
        f"submission_{submission.id}",
    )
    return f"{task_part}/{student_part}"


def build_batch_archive_filename(submissions: list[Submission]) -> str:
    task_ids = {submission.task_id for submission in submissions}
    if len(task_ids) == 1 and submissions:
        task = submissions[0].task
        archive_name = sanitize_archive_part(
            f"任务{task.id}_{task.title}_{len(submissions)}份作品附件",
            f"task_{task.id}_attachments",
        )
    else:
        archive_name = f"selected_submissions_{len(submissions)}_attachments"
    return f"{archive_name}.zip"


def student_can_access_submission(student: User, submission: Submission, db: Session) -> bool:
    if submission.student_id == student.id:
        return True
    if submission.group_id is None:
        return False

    membership = load_student_group_membership(student.id, db, include_members=False)
    return membership is not None and membership.group_id == submission.group_id


def ensure_submission_file_access(submission_file: SubmissionFile, user: User, db: Session) -> None:
    if user.user_type == "staff":
        return
    if user.user_type == "student" and student_can_access_submission(user, submission_file.submission, db):
        return
    if user.user_type == "student" and is_recommended_submission(submission_file.submission):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="无权访问该附件",
    )


def load_student_submission(submission_id: int, student_id: int, db: Session) -> Submission | None:
    membership = load_student_group_membership(student_id, db, include_members=True)
    group_id = membership.group_id if membership is not None else None
    return db.scalar(
        select(Submission)
        .where(
            Submission.id == submission_id,
            or_(
                Submission.student_id == student_id,
                Submission.group_id == group_id if group_id is not None else False,
            ),
        )
        .options(
            selectinload(Submission.task).selectinload(Task.lesson_plan),
            selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(Submission.student).selectinload(User.student_profile),
            selectinload(Submission.files),
        )
    )


def load_submission_for_staff(submission_id: int, db: Session) -> Submission | None:
    return db.scalar(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(
            selectinload(Submission.task).selectinload(Task.lesson_plan),
            selectinload(Submission.student)
            .selectinload(User.student_profile)
            .selectinload(StudentProfile.school_class),
            selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(Submission.files),
        )
    )


def load_submission_file(file_id: int, db: Session) -> SubmissionFile | None:
    return db.scalar(
        select(SubmissionFile)
        .where(SubmissionFile.id == file_id)
        .options(selectinload(SubmissionFile.submission))
    )


def load_submissions_for_batch_download(submission_ids: list[int], db: Session) -> list[Submission]:
    submissions = db.scalars(
        select(Submission)
        .where(Submission.id.in_(submission_ids))
        .options(
            selectinload(Submission.task),
            selectinload(Submission.student).selectinload(User.student_profile),
            selectinload(Submission.group),
            selectinload(Submission.files),
        )
    ).all()
    submission_map = {submission.id: submission for submission in submissions}

    if len(submission_map) != len(submission_ids):
        missing_ids = [str(submission_id) for submission_id in submission_ids if submission_id not in submission_map]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到指定作品：{', '.join(missing_ids)}",
        )

    return [submission_map[submission_id] for submission_id in submission_ids]


def load_task_for_staff(task_id: int, db: Session) -> Task | None:
    return db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
            selectinload(Task.submissions)
            .selectinload(Submission.student)
            .selectinload(User.student_profile)
            .selectinload(StudentProfile.school_class),
            selectinload(Task.submissions)
            .selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(Task.submissions).selectinload(Submission.files),
        )
    )


def load_review_template_for_staff(template_id: int, staff_user_id: int, db: Session) -> ReviewTemplate | None:
    return db.scalar(
        select(ReviewTemplate).where(
            ReviewTemplate.id == template_id,
            ReviewTemplate.staff_user_id == staff_user_id,
        )
    )


@router.get("/mine", response_model=ApiResponse)
def my_submissions(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    membership = load_student_group_membership(student.id, db, include_members=True)
    group_id = membership.group_id if membership is not None else None
    submissions = db.scalars(
        select(Submission)
        .where(
            or_(
                Submission.student_id == student.id,
                Submission.group_id == group_id if group_id is not None else False,
            )
        )
        .options(
            selectinload(Submission.task).selectinload(Task.lesson_plan),
            selectinload(Submission.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile),
            selectinload(Submission.student).selectinload(User.student_profile),
            selectinload(Submission.files),
        )
    ).all()
    submissions.sort(key=latest_submission_time, reverse=True)

    reviewed_count = sum(1 for item in submissions if item.submit_status == "reviewed")
    submitted_count = sum(1 for item in submissions if item.submit_status == "submitted")
    resubmittable_count = sum(1 for item in submissions if item.submit_status != "reviewed")

    return ApiResponse(
        data={
            "summary": {
                "total_count": len(submissions),
                "reviewed_count": reviewed_count,
                "submitted_count": submitted_count,
                "resubmittable_count": resubmittable_count,
            },
            "items": [serialize_submission_item(item) for item in submissions],
        }
    )


@router.get("/teacher", response_model=ApiResponse)
def teacher_submissions_overview(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    accessible_student_ids = accessible_student_ids_for_staff(staff, db)
    tasks = db.scalars(
        select(Task)
        .where(Task.submissions.any())
        .options(
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
            selectinload(Task.submissions),
        )
    ).all()
    tasks.sort(key=lambda item: item.sort_order)
    tasks.sort(key=lambda item: (item.lesson_plan.assigned_date, item.lesson_plan.id), reverse=True)

    all_submissions = [
        submission
        for task in tasks
        for submission in task.submissions
        if submission.student_id in accessible_student_ids
    ]
    task_payloads = []
    for task in tasks:
        filtered_submissions = [item for item in task.submissions if item.student_id in accessible_student_ids]
        if not filtered_submissions:
            continue
        task_payloads.append(serialize_teacher_task_item(task, filtered_submissions))
    reviewed_count = sum(1 for item in all_submissions if item.submit_status == "reviewed")
    pending_count = sum(1 for item in all_submissions if item.submit_status != "reviewed")
    recommended_count = sum(1 for item in all_submissions if is_recommended_submission(item))
    scored_items = [item.score for item in all_submissions if item.score is not None]

    return ApiResponse(
        data={
            "summary": {
                "task_count": len(task_payloads),
                "submission_count": len(all_submissions),
                "reviewed_count": reviewed_count,
                "pending_count": pending_count,
                "recommended_count": recommended_count,
                "average_score": round(sum(scored_items) / len(scored_items), 1) if scored_items else None,
            },
            "items": task_payloads,
        }
    )


@router.get("/teacher/task/{task_id}", response_model=ApiResponse)
def teacher_task_submissions(
    task_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task_for_staff(task_id, db)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    submissions = sorted(filter_task_submissions_for_staff(task, staff, db), key=latest_submission_time, reverse=True)
    if not submissions and task.submissions and not is_admin_staff(staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该任务作品")
    recommended_submissions = [item for item in submissions if is_recommended_submission(item)]
    scored_items = [item.score for item in submissions if item.score is not None]
    latest_time = latest_submission_time(submissions[0]) if submissions else None

    return ApiResponse(
        data={
            "task": {
                "id": task.id,
                "title": task.title,
                "task_type": task.task_type,
                "description": task.description,
                "course": {
                    "id": task.lesson_plan.id,
                    "title": task.lesson_plan.title,
                    "assigned_date": task.lesson_plan.assigned_date.isoformat(),
                    "lesson_title": task.lesson_plan.lesson.title,
                    "unit_title": task.lesson_plan.lesson.unit.title,
                },
            },
            "summary": {
                "submission_count": len(submissions),
                "reviewed_count": sum(1 for item in submissions if item.submit_status == "reviewed"),
                "pending_count": sum(1 for item in submissions if item.submit_status != "reviewed"),
                "recommended_count": len(recommended_submissions),
                "average_score": round(sum(scored_items) / len(scored_items), 1) if scored_items else None,
                "latest_submitted_at": latest_time.isoformat() if latest_time else None,
            },
            "recommended_showcase": serialize_recommended_showcase(recommended_submissions),
            "items": [serialize_teacher_submission(item) for item in submissions],
        }
    )


@router.get("/review-templates", response_model=ApiResponse)
def list_review_templates(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    templates = db.scalars(
        select(ReviewTemplate)
        .where(ReviewTemplate.staff_user_id == staff.id)
        .order_by(
            case((ReviewTemplate.group_name == "", 0), else_=1),
            ReviewTemplate.group_name.asc(),
            ReviewTemplate.sort_order.asc(),
            ReviewTemplate.updated_at.desc(),
            ReviewTemplate.id.desc(),
        )
    ).all()

    return ApiResponse(
        data={
            "items": [serialize_review_template(template) for template in templates],
        }
    )


@router.post("/review-templates", response_model=ApiResponse)
def create_review_template(
    payload: ReviewTemplateUpsertRequest,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    title = normalize_template_title(payload.title)
    group_name = normalize_template_group_name(payload.group_name)
    comment = normalize_template_comment(payload.comment)
    ensure_template_payload(title, payload.score, comment)
    sort_order = payload.sort_order if payload.sort_order is not None else next_review_template_sort_order(staff.id, group_name, db)

    template = ReviewTemplate(
        staff_user_id=staff.id,
        title=title,
        group_name=group_name,
        sort_order=sort_order,
        score=payload.score,
        comment=comment,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return ApiResponse(
        message="评分模板已保存",
        data={"template": serialize_review_template(template)},
    )


@router.put("/review-templates/{template_id}", response_model=ApiResponse)
def update_review_template(
    template_id: int,
    payload: ReviewTemplateUpsertRequest,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_review_template_for_staff(template_id, staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评分模板不存在")

    title = normalize_template_title(payload.title)
    group_name = normalize_template_group_name(payload.group_name)
    comment = normalize_template_comment(payload.comment)
    ensure_template_payload(title, payload.score, comment)

    template.title = title
    template.group_name = group_name
    template.sort_order = (
        payload.sort_order
        if payload.sort_order is not None
        else next_review_template_sort_order(staff.id, group_name, db)
    )
    template.score = payload.score
    template.comment = comment
    db.commit()
    db.refresh(template)

    return ApiResponse(
        message="评分模板已更新",
        data={"template": serialize_review_template(template)},
    )


@router.delete("/review-templates/{template_id}", response_model=ApiResponse)
def delete_review_template(
    template_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_review_template_for_staff(template_id, staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评分模板不存在")

    deleted_id = template.id
    db.delete(template)
    db.commit()

    return ApiResponse(
        message="评分模板已删除",
        data={"deleted_id": str(deleted_id)},
    )


@router.post("/files/batch-download")
def batch_download_submission_files(
    payload: BatchSubmissionFileDownloadRequest,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Response:
    submission_ids = list(dict.fromkeys(payload.submission_ids))
    submissions = load_submissions_for_batch_download(submission_ids, db)
    for submission in submissions:
        ensure_staff_can_access_submission(staff, submission, db)
    archive_names: set[str] = set()

    from io import BytesIO

    buffer = BytesIO()
    file_count = 0

    with ZipFile(buffer, mode="w", compression=ZIP_DEFLATED) as archive:
        for submission in submissions:
            folder_name = build_submission_archive_folder(submission)
            for submission_file in sorted(submission.files, key=lambda item: item.id):
                file_path = stored_file_path(submission_file)
                if not file_path.exists():
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"附件文件不存在：{submission_file.original_name}",
                    )

                fallback_name = f"file_{submission_file.id}.{submission_file.file_ext or 'bin'}"
                archive_name = make_unique_archive_name(
                    folder_name,
                    submission_file.original_name,
                    archive_names,
                    fallback_name,
                )
                archive.write(file_path, archive_name)
                file_count += 1

    if file_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="所选作品没有可下载的附件",
        )

    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": build_content_disposition(
                build_batch_archive_filename(submissions),
                "attachment",
            )
        },
    )


@router.get("/files/{file_id}")
def submission_file_content(
    file_id: int,
    disposition: Literal["inline", "attachment"] = Query(default="attachment"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    submission_file = load_submission_file(file_id, db)
    if submission_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件不存在")

    ensure_submission_file_access(submission_file, user, db)
    file_path = stored_file_path(submission_file)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件文件不存在")

    response = FileResponse(
        path=file_path,
        media_type=guess_media_type(submission_file),
        filename=submission_file.original_name,
    )
    response.headers["Content-Disposition"] = build_content_disposition(
        submission_file.original_name,
        disposition,
    )
    return response


@router.post("/batch-score", response_model=ApiResponse)
def batch_score_submissions(
    payload: BatchSubmissionScoreRequest,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    teacher_comment = normalize_teacher_comment(payload.teacher_comment)
    ensure_review_payload(payload.score, teacher_comment)

    submission_ids = list(dict.fromkeys(payload.submission_ids))
    submissions = db.scalars(select(Submission).where(Submission.id.in_(submission_ids))).all()
    submission_map = {submission.id: submission for submission in submissions}

    if len(submission_map) != len(submission_ids):
        missing_ids = [str(submission_id) for submission_id in submission_ids if submission_id not in submission_map]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到指定作品：{', '.join(missing_ids)}",
        )

    ordered_submissions = [submission_map[submission_id] for submission_id in submission_ids]
    for submission in ordered_submissions:
        ensure_staff_can_access_submission(staff, submission, db)
        apply_review_update(submission, payload.score, teacher_comment)
        log_group_review_operation(db, submission, staff, teacher_comment)

    db.commit()

    return ApiResponse(
        message="批量评分已保存",
        data={
            "updated_count": len(ordered_submissions),
            "submission_ids": submission_ids,
            "task_ids": sorted({submission.task_id for submission in ordered_submissions}),
        },
    )


@router.post("/{submission_id}/score", response_model=ApiResponse)
def score_submission(
    submission_id: int,
    payload: SubmissionScoreRequest,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    submission = load_submission_for_staff(submission_id, db)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")
    ensure_staff_can_access_submission(staff, submission, db)

    teacher_comment = normalize_teacher_comment(payload.teacher_comment)
    ensure_review_payload(payload.score, teacher_comment)
    apply_review_update(submission, payload.score, teacher_comment)
    log_group_review_operation(db, submission, staff, teacher_comment)

    db.commit()

    latest_submission = load_submission_for_staff(submission_id, db)
    if latest_submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")

    return ApiResponse(
        message="评分已保存",
        data={
            "task_id": latest_submission.task_id,
            "submission": serialize_teacher_submission(latest_submission),
        },
    )


@router.get("/{submission_id}", response_model=ApiResponse)
def submission_detail(
    submission_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    submission = load_student_submission(submission_id, student.id, db)
    if submission is None:
        return ApiResponse(code="NOT_FOUND", message="submission not found", data=None)

    return ApiResponse(data=serialize_submission_detail(submission))
