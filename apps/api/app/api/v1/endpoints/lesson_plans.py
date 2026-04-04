from __future__ import annotations

from datetime import date
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.models import (
    AttendanceRecord,
    CurriculumLesson,
    CurriculumUnit,
    GroupTaskDraft,
    GroupTaskDraftVersion,
    LessonPlan,
    PeerReviewVote,
    Submission,
    SubmissionFile,
    StudentLessonPlanProgress,
    Task,
    TaskReadRecord,
    User,
    ClassroomSession,
)
from app.schemas.common import ApiResponse

router = APIRouter()

SUPPORTED_PLAN_STATUSES = {"draft", "published", "active", "completed"}
SUPPORTED_TASK_TYPES = {"reading", "upload_image", "programming"}
SUPPORTED_TASK_SUBMISSION_SCOPES = {"individual", "group"}


class LessonPlanTaskPayload(BaseModel):
    id: int | None = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=120)
    task_type: str = Field(min_length=1, max_length=50)
    submission_scope: str = Field(default="individual", min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=50000)
    sort_order: int | None = Field(default=None, ge=1, le=999)
    is_required: bool = True


class LessonPlanUpsertPayload(BaseModel):
    lesson_id: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=120)
    content: str | None = Field(default=None, max_length=50000)
    assigned_date: date
    status: str = Field(default="draft", min_length=1, max_length=30)
    tasks: list[LessonPlanTaskPayload] = Field(default_factory=list, min_length=1)


def normalize_title(title: str) -> str:
    return title.strip()


def normalize_description(description: str | None) -> str | None:
    if description is None:
        return None
    cleaned = description.strip()
    return cleaned or None


def normalize_rich_text(html_value: str | None) -> str | None:
    cleaned = normalize_description(html_value)
    if cleaned is None:
        return None

    text_only = re.sub(r"<[^>]+>", "", cleaned).replace("&nbsp;", " ").strip()
    return cleaned if text_only else None


def normalize_status(status_value: str) -> str:
    normalized = status_value.strip().lower()
    if normalized not in SUPPORTED_PLAN_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="学案状态不受支持",
        )
    return normalized


def normalize_task_type(task_type: str) -> str:
    normalized = task_type.strip().lower()
    if normalized not in SUPPORTED_TASK_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务类型不受支持",
        )
    return normalized


def normalize_task_submission_scope(submission_scope: str, task_type: str) -> str:
    normalized = submission_scope.strip().lower()
    if normalized not in SUPPORTED_TASK_SUBMISSION_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务提交方式不受支持",
        )
    if task_type == "reading":
        return "individual"
    return normalized


def next_plan_id(db: Session) -> int:
    current_max = db.scalar(select(func.coalesce(func.max(LessonPlan.id), 0)))
    return int(current_max or 0) + 1


def next_task_id(db: Session) -> int:
    current_max = db.scalar(select(func.coalesce(func.max(Task.id), 0)))
    return int(current_max or 0) + 1


def load_lesson(lesson_id: int, db: Session) -> CurriculumLesson:
    lesson = db.scalar(
        select(CurriculumLesson)
        .where(CurriculumLesson.id == lesson_id)
        .options(
            selectinload(CurriculumLesson.unit).selectinload(CurriculumUnit.book)
        )
    )
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课次不存在")
    return lesson


def load_plan(plan_id: int, db: Session) -> LessonPlan | None:
    return db.scalar(
        select(LessonPlan)
        .where(LessonPlan.id == plan_id)
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
            selectinload(LessonPlan.progresses),
            selectinload(LessonPlan.classroom_sessions),
        )
    )


def apply_plan_payload(plan: LessonPlan, payload: LessonPlanUpsertPayload) -> None:
    title = normalize_title(payload.title)
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写学案标题",
        )

    plan.title = title
    plan.content = normalize_rich_text(payload.content)
    plan.lesson_id = payload.lesson_id
    plan.assigned_date = payload.assigned_date
    plan.status = normalize_status(payload.status)


def delete_task_related_records(task_ids: list[int], db: Session) -> None:
    for task_id in task_ids:
        submission_id_subquery = select(Submission.id).where(Submission.task_id == task_id)
        db.execute(delete(PeerReviewVote).where(PeerReviewVote.task_id == task_id))
        db.execute(delete(SubmissionFile).where(SubmissionFile.submission_id.in_(submission_id_subquery)))
        db.execute(delete(Submission).where(Submission.task_id == task_id))
        db.execute(delete(GroupTaskDraftVersion).where(GroupTaskDraftVersion.task_id == task_id))
        db.execute(delete(GroupTaskDraft).where(GroupTaskDraft.task_id == task_id))
        db.execute(delete(TaskReadRecord).where(TaskReadRecord.task_id == task_id))
        db.execute(delete(Task).where(Task.id == task_id))


def sync_plan_tasks(plan: LessonPlan, payload_tasks: list[LessonPlanTaskPayload], db: Session) -> None:
    existing_by_id = {task.id: task for task in plan.tasks}
    kept_task_ids: set[int] = set()
    seen_payload_ids: set[int] = set()

    next_id = next_task_id(db)
    for index, payload_task in enumerate(payload_tasks, start=1):
        title = payload_task.title.strip()
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"请填写任务 {index} 的标题")
        task_type = normalize_task_type(payload_task.task_type)
        task_id = payload_task.id
        if task_id is not None:
            if task_id in seen_payload_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务列表存在重复记录，请刷新后重试")
            seen_payload_ids.add(task_id)

        if task_id is not None:
            existing_task = existing_by_id.get(task_id)
            if existing_task is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务标识无效，请刷新后重试")
            existing_task.title = title
            existing_task.task_type = task_type
            existing_task.submission_scope = normalize_task_submission_scope(payload_task.submission_scope, task_type)
            existing_task.description = normalize_description(payload_task.description)
            existing_task.sort_order = payload_task.sort_order or index
            existing_task.is_required = payload_task.is_required
            kept_task_ids.add(existing_task.id)
            continue

        task = Task(
            id=next_id,
            plan_id=plan.id,
            title=title,
            task_type=task_type,
            submission_scope=normalize_task_submission_scope(payload_task.submission_scope, task_type),
            description=normalize_description(payload_task.description),
            sort_order=payload_task.sort_order or index,
            is_required=payload_task.is_required,
        )
        db.add(task)
        kept_task_ids.add(next_id)
        next_id += 1
    db.flush()

    removed_task_ids = [task_id for task_id in existing_by_id if task_id not in kept_task_ids]
    if removed_task_ids:
        delete_task_related_records(removed_task_ids, db)
        db.flush()


def serialize_staff_plan(plan: LessonPlan) -> dict:
    pending_count = sum(1 for item in plan.progresses if item.progress_status == "pending")
    completed_count = sum(1 for item in plan.progresses if item.progress_status == "completed")
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "assigned_date": plan.assigned_date.isoformat(),
        "task_count": len(plan.tasks),
        "lesson": {
            "id": plan.lesson.id,
            "title": plan.lesson.title,
            "lesson_no": plan.lesson.lesson_no,
            "unit_title": plan.lesson.unit.title,
            "book_name": plan.lesson.unit.book.name,
        },
        "progress": {
            "pending_count": pending_count,
            "completed_count": completed_count,
        },
    }


def serialize_staff_plan_detail(plan: LessonPlan) -> dict:
    summary = serialize_staff_plan(plan)
    summary["content"] = plan.content
    summary["tasks"] = [
        {
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "submission_scope": task.submission_scope,
            "description": task.description,
            "sort_order": task.sort_order,
            "is_required": task.is_required,
        }
        for task in sorted(plan.tasks, key=lambda item: (item.sort_order, item.id))
    ]
    return summary


def build_default_plan_content(plan: LessonPlan) -> str:
    return (
        f"<p>欢迎进入《{plan.title}》。</p>"
        f"<p>本课次属于“{plan.lesson.unit.title} / {plan.lesson.title}”，教师可以在这里发布导读、步骤说明、图片或参考资料。</p>"
    )


@router.get("/staff/list", response_model=ApiResponse)
def staff_plan_list(
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plans = db.scalars(
        select(LessonPlan)
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
            selectinload(LessonPlan.progresses),
        )
        .order_by(LessonPlan.assigned_date.desc(), LessonPlan.id.desc())
    ).all()
    return ApiResponse(data={"plans": [serialize_staff_plan(plan) for plan in plans]})


@router.get("/staff/{plan_id}", response_model=ApiResponse)
def staff_plan_detail(
    plan_id: int,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = load_plan(plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")
    return ApiResponse(data={"plan": serialize_staff_plan_detail(plan)})


@router.post("/staff", response_model=ApiResponse)
def create_lesson_plan(
    payload: LessonPlanUpsertPayload,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    load_lesson(payload.lesson_id, db)

    plan = LessonPlan(
        id=next_plan_id(db),
        lesson_id=payload.lesson_id,
        title="",
        content=None,
        status="draft",
        assigned_date=payload.assigned_date,
    )
    db.add(plan)
    db.flush()

    apply_plan_payload(plan, payload)
    sync_plan_tasks(plan, payload.tasks, db)
    db.commit()

    latest_plan = load_plan(plan.id, db)
    if latest_plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    return ApiResponse(
        message="学案已创建",
        data={"plan": serialize_staff_plan_detail(latest_plan)},
    )


@router.put("/staff/{plan_id}", response_model=ApiResponse)
def update_lesson_plan(
    plan_id: int,
    payload: LessonPlanUpsertPayload,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = load_plan(plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    load_lesson(payload.lesson_id, db)
    apply_plan_payload(plan, payload)
    sync_plan_tasks(plan, payload.tasks, db)
    db.commit()

    latest_plan = load_plan(plan_id, db)
    if latest_plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    return ApiResponse(
        message="学案已更新",
        data={"plan": serialize_staff_plan_detail(latest_plan)},
    )


@router.delete("/staff/{plan_id}", response_model=ApiResponse)
def delete_lesson_plan(
    plan_id: int,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = load_plan(plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    delete_task_related_records([task.id for task in plan.tasks], db)
    db.execute(delete(StudentLessonPlanProgress).where(StudentLessonPlanProgress.plan_id == plan_id))
    db.execute(delete(ClassroomSession).where(ClassroomSession.plan_id == plan_id))
    db.execute(delete(LessonPlan).where(LessonPlan.id == plan_id))
    db.commit()
    return ApiResponse(message="学案已删除", data={"deleted_id": plan_id})


@router.post("/staff/{plan_id}/publish", response_model=ApiResponse)
def publish_lesson_plan(
    plan_id: int,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = load_plan(plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")
    if not plan.tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请至少配置一个任务后再发布学案",
        )

    plan.status = "published"
    db.commit()

    latest_plan = load_plan(plan_id, db)
    if latest_plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    return ApiResponse(
        message="学案已发布",
        data={"plan": serialize_staff_plan_detail(latest_plan)},
    )


@router.get("/student/home", response_model=ApiResponse)
def student_home(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = student.student_profile

    progresses = db.scalars(
        select(StudentLessonPlanProgress)
        .where(StudentLessonPlanProgress.student_id == student.id)
        .options(
            selectinload(StudentLessonPlanProgress.lesson_plan).selectinload(LessonPlan.lesson)
        )
    ).all()

    pending_items = []
    completed_items = []
    for progress in progresses:
        item = {
            "id": progress.lesson_plan.id,
            "title": progress.lesson_plan.title,
            "date": (
                progress.assigned_date if progress.progress_status == "pending" else progress.completed_date
            ).isoformat(),
        }
        if progress.progress_status == "pending":
            pending_items.append(item)
        else:
            completed_items.append(item)

    pending_items.sort(key=lambda item: item["date"], reverse=True)
    completed_items.sort(key=lambda item: item["date"], reverse=True)

    classmates_today = db.scalars(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.class_id == profile.class_id,
            AttendanceRecord.attendance_date == date.today(),
        )
        .options(selectinload(AttendanceRecord.student).selectinload(User.student_profile))
    ).all()

    attendance_today = [
        {
            "name": record.student.display_name,
            "checked_in_at": record.checked_in_at.strftime("%H:%M"),
        }
        for record in sorted(classmates_today, key=lambda item: item.checked_in_at)
    ]

    payload = {
        "pending_courses": pending_items,
        "completed_courses": completed_items,
        "attendance_today": attendance_today,
        "profile": {
            "student_no": profile.student_no,
            "name": student.display_name,
            "class_name": profile.school_class.class_name,
            "grade_no": profile.grade_no,
        },
    }
    return ApiResponse(data=payload)


@router.get("/{plan_id}", response_model=ApiResponse)
def lesson_plan_detail(plan_id: str, db: Session = Depends(get_db)) -> ApiResponse:
    plan = db.scalar(
        select(LessonPlan)
        .where(LessonPlan.id == int(plan_id))
        .options(selectinload(LessonPlan.tasks), selectinload(LessonPlan.lesson))
    )
    if plan is None:
        return ApiResponse(code="NOT_FOUND", message="lesson plan not found", data=None)

    return ApiResponse(
        data={
            "id": plan.id,
            "title": plan.title,
            "content": plan.content or build_default_plan_content(plan),
            "lesson_id": plan.lesson_id,
            "lesson_title": plan.lesson.title,
            "tasks": [
                {
                    "id": task.id,
                    "title": task.title,
                    "task_type": task.task_type,
                    "submission_scope": task.submission_scope,
                    "description": task.description,
                    "sort_order": task.sort_order,
                    "is_required": task.is_required,
                }
                for task in sorted(plan.tasks, key=lambda item: item.sort_order)
            ],
        }
    )
