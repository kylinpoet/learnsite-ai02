"""班级旁听（只读）接口。

只拿着班级码进来的访客没有任何学生身份，因此这里刻意只读、只返回「这一节课在讲什么」：
班级名、当前学案、活动清单与关联资源。提交、互评、网盘、测验、签到一律不开放。
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_class_guest
from app.api.deps.db import get_db
from app.core.security import decode_class_guest_token, is_access_token_expired
from app.models import (
    ClassroomSession,
    CurriculumLesson,
    CurriculumUnit,
    LessonPlan,
    SchoolClass,
    Task,
    TaskResourceLink,
    TaskWebAsset,
)
from app.schemas.common import ApiResponse
from app.services.task_assets import normalize_relative_path, resolve_asset_file_path

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
    if session is not None and session.lesson_plan is not None and not session.lesson_plan.is_hidden:
        return session.lesson_plan

    return db.scalars(
        select(LessonPlan)
        .where(
            LessonPlan.status.in_(("published", "active")),
            LessonPlan.is_hidden == False,  # noqa: E712
        )
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


def _guest_task_navigation(plan: LessonPlan, task: Task) -> dict:
    """旁听也要能翻上一个 / 下一个活动，和学生端一致。"""
    ordered = sorted(
        (item for item in plan.tasks if item.is_active),
        key=lambda item: (item.sort_order, item.id),
    )
    index = next((position for position, item in enumerate(ordered) if item.id == task.id), 0)

    def serialize_nav_item(target: Task | None) -> dict | None:
        if target is None:
            return None
        return {"id": target.id, "title": target.title, "task_type": target.task_type}

    return {
        "previous_task": serialize_nav_item(ordered[index - 1] if index > 0 else None),
        "next_task": serialize_nav_item(ordered[index + 1] if index + 1 < len(ordered) else None),
    }


def _guest_task_config(task: Task) -> dict:
    if not task.config_json:
        return {}
    try:
        parsed = json.loads(task.config_json)
    except (json.JSONDecodeError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _guest_task_topic(task: Task) -> str:
    """讨论活动的主题写在 config_json 里，旁听只取这一个字段，不暴露提交配置。"""
    if task.task_type != "discussion":
        return ""
    return str(_guest_task_config(task).get("topic") or "")


def _guest_web_entry_path(task: Task) -> str:
    """网页活动的入口文件：旁听可以直接只读浏览这个页面。"""
    if task.task_type != "web_page":
        return ""
    return str(_guest_task_config(task).get("entry_path") or "")


@router.get("/tasks/{task_id}", response_model=ApiResponse)
def guest_task_detail(
    task_id: int,
    guest: dict = Depends(require_class_guest),
    db: Session = Depends(get_db),
) -> ApiResponse:
    """旁听查看活动页：说明、阅读正文、关联资源与上下活动导航。

    旁听身份不能提交、不能看别人的作品、不能参与讨论，所以这里刻意不返回
    提交状态、小组、讨论帖与推荐作品——只回答「这个活动要做什么」。
    """
    school_class = db.get(SchoolClass, int(guest["class_id"]))
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    plan = load_focus_plan(school_class.id, db)
    task = None
    if plan is not None:
        for item in plan.tasks:
            if item.id == task_id and item.is_active:
                task = item
                break
    if task is None or plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="活动不存在")

    has_web_assets = (
        db.scalar(
            select(TaskWebAsset.id)
            .where(TaskWebAsset.task_id == task.id, TaskWebAsset.slot == "web")
            .limit(1)
        )
        is not None
    )

    return ApiResponse(
        data={
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "submission_scope": task.submission_scope,
            "sort_order": task.sort_order,
            "is_required": task.is_required,
            "description": task.description or "",
            "topic": _guest_task_topic(task),
            "web_entry_path": _guest_web_entry_path(task),
            "has_web_assets": has_web_assets,
            "plan_title": plan.title,
            "plan_content": plan.content or "",
            "lesson_title": plan.lesson.title if plan.lesson else None,
            "unit_title": plan.lesson.unit.title if plan.lesson and plan.lesson.unit else None,
            "book_title": (
                plan.lesson.unit.book.name
                if plan.lesson and plan.lesson.unit and plan.lesson.unit.book
                else None
            ),
            "task_navigation": _guest_task_navigation(plan, task),
            "resources": [
                {
                    "id": link.resource_item.id,
                    "title": link.resource_item.title,
                    "resource_type": link.resource_item.resource_type,
                    "summary": link.resource_item.summary,
                    "external_url": link.resource_item.external_url,
                }
                for link in sorted(task.resource_links, key=lambda item: (item.sort_order, item.id))
                if link.resource_item is not None
            ],
        }
    )


def _guest_task_from_request(request: Request) -> dict:
    """旁听令牌允许放在标题里，也允许作为 ?access_token= —— iframe 无法带请求头。"""
    raw_token = ""
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        raw_token = authorization.split(" ", 1)[1].strip()
    if not raw_token:
        raw_token = str(request.query_params.get("access_token") or "").strip()
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing guest credentials",
        )
    token_data = decode_class_guest_token(raw_token)
    if token_data is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token")
    if is_access_token_expired(token_data):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Guest session expired")
    return token_data


def _resolve_guest_task(db: Session, class_id: int, task_id: int) -> tuple[SchoolClass, Task] | None:
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        return None
    plan = load_focus_plan(school_class.id, db)
    if plan is None:
        return None
    for item in plan.tasks:
        if item.id == task_id and item.is_active:
            return school_class, item
    return None


@router.get("/tasks/{task_id}/assets/{slot}/{asset_path:path}")
def guest_task_asset(
    task_id: int,
    slot: str,
    asset_path: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """旁听只读打开网页活动的静态资源。

    只开放网页活动（web）的静态文件：数据提交页是提交入口，旁听不该看到，
    也不在这里注入任何带提交令牌的运行时上下文。
    """
    guest = _guest_task_from_request(request)
    resolved = _resolve_guest_task(db, int(guest["class_id"]), task_id)
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="活动不存在")
    _, task = resolved

    normalized_slot = slot.strip().lower()
    if normalized_slot != "web" or (task.task_type or "").strip().lower() != "web_page":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    try:
        normalized_path = normalize_relative_path(asset_path)
        file_path = resolve_asset_file_path(task_id, normalized_slot, normalized_path)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源路径无效") from error

    asset = db.scalar(
        select(TaskWebAsset).where(
            TaskWebAsset.task_id == task_id,
            TaskWebAsset.slot == normalized_slot,
            TaskWebAsset.relative_path == normalized_path,
        )
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    file_path = resolve_asset_file_path(task_id, normalized_slot, normalized_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源文件不存在")

    suffix = file_path.suffix.lower()
    if suffix in {".html", ".htm", ".xhtml"}:
        raw_bytes = file_path.read_bytes()
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                html_text = raw_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源无法读取")
        return Response(content=html_text.encode("utf-8"), media_type="text/html; charset=utf-8")

    return FileResponse(path=file_path, media_type=asset.content_type, filename=asset.original_name)


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
        for task in sorted(
            (item for item in plan.tasks if item.is_active),
            key=lambda item: (item.sort_order, item.id),
        ):
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
                    "content": plan.content or "",
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
