from __future__ import annotations

import json
import random
from datetime import date
from datetime import datetime
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff
from app.api.deps.db import get_db
from app.models import (
    AttendanceRecord,
    ClassroomSession,
    CurriculumLesson,
    CurriculumUnit,
    LessonPlan,
    SchoolClass,
    StudentGroup,
    StudentLessonPlanProgress,
    StudentProfile,
    Submission,
    SystemSetting,
    Task,
    User,
)
from app.schemas.common import ApiResponse
from app.services.staff_access import get_accessible_class_ids, staff_can_access_class

router = APIRouter()


class CreateClassroomSessionPayload(BaseModel):
    class_id: int = Field(ge=1)
    plan_id: int = Field(ge=1)


class SessionSwitchesPayload(BaseModel):
    drive: bool | None = None
    group_drive: bool | None = None
    group_discussion: bool | None = None
    peer_review: bool | None = None
    ai_assistant: bool | None = None
    programming_control: bool | None = None
    ip_lock: bool | None = None


class RollCallPayload(BaseModel):
    only_pending_signin: bool = False


class ForceOfflinePayload(BaseModel):
    note: str | None = Field(default=None, max_length=200)


CLASSROOM_SWITCH_CONFIG = [
    {
        "key": "drive",
        "label": "网盘协作",
        "description": "学生可访问个人网盘并提交资料。",
        "default_enabled": True,
    },
    {
        "key": "group_drive",
        "label": "小组网盘",
        "description": "学生可访问小组共享空间。",
        "default_enabled": True,
    },
    {
        "key": "group_discussion",
        "label": "小组讨论",
        "description": "课堂内允许小组讨论协作。",
        "default_enabled": True,
    },
    {
        "key": "peer_review",
        "label": "作品互评",
        "description": "课堂内允许互评与推荐投票。",
        "default_enabled": True,
    },
    {
        "key": "ai_assistant",
        "label": "AI 学伴",
        "description": "课堂内允许调用 AI 学伴。",
        "default_enabled": True,
    },
    {
        "key": "programming_control",
        "label": "编程控制",
        "description": "课堂内允许进入编程任务控制区。",
        "default_enabled": True,
    },
    {
        "key": "ip_lock",
        "label": "IP 锁定",
        "description": "仅允许指定机房网络参与本节课堂。",
        "default_enabled": False,
    },
]
CLASSROOM_SWITCH_KEYS = tuple(item["key"] for item in CLASSROOM_SWITCH_CONFIG)
DEFAULT_SESSION_SWITCHES = {
    item["key"]: bool(item["default_enabled"]) for item in CLASSROOM_SWITCH_CONFIG
}
ROLL_CALL_DEDUPE_WINDOW_MINUTES = 8
ROLL_CALL_STORE_LIMIT = 60
ROLL_CALL_RESPONSE_LIMIT = 8


def normalize_session_switches(raw: dict | None) -> dict:
    normalized = dict(DEFAULT_SESSION_SWITCHES)
    if not raw:
        return normalized
    for key in DEFAULT_SESSION_SWITCHES:
        if key in raw:
            normalized[key] = bool(raw[key])
    return normalized


def session_switches_setting_key(session_id: int) -> str:
    return f"classroom_session_switches:{session_id}"


def load_session_switches(session_id: int, db: Session) -> dict:
    row = db.scalar(
        select(SystemSetting).where(
            SystemSetting.setting_key == session_switches_setting_key(session_id)
        )
    )
    if row is None:
        return dict(DEFAULT_SESSION_SWITCHES)
    try:
        payload = json.loads(row.setting_value or "{}")
    except json.JSONDecodeError:
        return dict(DEFAULT_SESSION_SWITCHES)
    if not isinstance(payload, dict):
        return dict(DEFAULT_SESSION_SWITCHES)
    return normalize_session_switches(payload)


def load_session_switches_map(session_ids: list[int], db: Session) -> dict[int, dict]:
    if not session_ids:
        return {}
    key_to_session_id = {
        session_switches_setting_key(session_id): session_id for session_id in session_ids
    }
    rows = db.scalars(
        select(SystemSetting).where(SystemSetting.setting_key.in_(key_to_session_id.keys()))
    ).all()
    payload: dict[int, dict] = {}
    for row in rows:
        session_id = key_to_session_id.get(row.setting_key)
        if session_id is None:
            continue
        try:
            parsed = json.loads(row.setting_value or "{}")
        except json.JSONDecodeError:
            parsed = {}
        payload[session_id] = normalize_session_switches(parsed if isinstance(parsed, dict) else {})
    return payload


def save_session_switches(session_id: int, switches: dict, db: Session) -> None:
    normalized = normalize_session_switches(switches)
    serialized = json.dumps(normalized, ensure_ascii=False)
    row = db.scalar(
        select(SystemSetting).where(
            SystemSetting.setting_key == session_switches_setting_key(session_id)
        )
    )
    if row is None:
        db.add(
            SystemSetting(
                setting_key=session_switches_setting_key(session_id),
                setting_value=serialized,
            )
        )
        return
    row.setting_value = serialized


def serialize_switch_config() -> list[dict]:
    return [
        {
            "key": item["key"],
            "label": item["label"],
            "description": item["description"],
            "default_enabled": bool(item["default_enabled"]),
        }
        for item in CLASSROOM_SWITCH_CONFIG
    ]


def roll_call_history_setting_key(session_id: int) -> str:
    return f"classroom_session_roll_call_history:{session_id}"


def load_roll_call_history(session_id: int, db: Session) -> list[dict]:
    row = db.scalar(
        select(SystemSetting).where(
            SystemSetting.setting_key == roll_call_history_setting_key(session_id)
        )
    )
    if row is None or not (row.setting_value or "").strip():
        return []

    try:
        payload = json.loads(row.setting_value)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []

    history: list[dict] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        student_user_id = item.get("student_user_id")
        occurred_at = str(item.get("occurred_at") or "").strip()
        if not isinstance(student_user_id, int) or not occurred_at:
            continue
        try:
            datetime.fromisoformat(occurred_at)
        except ValueError:
            continue
        history.append(
            {
                "student_user_id": student_user_id,
                "student_no": str(item.get("student_no") or ""),
                "student_name": str(item.get("student_name") or ""),
                "checked_in_today": bool(item.get("checked_in_today")),
                "used_pending_pool": bool(item.get("used_pending_pool")),
                "occurred_at": occurred_at,
            }
        )

    history.sort(key=lambda entry: entry["occurred_at"], reverse=True)
    return history[:ROLL_CALL_STORE_LIMIT]


def save_roll_call_history(session_id: int, history: list[dict], db: Session) -> None:
    serialized = json.dumps(history[:ROLL_CALL_STORE_LIMIT], ensure_ascii=False)
    row = db.scalar(
        select(SystemSetting).where(
            SystemSetting.setting_key == roll_call_history_setting_key(session_id)
        )
    )
    if row is None:
        db.add(
            SystemSetting(
                setting_key=roll_call_history_setting_key(session_id),
                setting_value=serialized,
            )
        )
        return
    row.setting_value = serialized


def build_task_progress_snapshot(session: ClassroomSession, db: Session) -> list[dict]:
    tasks = sorted(session.lesson_plan.tasks, key=lambda item: (item.sort_order, item.id))
    if not tasks:
        return []

    student_profiles = list(
        db.scalars(
            select(StudentProfile).where(StudentProfile.class_id == session.class_id)
        ).all()
    )
    student_ids = {item.user_id for item in student_profiles}
    group_ids = set(
        db.scalars(
            select(StudentGroup.id).where(StudentGroup.class_id == session.class_id)
        ).all()
    )
    task_ids = [task.id for task in tasks]

    submissions: list[Submission] = []
    if task_ids and (student_ids or group_ids):
        submission_query = select(Submission).where(Submission.task_id.in_(task_ids))
        if student_ids and group_ids:
            submission_query = submission_query.where(
                or_(
                    Submission.student_id.in_(student_ids),
                    Submission.group_id.in_(group_ids),
                )
            )
        elif student_ids:
            submission_query = submission_query.where(Submission.student_id.in_(student_ids))
        else:
            submission_query = submission_query.where(Submission.group_id.in_(group_ids))
        submissions = list(
            db.scalars(
                submission_query.order_by(Submission.updated_at.desc(), Submission.id.desc())
            ).all()
        )

    submissions_by_task: dict[int, list[Submission]] = {}
    for item in submissions:
        submissions_by_task.setdefault(item.task_id, []).append(item)

    payload: list[dict] = []
    for task in tasks:
        task_submissions = submissions_by_task.get(task.id, [])
        use_group_slots = task.submission_scope == "group" and bool(group_ids)

        if use_group_slots:
            slot_ids = list(group_ids)
            slot_status_map = {slot_id: "pending" for slot_id in slot_ids}
            for submission in task_submissions:
                group_id = submission.group_id
                if group_id is None or group_id not in slot_status_map:
                    continue
                next_status = "reviewed" if submission.submit_status == "reviewed" else "submitted"
                if next_status == "reviewed" or slot_status_map[group_id] == "pending":
                    slot_status_map[group_id] = next_status
            slot_type = "group"
        else:
            slot_ids = list(student_ids)
            slot_status_map = {slot_id: "pending" for slot_id in slot_ids}
            for submission in task_submissions:
                student_id = submission.student_id
                if student_id not in slot_status_map:
                    continue
                next_status = "reviewed" if submission.submit_status == "reviewed" else "submitted"
                if next_status == "reviewed" or slot_status_map[student_id] == "pending":
                    slot_status_map[student_id] = next_status
            slot_type = "student"

        slot_total = len(slot_ids)
        reviewed_count = sum(1 for status_text in slot_status_map.values() if status_text == "reviewed")
        submitted_count = sum(1 for status_text in slot_status_map.values() if status_text == "submitted")
        pending_count = max(slot_total - submitted_count - reviewed_count, 0)

        payload.append(
            {
                "id": task.id,
                "title": task.title,
                "task_type": task.task_type,
                "sort_order": task.sort_order,
                "is_required": task.is_required,
                "submission_scope": task.submission_scope,
                "progress": {
                    "slot_type": slot_type,
                    "slot_total": slot_total,
                    "pending_count": pending_count,
                    "submitted_count": submitted_count,
                    "reviewed_count": reviewed_count,
                },
            }
        )

    return payload


def build_session_detail_payload(
    session: ClassroomSession,
    db: Session,
    *,
    switches_override: dict | None = None,
) -> dict:
    switches = normalize_session_switches(
        switches_override if switches_override is not None else load_session_switches(session.id, db)
    )
    roll_call_history = load_roll_call_history(session.id, db)
    return {
        **serialize_classroom_session(session, switches),
        "attendance_ready": True,
        "task_count": len(session.lesson_plan.tasks),
        "tasks": build_task_progress_snapshot(session, db),
        "switch_config": serialize_switch_config(),
        "roll_call": {
            "dedupe_window_minutes": ROLL_CALL_DEDUPE_WINDOW_MINUTES,
            "recent_history": roll_call_history[:ROLL_CALL_RESPONSE_LIMIT],
        },
    }


def serialize_ready_plan(plan: LessonPlan) -> dict:
    pending_count = sum(1 for item in plan.progresses if item.progress_status == "pending")
    return {
        "id": plan.id,
        "title": plan.title,
        "status": plan.status,
        "assigned_date": plan.assigned_date.isoformat(),
        "task_count": len(plan.tasks),
        "pending_count": pending_count,
        "lesson": {
            "id": plan.lesson.id,
            "title": plan.lesson.title,
            "unit_title": plan.lesson.unit.title,
            "book_name": plan.lesson.unit.book.name,
        },
    }


def serialize_session_task(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "task_type": task.task_type,
        "sort_order": task.sort_order,
        "is_required": task.is_required,
        "submission_scope": task.submission_scope,
    }


def serialize_classroom_session(session: ClassroomSession, switches: dict | None = None) -> dict:
    session_switches = normalize_session_switches(switches)
    return {
        "session_id": session.id,
        "status": session.status,
        "started_at": session.started_at.isoformat(),
        "class": {
            "id": session.school_class.id,
            "name": session.school_class.class_name,
        },
        "plan": {
            "id": session.lesson_plan.id,
            "title": session.lesson_plan.title,
            "lesson_title": session.lesson_plan.lesson.title,
            "unit_title": session.lesson_plan.lesson.unit.title,
        },
        "switches": session_switches,
    }


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
        )
    )


def load_school_class(class_id: int, db: Session) -> SchoolClass | None:
    return db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == class_id)
        .options(selectinload(SchoolClass.students))
    )


def load_session_with_relations(session_id: int, db: Session) -> ClassroomSession | None:
    return db.scalar(
        select(ClassroomSession)
        .where(ClassroomSession.id == session_id)
        .options(
            selectinload(ClassroomSession.school_class),
            selectinload(ClassroomSession.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
        )
    )


@router.get("/launchpad", response_model=ApiResponse)
def classroom_launchpad(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    accessible_class_ids = get_accessible_class_ids(staff, db)
    classes = db.scalars(
        select(SchoolClass)
        .where(SchoolClass.id.in_(accessible_class_ids))
        .options(selectinload(SchoolClass.students))
        .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
    ).all()
    plans = db.scalars(
        select(LessonPlan)
        .where(LessonPlan.status.in_(("published", "active")))
        .options(
            selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
            .selectinload(CurriculumUnit.book),
            selectinload(LessonPlan.tasks),
            selectinload(LessonPlan.progresses),
        )
        .order_by(LessonPlan.assigned_date.desc(), LessonPlan.id.desc())
    ).all()
    sessions = db.scalars(
        select(ClassroomSession)
        .where(
            ClassroomSession.class_id.in_(accessible_class_ids),
            ClassroomSession.status == "active",
        )
        .options(
            selectinload(ClassroomSession.school_class),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
        )
        .order_by(
            ClassroomSession.class_id.asc(),
            ClassroomSession.started_at.desc(),
            ClassroomSession.id.desc(),
        )
    ).all()
    switch_map = load_session_switches_map([session.id for session in sessions], db)

    return ApiResponse(
        data={
            "classes": [
                {
                    "id": school_class.id,
                    "class_name": school_class.class_name,
                    "grade_no": school_class.grade_no,
                    "class_no": school_class.class_no,
                    "student_count": len(school_class.students),
                }
                for school_class in classes
            ],
            "ready_plans": [serialize_ready_plan(plan) for plan in plans],
            "active_sessions": [
                serialize_classroom_session(session, switch_map.get(session.id))
                for session in sessions
            ],
            "switch_config": serialize_switch_config(),
        }
    )


@router.post("/sessions", response_model=ApiResponse)
def create_session(
    payload: CreateClassroomSessionPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not staff_can_access_class(staff, payload.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权为该班级开课")

    school_class = load_school_class(payload.class_id, db)
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    plan = load_plan(payload.plan_id, db)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")
    if plan.status == "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先发布学案，再执行开课")
    if not plan.tasks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前学案还没有任务，不能开课")

    now = datetime.now()
    created_progress_count = 0

    existing_active_sessions = db.scalars(
        select(ClassroomSession).where(
            ClassroomSession.class_id == school_class.id,
            ClassroomSession.status == "active",
        )
    ).all()
    for existing_session in existing_active_sessions:
        existing_session.status = "completed"

    class_profiles = db.scalars(
        select(StudentProfile)
        .where(StudentProfile.class_id == school_class.id)
        .options(selectinload(StudentProfile.user))
    ).all()

    for profile in class_profiles:
        existing_progress = db.scalar(
            select(StudentLessonPlanProgress).where(
                StudentLessonPlanProgress.student_id == profile.user_id,
                StudentLessonPlanProgress.plan_id == plan.id,
            )
        )
        if existing_progress is None:
            db.add(
                StudentLessonPlanProgress(
                    student_id=profile.user_id,
                    plan_id=plan.id,
                    progress_status="pending",
                    assigned_date=plan.assigned_date,
                    completed_date=None,
                )
            )
            created_progress_count += 1

    session = ClassroomSession(
        class_id=school_class.id,
        plan_id=plan.id,
        started_by_staff_id=staff.id,
        status="active",
        started_at=now,
    )
    db.add(session)
    plan.status = "active"
    db.commit()

    latest_session = db.scalar(
        select(ClassroomSession)
        .where(ClassroomSession.id == session.id)
        .options(
            selectinload(ClassroomSession.school_class),
            selectinload(ClassroomSession.lesson_plan).selectinload(LessonPlan.tasks),
            selectinload(ClassroomSession.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit),
        )
    )
    if latest_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")

    return ApiResponse(
        message="课堂已开启",
        data={
            "session": serialize_classroom_session(
                latest_session,
                load_session_switches(latest_session.id, db),
            ),
            "progress_created_count": created_progress_count,
            "task_count": len(plan.tasks),
        },
    )


@router.get("/sessions/{session_id}", response_model=ApiResponse)
def session_detail(
    session_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    session = load_session_with_relations(session_id, db)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")
    if not staff_can_access_class(staff, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该课堂")

    return ApiResponse(data=build_session_detail_payload(session, db))


@router.put("/sessions/{session_id}/switches", response_model=ApiResponse)
def update_session_switches(
    session_id: int,
    payload: SessionSwitchesPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    session = load_session_with_relations(session_id, db)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")
    if not staff_can_access_class(staff, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权调整该课堂开关")
    if session.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="课堂已结束，不能调整课堂开关")

    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少传入一个课堂开关")

    switches = load_session_switches(session.id, db)
    for key, value in updates.items():
        if key not in CLASSROOM_SWITCH_KEYS:
            continue
        switches[key] = bool(value)
    save_session_switches(session.id, switches, db)
    db.commit()

    refreshed = load_session_with_relations(session_id, db)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")

    return ApiResponse(
        message="课堂开关已更新",
        data=build_session_detail_payload(refreshed, db, switches_override=switches),
    )


@router.post("/sessions/{session_id}/roll-call", response_model=ApiResponse)
def session_roll_call(
    session_id: int,
    payload: RollCallPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    session = load_session_with_relations(session_id, db)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")
    if not staff_can_access_class(staff, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权对该课堂随机点名")
    if session.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="课堂已结束，不能继续点名")

    class_profiles = list(
        db.scalars(
            select(StudentProfile)
            .where(StudentProfile.class_id == session.class_id)
            .options(selectinload(StudentProfile.user))
            .order_by(StudentProfile.student_no.asc())
        ).all()
    )
    if not class_profiles:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前班级还没有学生")

    attendance_date = date.today()
    attendance_records = list(
        db.scalars(
            select(AttendanceRecord).where(
                AttendanceRecord.class_id == session.class_id,
                AttendanceRecord.attendance_date == attendance_date,
            )
        ).all()
    )
    checked_in_ids = {item.student_id for item in attendance_records}

    candidates = class_profiles
    used_pending_pool = False
    if payload.only_pending_signin:
        pending_profiles = [
            item for item in class_profiles if item.user_id not in checked_in_ids
        ]
        if pending_profiles:
            candidates = pending_profiles
            used_pending_pool = True

    history = load_roll_call_history(session.id, db)
    now = datetime.now()
    dedupe_cutoff = now - timedelta(minutes=ROLL_CALL_DEDUPE_WINDOW_MINUTES)
    recent_called_ids = {
        item["student_user_id"]
        for item in history
        if datetime.fromisoformat(item["occurred_at"]) >= dedupe_cutoff
    }
    dedupe_candidates = [item for item in candidates if item.user_id not in recent_called_ids]
    dedupe_applied = bool(recent_called_ids and dedupe_candidates)
    candidate_pool = dedupe_candidates if dedupe_applied else candidates

    selected = random.choice(candidate_pool)
    student_user = selected.user
    checked_in_today = selected.user_id in checked_in_ids

    history_entry = {
        "student_user_id": selected.user_id,
        "student_no": selected.student_no,
        "student_name": student_user.display_name if student_user else "",
        "checked_in_today": checked_in_today,
        "used_pending_pool": used_pending_pool,
        "occurred_at": now.isoformat(),
    }
    history = [history_entry, *history]
    save_roll_call_history(session.id, history, db)
    db.commit()
    response_history = history[:ROLL_CALL_RESPONSE_LIMIT]

    return ApiResponse(
        message="已完成随机点名",
        data={
            "session_id": session.id,
            "class_id": session.class_id,
            "attendance_date": attendance_date.isoformat(),
            "used_pending_pool": used_pending_pool,
            "dedupe_applied": dedupe_applied,
            "dedupe_window_minutes": ROLL_CALL_DEDUPE_WINDOW_MINUTES,
            "recent_history": response_history,
            "student": {
                "user_id": selected.user_id,
                "student_no": selected.student_no,
                "display_name": student_user.display_name if student_user else "",
                "username": student_user.username if student_user else "",
                "checked_in_today": checked_in_today,
            },
        },
    )


@router.post("/sessions/{session_id}/force-offline", response_model=ApiResponse)
def session_force_offline(
    session_id: int,
    payload: ForceOfflinePayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    session = load_session_with_relations(session_id, db)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")
    if not staff_can_access_class(staff, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权执行全班下线")
    if session.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="课堂已结束，无需全班下线")

    class_student_count = db.scalar(
        select(func.count()).select_from(StudentProfile).where(
            StudentProfile.class_id == session.class_id
        )
    )
    attendance_date = date.today()
    checked_in_count = len(
        db.scalars(
            select(AttendanceRecord.student_id).where(
                AttendanceRecord.class_id == session.class_id,
                AttendanceRecord.attendance_date == attendance_date,
            )
        ).all()
    )

    return ApiResponse(
        message="已下发全班下线指令",
        data={
            "session_id": session.id,
            "class_id": session.class_id,
            "class_name": session.school_class.class_name,
            "target_student_count": int(class_student_count or 0),
            "checked_in_count": checked_in_count,
            "note": (payload.note or "").strip() or None,
            "issued_at": datetime.now().isoformat(),
        },
    )


@router.post("/sessions/{session_id}/close", response_model=ApiResponse)
def close_session(
    session_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    session = load_session_with_relations(session_id, db)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")
    if not staff_can_access_class(staff, session.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权结束该课堂")
    if session.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课堂会话已结束")

    session.status = "completed"

    active_session_for_plan = db.scalar(
        select(ClassroomSession).where(
            ClassroomSession.plan_id == session.plan_id,
            ClassroomSession.status == "active",
            ClassroomSession.id != session.id,
        )
    )
    if active_session_for_plan is None and session.lesson_plan.status == "active":
        session.lesson_plan.status = "published"

    db.commit()

    refreshed = load_session_with_relations(session_id, db)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课堂会话不存在")

    return ApiResponse(
        message="课堂已结束",
        data=build_session_detail_payload(refreshed, db),
    )
