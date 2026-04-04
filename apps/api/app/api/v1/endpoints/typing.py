from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.models import SchoolClass, StudentProfile, TypingRecord, TypingSet, User
from app.schemas.common import ApiResponse
from app.services.staff_access import get_accessible_class_ids

router = APIRouter()


class TypingSessionCreatePayload(BaseModel):
    typing_set_id: int = Field(ge=1)
    typed_chars: int = Field(ge=0, le=100000)
    duration_sec: int = Field(ge=1, le=36000)
    accuracy_percent: int = Field(ge=0, le=100)


class StaffTypingSetCreatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    typing_mode: str = Field(min_length=1, max_length=30)
    difficulty: str = Field(default="基础", min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=1000)
    content: str = Field(min_length=1, max_length=10000)
    is_active: bool = True

    @field_validator("title", "typing_mode", "difficulty", "description", "content", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


def today_range() -> tuple[datetime, datetime]:
    current_day = date.today()
    start_at = datetime.combine(current_day, datetime.min.time())
    end_at = datetime.combine(current_day, datetime.max.time())
    return start_at, end_at


def load_student_profile(user: User, db: Session) -> StudentProfile:
    profile = db.scalar(
        select(StudentProfile)
        .where(StudentProfile.user_id == user.id)
        .options(selectinload(StudentProfile.school_class))
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生档案不存在")
    return profile


def serialize_typing_set(typing_set: TypingSet, last_record: TypingRecord | None) -> dict:
    return {
        "id": typing_set.id,
        "title": typing_set.title,
        "typing_mode": typing_set.typing_mode,
        "difficulty": typing_set.difficulty,
        "description": typing_set.description,
        "content": typing_set.content,
        "content_length": len(typing_set.content),
        "last_speed": last_record.speed_cpm if last_record else None,
        "last_accuracy": last_record.accuracy_percent if last_record else None,
        "last_played_at": last_record.played_at.isoformat() if last_record else None,
    }


def build_typing_ranking(profile: StudentProfile, scope: str, db: Session) -> dict:
    start_at, end_at = today_range()
    query = (
        select(TypingRecord)
        .join(StudentProfile, StudentProfile.user_id == TypingRecord.student_user_id)
        .where(TypingRecord.played_at >= start_at, TypingRecord.played_at <= end_at)
        .options(
            selectinload(TypingRecord.student).selectinload(User.student_profile),
            selectinload(TypingRecord.typing_set),
            selectinload(TypingRecord.school_class),
        )
    )

    if scope == "class":
        query = query.where(TypingRecord.class_id == profile.class_id)
        label = profile.school_class.class_name if profile.school_class else "当前班级"
    elif scope == "grade":
        query = query.where(StudentProfile.grade_no == profile.grade_no)
        label = f"{profile.grade_no}年级"
    elif scope == "school":
        label = "全校"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的排行榜范围")

    records = list(
        db.scalars(
            query.order_by(
                TypingRecord.speed_cpm.desc(),
                TypingRecord.accuracy_percent.desc(),
                TypingRecord.played_at.asc(),
                TypingRecord.id.asc(),
            )
        ).all()
    )

    best_record_by_student: dict[int, TypingRecord] = {}
    for record in records:
        existing = best_record_by_student.get(record.student_user_id)
        if existing is None:
            best_record_by_student[record.student_user_id] = record
            continue
        if record.speed_cpm > existing.speed_cpm:
            best_record_by_student[record.student_user_id] = record
            continue
        if record.speed_cpm == existing.speed_cpm and record.accuracy_percent > existing.accuracy_percent:
            best_record_by_student[record.student_user_id] = record
            continue
        if (
            record.speed_cpm == existing.speed_cpm
            and record.accuracy_percent == existing.accuracy_percent
            and record.played_at < existing.played_at
        ):
            best_record_by_student[record.student_user_id] = record

    ranking_records = sorted(
        best_record_by_student.values(),
        key=lambda item: (-item.speed_cpm, -item.accuracy_percent, item.played_at, item.id),
    )

    items: list[dict] = []
    for index, record in enumerate(ranking_records, start=1):
        student_profile = record.student.student_profile if record.student else None
        items.append(
            {
                "rank": index,
                "student_name": record.student.display_name if record.student else "未知学生",
                "student_no": student_profile.student_no if student_profile else "",
                "class_name": record.school_class.class_name if record.school_class else "",
                "speed_cpm": record.speed_cpm,
                "accuracy_percent": record.accuracy_percent,
                "typing_set_title": record.typing_set.title if record.typing_set else "",
                "played_at": record.played_at.isoformat(),
            }
        )

    pending_students: list[dict] = []
    if scope == "class":
        class_profiles = list(
            db.scalars(
                select(StudentProfile)
                .where(StudentProfile.class_id == profile.class_id)
                .options(selectinload(StudentProfile.user))
                .order_by(StudentProfile.student_no.asc())
            ).all()
        )
        attempted_student_ids = {record.student_user_id for record in ranking_records}
        pending_students = [
            {
                "student_name": item.user.display_name if item.user else "",
                "student_no": item.student_no,
            }
            for item in class_profiles
            if item.user_id not in attempted_student_ids
        ]

    return {
        "scope": scope,
        "label": label,
        "items": items,
        "pending_students": pending_students,
        "generated_at": datetime.now().isoformat(),
    }


@router.get("/home", response_model=ApiResponse)
def typing_home(
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(user, db)
    typing_sets = list(
        db.scalars(
            select(TypingSet)
            .where(TypingSet.is_active.is_(True))
            .order_by(TypingSet.updated_at.desc(), TypingSet.id.desc())
        ).all()
    )
    records = list(
        db.scalars(
            select(TypingRecord)
            .where(TypingRecord.student_user_id == user.id)
            .options(selectinload(TypingRecord.typing_set))
            .order_by(TypingRecord.played_at.desc(), TypingRecord.id.desc())
        ).all()
    )

    average_speed = round(sum(item.speed_cpm for item in records) / len(records)) if records else None
    best_speed = max((item.speed_cpm for item in records), default=None)
    best_accuracy = max((item.accuracy_percent for item in records), default=None)
    last_record_by_set: dict[int, TypingRecord] = {}
    for record in records:
        if record.typing_set_id not in last_record_by_set:
            last_record_by_set[record.typing_set_id] = record

    ranking = build_typing_ranking(profile, "class", db)
    my_rank = next((item["rank"] for item in ranking["items"] if item["student_no"] == profile.student_no), None)

    return ApiResponse(
        data={
            "overview": {
                "average_speed": average_speed,
                "best_speed": best_speed,
                "best_accuracy": best_accuracy,
                "attempt_count": len(records),
                "today_rank": my_rank,
                "today_participants": len(ranking["items"]),
            },
            "typing_sets": [serialize_typing_set(item, last_record_by_set.get(item.id)) for item in typing_sets],
            "recent_records": [
                {
                    "id": item.id,
                    "typing_set_id": item.typing_set_id,
                    "typing_set_title": item.typing_set.title if item.typing_set else "",
                    "speed_cpm": item.speed_cpm,
                    "accuracy_percent": item.accuracy_percent,
                    "duration_sec": item.duration_sec,
                    "typed_chars": item.typed_chars,
                    "played_at": item.played_at.isoformat(),
                }
                for item in records[:5]
            ],
            "ranking_preview": {
                "label": ranking["label"],
                "items": ranking["items"][:5],
                "pending_students": ranking["pending_students"][:5],
            },
        }
    )


@router.post("/sessions", response_model=ApiResponse)
def create_typing_session(
    payload: TypingSessionCreatePayload,
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(user, db)
    typing_set = db.get(TypingSet, payload.typing_set_id)
    if typing_set is None or not typing_set.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="打字内容不存在")

    speed_cpm = round(payload.typed_chars * 60 / payload.duration_sec) if payload.duration_sec else 0
    record = TypingRecord(
        student_user_id=user.id,
        class_id=profile.class_id,
        typing_set_id=typing_set.id,
        typed_chars=payload.typed_chars,
        duration_sec=payload.duration_sec,
        speed_cpm=speed_cpm,
        accuracy_percent=payload.accuracy_percent,
        played_at=datetime.now(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    ranking = build_typing_ranking(profile, "class", db)
    my_rank = next((item["rank"] for item in ranking["items"] if item["student_no"] == profile.student_no), None)
    return ApiResponse(
        message="打字成绩已保存",
        data={
            "summary": {
                "record_id": record.id,
                "typing_set_id": typing_set.id,
                "typing_set_title": typing_set.title,
                "speed_cpm": record.speed_cpm,
                "accuracy_percent": record.accuracy_percent,
                "duration_sec": record.duration_sec,
                "typed_chars": record.typed_chars,
                "played_at": record.played_at.isoformat(),
                "today_rank": my_rank,
            },
            "ranking_preview": {
                "label": ranking["label"],
                "items": ranking["items"][:5],
                "pending_students": ranking["pending_students"][:5],
            },
        },
    )


@router.get("/rankings", response_model=ApiResponse)
def typing_rankings(
    scope: str = "class",
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(user, db)
    return ApiResponse(data=build_typing_ranking(profile, scope, db))


@router.get("/staff/bootstrap", response_model=ApiResponse)
def typing_staff_bootstrap(
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    accessible_class_ids = get_accessible_class_ids(user, db)
    classes = list(
        db.scalars(
            select(SchoolClass)
            .where(SchoolClass.id.in_(accessible_class_ids))
            .options(selectinload(SchoolClass.students))
            .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
        ).all()
    )
    typing_sets = list(
        db.scalars(
            select(TypingSet)
            .options(selectinload(TypingSet.owner_staff), selectinload(TypingSet.records))
            .order_by(TypingSet.updated_at.desc(), TypingSet.id.desc())
        ).all()
    )

    return ApiResponse(
        data={
            "classes": [
                {
                    "id": item.id,
                    "class_name": item.class_name,
                    "grade_no": item.grade_no,
                    "class_no": item.class_no,
                    "student_count": len(item.students),
                }
                for item in classes
            ],
            "sets": [
                {
                    "id": item.id,
                    "title": item.title,
                    "typing_mode": item.typing_mode,
                    "difficulty": item.difficulty,
                    "description": item.description,
                    "content": item.content,
                    "is_active": item.is_active,
                    "owner_name": item.owner_staff.display_name if item.owner_staff else "系统内置",
                    "record_count": len(item.records),
                    "average_speed": (
                        round(sum(record.speed_cpm for record in item.records) / len(item.records))
                        if item.records
                        else None
                    ),
                    "best_speed": max((record.speed_cpm for record in item.records), default=None),
                    "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                }
                for item in typing_sets
            ],
        }
    )


@router.post("/staff/sets", response_model=ApiResponse)
def create_typing_set(
    payload: StaffTypingSetCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    typing_set = TypingSet(
        owner_staff_user_id=user.id,
        title=payload.title,
        typing_mode=payload.typing_mode,
        difficulty=payload.difficulty,
        description=payload.description,
        content=payload.content,
        is_active=payload.is_active,
    )
    db.add(typing_set)
    db.commit()
    return typing_staff_bootstrap(user=user, db=db)
