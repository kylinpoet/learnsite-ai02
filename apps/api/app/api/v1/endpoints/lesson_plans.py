from __future__ import annotations

from datetime import UTC, date, datetime
from io import BytesIO
import json
import mimetypes
from pathlib import Path
import re
import secrets
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
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
    SystemSetting,
    Task,
    TaskTemplate,
    TaskDataSubmission,
    TaskDiscussionPost,
    TaskReadRecord,
    TaskWebAsset,
    User,
    ClassroomSession,
)
from app.schemas.common import ApiResponse
from app.services.task_assets import clear_task_dir, clear_slot_dir, normalize_relative_path, write_asset_file

router = APIRouter()

SUPPORTED_PLAN_STATUSES = {"draft", "published", "active", "completed"}
SUPPORTED_TASK_TYPES = {"reading", "upload_image", "programming", "web_page", "discussion", "rich_text", "data_submit"}
SUPPORTED_TASK_SUBMISSION_SCOPES = {"individual", "group"}
SUPPORTED_TASK_ASSET_SLOTS = {"web", "data_submit_form", "data_submit_visualization"}
TASK_ID_COUNTER_SETTING_KEY = "lesson_plan_task_id_counter"


class LessonPlanTaskPayload(BaseModel):
    id: int | None = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=120)
    task_type: str = Field(min_length=1, max_length=50)
    submission_scope: str = Field(default="individual", min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=50000)
    config: dict[str, object] | None = None
    sort_order: int | None = Field(default=None, ge=1, le=999)
    is_required: bool = True


class LessonPlanUpsertPayload(BaseModel):
    lesson_id: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=120)
    content: str | None = Field(default=None, max_length=50000)
    assigned_date: date
    status: str = Field(default="draft", min_length=1, max_length=30)
    tasks: list[LessonPlanTaskPayload] = Field(default_factory=list, min_length=1)


class TaskTemplateUpsertPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    group_name: str | None = Field(default=None, max_length=60)
    summary: str | None = Field(default=None, max_length=500)
    task_title: str = Field(min_length=1, max_length=120)
    task_type: str = Field(min_length=1, max_length=50)
    submission_scope: str = Field(default="individual", min_length=1, max_length=20)
    task_description: str | None = Field(default=None, max_length=50000)
    config: dict[str, object] | None = None
    is_required: bool = True
    is_pinned: bool = False


class TaskTemplatePinPayload(BaseModel):
    is_pinned: bool = False


class TaskTemplateGroupUpdatePayload(BaseModel):
    id: int = Field(ge=1)
    group_name: str | None = Field(default=None, max_length=60)


class TaskTemplateReorderPayload(BaseModel):
    ordered_ids: list[int] = Field(min_length=1)
    group_updates: list[TaskTemplateGroupUpdatePayload] = Field(default_factory=list)


class TaskIdReservationPayload(BaseModel):
    count: int = Field(default=1, ge=1, le=20)


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


def normalize_task_template_title(title: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写模板名称")
    return cleaned


def normalize_task_template_group_name(group_name: str | None) -> str:
    return (group_name or "").strip()


def normalize_task_template_summary(summary: str | None) -> str | None:
    return normalize_description(summary)


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


def parse_task_config_json(raw_value: str | None) -> dict[str, object]:
    if not raw_value:
        return {}
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return parsed


def build_absolute_api_url(request: Request | None, path: str) -> str:
    normalized = path.strip()
    if not normalized:
        return ""
    if normalized.startswith(("http://", "https://")):
        return normalized
    if request is None:
        return normalized
    base_url = str(request.base_url)
    if normalized.startswith("/"):
        return f"{base_url.rstrip('/')}{normalized}"
    return f"{base_url}{normalized}"


def normalize_asset_manifest(value: object, slot: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []

    items: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        path_value = item.get("path")
        if not isinstance(path_value, str):
            continue
        try:
            normalized_path = normalize_relative_path(path_value)
        except ValueError:
            continue
        size_kb = item.get("size_kb")
        mime_type = item.get("mime_type")
        items.append(
            {
                "path": normalized_path,
                "size_kb": int(size_kb) if isinstance(size_kb, int | float) else 0,
                "mime_type": str(mime_type).strip() if isinstance(mime_type, str) else None,
                "slot": slot,
            }
        )
    items.sort(key=lambda current: str(current.get("path", "")))
    return items


def build_asset_manifest_item(relative_path: str, size_bytes: int, slot: str, content_type: str | None) -> dict[str, object]:
    return {
        "path": relative_path,
        "size_kb": max(0, size_bytes // 1024),
        "mime_type": content_type,
        "slot": slot,
    }


def merge_asset_manifest_item(
    manifest: object,
    item: dict[str, object],
    slot: str,
) -> list[dict[str, object]]:
    next_items = [
        current
        for current in normalize_asset_manifest(manifest, slot)
        if str(current.get("path") or "") != str(item.get("path") or "")
    ]
    next_items.append(item)
    next_items.sort(key=lambda current: str(current.get("path", "")))
    return next_items


def upsert_task_inline_html_asset(
    task_id: int,
    slot: str,
    entry_path: str,
    html_source: str,
    db: Session,
) -> dict[str, object]:
    normalized_path = normalize_relative_path(entry_path)
    db.execute(
        delete(TaskWebAsset).where(
            TaskWebAsset.task_id == task_id,
            TaskWebAsset.slot == slot,
            TaskWebAsset.relative_path == normalized_path,
        )
    )
    raw_bytes = html_source.encode("utf-8")
    write_asset_file(task_id, slot, normalized_path, raw_bytes)
    db.add(
        TaskWebAsset(
            task_id=task_id,
            slot=slot,
            relative_path=normalized_path,
            original_name=Path(normalized_path).name,
            size_kb=max(0, len(raw_bytes) // 1024),
            content_type="text/html; charset=utf-8",
        )
    )
    return build_asset_manifest_item(normalized_path, len(raw_bytes), slot, "text/html; charset=utf-8")


def persist_inline_task_html_sources(task: Task, config: dict[str, object], db: Session) -> dict[str, object]:
    task_type = (task.task_type or "").strip().lower()
    if task_type == "web_page":
        entry_html_source = str(config.get("entry_html_source") or "").strip()
        if entry_html_source:
            entry_path = str(config.get("entry_path") or "index.html").strip() or "index.html"
            asset_item = upsert_task_inline_html_asset(task.id, "web", entry_path, entry_html_source, db)
            config["assets"] = merge_asset_manifest_item(config.get("assets"), asset_item, "web")
        return config

    if task_type == "data_submit":
        submit_html_source = str(config.get("submit_html_source") or "").strip()
        if submit_html_source:
            submit_entry_path = str(config.get("submit_entry_path") or "index.html").strip() or "index.html"
            asset_item = upsert_task_inline_html_asset(
                task.id,
                "data_submit_form",
                submit_entry_path,
                submit_html_source,
                db,
            )
            config["submit_assets"] = merge_asset_manifest_item(
                config.get("submit_assets"),
                asset_item,
                "data_submit_form",
            )

        visualization_html_source = str(config.get("visualization_html_source") or "").strip()
        if visualization_html_source:
            visualization_entry_path = str(config.get("visualization_entry_path") or "index.html").strip() or "index.html"
            asset_item = upsert_task_inline_html_asset(
                task.id,
                "data_submit_visualization",
                visualization_entry_path,
                visualization_html_source,
                db,
            )
            config["visualization_assets"] = merge_asset_manifest_item(
                config.get("visualization_assets"),
                asset_item,
                "data_submit_visualization",
            )
    return config


def normalize_task_config(task_type: str, raw_config: dict[str, object] | None) -> dict[str, object]:
    source = raw_config if isinstance(raw_config, dict) else {}

    if task_type == "discussion":
        topic = str(source.get("topic") or "").strip()
        return {"topic": topic}

    if task_type == "web_page":
        entry_path = str(source.get("entry_path") or "index.html").strip() or "index.html"
        try:
            entry_path = normalize_relative_path(entry_path)
        except ValueError:
            entry_path = "index.html"
        config: dict[str, object] = {
            "entry_path": entry_path,
            "assets": normalize_asset_manifest(source.get("assets"), "web"),
        }
        entry_html_source = str(source.get("entry_html_source") or "").strip()
        if entry_html_source:
            config["entry_html_source"] = entry_html_source
        return config

    if task_type == "data_submit":
        token = str(source.get("endpoint_token") or "").strip()
        if not token:
            token = secrets.token_urlsafe(18)
        submit_entry_path = str(source.get("submit_entry_path") or "index.html").strip() or "index.html"
        visualization_entry_path = str(source.get("visualization_entry_path") or "index.html").strip() or "index.html"
        try:
            submit_entry_path = normalize_relative_path(submit_entry_path)
        except ValueError:
            submit_entry_path = "index.html"
        try:
            visualization_entry_path = normalize_relative_path(visualization_entry_path)
        except ValueError:
            visualization_entry_path = "index.html"

        config = {
            "endpoint_token": token,
            "submit_entry_path": submit_entry_path,
            "visualization_entry_path": visualization_entry_path,
            "submit_assets": normalize_asset_manifest(source.get("submit_assets"), "data_submit_form"),
            "visualization_assets": normalize_asset_manifest(
                source.get("visualization_assets"),
                "data_submit_visualization",
            ),
        }
        submit_html_source = str(source.get("submit_html_source") or "").strip()
        if submit_html_source:
            config["submit_html_source"] = submit_html_source
        visualization_html_source = str(source.get("visualization_html_source") or "").strip()
        if visualization_html_source:
            config["visualization_html_source"] = visualization_html_source
        return config

    if task_type == "rich_text":
        return {"render_mode": "rich_text"}

    return {}


def normalize_task_template_config(task_type: str, raw_config: dict[str, object] | None) -> dict[str, object]:
    source = raw_config if isinstance(raw_config, dict) else {}

    if task_type == "discussion":
        topic = str(source.get("topic") or "").strip()
        return {"topic": topic}

    if task_type == "web_page":
        entry_path = str(source.get("entry_path") or "index.html").strip() or "index.html"
        try:
            entry_path = normalize_relative_path(entry_path)
        except ValueError:
            entry_path = "index.html"

        config: dict[str, object] = {"entry_path": entry_path}
        entry_html_source = str(source.get("entry_html_source") or "").strip()
        if entry_html_source:
            config["entry_html_source"] = entry_html_source
        return config

    if task_type == "data_submit":
        submit_entry_path = str(source.get("submit_entry_path") or "index.html").strip() or "index.html"
        visualization_entry_path = str(source.get("visualization_entry_path") or "index.html").strip() or "index.html"
        try:
            submit_entry_path = normalize_relative_path(submit_entry_path)
        except ValueError:
            submit_entry_path = "index.html"
        try:
            visualization_entry_path = normalize_relative_path(visualization_entry_path)
        except ValueError:
            visualization_entry_path = "index.html"

        config = {
            "submit_entry_path": submit_entry_path,
            "visualization_entry_path": visualization_entry_path,
        }
        submit_html_source = str(source.get("submit_html_source") or "").strip()
        if submit_html_source:
            config["submit_html_source"] = submit_html_source
        visualization_html_source = str(source.get("visualization_html_source") or "").strip()
        if visualization_html_source:
            config["visualization_html_source"] = visualization_html_source
        return config

    return {}


def serialize_task_config(task: Task, request: Request | None = None) -> dict[str, object] | None:
    config = parse_task_config_json(task.config_json)
    if task.task_type == "data_submit":
        config.pop("schema_json", None)
        token = str(config.get("endpoint_token") or "").strip()
        if token:
            submit_path = f"/api/v1/tasks/{task.id}/data-submit/{token}"
            config["submit_api_path"] = build_absolute_api_url(request, submit_path)
            config["records_api_path"] = build_absolute_api_url(request, f"{submit_path}/records")
    return config or None


def serialize_task_template(template: TaskTemplate) -> dict[str, object]:
    config = parse_task_config_json(template.config_json) or None
    if template.task_type == "data_submit" and isinstance(config, dict):
        config.pop("schema_json", None)
    return {
        "id": template.id,
        "title": template.title,
        "group_name": template.group_name,
        "summary": template.summary,
        "task_title": template.task_title,
        "task_type": template.task_type,
        "submission_scope": template.submission_scope,
        "task_description": template.task_description,
        "config": config,
        "is_required": template.is_required,
        "sort_order": template.sort_order,
        "is_pinned": template.is_pinned,
        "last_used_at": template.last_used_at.isoformat() if template.last_used_at else None,
        "use_count": template.use_count,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }


def task_template_order_by_columns() -> tuple[object, ...]:
    return (
        TaskTemplate.is_pinned.desc(),
        TaskTemplate.sort_order.asc(),
        TaskTemplate.last_used_at.desc(),
        TaskTemplate.group_name.asc(),
        TaskTemplate.updated_at.desc(),
        TaskTemplate.id.desc(),
    )


def next_plan_id(db: Session) -> int:
    current_max = db.scalar(select(func.coalesce(func.max(LessonPlan.id), 0)))
    return int(current_max or 0) + 1


def read_int_system_setting(setting_key: str, db: Session) -> int:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == setting_key))
    if row is None:
        return 0
    try:
        return int((row.setting_value or "").strip() or 0)
    except ValueError:
        return 0


def write_int_system_setting(setting_key: str, value: int, db: Session) -> None:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == setting_key))
    if row is None:
        db.add(SystemSetting(setting_key=setting_key, setting_value=str(int(value))))
        return
    row.setting_value = str(int(value))


def next_task_id(db: Session) -> int:
    current_max = db.scalar(select(func.coalesce(func.max(Task.id), 0)))
    reserved_max = read_int_system_setting(TASK_ID_COUNTER_SETTING_KEY, db)
    return max(int(current_max or 0), reserved_max) + 1


def reserve_task_ids(count: int, db: Session) -> list[int]:
    start_id = next_task_id(db)
    reserved_ids = list(range(start_id, start_id + count))
    write_int_system_setting(TASK_ID_COUNTER_SETTING_KEY, reserved_ids[-1], db)
    db.flush()
    return reserved_ids


def next_task_template_sort_order(staff_user_id: int, db: Session) -> int:
    current_max = db.scalar(
        select(func.coalesce(func.max(TaskTemplate.sort_order), 0)).where(TaskTemplate.owner_staff_id == staff_user_id)
    )
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


def load_task_template_for_staff(template_id: int, staff_user_id: int, db: Session) -> TaskTemplate | None:
    return db.scalar(
        select(TaskTemplate).where(
            TaskTemplate.id == template_id,
            TaskTemplate.owner_staff_id == staff_user_id,
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
        db.execute(delete(TaskWebAsset).where(TaskWebAsset.task_id == task_id))
        db.execute(delete(TaskDiscussionPost).where(TaskDiscussionPost.task_id == task_id))
        db.execute(delete(TaskDataSubmission).where(TaskDataSubmission.task_id == task_id))
        db.execute(delete(TaskReadRecord).where(TaskReadRecord.task_id == task_id))
        db.execute(delete(Task).where(Task.id == task_id))
        clear_task_dir(task_id)


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
        preferred_new_task_id: int | None = None
        if task_id is not None:
            if task_id in seen_payload_ids:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务列表存在重复记录，请刷新后重试")
            seen_payload_ids.add(task_id)
            existing_task = existing_by_id.get(task_id)
            if existing_task is None:
                conflicting_task = db.get(Task, task_id)
                if conflicting_task is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="任务标识已被占用，请重新生成后再保存",
                    )
                preferred_new_task_id = task_id
                task_id = None

        if task_id is not None:
            existing_task = existing_by_id.get(task_id)
            if existing_task is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务标识无效，请刷新后重试")
            normalized_config = normalize_task_config(
                task_type,
                payload_task.config if payload_task.config is not None else parse_task_config_json(existing_task.config_json),
            )
            existing_task.title = title
            existing_task.task_type = task_type
            existing_task.submission_scope = normalize_task_submission_scope(payload_task.submission_scope, task_type)
            existing_task.description = normalize_description(payload_task.description)
            normalized_config = persist_inline_task_html_sources(existing_task, normalized_config, db)
            existing_task.config_json = json.dumps(normalized_config, ensure_ascii=False) if normalized_config else None
            existing_task.sort_order = payload_task.sort_order or index
            existing_task.is_required = payload_task.is_required
            kept_task_ids.add(existing_task.id)
            continue

        normalized_config = normalize_task_config(task_type, payload_task.config)
        task_id_to_use = preferred_new_task_id or next_id
        task = Task(
            id=task_id_to_use,
            plan_id=plan.id,
            title=title,
            task_type=task_type,
            submission_scope=normalize_task_submission_scope(payload_task.submission_scope, task_type),
            description=normalize_description(payload_task.description),
            config_json=json.dumps(normalized_config, ensure_ascii=False) if normalized_config else None,
            sort_order=payload_task.sort_order or index,
            is_required=payload_task.is_required,
        )
        db.add(task)
        normalized_config = persist_inline_task_html_sources(task, normalized_config, db)
        task.config_json = json.dumps(normalized_config, ensure_ascii=False) if normalized_config else None
        kept_task_ids.add(task_id_to_use)
        if preferred_new_task_id is None:
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


def serialize_staff_plan_detail(plan: LessonPlan, request: Request | None = None) -> dict:
    summary = serialize_staff_plan(plan)
    summary["content"] = plan.content
    summary["tasks"] = [
        {
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "submission_scope": task.submission_scope,
            "description": task.description,
            "config": serialize_task_config(task, request),
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


@router.get("/staff/task-templates", response_model=ApiResponse)
def list_staff_task_templates(
    keyword: str | None = Query(default=None, max_length=120),
    group_name: str | None = Query(default=None, max_length=60),
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    statement = select(TaskTemplate).where(TaskTemplate.owner_staff_id == current_staff.id)

    normalized_group_name = normalize_task_template_group_name(group_name)
    if normalized_group_name:
        statement = statement.where(TaskTemplate.group_name == normalized_group_name)

    normalized_keyword = (keyword or "").strip().lower()
    if normalized_keyword:
        keyword_pattern = f"%{normalized_keyword}%"
        statement = statement.where(
            or_(
                func.lower(TaskTemplate.title).like(keyword_pattern),
                func.lower(TaskTemplate.group_name).like(keyword_pattern),
                func.lower(func.coalesce(TaskTemplate.summary, "")).like(keyword_pattern),
                func.lower(TaskTemplate.task_title).like(keyword_pattern),
                func.lower(func.coalesce(TaskTemplate.task_description, "")).like(keyword_pattern),
            )
        )

    templates = db.scalars(statement.order_by(*task_template_order_by_columns())).all()
    return ApiResponse(data={"templates": [serialize_task_template(template) for template in templates]})


@router.post("/staff/task-ids/reserve", response_model=ApiResponse)
def reserve_staff_task_ids(
    payload: TaskIdReservationPayload,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    reserved_ids = reserve_task_ids(payload.count, db)
    db.commit()
    return ApiResponse(
        message="任务编号已预生成",
        data={"task_ids": reserved_ids},
    )


@router.post("/staff/task-templates", response_model=ApiResponse)
def create_staff_task_template(
    payload: TaskTemplateUpsertPayload,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    title = normalize_task_template_title(payload.title)
    task_title = normalize_title(payload.task_title)
    if not task_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写任务标题")

    task_type = normalize_task_type(payload.task_type)
    template = TaskTemplate(
        owner_staff_id=current_staff.id,
        title=title,
        group_name=normalize_task_template_group_name(payload.group_name),
        summary=normalize_task_template_summary(payload.summary),
        task_title=task_title,
        task_type=task_type,
        submission_scope=normalize_task_submission_scope(payload.submission_scope, task_type),
        task_description=normalize_description(payload.task_description),
        config_json=None,
        is_required=payload.is_required,
        sort_order=next_task_template_sort_order(current_staff.id, db),
        is_pinned=payload.is_pinned,
    )
    normalized_config = normalize_task_template_config(task_type, payload.config)
    template.config_json = json.dumps(normalized_config, ensure_ascii=False) if normalized_config else None

    db.add(template)
    db.commit()
    db.refresh(template)
    return ApiResponse(message="任务模板已保存", data={"template": serialize_task_template(template)})


@router.put("/staff/task-templates/{template_id}", response_model=ApiResponse)
def update_staff_task_template(
    template_id: int,
    payload: TaskTemplateUpsertPayload,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_task_template_for_staff(template_id, current_staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务模板不存在")

    title = normalize_task_template_title(payload.title)
    task_title = normalize_title(payload.task_title)
    if not task_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写任务标题")

    task_type = normalize_task_type(payload.task_type)
    template.title = title
    template.group_name = normalize_task_template_group_name(payload.group_name)
    template.summary = normalize_task_template_summary(payload.summary)
    template.task_title = task_title
    template.task_type = task_type
    template.submission_scope = normalize_task_submission_scope(payload.submission_scope, task_type)
    template.task_description = normalize_description(payload.task_description)
    normalized_config = normalize_task_template_config(task_type, payload.config)
    template.config_json = json.dumps(normalized_config, ensure_ascii=False) if normalized_config else None
    template.is_required = payload.is_required
    template.is_pinned = payload.is_pinned

    db.commit()
    db.refresh(template)
    return ApiResponse(message="任务模板已更新", data={"template": serialize_task_template(template)})


@router.post("/staff/task-templates/{template_id}/pin", response_model=ApiResponse)
def pin_staff_task_template(
    template_id: int,
    payload: TaskTemplatePinPayload,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_task_template_for_staff(template_id, current_staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务模板不存在")

    template.is_pinned = payload.is_pinned
    db.commit()
    db.refresh(template)
    return ApiResponse(
        message="任务模板置顶状态已更新",
        data={"template": serialize_task_template(template)},
    )


@router.post("/staff/task-templates/{template_id}/mark-used", response_model=ApiResponse)
def mark_staff_task_template_used(
    template_id: int,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_task_template_for_staff(template_id, current_staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务模板不存在")

    template.last_used_at = datetime.now(UTC)
    template.use_count = int(template.use_count or 0) + 1
    db.commit()
    db.refresh(template)
    return ApiResponse(
        message="任务模板最近使用已记录",
        data={"template": serialize_task_template(template)},
    )


@router.post("/staff/task-templates/reorder", response_model=ApiResponse)
def reorder_staff_task_templates(
    payload: TaskTemplateReorderPayload,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    templates = list(
        db.scalars(
            select(TaskTemplate)
            .where(TaskTemplate.owner_staff_id == current_staff.id)
            .order_by(*task_template_order_by_columns())
        ).all()
    )
    if not templates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="褰撳墠娌℃湁鍙帓搴忕殑妯℃澘")

    ordered_ids = [template_id for template_id in payload.ordered_ids if template_id > 0]
    if len(ordered_ids) != len(payload.ordered_ids) or len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="妯℃澘鎺掑簭鍙傛暟涓嶅悎娉?")

    current_ids = [template.id for template in templates]
    if len(ordered_ids) != len(current_ids) or set(ordered_ids) != set(current_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="妯℃澘鍒楄〃宸插彉鍖栵紝璇峰埛鏂板悗閲嶈瘯",
        )

    group_updates: dict[int, str] = {}
    for item in payload.group_updates:
        if item.id not in current_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="妯℃澘鍒嗙粍鏇存柊瀵硅薄鏃犳晥")
        if item.id in group_updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="妯℃澘鍒嗙粍鏇存柊鍙傛暟閲嶅")
        group_updates[item.id] = normalize_task_template_group_name(item.group_name)

    template_by_id = {template.id: template for template in templates}
    for index, template_id in enumerate(ordered_ids, start=1):
        template = template_by_id[template_id]
        template.sort_order = index
        if template_id in group_updates:
            template.group_name = group_updates[template_id]

    db.commit()

    latest_templates = list(
        db.scalars(
            select(TaskTemplate)
            .where(TaskTemplate.owner_staff_id == current_staff.id)
            .order_by(*task_template_order_by_columns())
        ).all()
    )
    return ApiResponse(
        message="浠诲姟妯℃澘鎺掑簭宸叉洿鏂?",
        data={"templates": [serialize_task_template(template) for template in latest_templates]},
    )


@router.delete("/staff/task-templates/{template_id}", response_model=ApiResponse)
def delete_staff_task_template(
    template_id: int,
    current_staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = load_task_template_for_staff(template_id, current_staff.id, db)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务模板不存在")

    db.delete(template)
    db.commit()
    return ApiResponse(message="任务模板已删除", data={"deleted_id": template_id})


@router.get("/staff/{plan_id}", response_model=ApiResponse)
def staff_plan_detail(
    plan_id: int,
    request: Request,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = load_plan(plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")
    return ApiResponse(data={"plan": serialize_staff_plan_detail(plan, request)})


@router.post("/staff", response_model=ApiResponse)
def create_lesson_plan(
    payload: LessonPlanUpsertPayload,
    request: Request,
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
        data={"plan": serialize_staff_plan_detail(latest_plan, request)},
    )


@router.put("/staff/{plan_id}", response_model=ApiResponse)
def update_lesson_plan(
    plan_id: int,
    payload: LessonPlanUpsertPayload,
    request: Request,
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
        data={"plan": serialize_staff_plan_detail(latest_plan, request)},
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
    request: Request,
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
        data={"plan": serialize_staff_plan_detail(latest_plan, request)},
    )

def load_staff_task_or_404(task_id: int, db: Session) -> Task:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.lesson_plan), selectinload(Task.web_assets))
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return task


def allowed_asset_slots_for_task(task_type: str) -> set[str]:
    if task_type == "web_page":
        return {"web"}
    if task_type == "data_submit":
        return {"data_submit_form", "data_submit_visualization"}
    return set()


def pick_entry_path(manifest: list[dict[str, object]], preferred: str | None = None) -> str | None:
    normalized_preferred = ""
    if isinstance(preferred, str) and preferred.strip():
        try:
            normalized_preferred = normalize_relative_path(preferred)
        except ValueError:
            normalized_preferred = ""

    existing_paths = [
        item.get("path")
        for item in manifest
        if isinstance(item.get("path"), str)
    ]
    if normalized_preferred and normalized_preferred in existing_paths:
        return normalized_preferred
    if "index.html" in existing_paths:
        return "index.html"
    for value in existing_paths:
        if isinstance(value, str) and value.endswith("/index.html"):
            return value
    for value in existing_paths:
        if isinstance(value, str) and value.lower().endswith(".html"):
            return value
    if existing_paths:
        first = existing_paths[0]
        return first if isinstance(first, str) else None
    return None


def read_upload_entries(
    files: list[UploadFile],
    paths: list[str] | None,
    *,
    extract_zip: bool,
) -> list[tuple[str, bytes, str, str | None]]:
    entries: dict[str, tuple[bytes, str, str | None]] = {}
    resolved_paths = paths or []

    if resolved_paths and len(resolved_paths) != len(files):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传路径数量与文件数量不一致")

    for index, upload in enumerate(files):
        if not upload.filename:
            continue
        raw_bytes = upload.file.read()
        upload.file.close()
        original_name = Path(upload.filename).name
        suffix = Path(original_name).suffix.lower()

        if extract_zip and suffix == ".zip":
            try:
                with zipfile.ZipFile(BytesIO(raw_bytes)) as archive:
                    for member in archive.infolist():
                        if member.is_dir():
                            continue
                        member_path = member.filename.replace("\\", "/")
                        normalized_path = normalize_relative_path(member_path)
                        member_name = Path(normalized_path).name
                        content = archive.read(member)
                        mime_type = mimetypes.guess_type(member_name)[0]
                        entries[normalized_path] = (content, member_name, mime_type)
            except zipfile.BadZipFile as error:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ZIP 文件解析失败") from error
            continue

        path_hint = resolved_paths[index] if index < len(resolved_paths) else ""
        fallback_name = original_name or f"asset-{index + 1}.bin"
        normalized_path = normalize_relative_path(path_hint or fallback_name)
        mime_type = mimetypes.guess_type(original_name)[0]
        entries[normalized_path] = (raw_bytes, original_name, mime_type)

    return [(path, item[0], item[1], item[2]) for path, item in sorted(entries.items(), key=lambda pair: pair[0])]


@router.post("/staff/tasks/{task_id}/assets", response_model=ApiResponse)
def upload_task_assets(
    task_id: int,
    request: Request,
    slot: str = Form(default="web"),
    entry_path: str | None = Form(default=None),
    clear_existing: bool = Form(default=True),
    extract_zip: bool = Form(default=True),
    paths: list[str] | None = Form(default=None),
    files: list[UploadFile] | None = File(default=None),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    normalized_slot = slot.strip().lower()
    if normalized_slot not in SUPPORTED_TASK_ASSET_SLOTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的任务资源槽位")

    task = load_staff_task_or_404(task_id, db)
    allowed_slots = allowed_asset_slots_for_task((task.task_type or "").strip().lower())
    if normalized_slot not in allowed_slots:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务类型不支持该资源槽位")

    upload_items = [item for item in (files or []) if item.filename]
    if not upload_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少上传一个文件")

    entries = read_upload_entries(upload_items, paths, extract_zip=extract_zip)
    if not entries:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未解析到可用的上传文件")

    if clear_existing:
        clear_slot_dir(task.id, normalized_slot)
        db.execute(
            delete(TaskWebAsset).where(
                TaskWebAsset.task_id == task.id,
                TaskWebAsset.slot == normalized_slot,
            )
        )
    else:
        db.execute(
            delete(TaskWebAsset).where(
                TaskWebAsset.task_id == task.id,
                TaskWebAsset.slot == normalized_slot,
                TaskWebAsset.relative_path.in_([item[0] for item in entries]),
            )
        )

    for relative_path, content, original_name, content_type in entries:
        write_asset_file(task.id, normalized_slot, relative_path, content)
        db.add(
            TaskWebAsset(
                task_id=task.id,
                slot=normalized_slot,
                relative_path=relative_path,
                original_name=original_name,
                size_kb=max(0, len(content) // 1024),
                content_type=content_type,
            )
        )
    db.flush()

    current_assets = list(
        db.scalars(
            select(TaskWebAsset)
            .where(TaskWebAsset.task_id == task.id, TaskWebAsset.slot == normalized_slot)
            .order_by(TaskWebAsset.relative_path.asc(), TaskWebAsset.id.asc())
        ).all()
    )
    manifest = [
        {
            "path": item.relative_path,
            "size_kb": item.size_kb,
            "mime_type": item.content_type,
            "slot": item.slot,
        }
        for item in current_assets
    ]

    config = parse_task_config_json(task.config_json)
    if task.task_type == "web_page":
        config["assets"] = manifest
        selected_entry = pick_entry_path(manifest, entry_path or str(config.get("entry_path") or ""))
        if selected_entry:
            config["entry_path"] = selected_entry
        config = normalize_task_config("web_page", config)
    elif task.task_type == "data_submit":
        config = normalize_task_config("data_submit", config)
        if normalized_slot == "data_submit_form":
            config["submit_assets"] = manifest
            selected_entry = pick_entry_path(manifest, entry_path or str(config.get("submit_entry_path") or ""))
            if selected_entry:
                config["submit_entry_path"] = selected_entry
        elif normalized_slot == "data_submit_visualization":
            config["visualization_assets"] = manifest
            selected_entry = pick_entry_path(
                manifest,
                entry_path or str(config.get("visualization_entry_path") or ""),
            )
            if selected_entry:
                config["visualization_entry_path"] = selected_entry

    task.config_json = json.dumps(config, ensure_ascii=False) if config else None
    db.commit()

    refreshed_task = load_staff_task_or_404(task_id, db)
    refreshed_config = serialize_task_config(refreshed_task, request) or {}
    preview_entry = None
    if normalized_slot == "web":
        preview_entry = refreshed_config.get("entry_path")
    elif normalized_slot == "data_submit_form":
        preview_entry = refreshed_config.get("submit_entry_path")
    elif normalized_slot == "data_submit_visualization":
        preview_entry = refreshed_config.get("visualization_entry_path")

    preview_url = (
        build_absolute_api_url(request, f"/api/v1/tasks/{task_id}/assets/{normalized_slot}/{preview_entry}")
        if isinstance(preview_entry, str) and preview_entry
        else None
    )

    return ApiResponse(
        message="任务网页资源上传成功",
        data={
            "task_id": task_id,
            "slot": normalized_slot,
            "entry_path": preview_entry,
            "preview_url": preview_url,
            "config": refreshed_config,
            "assets": manifest,
        },
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
def lesson_plan_detail(plan_id: str, request: Request, db: Session = Depends(get_db)) -> ApiResponse:
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
                    "config": serialize_task_config(task, request),
                    "sort_order": task.sort_order,
                    "is_required": task.is_required,
                }
                for task in sorted(plan.tasks, key=lambda item: item.sort_order)
            ],
        }
    )
