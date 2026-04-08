from __future__ import annotations

from datetime import datetime
import json
import re
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import get_current_user, require_staff
from app.api.deps.db import get_db
from app.models import (
    AIProvider,
    ClassroomSession,
    CurriculumLesson,
    CurriculumUnit,
    LessonPlan,
    SchoolClass,
    StudentLessonPlanProgress,
    SystemSetting,
    Task,
    User,
)
from app.schemas.common import ApiResponse
from app.services.remote_request_headers import build_remote_request_headers
from app.services.assistant_settings import (
    read_assistant_prompt_settings,
    read_assistant_runtime_settings,
)
from app.services.staff_access import get_accessible_class_ids, is_admin_staff, staff_can_access_class
from app.services.system_settings import read_system_settings

router = APIRouter()

MAX_HISTORY_MESSAGES = 8
MAX_CONVERSATION_CHARS = 4000
DEFAULT_GENERAL_KNOWLEDGE_BASE_IDS = ["platform-guide", "study-methods"]
DEFAULT_LESSON_KNOWLEDGE_BASE_IDS = ["lesson-plan", "task-guidance"]
KNOWLEDGE_BASES = [
    {
        "id": "platform-guide",
        "name": "平台使用指南",
        "description": "回答登录、课程进入、提交作业、课堂流程等平台操作问题。",
        "scopes": ["general"],
    },
    {
        "id": "study-methods",
        "name": "学习方法库",
        "description": "提供任务拆解、学习步骤、反思结构与表达建议。",
        "scopes": ["general", "lesson"],
    },
    {
        "id": "lesson-plan",
        "name": "当前学案知识库",
        "description": "优先引用当前课程、课次、学案正文与课堂上下文。",
        "scopes": ["lesson"],
    },
    {
        "id": "task-guidance",
        "name": "任务提示库",
        "description": "聚焦任务要求、提交方式、评分关注点与完成路径。",
        "scopes": ["lesson"],
    },
    {
        "id": "teacher-coaching",
        "name": "教师备课建议库",
        "description": "帮助教师生成提问、分层提示、课堂讲解与点评话术。",
        "scopes": ["general", "lesson"],
    },
    {
        "id": "classroom-routines",
        "name": "课堂流程库",
        "description": "围绕课堂节奏、机房秩序、分组协作与课堂开关给出建议。",
        "scopes": ["lesson"],
    },
]
LESSON_AGENT_BINDINGS_KEY = "lesson_agent_bindings"


class CompanionConversationMessagePayload(BaseModel):
    role: str = Field(min_length=1, max_length=20)
    content: str = Field(default="", max_length=10000)


class CompanionAttachmentPayload(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mime_type: str | None = Field(default=None, max_length=120)
    size_kb: int = Field(default=0, ge=0, le=10240)
    kind: str = Field(default="file", min_length=1, max_length=30)
    text_content: str | None = Field(default=None, max_length=12000)
    data_url: str | None = Field(default=None, max_length=3_000_000)


class CompanionRespondPayload(BaseModel):
    scope: str = Field(min_length=1, max_length=20)
    message: str = Field(default="", max_length=12000)
    provider_id: int | None = Field(default=None, ge=1)
    stream: bool = False
    knowledge_base_ids: list[str] = Field(default_factory=list, max_length=10)
    course_id: int | None = Field(default=None, ge=1)
    task_id: int | None = Field(default=None, ge=1)
    plan_id: int | None = Field(default=None, ge=1)
    session_id: int | None = Field(default=None, ge=1)
    attachments: list[CompanionAttachmentPayload] = Field(default_factory=list, max_length=8)
    conversation: list[CompanionConversationMessagePayload] = Field(default_factory=list, max_length=24)


class LessonAgentBindingPayload(BaseModel):
    binding_id: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    plan_id: int = Field(ge=1)
    class_id: int | None = Field(default=None, ge=1)
    knowledge_base_ids: list[str] = Field(default_factory=list, max_length=10)
    prompt_template: str = Field(default="", max_length=8000)
    is_enabled: bool = True


def read_assistant_enabled(db: Session) -> bool:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == "assistant_enabled"))
    if row is None:
        return True
    return (row.setting_value or "").strip().lower() == "true"


def serialize_provider(provider: AIProvider) -> dict:
    return {
        "id": provider.id,
        "name": provider.name,
        "provider_type": provider.provider_type,
        "base_url": provider.base_url,
        "model_name": provider.model_name,
        "is_default": provider.is_default,
    }


def enabled_provider_rows(db: Session) -> list[AIProvider]:
    return list(
        db.scalars(
            select(AIProvider)
            .where(AIProvider.is_enabled == True)  # noqa: E712
            .order_by(AIProvider.is_default.desc(), AIProvider.id.asc())
        ).all()
    )


def resolve_provider(db: Session, preferred_provider_id: int | None = None) -> AIProvider | None:
    providers = enabled_provider_rows(db)
    if not providers:
        return None
    if preferred_provider_id is None:
        return providers[0]
    return next((provider for provider in providers if provider.id == preferred_provider_id), None)


def normalize_scope(scope: str) -> str:
    normalized = scope.strip().lower()
    if normalized not in {"general", "lesson"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported AI companion scope")
    return normalized


def lesson_plan_with_relations(plan_id: int, db: Session) -> LessonPlan | None:
    return db.scalar(
        select(LessonPlan)
        .where(LessonPlan.id == plan_id)
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
        )
    )


def task_with_relations(task_id: int, db: Session) -> Task | None:
    return db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
        )
    )


def classroom_session_with_relations(session_id: int, db: Session) -> ClassroomSession | None:
    return db.scalar(
        select(ClassroomSession)
        .where(ClassroomSession.id == session_id)
        .options(
            selectinload(ClassroomSession.school_class),
            selectinload(ClassroomSession.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
        )
    )


def ensure_student_can_access_plan(student: User, plan_id: int, db: Session) -> None:
    progress_exists = db.scalar(
        select(StudentLessonPlanProgress.id).where(
            StudentLessonPlanProgress.student_id == student.id,
            StudentLessonPlanProgress.plan_id == plan_id,
        )
    )
    if progress_exists is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user cannot access this lesson plan")


def ensure_session_access(user: User, session: ClassroomSession, db: Session) -> None:
    if user.user_type == "student":
        student_profile = user.student_profile
        if student_profile is None or student_profile.class_id != session.class_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user cannot access this classroom")
        return

    if not staff_can_access_class(user, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current user cannot access this classroom")


def excerpt_text(value: str | None, limit: int = 180) -> str:
    if not value:
        return ""
    plain_text = re.sub(r"<[^>]+>", " ", value).replace("&nbsp;", " ")
    normalized = " ".join(plain_text.replace("\r", " ").replace("\n", " ").split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1]}…"


def serialize_task_summary(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "task_type": task.task_type,
        "sort_order": task.sort_order,
        "is_required": task.is_required,
    }


def context_prompt_for_user(user: User, kind_label: str) -> str:
    if user.user_type == "student":
        return f"当前是 {kind_label} 学伴模式，我会优先解释要求、拆分步骤，并尽量用提示代替直接给答案。"
    return f"当前是 {kind_label} 学伴模式，我会围绕课堂讲解、提问设计、点评和备课建议来回答。"


def plan_context_payload(plan: LessonPlan, user: User, *, kind: str) -> dict:
    lesson = plan.lesson
    unit = lesson.unit
    book = unit.book
    return {
        "kind": kind,
        "route_key": f"{kind}:{plan.id}",
        "title": plan.title,
        "subtitle": f"{book.name} / {unit.title} / {lesson.title}",
        "description": excerpt_text(plan.content or lesson.summary),
        "coach_mode": "student_hint" if user.user_type == "student" else "staff_coach",
        "recommended_knowledge_base_ids": DEFAULT_LESSON_KNOWLEDGE_BASE_IDS,
        "suggested_questions": [
            "帮我概括当前学案的学习目标",
            "请把这节课要完成的任务拆成 3 步",
            "有哪些容易出错的地方需要提前提醒",
        ],
        "identifiers": {
            "course_id": plan.id,
            "task_id": None,
            "plan_id": plan.id,
            "session_id": None,
            "lesson_id": lesson.id,
        },
        "lesson": {
            "id": lesson.id,
            "title": lesson.title,
            "unit_title": unit.title,
            "book_title": book.name,
        },
        "classroom": None,
        "tasks": [serialize_task_summary(task) for task in sorted(plan.tasks, key=lambda item: (item.sort_order, item.id))],
        "prompt_hint": context_prompt_for_user(user, "当前学案"),
    }


def task_context_payload(task: Task, user: User) -> dict:
    plan = task.lesson_plan
    context = plan_context_payload(plan, user, kind="task")
    context["route_key"] = f"task:{task.id}"
    context["title"] = task.title
    context["description"] = excerpt_text(task.description or plan.content)
    context["recommended_knowledge_base_ids"] = ["lesson-plan", "task-guidance", "study-methods"]
    context["suggested_questions"] = [
        "这道任务真正要交付什么",
        "先做哪一步最合适",
        "请给我只提示不直给答案的帮助",
    ]
    context["identifiers"]["task_id"] = task.id
    context["prompt_hint"] = context_prompt_for_user(user, "当前任务")
    return context


def session_context_payload(session: ClassroomSession, user: User) -> dict:
    plan = session.lesson_plan
    context = plan_context_payload(plan, user, kind="session")
    context["route_key"] = f"session:{session.id}"
    context["title"] = f"{session.school_class.class_name} · {plan.title}"
    context["subtitle"] = f"{session.school_class.class_name} / {plan.lesson.unit.book.name} / {plan.lesson.title}"
    context["recommended_knowledge_base_ids"] = ["lesson-plan", "classroom-routines", "teacher-coaching"]
    context["suggested_questions"] = (
        [
            "帮我设计这节课的 3 个追问问题",
            "请给出课堂提醒与节奏建议",
            "如果学生卡住了，先提示什么",
        ]
        if user.user_type == "staff"
        else [
            "老师这节课最希望我完成什么",
            "我现在应该先做哪一项任务",
            "请给我一个不直接给答案的提示",
        ]
    )
    context["identifiers"]["session_id"] = session.id
    context["classroom"] = {
        "id": session.school_class.id,
        "name": session.school_class.class_name,
        "status": session.status,
        "started_at": session.started_at.isoformat(),
    }
    context["prompt_hint"] = context_prompt_for_user(user, "当前课堂")
    return context


def resolve_context_payload(
    user: User,
    db: Session,
    *,
    course_id: int | None = None,
    task_id: int | None = None,
    plan_id: int | None = None,
    session_id: int | None = None,
) -> dict | None:
    if task_id is not None:
        task = task_with_relations(task_id, db)
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        if user.user_type == "student":
            ensure_student_can_access_plan(user, task.plan_id, db)
        return task_context_payload(task, user)

    if session_id is not None:
        session = classroom_session_with_relations(session_id, db)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom session not found")
        ensure_session_access(user, session, db)
        return session_context_payload(session, user)

    target_plan_id = plan_id or course_id
    if target_plan_id is None:
        return None

    plan = lesson_plan_with_relations(target_plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson plan not found")
    if user.user_type == "student":
        ensure_student_can_access_plan(user, plan.id, db)
    return plan_context_payload(plan, user, kind="course" if course_id is not None else "plan")


def knowledge_base_lookup() -> dict[str, dict]:
    return {item["id"]: item for item in KNOWLEDGE_BASES}


def selected_knowledge_bases(selected_ids: list[str], scope: str) -> list[dict]:
    lookup = knowledge_base_lookup()
    fallback_ids = DEFAULT_LESSON_KNOWLEDGE_BASE_IDS if scope == "lesson" else DEFAULT_GENERAL_KNOWLEDGE_BASE_IDS
    resolved_ids = selected_ids or fallback_ids
    return [lookup[item_id] for item_id in resolved_ids if item_id in lookup]


def normalize_lesson_agent_binding(raw_item: Any) -> dict | None:
    if not isinstance(raw_item, dict):
        return None

    try:
        plan_id = int(raw_item.get("plan_id") or 0)
    except (TypeError, ValueError):
        return None
    if plan_id <= 0:
        return None

    class_id: int | None = None
    raw_class_id = raw_item.get("class_id")
    if raw_class_id not in {None, ""}:
        try:
            parsed_class_id = int(raw_class_id)
        except (TypeError, ValueError):
            parsed_class_id = 0
        class_id = parsed_class_id if parsed_class_id > 0 else None

    kb_lookup = knowledge_base_lookup()
    normalized_kbs: list[str] = []
    for value in raw_item.get("knowledge_base_ids") or []:
        if not isinstance(value, str):
            continue
        item = value.strip()
        if item and item in kb_lookup and item not in normalized_kbs:
            normalized_kbs.append(item)

    binding_id = str(raw_item.get("binding_id") or "").strip() or f"binding-{plan_id}-{class_id or 'all'}"
    owner_staff_id: int | None = None
    raw_owner_id = raw_item.get("owner_staff_id")
    if raw_owner_id not in {None, ""}:
        try:
            parsed_owner_id = int(raw_owner_id)
        except (TypeError, ValueError):
            parsed_owner_id = 0
        owner_staff_id = parsed_owner_id if parsed_owner_id > 0 else None

    updated_at = str(raw_item.get("updated_at") or "").strip()
    if not updated_at:
        updated_at = datetime.now().isoformat(timespec="seconds")

    return {
        "binding_id": binding_id,
        "name": str(raw_item.get("name") or "课时智能体").strip() or "课时智能体",
        "plan_id": plan_id,
        "class_id": class_id,
        "knowledge_base_ids": normalized_kbs,
        "prompt_template": str(raw_item.get("prompt_template") or "").strip(),
        "is_enabled": bool(raw_item.get("is_enabled", True)),
        "owner_staff_id": owner_staff_id,
        "updated_at": updated_at,
    }


def read_lesson_agent_bindings(db: Session) -> list[dict]:
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == LESSON_AGENT_BINDINGS_KEY))
    if row is None or not (row.setting_value or "").strip():
        return []

    try:
        payload = json.loads(row.setting_value)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []

    bindings: list[dict] = []
    for raw_item in payload:
        normalized = normalize_lesson_agent_binding(raw_item)
        if normalized is not None:
            bindings.append(normalized)
    return bindings


def write_lesson_agent_bindings(bindings: list[dict], db: Session) -> None:
    serialized = json.dumps(bindings, ensure_ascii=False)
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == LESSON_AGENT_BINDINGS_KEY))
    if row is None:
        row = SystemSetting(setting_key=LESSON_AGENT_BINDINGS_KEY, setting_value=serialized)
        db.add(row)
    else:
        row.setting_value = serialized


def lesson_agent_binding_sort_key(binding: dict) -> datetime:
    updated_at = str(binding.get("updated_at") or "").strip()
    if not updated_at:
        return datetime.min
    try:
        return datetime.fromisoformat(updated_at)
    except ValueError:
        return datetime.min


def build_staff_lesson_agent_payload(staff: User, db: Session) -> dict:
    accessible_class_ids = sorted(get_accessible_class_ids(staff, db))
    classes = (
        db.scalars(
            select(SchoolClass)
            .where(SchoolClass.id.in_(accessible_class_ids or [-1]))
            .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
        ).all()
        if accessible_class_ids
        else []
    )
    plans = db.scalars(
        select(LessonPlan)
        .where(LessonPlan.status.in_(("published", "active")))
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
        )
        .order_by(LessonPlan.assigned_date.desc(), LessonPlan.id.desc())
    ).all()
    plan_by_id = {item.id: item for item in plans}
    class_by_id = {item.id: item for item in classes}

    all_bindings = read_lesson_agent_bindings(db)
    if is_admin_staff(staff):
        visible_bindings = list(all_bindings)
    else:
        visible_bindings = [item for item in all_bindings if item.get("owner_staff_id") == staff.id]
    visible_bindings.sort(key=lesson_agent_binding_sort_key, reverse=True)

    return {
        "classes": [
            {
                "id": item.id,
                "class_name": item.class_name,
                "grade_no": item.grade_no,
                "class_no": item.class_no,
            }
            for item in classes
        ],
        "plans": [
            {
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "assigned_date": item.assigned_date.isoformat(),
                "lesson_title": item.lesson.title,
                "unit_title": item.lesson.unit.title,
                "book_title": item.lesson.unit.book.name,
            }
            for item in plans
        ],
        "knowledge_bases": KNOWLEDGE_BASES,
        "bindings": [
            {
                **item,
                "class_name": (
                    class_by_id[item["class_id"]].class_name
                    if item.get("class_id") in class_by_id
                    else "全部班级"
                ),
                "plan_title": (
                    plan_by_id[item["plan_id"]].title
                    if item.get("plan_id") in plan_by_id
                    else f"学案 {item.get('plan_id')}"
                ),
                "lesson_title": (
                    plan_by_id[item["plan_id"]].lesson.title
                    if item.get("plan_id") in plan_by_id
                    else None
                ),
                "owner_editable": is_admin_staff(staff) or item.get("owner_staff_id") == staff.id,
            }
            for item in visible_bindings
        ],
    }


def resolve_lesson_agent_binding_for_context(user: User, context: dict | None, db: Session) -> dict | None:
    if context is None:
        return None

    identifiers = context.get("identifiers") or {}
    plan_id = identifiers.get("plan_id")
    if not isinstance(plan_id, int) or plan_id <= 0:
        return None

    class_id: int | None = None
    classroom = context.get("classroom")
    if isinstance(classroom, dict):
        raw_class_id = classroom.get("id")
        if isinstance(raw_class_id, int) and raw_class_id > 0:
            class_id = raw_class_id
    elif user.user_type == "student" and user.student_profile is not None:
        class_id = user.student_profile.class_id

    enabled_bindings = [item for item in read_lesson_agent_bindings(db) if item.get("is_enabled")]
    if not enabled_bindings:
        return None

    accessible_class_ids: set[int] | None = None
    if user.user_type == "staff" and not is_admin_staff(user):
        accessible_class_ids = set(get_accessible_class_ids(user, db))

    def visible_candidates(candidates: list[dict]) -> list[dict]:
        if user.user_type != "staff" or is_admin_staff(user):
            return candidates
        filtered: list[dict] = []
        class_scope = accessible_class_ids or set()
        for item in candidates:
            item_class_id = item.get("class_id")
            if item_class_id is None:
                if item.get("owner_staff_id") == user.id:
                    filtered.append(item)
                continue
            if item_class_id in class_scope:
                filtered.append(item)
        return filtered

    def pick_latest(candidates: list[dict]) -> dict | None:
        visible = visible_candidates(candidates)
        if not visible:
            return None
        visible.sort(key=lesson_agent_binding_sort_key, reverse=True)
        return visible[0]

    # Primary strategy: strict plan-level match, then same-plan global.
    plan_bindings = [item for item in enabled_bindings if item.get("plan_id") == plan_id]
    if class_id is not None:
        matched = pick_latest([item for item in plan_bindings if item.get("class_id") == class_id])
        if matched is not None:
            return matched
    matched = pick_latest([item for item in plan_bindings if item.get("class_id") is None] or plan_bindings)
    if matched is not None:
        return matched

    # Fallback strategy: same-class recent binding (cross-plan), then owner default.
    if class_id is not None:
        matched = pick_latest([item for item in enabled_bindings if item.get("class_id") == class_id])
        if matched is not None:
            return matched

    if user.user_type == "staff" and not is_admin_staff(user):
        matched = pick_latest([item for item in enabled_bindings if item.get("owner_staff_id") == user.id])
        if matched is not None:
            return matched

    return pick_latest([item for item in enabled_bindings if item.get("class_id") is None] or enabled_bindings)


def apply_lesson_agent_binding_to_context(context: dict | None, binding: dict | None) -> dict | None:
    if context is None or binding is None:
        return context

    next_context = {**context}
    if binding.get("knowledge_base_ids"):
        next_context["recommended_knowledge_base_ids"] = list(binding["knowledge_base_ids"])

    binding_hint = f"当前已绑定课时智能体：{binding.get('name') or '课时智能体'}。"
    prompt_hint = str(next_context.get("prompt_hint") or "").strip()
    if binding_hint not in prompt_hint:
        next_context["prompt_hint"] = f"{prompt_hint} {binding_hint}".strip()

    next_context["assistant_binding"] = {
        "binding_id": binding.get("binding_id"),
        "name": binding.get("name"),
        "plan_id": binding.get("plan_id"),
        "class_id": binding.get("class_id"),
        "is_enabled": binding.get("is_enabled", True),
        "updated_at": binding.get("updated_at"),
    }
    return next_context


@router.get("/staff/lesson-agents", response_model=ApiResponse)
def staff_lesson_agent_bootstrap(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    return ApiResponse(data=build_staff_lesson_agent_payload(staff, db))


@router.post("/staff/lesson-agents", response_model=ApiResponse)
def save_staff_lesson_agent_binding(
    payload: LessonAgentBindingPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    plan = lesson_plan_with_relations(payload.plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    school_class = None
    if payload.class_id is not None:
        school_class = db.get(SchoolClass, payload.class_id)
        if school_class is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")
        if not staff_can_access_class(staff, payload.class_id, db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权绑定该班级的课时智能体")
    elif not is_admin_staff(staff):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非管理员必须绑定到具体班级")

    editable_as_admin = is_admin_staff(staff)
    kb_lookup = knowledge_base_lookup()
    normalized_kbs = [item for item in payload.knowledge_base_ids if item in kb_lookup]
    now = datetime.now().isoformat(timespec="seconds")
    bindings = read_lesson_agent_bindings(db)

    target_binding: dict | None = None
    if payload.binding_id:
        target_binding = next(
            (item for item in bindings if item.get("binding_id") == payload.binding_id),
            None,
        )
        if target_binding is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课时智能体绑定不存在")
        if not editable_as_admin and target_binding.get("owner_staff_id") != staff.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权编辑该课时智能体绑定")
    else:
        target_binding = next(
            (
                item
                for item in bindings
                if item.get("owner_staff_id") == staff.id
                and item.get("plan_id") == payload.plan_id
                and item.get("class_id") == payload.class_id
            ),
            None,
        )

    if target_binding is None:
        binding_id = f"lagent-{int(datetime.now().timestamp())}-{payload.plan_id}-{payload.class_id or 'all'}"
        bindings.append(
            {
                "binding_id": binding_id,
                "name": payload.name.strip(),
                "plan_id": payload.plan_id,
                "class_id": payload.class_id,
                "knowledge_base_ids": normalized_kbs,
                "prompt_template": payload.prompt_template.strip(),
                "is_enabled": payload.is_enabled,
                "owner_staff_id": staff.id,
                "updated_at": now,
            }
        )
        message = "课时智能体绑定已创建"
    else:
        target_binding["name"] = payload.name.strip()
        target_binding["plan_id"] = payload.plan_id
        target_binding["class_id"] = payload.class_id
        target_binding["knowledge_base_ids"] = normalized_kbs
        target_binding["prompt_template"] = payload.prompt_template.strip()
        target_binding["is_enabled"] = payload.is_enabled
        target_binding["updated_at"] = now
        if editable_as_admin and target_binding.get("owner_staff_id") is None:
            target_binding["owner_staff_id"] = staff.id
        message = "课时智能体绑定已更新"

    write_lesson_agent_bindings(bindings, db)
    db.commit()
    class_name = school_class.class_name if school_class is not None else "全部班级"
    return ApiResponse(
        message=f"{message}（{class_name} · {plan.title}）",
        data=build_staff_lesson_agent_payload(staff, db),
    )


@router.delete("/staff/lesson-agents/{binding_id}", response_model=ApiResponse)
def delete_staff_lesson_agent_binding(
    binding_id: str,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    bindings = read_lesson_agent_bindings(db)
    target = next((item for item in bindings if item.get("binding_id") == binding_id), None)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课时智能体绑定不存在")
    if not is_admin_staff(staff) and target.get("owner_staff_id") != staff.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该课时智能体绑定")

    next_bindings = [item for item in bindings if item.get("binding_id") != binding_id]
    write_lesson_agent_bindings(next_bindings, db)
    db.commit()
    return ApiResponse(
        message="课时智能体绑定已删除",
        data=build_staff_lesson_agent_payload(staff, db),
    )


def provider_is_demo(provider: AIProvider | None) -> bool:
    if provider is None:
        return True
    base_url = (provider.base_url or "").lower()
    api_key = (provider.api_key or "").lower()
    return "example.com" in base_url or api_key.startswith("demo-") or api_key == "demo-key-change-me"


def build_system_prompt(
    user: User,
    scope: str,
    knowledge_bases: list[dict],
    context: dict | None,
    prompt_settings: dict[str, str],
    platform_name: str,
    lesson_binding_prompt: str | None = None,
) -> str:
    role_label = "学生" if user.user_type == "student" else "教师"
    kb_names = "、".join(item["name"] for item in knowledge_bases) or "未指定知识库"
    prompt_parts = [
        f"你是 {platform_name} 的 AI 学伴，服务对象是 {role_label}。",
        f"当前模式是 {'当前课程学案学伴' if scope == 'lesson' else '通用学伴'}。",
        f"优先参考这些知识库：{kb_names}。",
    ]

    if scope == "lesson":
        if user.user_type == "student":
            prompt_parts.append("请解释学案与任务要求，优先给提示、步骤和检查点，不要直接代写完整答案或完整代码。")
        else:
            prompt_parts.append("请围绕当前课堂或学案，帮助教师组织讲解、提问、点评与分层提示。")
    else:
        prompt_parts.append("可以回答平台使用、学习方法、课堂组织与一般性课程相关问题。")

    if context is not None:
        prompt_parts.append(f"当前页面上下文标题：{context['title']}。")
        prompt_parts.append(f"当前页面上下文摘要：{context['subtitle']}。")
        if context.get("description"):
            prompt_parts.append(f"当前页面补充说明：{context['description']}。")

    custom_prompt = (
        prompt_settings.get("lesson_prompt", "")
        if scope == "lesson"
        else prompt_settings.get("general_prompt", "")
    ).strip()
    if scope == "lesson" and (lesson_binding_prompt or "").strip():
        prompt_parts.append(f"Lesson binding instruction: {lesson_binding_prompt.strip()}")
    if custom_prompt:
        prompt_parts.append(f"Additional admin instruction: {custom_prompt}")

    return " ".join(prompt_parts)


def build_user_prompt(
    user: User,
    message: str,
    knowledge_bases: list[dict],
    context: dict | None,
    attachments: list[CompanionAttachmentPayload],
) -> str:
    question = message.strip() or "请结合附件给我建议。"
    lines = [
        f"提问用户：{user.display_name}",
        f"问题：{question}",
    ]

    if context is not None:
        lines.append(f"当前上下文：{context['title']} / {context['subtitle']}")
        if context.get("description"):
            lines.append(f"上下文说明：{context['description']}")

    if knowledge_bases:
        lines.append(f"已选知识库：{'、'.join(item['name'] for item in knowledge_bases)}")

    if attachments:
        lines.append("附件摘要：")
        for attachment in attachments:
            attachment_line = f"- {attachment.name} ({attachment.mime_type or 'application/octet-stream'}, {attachment.size_kb} KB)"
            if attachment.text_content:
                attachment_line += f"；文本摘录：{excerpt_text(attachment.text_content, 260)}"
            lines.append(attachment_line)

    return "\n".join(lines)


def build_chat_messages(
    system_prompt: str,
    user_prompt: str,
    history: list[CompanionConversationMessagePayload],
    attachments: list[CompanionAttachmentPayload],
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]

    for item in history[-MAX_HISTORY_MESSAGES:]:
        role = item.role.strip().lower()
        if role not in {"assistant", "user"}:
            continue
        content = item.content.strip()
        if not content:
            continue
        messages.append({"role": role, "content": content[:MAX_CONVERSATION_CHARS]})

    image_items = [
        {
            "type": "image_url",
            "image_url": {"url": attachment.data_url},
        }
        for attachment in attachments
        if attachment.data_url and (attachment.mime_type or "").startswith("image/")
    ]
    if image_items:
        messages.append({"role": "user", "content": [{"type": "text", "text": user_prompt}, *image_items]})
    else:
        messages.append({"role": "user", "content": user_prompt})

    return messages


def chat_completions_url(provider: AIProvider) -> str:
    base_url = provider.base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url}/chat/completions"


def extract_provider_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        texts = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                texts.append(text.strip())
        return "\n".join(texts).strip()

    return ""


def extract_provider_stream_text(content: Any) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text
        return ""

    if isinstance(content, list):
        texts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str):
                texts.append(text)
        return "".join(texts)

    return ""


def sse_event(event_name: str, data: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def build_runtime_generation_params(runtime_settings: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "temperature": float(runtime_settings.get("temperature", 0.4)),
    }

    top_p = runtime_settings.get("top_p")
    if isinstance(top_p, (int, float)):
        payload["top_p"] = float(top_p)

    max_tokens = runtime_settings.get("max_tokens")
    if isinstance(max_tokens, int) and max_tokens > 0:
        payload["max_tokens"] = max_tokens

    presence_penalty = runtime_settings.get("presence_penalty")
    if isinstance(presence_penalty, (int, float)):
        payload["presence_penalty"] = float(presence_penalty)

    frequency_penalty = runtime_settings.get("frequency_penalty")
    if isinstance(frequency_penalty, (int, float)):
        payload["frequency_penalty"] = float(frequency_penalty)

    return payload


def call_openai_compatible_provider(
    provider: AIProvider,
    *,
    system_prompt: str,
    user_prompt: str,
    history: list[CompanionConversationMessagePayload],
    attachments: list[CompanionAttachmentPayload],
    runtime_settings: dict[str, Any],
) -> tuple[str | None, str | None]:
    payload = {
        "model": provider.model_name,
        "messages": build_chat_messages(system_prompt, user_prompt, history, attachments),
        **build_runtime_generation_params(runtime_settings),
    }
    request = urllib_request.Request(
        chat_completions_url(provider),
        data=json.dumps(payload).encode("utf-8"),
        headers=build_remote_request_headers(
            provider.api_key,
            content_type="application/json",
        ),
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=20) as response:
            raw_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body)
            return None, payload.get("error", {}).get("message") or payload.get("message") or body
        except json.JSONDecodeError:
            return None, body or f"Provider request failed with status {exc.code}"
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        return None, str(exc)

    choices = raw_payload.get("choices") or []
    if not choices:
        return None, "Provider returned an empty completion result"

    message = choices[0].get("message") or {}
    content = extract_provider_text(message.get("content"))
    if not content:
        return None, "Provider returned an empty message"
    return content, None


def call_openai_compatible_provider_stream(
    provider: AIProvider,
    *,
    system_prompt: str,
    user_prompt: str,
    history: list[CompanionConversationMessagePayload],
    attachments: list[CompanionAttachmentPayload],
    runtime_settings: dict[str, Any],
):
    payload = {
        "model": provider.model_name,
        "messages": build_chat_messages(system_prompt, user_prompt, history, attachments),
        **build_runtime_generation_params(runtime_settings),
        "stream": True,
    }
    request = urllib_request.Request(
        chat_completions_url(provider),
        data=json.dumps(payload).encode("utf-8"),
        headers=build_remote_request_headers(
            provider.api_key,
            accept="text/event-stream, application/json, text/plain, */*",
            content_type="application/json",
        ),
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=35) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            if "text/event-stream" not in content_type:
                raw_payload = json.loads(response.read().decode("utf-8"))
                choices = raw_payload.get("choices") or []
                if not choices:
                    return None, "Provider returned an empty completion result"
                message = choices[0].get("message") or {}
                content = extract_provider_text(message.get("content"))
                if not content:
                    return None, "Provider returned an empty message"
                return content, None

            chunks: list[str] = []
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue

                raw_payload = line[5:].strip()
                if raw_payload == "[DONE]":
                    break

                try:
                    payload_item = json.loads(raw_payload)
                except json.JSONDecodeError:
                    continue

                choices = payload_item.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = extract_provider_stream_text(delta.get("content"))
                if content:
                    chunks.append(content)
                    yield ("chunk", content)

            full_text = "".join(chunks).strip()
            if not full_text:
                return None, "Provider returned an empty stream completion result"
            return full_text, None
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body)
            warning = payload.get("error", {}).get("message") or payload.get("message") or body
        except json.JSONDecodeError:
            warning = body or f"Provider request failed with status {exc.code}"
        return None, warning
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        return None, str(exc)


def build_preview_reply(
    user: User,
    scope: str,
    message: str,
    knowledge_bases: list[dict],
    context: dict | None,
    attachments: list[CompanionAttachmentPayload],
    warning: str | None = None,
) -> str:
    kb_names = "、".join(item["name"] for item in knowledge_bases) or "默认知识库"
    attachment_names = "、".join(item.name for item in attachments[:3])
    lines: list[str] = []

    if scope == "lesson" and context is not None:
        lines.append(f"已切换到“{context['title']}”的学案学伴模式。")
        lines.append(f"本次会优先参考：{kb_names}。")
        if attachments:
            lines.append(f"我已收到附件：{attachment_names}。")
        if user.user_type == "student":
            lines.append("先不要急着追求标准答案，建议你先确认任务产出、再找学案关键词、最后把自己的草稿发给我继续拆解。")
        else:
            lines.append("你可以继续让我围绕这份学案生成课堂追问、分层提示、板书结构或点评话术。")
    else:
        lines.append("已进入通用 AI 学伴模式。")
        lines.append(f"这次会优先参考：{kb_names}。")
        if attachments:
            lines.append(f"我已收到附件：{attachment_names}。")
        lines.append("你可以继续追问平台操作、学习方法、课堂组织，或把当前困惑再具体一点。")

    if message.strip():
        lines.append(f"当前你的问题聚焦在：{excerpt_text(message, 80)}")

    if warning:
        lines.append("当前 Provider 没有成功返回结果，已自动切换到内置预览学伴继续回答。")

    return "\n".join(lines)


@router.get("/providers", response_model=ApiResponse)
def providers(db: Session = Depends(get_db)) -> ApiResponse:
    items = [serialize_provider(provider) for provider in enabled_provider_rows(db)]
    return ApiResponse(data={"items": items})


@router.get("/companion/bootstrap", response_model=ApiResponse)
def companion_bootstrap(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    providers = enabled_provider_rows(db)
    active_provider = providers[0] if providers else None
    runtime_settings = read_assistant_runtime_settings(db)
    return ApiResponse(
        data={
            "enabled": read_assistant_enabled(db),
            "user": {
                "role": user.user_type,
                "display_name": user.display_name,
            },
            "providers": [serialize_provider(provider) for provider in providers],
            "active_provider": serialize_provider(active_provider) if active_provider is not None else None,
            "knowledge_bases": KNOWLEDGE_BASES,
            "default_knowledge_base_ids": {
                "general": DEFAULT_GENERAL_KNOWLEDGE_BASE_IDS,
                "lesson": DEFAULT_LESSON_KNOWLEDGE_BASE_IDS,
            },
            "welcome_messages": {
                "general": "我是通用 AI 学伴，可以帮你处理平台使用、学习方法和课堂相关问题。",
                "lesson": "我是当前课程学案 AI 学伴，会优先围绕当前课次、任务和课堂上下文来回答。",
            },
            "starter_questions": {
                "general": [
                    "这个页面的主要功能怎么用",
                    "帮我规划一下本节课学习步骤",
                    "我该怎么整理这次作业",
                ],
                "lesson": [
                    "请概括当前学案的目标",
                    "先做哪一项任务最合适",
                    "请给我一个不直给答案的提示",
                ],
            },
            "capabilities": {
                "multimodal": True,
                "course_context": True,
                "knowledge_base_select": True,
                "streaming": bool(runtime_settings["streaming_enabled"]),
            },
        }
    )


@router.get("/companion/context", response_model=ApiResponse)
def companion_context(
    course_id: int | None = Query(default=None, ge=1),
    task_id: int | None = Query(default=None, ge=1),
    plan_id: int | None = Query(default=None, ge=1),
    session_id: int | None = Query(default=None, ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    context = resolve_context_payload(
        user,
        db,
        course_id=course_id,
        task_id=task_id,
        plan_id=plan_id,
        session_id=session_id,
    )
    binding = resolve_lesson_agent_binding_for_context(user, context, db)
    return ApiResponse(
        data={
            "context": apply_lesson_agent_binding_to_context(context, binding)
        }
    )


@router.post("/companion/respond", response_model=ApiResponse)
def companion_respond(
    payload: CompanionRespondPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not read_assistant_enabled(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI companion is disabled")

    scope = normalize_scope(payload.scope)
    message = payload.message.strip()
    if not message and not payload.attachments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message or attachments are required")

    context = resolve_context_payload(
        user,
        db,
        course_id=payload.course_id,
        task_id=payload.task_id,
        plan_id=payload.plan_id,
        session_id=payload.session_id,
    )
    binding = resolve_lesson_agent_binding_for_context(user, context, db)
    context = apply_lesson_agent_binding_to_context(context, binding)
    if scope == "lesson" and context is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lesson mode requires course context")

    provider = resolve_provider(db, payload.provider_id)
    if payload.provider_id is not None and provider is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected AI provider is unavailable")
    preferred_kb_ids = list(payload.knowledge_base_ids)
    if (
        scope == "lesson"
        and not preferred_kb_ids
        and context is not None
        and isinstance(context.get("recommended_knowledge_base_ids"), list)
    ):
        preferred_kb_ids = [
            item
            for item in context["recommended_knowledge_base_ids"]
            if isinstance(item, str)
        ]

    selected_kbs = selected_knowledge_bases(preferred_kb_ids, scope)
    runtime_settings = read_assistant_runtime_settings(db)
    platform_name = str(read_system_settings(db).get("platform_name") or "OW³教学评AI平台")
    system_prompt = build_system_prompt(
        user,
        scope,
        selected_kbs,
        context,
        read_assistant_prompt_settings(db),
        platform_name=platform_name,
        lesson_binding_prompt=binding.get("prompt_template") if binding else None,
    )
    user_prompt = build_user_prompt(user, message, selected_kbs, context, payload.attachments)

    provider_mode = "preview"
    provider_warning: str | None = None
    reply_text: str | None = None

    if provider is not None and not provider_is_demo(provider):
        reply_text, provider_warning = call_openai_compatible_provider(
            provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            history=payload.conversation,
            attachments=payload.attachments,
            runtime_settings=runtime_settings,
        )
        if reply_text:
            provider_mode = "live"

    if not reply_text:
        reply_text = build_preview_reply(
            user,
            scope,
            message,
            selected_kbs,
            context,
            payload.attachments,
            provider_warning,
        )

    provider_name = provider.name if provider is not None else "内置预览学伴"
    return ApiResponse(
        data={
            "reply": {
                "role": "assistant",
                "content": reply_text,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "provider_name": provider_name,
                "provider_mode": provider_mode,
                "warning": provider_warning,
            },
            "active_provider": serialize_provider(provider) if provider is not None else None,
            "context": context,
        }
    )


@router.post("/companion/respond/stream")
def companion_respond_stream(
    payload: CompanionRespondPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if not read_assistant_enabled(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI companion is disabled")

    scope = normalize_scope(payload.scope)
    message = payload.message.strip()
    if not message and not payload.attachments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message or attachments are required")

    context = resolve_context_payload(
        user,
        db,
        course_id=payload.course_id,
        task_id=payload.task_id,
        plan_id=payload.plan_id,
        session_id=payload.session_id,
    )
    binding = resolve_lesson_agent_binding_for_context(user, context, db)
    context = apply_lesson_agent_binding_to_context(context, binding)
    if scope == "lesson" and context is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lesson mode requires course context")

    provider = resolve_provider(db, payload.provider_id)
    if payload.provider_id is not None and provider is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected AI provider is unavailable")
    runtime_settings = read_assistant_runtime_settings(db)
    if not bool(runtime_settings["streaming_enabled"]):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI 学伴流式输出已关闭")

    preferred_kb_ids = list(payload.knowledge_base_ids)
    if (
        scope == "lesson"
        and not preferred_kb_ids
        and context is not None
        and isinstance(context.get("recommended_knowledge_base_ids"), list)
    ):
        preferred_kb_ids = [
            item
            for item in context["recommended_knowledge_base_ids"]
            if isinstance(item, str)
        ]

    selected_kbs = selected_knowledge_bases(preferred_kb_ids, scope)
    platform_name = str(read_system_settings(db).get("platform_name") or "OW³教学评AI平台")
    system_prompt = build_system_prompt(
        user,
        scope,
        selected_kbs,
        context,
        read_assistant_prompt_settings(db),
        platform_name=platform_name,
        lesson_binding_prompt=binding.get("prompt_template") if binding else None,
    )
    user_prompt = build_user_prompt(user, message, selected_kbs, context, payload.attachments)
    provider_name = provider.name if provider is not None else "内置预览学伴"

    def generate():
        provider_mode = "preview"
        provider_warning: str | None = None
        reply_text: str | None = None
        emitted_token = False

        if provider is not None and not provider_is_demo(provider):
            stream_iterator = call_openai_compatible_provider_stream(
                provider,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                history=payload.conversation,
                attachments=payload.attachments,
                runtime_settings=runtime_settings,
            )
            while True:
                try:
                    event_type, event_payload = next(stream_iterator)
                    if event_type == "chunk" and isinstance(event_payload, str) and event_payload:
                        emitted_token = True
                        yield sse_event("token", {"text": event_payload})
                except StopIteration as stop:
                    if isinstance(stop.value, tuple) and len(stop.value) == 2:
                        reply_text, provider_warning = stop.value
                    else:
                        reply_text, provider_warning = None, "Provider stream terminated unexpectedly"
                    break

            if reply_text:
                provider_mode = "live"
                if not emitted_token:
                    yield sse_event("token", {"text": reply_text})

        if not reply_text:
            reply_text = build_preview_reply(
                user,
                scope,
                message,
                selected_kbs,
                context,
                payload.attachments,
                provider_warning,
            )
            yield sse_event("token", {"text": reply_text})

        done_payload = {
            "reply": {
                "role": "assistant",
                "content": reply_text,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "provider_name": provider_name,
                "provider_mode": provider_mode,
                "warning": provider_warning,
            },
            "active_provider": serialize_provider(provider) if provider is not None else None,
            "context": context,
        }
        yield sse_event("done", done_payload)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/lesson-agent-template", response_model=ApiResponse)
def lesson_agent_template() -> ApiResponse:
    return ApiResponse(
        data={
            "assistant_type": "lesson",
            "title": "Lesson Assistant Template",
            "capabilities": [
                "Explain the current lesson content",
                "Answer task instructions",
                "Provide hints without doing the work for students",
            ],
        }
    )
