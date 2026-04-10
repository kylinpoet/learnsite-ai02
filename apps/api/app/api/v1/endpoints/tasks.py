from __future__ import annotations

import json
import re
from datetime import date, datetime
from math import ceil
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import TASK_RUNTIME_COOKIE_NAME, get_current_user, require_student
from app.api.deps.db import get_db
from app.core.config import settings
from app.core.security import (
    create_task_runtime_token,
    decode_access_token,
    decode_task_runtime_token,
    is_access_token_expired,
)
from app.models import (
    ClassroomSession,
    CurriculumLesson,
    CurriculumUnit,
    GroupTaskDraft,
    GroupTaskDraftVersion,
    LessonPlan,
    ResourceItem,
    StudentGroup,
    StudentGroupMember,
    StudentLessonPlanProgress,
    StudentProfile,
    Submission,
    SubmissionFile,
    Task,
    TaskDataSubmission,
    TaskDiscussionPost,
    TaskReadRecord,
    TaskResourceLink,
    TaskWebAsset,
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
from app.services.staff_access import staff_can_access_class
from app.services.student_groups import load_student_group_membership
from app.services.submission_files import (
    guess_media_type,
    is_previewable_file,
    stored_file_path,
    submission_dir,
)
from app.services.task_assets import normalize_relative_path, resolve_asset_file_path

router = APIRouter()
SUPPORTED_TASK_ASSET_SLOTS = {"web", "data_submit_form", "data_submit_visualization"}
TASK_RUNTIME_COOKIE_MAX_AGE = settings.task_runtime_ttl_seconds
DISCUSSION_CONTENT_MAX_LENGTH = 200_000
MEANINGFUL_RICH_HTML_TAG_PATTERN = re.compile(
    r"<\s*(img|video|audio|iframe|embed|object|svg|canvas|table|form|input|textarea|select|button|style|font|figure|math|hr)\b",
    re.IGNORECASE,
)


class GroupTaskDraftUpdateRequest(BaseModel):
    submission_note: str | None = Field(default="")
    source_code: str | None = Field(default="")


class TaskDiscussionPostCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=DISCUSSION_CONTENT_MAX_LENGTH)
    parent_post_id: int | None = Field(default=None, ge=1)


def load_task(task_id: int, db: Session) -> Task:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(Task.resource_links)
            .selectinload(TaskResourceLink.resource_item)
            .selectinload(ResourceItem.category),
            selectinload(Task.resource_links)
            .selectinload(TaskResourceLink.resource_item)
            .selectinload(ResourceItem.owner_staff),
        )
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    return task


def student_can_access_task(student: User, task: Task, db: Session) -> bool:
    if student.user_type != "student":
        return False
    progress_exists = db.scalar(
        select(StudentLessonPlanProgress.id).where(
            StudentLessonPlanProgress.student_id == student.id,
            StudentLessonPlanProgress.plan_id == task.plan_id,
        )
    )
    return progress_exists is not None


def staff_can_access_task(staff: User, task: Task, db: Session) -> bool:
    if staff.user_type != "staff":
        return False

    session_class_ids = list(
        db.scalars(
            select(ClassroomSession.class_id)
            .where(ClassroomSession.plan_id == task.plan_id)
            .distinct()
        ).all()
    )
    if session_class_ids:
        return any(staff_can_access_class(staff, class_id, db) for class_id in session_class_ids)

    progress_class_ids = list(
        db.scalars(
            select(StudentProfile.class_id)
            .join(StudentLessonPlanProgress, StudentLessonPlanProgress.student_id == StudentProfile.user_id)
            .where(StudentLessonPlanProgress.plan_id == task.plan_id)
            .distinct()
        ).all()
    )
    if progress_class_ids:
        return any(staff_can_access_class(staff, class_id, db) for class_id in progress_class_ids)

    # Draft / unassigned plans do not expose enough class bindings to scope staff preview more narrowly yet.
    return True


def user_can_access_task(user: User, task: Task, db: Session, *, allow_staff: bool = False) -> bool:
    if user.user_type == "student":
        return student_can_access_task(user, task, db)
    if allow_staff and user.user_type == "staff":
        return staff_can_access_task(user, task, db)
    return False


def ensure_user_can_access_task(user: User, task: Task, db: Session, *, allow_staff: bool = False) -> None:
    if user_can_access_task(user, task, db, allow_staff=allow_staff):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user cannot access this task")


def ensure_student_can_access_task(student: User, task: Task, db: Session) -> None:
    ensure_user_can_access_task(student, task, db, allow_staff=False)


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


def load_student_plan_progress(student_id: int, plan_id: int, db: Session) -> StudentLessonPlanProgress | None:
    return db.scalar(
        select(StudentLessonPlanProgress).where(
            StudentLessonPlanProgress.student_id == student_id,
            StudentLessonPlanProgress.plan_id == plan_id,
        )
    )


def sync_student_lesson_plan_progress(task: Task, student: User, db: Session) -> None:
    progress = load_student_plan_progress(student.id, task.plan_id, db)
    if progress is None:
        return

    required_tasks = [item for item in task.lesson_plan.tasks if item.is_required]
    if not required_tasks:
        progress.progress_status = "completed"
        progress.completed_date = progress.completed_date or date.today()
        return

    reading_task_ids = [item.id for item in required_tasks if item.task_type == "reading"]
    discussion_task_ids = [item.id for item in required_tasks if item.task_type == "discussion"]
    data_submit_task_ids = [item.id for item in required_tasks if item.task_type == "data_submit"]
    individual_submission_task_ids = [
        item.id
        for item in required_tasks
        if item.task_type not in {"reading", "discussion", "data_submit"} and not is_group_submission_task(item)
    ]
    group_submission_task_ids = [
        item.id
        for item in required_tasks
        if item.task_type not in {"reading", "discussion", "data_submit"} and is_group_submission_task(item)
    ]

    completed_reading_ids = set(
        db.scalars(
            select(TaskReadRecord.task_id).where(
                TaskReadRecord.student_id == student.id,
                TaskReadRecord.task_id.in_(reading_task_ids or [-1]),
            )
        ).all()
    )
    completed_discussion_ids = set(
        db.scalars(
            select(TaskDiscussionPost.task_id)
            .where(
                TaskDiscussionPost.author_user_id == student.id,
                TaskDiscussionPost.task_id.in_(discussion_task_ids or [-1]),
            )
            .distinct()
        ).all()
    )
    completed_data_submit_ids = set(
        db.scalars(
            select(TaskDataSubmission.task_id)
            .where(
                TaskDataSubmission.submitted_by_user_id == student.id,
                TaskDataSubmission.task_id.in_(data_submit_task_ids or [-1]),
            )
            .distinct()
        ).all()
    )
    completed_individual_submission_ids = set(
        db.scalars(
            select(Submission.task_id)
            .where(
                Submission.student_id == student.id,
                Submission.task_id.in_(individual_submission_task_ids or [-1]),
            )
            .distinct()
        ).all()
    )

    completed_group_submission_ids: set[int] = set()
    if group_submission_task_ids:
        membership = load_student_group_for_task(student.id, db)
        if membership is not None:
            completed_group_submission_ids = set(
                db.scalars(
                    select(Submission.task_id)
                    .where(
                        Submission.group_id == membership.group_id,
                        Submission.task_id.in_(group_submission_task_ids),
                    )
                    .distinct()
                ).all()
            )

    is_completed = True
    for plan_task in required_tasks:
        if plan_task.task_type == "reading":
            if plan_task.id not in completed_reading_ids:
                is_completed = False
                break
            continue
        if plan_task.task_type == "discussion":
            if plan_task.id not in completed_discussion_ids:
                is_completed = False
                break
            continue
        if plan_task.task_type == "data_submit":
            if plan_task.id not in completed_data_submit_ids:
                is_completed = False
                break
            continue
        if is_group_submission_task(plan_task):
            if plan_task.id not in completed_group_submission_ids:
                is_completed = False
                break
            continue
        if plan_task.id not in completed_individual_submission_ids:
            is_completed = False
            break

    progress.progress_status = "completed" if is_completed else "pending"
    progress.completed_date = (progress.completed_date or date.today()) if is_completed else None


def serialize_task_resource(resource_link: TaskResourceLink) -> dict | None:
    resource = resource_link.resource_item
    if resource is None or not resource.is_published:
        return None

    return {
        "id": resource_link.id,
        "task_id": resource_link.task_id,
        "resource_id": resource.id,
        "relation_type": resource_link.relation_type,
        "sort_order": resource_link.sort_order,
        "title": resource.title,
        "resource_type": resource.resource_type,
        "summary": resource.summary,
        "content": resource.content,
        "external_url": resource.external_url,
        "owner_name": resource.owner_staff.display_name if resource.owner_staff else "系统内置",
        "category": (
            {
                "id": resource.category.id,
                "name": resource.category.name,
            }
            if resource.category
            else None
        ),
    }


def serialize_task_resources(task: Task) -> list[dict]:
    items: list[dict] = []
    for resource_link in task.resource_links:
        serialized = serialize_task_resource(resource_link)
        if serialized is not None:
            items.append(serialized)
    return items


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


def normalize_discussion_content(content: str | None) -> str | None:
    if content is None:
        return None

    cleaned = content.strip()
    if not cleaned:
        return None

    text_only = re.sub(r"<[^>]+>", "", cleaned).replace("&nbsp;", " ").strip()
    if text_only:
        return cleaned
    if MEANINGFUL_RICH_HTML_TAG_PATTERN.search(cleaned):
        return cleaned
    return None


def normalize_draft_source_code(source_code: str | None) -> str | None:
    if source_code is None:
        return None
    normalized = source_code.replace("\r\n", "\n")
    return normalized if normalized.strip() else None


def parse_task_config(task: Task) -> dict[str, object]:
    if not task.config_json:
        return {}
    try:
        parsed = json.loads(task.config_json)
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


def serialize_task_config(task: Task, request: Request | None = None) -> dict[str, object] | None:
    config = parse_task_config(task)
    config.pop("entry_html_source", None)
    config.pop("submit_html_source", None)
    config.pop("visualization_html_source", None)
    if task.task_type == "data_submit":
        config.pop("schema_json", None)
        token = str(config.get("endpoint_token") or "").strip()
        if token:
            submit_path = f"/api/v1/tasks/{task.id}/data-submit/{token}"
            config["submit_api_path"] = build_absolute_api_url(request, submit_path)
            config["records_api_path"] = build_absolute_api_url(request, f"{submit_path}/records")
    return config or None


def allowed_asset_slots_for_task(task: Task) -> set[str]:
    normalized_type = (task.task_type or "").strip().lower()
    if normalized_type == "web_page":
        return {"web"}
    if normalized_type == "data_submit":
        return {"data_submit_form", "data_submit_visualization"}
    return set()


def serialize_discussion_post(post: TaskDiscussionPost) -> dict:
    author = post.author
    profile = author.student_profile if author else None
    return {
        "id": post.id,
        "task_id": post.task_id,
        "parent_post_id": post.parent_post_id,
        "content": post.content,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
        "author": {
            "user_id": author.id if author else None,
            "display_name": author.display_name if author else "未知用户",
            "user_type": author.user_type if author else "unknown",
            "student_no": profile.student_no if profile else None,
        },
    }


def parse_access_token_user(access_token: str | None, db: Session) -> User | None:
    if not access_token:
        return None
    token_data = decode_access_token(access_token)
    if token_data is None:
        return None
    if is_access_token_expired(token_data):
        return None
    user = db.get(User, int(token_data.get("user_id", 0)))
    if user is None or not user.is_active:
        return None
    return user


def parse_task_runtime_user(
    request: Request,
    task: Task,
    db: Session,
    *,
    enforce_task_access: bool = True,
) -> User | None:
    runtime_token = (request.cookies.get(TASK_RUNTIME_COOKIE_NAME) or "").strip()
    if not runtime_token:
        return None
    token_data = decode_task_runtime_token(runtime_token)
    if token_data is None:
        return None
    if is_access_token_expired(token_data):
        return None
    if int(token_data.get("task_id", 0)) != task.id:
        return None
    user = db.get(User, int(token_data.get("user_id", 0)))
    if user is None or not user.is_active:
        return None
    if enforce_task_access and not user_can_access_task(user, task, db, allow_staff=True):
        return None
    return user


def extract_request_access_token(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        bearer_token = authorization.split(" ", 1)[1].strip()
        if bearer_token:
            return bearer_token
    query_token = str(request.query_params.get("access_token") or "").strip()
    if query_token:
        return query_token
    return None


def allows_runtime_preview_without_assignment(request: Request, task: Task, user: User) -> bool:
    if task.lesson_plan.status != "draft":
        return False
    if user.user_type not in {"student", "staff"}:
        return False
    return bool(request.cookies.get(TASK_RUNTIME_COOKIE_NAME) or extract_request_access_token(request))


def set_task_runtime_cookie(response: Response, user: User, task: Task) -> None:
    runtime_token, _ = create_task_runtime_token(
        user_id=user.id,
        user_type=user.user_type,
        username=user.username,
        task_id=task.id,
        ttl_seconds=TASK_RUNTIME_COOKIE_MAX_AGE,
    )
    response.set_cookie(
        key=TASK_RUNTIME_COOKIE_NAME,
        value=runtime_token,
        max_age=TASK_RUNTIME_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path=f"/api/v1/tasks/{task.id}/",
    )


def task_request_base_path(request: Request, task_id: int) -> str:
    path = request.url.path
    asset_separator = "/assets/"
    if asset_separator in path:
        return path.split(asset_separator, 1)[0]
    task_separator = f"/tasks/{task_id}/"
    if task_separator in path:
        return path.split(task_separator, 1)[0] + f"/tasks/{task_id}"
    return f"/api/v1/tasks/{task_id}"


def build_task_runtime_context(task: Task, slot: str, asset_path: str, request: Request) -> dict[str, object]:
    config = serialize_task_config(task, request) or {}
    task_base_path = task_request_base_path(request, task.id)
    api_base_path = task_base_path.rsplit("/tasks/", 1)[0] if "/tasks/" in task_base_path else "/api/v1"
    asset_base_path = f"{task_base_path}/assets/{slot}"
    return {
        "taskId": task.id,
        "taskType": task.task_type,
        "slot": slot,
        "assetPath": asset_path,
        "assetBasePath": asset_base_path,
        "assetEntryUrl": f"{asset_base_path}/{asset_path}",
        "taskBasePath": task_base_path,
        "apiBasePath": api_base_path,
        "previewKey": f"task:{task.id}:{slot}",
        "previewParentOrigin": str(request.base_url).rstrip("/"),
        "config": config,
        "dataSubmit": {
            "endpointToken": str(config.get("endpoint_token") or ""),
            "submitApiPath": str(config.get("submit_api_path") or ""),
            "recordsApiPath": str(config.get("records_api_path") or ""),
        },
    }


def is_html_asset(asset: TaskWebAsset, file_path: Path) -> bool:
    content_type = (asset.content_type or "").split(";", 1)[0].strip().lower()
    if content_type in {"text/html", "application/xhtml+xml"}:
        return True
    return file_path.suffix.lower() in {".html", ".htm", ".xhtml"}


def decode_html_asset_bytes(raw_bytes: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            decoded = raw_bytes.decode(encoding)
            if encoding == "utf-8-sig":
                return decoded, "utf-8"
            return decoded, encoding
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("latin-1"), "latin-1"


def inject_task_runtime_context(html_text: str, context: dict[str, object]) -> str:
    serialized_context = json.dumps(context, ensure_ascii=False)
    runtime_block = (
        "<script>"
        "(function(){"
        f"const context={serialized_context};"
        "window.__LEARNSITE_TASK_CONTEXT__=context;"
        "const previewKey=String(context.previewKey||'');"
        "const previewParentOrigin=String(context.previewParentOrigin||window.location.origin||'*');"
        "const previewErrors=[];"
        "const previewErrorKeys=new Set();"
        "window.__LEARNSITE_PREVIEW_ERRORS__=previewErrors;"
        "const reportPreviewIssue=(code,message,detail)=>{"
        "const normalizedMessage=String(message||'Preview failed').trim()||'Preview failed';"
        "const normalizedDetail=String(detail||'').trim();"
        "const dedupeKey=[code,normalizedMessage,normalizedDetail].join('::');"
        "if(previewErrorKeys.has(dedupeKey)){return;}"
        "previewErrorKeys.add(dedupeKey);"
        "const payload={code,message:normalizedMessage,detail:normalizedDetail};"
        "if(previewErrors.length<12){previewErrors.push(payload);}"
        "try{"
        "if(window.parent&&window.parent!==window){"
        "window.parent.postMessage({source:'learnsite-task-preview',previewKey,code:payload.code,message:payload.message,detail:payload.detail},previewParentOrigin||'*');"
        "}"
        "}catch(error){}"
        "};"
        "window.addEventListener('error',(event)=>{"
        "const target=event.target;"
        "if(target&&target!==window&&typeof HTMLElement!=='undefined'&&target instanceof HTMLElement){"
        "const source=target.getAttribute('src')||target.getAttribute('href')||'';"
        "reportPreviewIssue('resource_error',String(target.tagName||'RESOURCE').toUpperCase()+' resource failed to load',source);"
        "return;"
        "}"
        "const location=[event.filename||'',event.lineno||'',event.colno||''].filter(Boolean).join(':');"
        "const stack=event.error&&typeof event.error==='object'&&'stack' in event.error?String(event.error.stack||''):'';"
        "reportPreviewIssue('runtime_error',event.message||'Page script failed',stack||location);"
        "},true);"
        "window.addEventListener('unhandledrejection',(event)=>{"
        "const reason=event.reason;"
        "const message=reason&&typeof reason==='object'&&'message' in reason?String(reason.message||''):String(reason||'');"
        "const detail=reason&&typeof reason==='object'&&'stack' in reason?String(reason.stack||''):'Check Promise / async logic.';"
        "reportPreviewIssue('unhandled_rejection',message||'Page has an unhandled async error',detail||'Check Promise / async logic.');"
        "});"
        "const nativeFetch=window.fetch.bind(window);"
        "const toAbsoluteUrl=(input)=>{try{if(typeof input==='string'){return new URL(input,window.location.href).toString();}if(input&&typeof input.url==='string'){return new URL(input.url,window.location.href).toString();}}catch(error){}return String(input||'');};"
        "const taskBaseUrl=toAbsoluteUrl(String(context.taskBasePath||''));"
        "const pendingRuntimeRequests=new Map();"
        "let runtimeRequestSeq=0;"
        "const decodeBase64Bytes=(value)=>{const normalized=String(value||'');if(!normalized){return new Uint8Array();}const binary=window.atob(normalized);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1){bytes[index]=binary.charCodeAt(index);}return bytes;};"
        "const encodeBodyValue=async (body)=>{if(body==null){return {kind:'empty',value:'',mimeType:''};}if(typeof body==='string'){return {kind:'text',value:body,mimeType:''};}if(typeof URLSearchParams!=='undefined'&&body instanceof URLSearchParams){return {kind:'text',value:body.toString(),mimeType:'application/x-www-form-urlencoded;charset=UTF-8'};}if(typeof Blob!=='undefined'&&body instanceof Blob){const buffer=await body.arrayBuffer();const bytes=new Uint8Array(buffer);let binary='';for(let index=0;index<bytes.length;index+=1){binary+=String.fromCharCode(bytes[index]);}return {kind:'base64',value:window.btoa(binary),mimeType:body.type||''};}return {kind:'text',value:String(body),mimeType:''};};"
        "window.addEventListener('message',(event)=>{const payload=event.data;if(!payload||payload.source!=='learnsite-task-runtime-response'||typeof payload.requestId!=='string'){return;}const pending=pendingRuntimeRequests.get(payload.requestId);if(!pending){return;}pendingRuntimeRequests.delete(payload.requestId);if(payload.error){pending.reject(new Error(String(payload.error||'Runtime request failed')));return;}const bodyBytes=decodeBase64Bytes(payload.bodyBase64||'');const headers=new Headers(payload.headers||{});pending.resolve(new Response(bodyBytes.byteLength?bodyBytes:null,{status:Number(payload.status||200),statusText:String(payload.statusText||''),headers}));});"
        "const requestParentFetch=async (input,init)=>{const absoluteUrl=toAbsoluteUrl(input);const requestInit=Object.assign({},init||{});const method=String(requestInit.method||((typeof Request!=='undefined'&&input instanceof Request)?input.method:'GET')||'GET').toUpperCase();const baseHeaders=requestInit.headers||((typeof Request!=='undefined'&&input instanceof Request)?input.headers:undefined)||{};const headers=new Headers(baseHeaders);const bodyPayload=await encodeBodyValue(requestInit.body);const requestId=`task-runtime:${previewKey}:${Date.now()}:${runtimeRequestSeq+=1}`;return await new Promise((resolve,reject)=>{pendingRuntimeRequests.set(requestId,{resolve,reject});try{if(window.parent&&window.parent!==window){window.parent.postMessage({source:'learnsite-task-runtime-request',requestId,previewKey,taskId:Number(context.taskId||0),url:absoluteUrl,method,headers:Object.fromEntries(headers.entries()),bodyKind:bodyPayload.kind,bodyValue:bodyPayload.value,bodyMimeType:bodyPayload.mimeType||''},previewParentOrigin||'*');return;}pendingRuntimeRequests.delete(requestId);reject(new Error('Preview parent is unavailable'));}catch(error){pendingRuntimeRequests.delete(requestId);reject(error instanceof Error?error:new Error('Preview parent is unavailable'));}});};"
        "const runtimeFetch=async (input,init)=>{const absoluteUrl=toAbsoluteUrl(input);const target=typeof input==='string'?input:((input&&input.url)||absoluteUrl);try{const response=taskBaseUrl&&absoluteUrl.startsWith(taskBaseUrl)?await requestParentFetch(input,init):await nativeFetch(input,init);if(response&&response.status>=400){reportPreviewIssue('http_error',`Request returned ${response.status}`,target);}return response;}catch(error){const message=error instanceof Error?error.message:String(error||'Request failed');reportPreviewIssue('fetch_error',message,target);throw error;}};"
        "window.__LEARNSITE_TASK_HELPERS__={"
        "fetch:runtimeFetch,"
        "async getJson(input,init){"
        "const response=await runtimeFetch(input,init);"
        "if(!response.ok){throw new Error((await response.text())||`Request failed: ${response.status}`);}"
        "return response.json();"
        "},"
        "async postJson(input,data,init){"
        "const options=Object.assign({},init||{});"
        "const headers=new Headers(options.headers||{});"
        "if(!headers.has('Content-Type')){headers.set('Content-Type','application/json');}"
        "options.method=options.method||'POST';"
        "options.headers=headers;"
        "options.body=JSON.stringify(data);"
        "return runtimeFetch(input,options);"
        "}"
        "};"
        "window.fetch=runtimeFetch;"
        "})();"
        "</script>"
    )

    head_open_match = re.search(r"<head\b[^>]*>", html_text, flags=re.IGNORECASE)
    if head_open_match:
        insert_at = head_open_match.end()
        return f"{html_text[:insert_at]}{runtime_block}{html_text[insert_at:]}"

    wrapped_runtime_block = f"<head>{runtime_block}</head>"
    html_open_match = re.search(r"<html\b[^>]*>", html_text, flags=re.IGNORECASE)
    if html_open_match:
        insert_at = html_open_match.end()
        return f"{html_text[:insert_at]}{wrapped_runtime_block}{html_text[insert_at:]}"

    doctype_match = re.search(r"<!doctype[^>]*>", html_text, flags=re.IGNORECASE)
    if doctype_match:
        insert_at = doctype_match.end()
        return f"{html_text[:insert_at]}{wrapped_runtime_block}{html_text[insert_at:]}"

    body_open_match = re.search(r"<body\b[^>]*>", html_text, flags=re.IGNORECASE)
    if body_open_match:
        insert_at = body_open_match.start()
        return f"{html_text[:insert_at]}{wrapped_runtime_block}{html_text[insert_at:]}"

    lowered = html_text.lower()
    body_index = lowered.find("</body>")
    if body_index >= 0:
        return f"{html_text[:body_index]}{runtime_block}{html_text[body_index:]}"

    return f"{runtime_block}{html_text}"


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


def default_course_content(plan: LessonPlan) -> str:
    return (
        f"<p>欢迎进入《{plan.title}》。</p>"
        f"<p>本课次属于“{plan.lesson.unit.title} / {plan.lesson.title}”，教师可以在这里发布导读、步骤说明、图片或参考资料。</p>"
    )


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
    request: Request | None = None,
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
        "config": serialize_task_config(task, request),
        "is_required": task.is_required,
        "course": {
            "id": plan.id,
            "title": plan.title,
            "assigned_date": plan.assigned_date.isoformat(),
            "lesson_title": lesson.title,
            "unit_title": lesson.unit.title,
            "book_title": lesson.unit.book.name,
            "content": plan.content or default_course_content(plan),
        },
        "submission_policy": {
            "direct_submit": True,
            "allow_resubmit_until_reviewed": True,
            "draft_enabled": is_group_submission_task(task),
        },
        "resources": serialize_task_resources(task),
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
    ensure_student_can_access_task(student, task, db)
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
            request=request,
        )
    )


@router.post("/{task_id}/runtime-session", response_model=ApiResponse)
def create_task_runtime_session(
    task_id: int,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    ensure_user_can_access_task(user, task, db, allow_staff=True)
    runtime_token, expires_at = create_task_runtime_token(
        user_id=user.id,
        user_type=user.user_type,
        username=user.username,
        task_id=task.id,
        ttl_seconds=TASK_RUNTIME_COOKIE_MAX_AGE,
    )
    response.set_cookie(
        key=TASK_RUNTIME_COOKIE_NAME,
        value=runtime_token,
        max_age=TASK_RUNTIME_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path=f"/api/v1/tasks/{task.id}/",
    )
    return ApiResponse(
        data={
            "task_id": task.id,
            "expires_at": expires_at.isoformat(),
            "asset_base_path": build_absolute_api_url(request, f"/api/v1/tasks/{task.id}/assets"),
        }
    )


@router.get("/{task_id}/assets/{slot}/{asset_path:path}")
def task_asset_file(
    task_id: int,
    slot: str,
    asset_path: str,
    request: Request,
    db: Session = Depends(get_db),
):
    task = load_task(task_id, db)
    normalized_slot = slot.strip().lower()
    if normalized_slot not in SUPPORTED_TASK_ASSET_SLOTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    if normalized_slot not in allowed_asset_slots_for_task(task):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    runtime_user = parse_task_runtime_user(request, task, db, enforce_task_access=False)
    access_token_user: User | None = None
    if runtime_user is None:
        access_token_user = parse_access_token_user(extract_request_access_token(request), db)
    active_user = runtime_user or access_token_user
    if active_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")
    if not allows_runtime_preview_without_assignment(request, task, active_user):
        ensure_user_can_access_task(active_user, task, db, allow_staff=True)

    try:
        normalized_path = normalize_relative_path(asset_path)
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

    if is_html_asset(asset, file_path):
        html_bytes = file_path.read_bytes()
        html_text, encoding = decode_html_asset_bytes(html_bytes)
        runtime_context = build_task_runtime_context(task, normalized_slot, normalized_path, request)
        response = Response(
            content=inject_task_runtime_context(html_text, runtime_context).encode(encoding, errors="replace"),
            media_type=f"text/html; charset={encoding}",
        )
    else:
        response = FileResponse(path=file_path, media_type=asset.content_type, filename=asset.original_name)

    if access_token_user is not None:
        set_task_runtime_cookie(response, access_token_user, task)

    return response


@router.get("/{task_id}/discussion", response_model=ApiResponse)
def task_discussion_feed(
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    ensure_user_can_access_task(user, task, db, allow_staff=True)
    if (task.task_type or "").strip().lower() != "discussion":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是讨论任务")

    config = parse_task_config(task)
    topic = str(config.get("topic") or "").strip() or task.title

    posts = list(
        db.scalars(
            select(TaskDiscussionPost)
            .where(TaskDiscussionPost.task_id == task_id, TaskDiscussionPost.parent_post_id.is_(None))
            .options(
                selectinload(TaskDiscussionPost.author).selectinload(User.student_profile),
                selectinload(TaskDiscussionPost.replies)
                .selectinload(TaskDiscussionPost.author)
                .selectinload(User.student_profile),
            )
            .order_by(TaskDiscussionPost.created_at.asc(), TaskDiscussionPost.id.asc())
        ).all()
    )

    return ApiResponse(
        data={
            "task_id": task_id,
            "topic": topic,
            "count": len(posts),
            "items": [
                {
                    **serialize_discussion_post(post),
                    "replies": [serialize_discussion_post(reply) for reply in sorted(post.replies, key=lambda item: item.id)],
                }
                for post in posts
            ],
        }
    )


@router.post("/{task_id}/discussion/posts", response_model=ApiResponse)
def create_task_discussion_post(
    task_id: int,
    payload: TaskDiscussionPostCreateRequest,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    ensure_student_can_access_task(student, task, db)
    if (task.task_type or "").strip().lower() != "discussion":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是讨论任务")

    content = normalize_discussion_content(payload.content)
    if content is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="回复内容不能为空")

    parent_post: TaskDiscussionPost | None = None
    if payload.parent_post_id is not None:
        parent_post = db.get(TaskDiscussionPost, payload.parent_post_id)
        if parent_post is None or parent_post.task_id != task_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="讨论主题不存在")
        if parent_post.parent_post_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前版本只支持一级回复")

    post = TaskDiscussionPost(
        task_id=task_id,
        parent_post_id=parent_post.id if parent_post else None,
        author_user_id=student.id,
        content=content,
    )
    db.add(post)
    db.flush()

    # Keep discussion replies visible in teacher grading pages that rely on Submission rows.
    # For discussion tasks, each student maintains one submission snapshot with latest reply content.
    submission, group_membership = load_task_submission_for_student(task, student, db)
    now = datetime.now()
    if submission is None:
        submission = Submission(
            id=next_submission_id(db),
            task_id=task.id,
            student_id=student.id,
            group_id=group_membership.group_id if group_membership is not None else None,
            submit_status="submitted",
            score=None,
            is_recommended=False,
            peer_review_score=None,
            submission_note=content,
            teacher_comment=None,
            submitted_at=now,
        )
        db.add(submission)
    else:
        submission.student_id = student.id
        submission.group_id = group_membership.group_id if group_membership is not None else None
        submission.submission_note = content
        submission.submitted_at = now
        if submission.submit_status != "reviewed":
            submission.submit_status = "submitted"

    sync_student_lesson_plan_progress(task, student, db)
    db.commit()

    latest_post = db.scalar(
        select(TaskDiscussionPost)
        .where(TaskDiscussionPost.id == post.id)
        .options(selectinload(TaskDiscussionPost.author).selectinload(User.student_profile))
    )
    if latest_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="讨论回复不存在")

    return ApiResponse(message="讨论回复已发布", data=serialize_discussion_post(latest_post))


@router.post("/{task_id}/data-submit/{endpoint_token}", response_model=ApiResponse)
def submit_task_data_payload(
    task_id: int,
    endpoint_token: str,
    request: Request,
    payload: dict[str, object] | list[object] = Body(...),
    source_label: str = Query(default="web", max_length=80),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    if (task.task_type or "").strip().lower() != "data_submit":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是数据提交任务")

    config = parse_task_config(task)
    expected_token = str(config.get("endpoint_token") or "").strip()
    if not expected_token or expected_token != endpoint_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="数据提交接口不存在")

    user = parse_task_runtime_user(request, task, db, enforce_task_access=False)
    if user is None:
        user = parse_access_token_user(extract_request_access_token(request), db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")
    if not allows_runtime_preview_without_assignment(request, task, user):
        ensure_user_can_access_task(user, task, db, allow_staff=True)
    submitted_by_user_id: int | None = user.id

    serialized_payload = json.dumps(payload, ensure_ascii=False)
    if len(serialized_payload) > 200_000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="提交数据体积过大")

    item = TaskDataSubmission(
        task_id=task_id,
        submitted_by_user_id=submitted_by_user_id,
        source_label=source_label.strip() or "web",
        payload_json=serialized_payload,
    )
    db.add(item)
    db.flush()
    if user.user_type == "student":
        sync_student_lesson_plan_progress(task, user, db)
    db.commit()

    return ApiResponse(
        message="数据提交成功",
        data={
            "task_id": task_id,
            "submission_id": item.id,
            "submitted_by_user_id": submitted_by_user_id,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        },
    )


@router.get("/{task_id}/data-submit/{endpoint_token}/records", response_model=ApiResponse)
def data_submit_records(
    task_id: int,
    endpoint_token: str,
    request: Request,
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    user = parse_task_runtime_user(request, task, db, enforce_task_access=False)
    if user is None:
        user = parse_access_token_user(extract_request_access_token(request), db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")
    if not allows_runtime_preview_without_assignment(request, task, user):
        ensure_user_can_access_task(user, task, db, allow_staff=True)
    if (task.task_type or "").strip().lower() != "data_submit":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前任务不是数据提交任务")

    config = parse_task_config(task)
    expected_token = str(config.get("endpoint_token") or "").strip()
    if not expected_token or expected_token != endpoint_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="数据接口不存在")

    items = list(
        db.scalars(
            select(TaskDataSubmission)
            .where(TaskDataSubmission.task_id == task_id)
            .options(selectinload(TaskDataSubmission.submitted_by_user).selectinload(User.student_profile))
            .order_by(TaskDataSubmission.created_at.desc(), TaskDataSubmission.id.desc())
            .limit(limit)
        ).all()
    )

    records: list[dict[str, object]] = []
    for item in items:
        parsed_payload: object
        try:
            parsed_payload = json.loads(item.payload_json)
        except json.JSONDecodeError:
            parsed_payload = item.payload_json
        user = item.submitted_by_user
        profile = user.student_profile if user else None
        records.append(
            {
                "id": item.id,
                "task_id": item.task_id,
                "source_label": item.source_label,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "submitted_by": {
                    "user_id": user.id if user else None,
                    "display_name": user.display_name if user else None,
                    "student_no": profile.student_no if profile else None,
                    "user_type": user.user_type if user else None,
                },
                "payload": parsed_payload,
            }
        )

    return ApiResponse(data={"task_id": task_id, "count": len(records), "items": records})


@router.get("/{task_id}/prerequisites", response_model=ApiResponse)
def task_prerequisites(
    task_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    ensure_student_can_access_task(student, task, db)
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
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task = load_task(task_id, db)
    ensure_student_can_access_task(student, task, db)
    if task.task_type != "reading":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有阅读任务支持已读确认")

    read_record = load_task_read_record(task.id, student.id, db)
    if read_record is None:
        db.add(TaskReadRecord(task_id=task.id, student_id=student.id, read_at=datetime.now()))
        db.flush()

    sync_student_lesson_plan_progress(task, student, db)
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
            request=request,
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
    ensure_student_can_access_task(student, task, db)
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
    ensure_student_can_access_task(student, task, db)
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
    ensure_student_can_access_task(student, task, db)
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
    sync_student_lesson_plan_progress(task, student, db)
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
            request=request,
        ),
    )


