"""班级旁听（只读）接口。

只拿着班级码进来的访客没有任何学生身份，因此这里刻意只读、只返回「这一节课在讲什么」：
班级名、当前学案、任务清单与关联资源。提交、互评、网盘、测验、签到一律不开放。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_class_guest
from app.api.deps.db import get_db
from app.models import (
    ClassroomSession,
    CurriculumLesson,
    CurriculumUnit,
    LessonPlan,
    SchoolClass,
    Task,
    TaskResourceLink,
)
from app.schemas.common import ApiResponse

router = APIRouter()


def load_focus_plan(school_class_id: int, db: Session) -> LessonPlan | None:
    """优先取本班最近一节课堂的学案，其次是最近一份已发布/进行中的学案。"""
    session = db.scalars(
        select(ClassroomSession)
        .where(ClassroomSession.class_id == school_class_id)
        .options(
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.tasks)
            .selectinload(Task.resource_links)
            .selectinload(TaskResourceLink.resource_item),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
        )
        .order_by(ClassroomSession.started_at.desc(), ClassroomSession.id.desc())
        .limit(1)
    ).first()
    if session is not None and session.lesson_plan is not None:
        return session.lesson_plan

    return db.scalars(
        select(LessonPlan)
        .where(LessonPlan.status.in_(("published", "active")))
        .options(
            selectinload(LessonPlan.tasks)
            .selectinload(Task.resource_links)
            .selectinload(TaskResourceLink.resource_item),
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
        )
        .order_by(LessonPlan.assigned_date.desc(), LessonPlan.id.desc())
        .limit(1)
    ).first()


@router.get("/class", response_model=ApiResponse)
def guest_class_overview(
    guest: dict = Depends(require_class_guest),
    db: Session = Depends(get_db),
) -> ApiResponse:
    school_class = db.get(SchoolClass, int(guest["class_id"]))
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    plan = load_focus_plan(school_class.id, db)
    tasks: list[dict] = []
    resources: list[dict] = []
    if plan is not None:
        seen_resource_ids: set[int] = set()
        for task in sorted(plan.tasks, key=lambda item: (item.sort_order, item.id)):
            tasks.append(
                {
                    "id": task.id,
                    "title": task.title,
                    "task_type": task.task_type,
                    "sort_order": task.sort_order,
                    "is_required": task.is_required,
                    "submission_scope": task.submission_scope,
                }
            )
            for link in task.resource_links:
                item = link.resource_item
                if item is None or item.id in seen_resource_ids:
                    continue
                seen_resource_ids.add(item.id)
                resources.append(
                    {
                        "id": item.id,
                        "title": item.title,
                        "resource_type": item.resource_type,
                        "summary": item.summary,
                        "external_url": item.external_url,
                    }
                )

    return ApiResponse(
        data={
            "class": {
                "id": school_class.id,
                "name": school_class.class_name,
                "grade_no": school_class.grade_no,
                "class_no": school_class.class_no,
            },
            "plan": (
                {
                    "id": plan.id,
                    "title": plan.title,
                    "status": plan.status,
                    "lesson_title": plan.lesson.title if plan.lesson else None,
                    "unit_title": plan.lesson.unit.title if plan.lesson and plan.lesson.unit else None,
                    "book_name": (
                        plan.lesson.unit.book.name
                        if plan.lesson and plan.lesson.unit and plan.lesson.unit.book
                        else None
                    ),
                }
                if plan is not None
                else None
            ),
            "tasks": tasks,
            "resources": resources,
        }
    )
