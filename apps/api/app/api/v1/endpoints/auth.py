from __future__ import annotations

import time
from collections import defaultdict
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import get_current_user
from app.api.deps.db import get_db
from app.core.security import (
    create_access_token,
    create_class_guest_token,
    decode_access_token,
    verify_password,
)
from app.models import ClassSeatAssignment, SchoolClass, StudentProfile, User
from app.schemas.auth import (
    ClassCodeRequest,
    ClassGuestPayload,
    ClassLoginRequest,
    ClassOptionGrade,
    ClassOptionItem,
    ClassRosterPayload,
    ClassRosterRequest,
    ClassRosterStudent,
    LoginPayload,
    LoginRequest,
    MePayload,
    UserSummary,
)
from app.schemas.common import ApiResponse
from app.services.attendance import ensure_student_login_attendance, resolve_client_ip
from app.services.class_code import find_class_by_code, normalize_class_code
from app.services.staff_access import build_staff_roles, is_admin_staff
from app.services.system_settings import read_system_settings

router = APIRouter()

# 班级码是名单的访问口令。6 位码无法靠限流挡住穷举，这里只把「脚本级高频试探」按住：
# 码空间约 8.9 亿，按每分钟 200 次失败计算，想撞中一个在用的码也要以年计；
# 而阈值放在 200 是为了不让一个班 40 多人集体输错码时把自己的机房锁掉。
_ROSTER_FAILURE_WINDOW_SECONDS = 60
_ROSTER_FAILURE_LIMIT = 200
_roster_failures: dict[str, list[float]] = defaultdict(list)


def _class_code_guard(request: Request) -> None:
    source = resolve_client_ip(request) or "unknown"
    now = time.monotonic()
    recent = [
        stamp
        for stamp in _roster_failures[source]
        if now - stamp < _ROSTER_FAILURE_WINDOW_SECONDS
    ]
    _roster_failures[source] = recent
    # 进程常驻时清理过期来源，避免这个内存计数器随访问过的 IP 无限增长
    if len(_roster_failures) > 5000:
        for key in [key for key, stamps in _roster_failures.items() if not stamps]:
            _roster_failures.pop(key, None)
    if len(recent) >= _ROSTER_FAILURE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="班级码尝试过于频繁，请稍后再试",
        )


def _class_code_miss(request: Request) -> NoReturn:
    source = resolve_client_ip(request) or "unknown"
    _roster_failures[source].append(time.monotonic())
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级码无效")


# 密码尝试限流：名单公开后 student_user_id 不再保密，这里按「来源 IP + 学生」按住脚本级
# 撞库。课堂场景下同班几十人共用一台 NAT 出口不常见，且阈值只挡高频试探，正常输错不受影响。
_PASSWORD_FAILURE_WINDOW_SECONDS = 60
_PASSWORD_FAILURE_LIMIT = 20
_password_failures: dict[str, list[float]] = defaultdict(list)


def _password_guard(key: str) -> None:
    now = time.monotonic()
    recent = [
        stamp
        for stamp in _password_failures[key]
        if now - stamp < _PASSWORD_FAILURE_WINDOW_SECONDS
    ]
    _password_failures[key] = recent
    if len(_password_failures) > 5000:
        for stale in [item for item, stamps in _password_failures.items() if not stamps]:
            _password_failures.pop(stale, None)
    if len(recent) >= _PASSWORD_FAILURE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="密码尝试过于频繁，请稍后再试",
        )


def _password_miss(key: str) -> NoReturn:
    _password_failures[key].append(time.monotonic())
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码不正确")


def _resolve_class_or_404(raw_code: str | None, request: Request, db: Session) -> SchoolClass:
    _class_code_guard(request)
    school_class = find_class_by_code(raw_code, db)
    if school_class is None:
        _class_code_miss(request)
    return school_class


def build_login_payload(user: User) -> LoginPayload:
    roles = [user.user_type] if user.user_type != "staff" else build_staff_roles(user)
    access_token, expires_at = create_access_token(
        user_id=user.id,
        user_type=user.user_type,
        username=user.username,
    )
    return LoginPayload(
        access_token=access_token,
        expires_at=expires_at.isoformat(),
        user=UserSummary(
            id=str(user.id),
            username=user.username,
            display_name=user.display_name,
            role=user.user_type,
            roles=roles,
        ),
    )


@router.post("/student/login", response_model=ApiResponse[LoginPayload])
def student_login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiResponse[LoginPayload]:
    user = db.scalar(
        select(User).where(User.username == payload.username, User.user_type == "student")
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    ensure_student_login_attendance(user, request, db)
    db.commit()
    return ApiResponse(data=build_login_payload(user))


@router.post("/staff/login", response_model=ApiResponse[LoginPayload])
def staff_login(payload: LoginRequest, db: Session = Depends(get_db)) -> ApiResponse[LoginPayload]:
    user = db.scalar(
        select(User).where(User.username == payload.username, User.user_type == "staff")
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    return ApiResponse(data=build_login_payload(user))


@router.get("/me", response_model=ApiResponse[MePayload])
def current_user(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse[MePayload]:
    raw_token = request.headers.get("authorization", "")
    token = raw_token.split(" ", 1)[1].strip() if raw_token.lower().startswith("bearer ") else ""
    token_data = decode_access_token(token) if token else None
    roles = [user.user_type]
    if user.user_type == "staff":
        roles = build_staff_roles(user)
    elif is_admin_staff(user):
        roles.append("admin")
    system_settings = read_system_settings(db)
    return ApiResponse(
        data=MePayload(
            id=str(user.id),
            username=user.username,
            display_name=user.display_name,
            roles=roles,
            theme=system_settings.get("theme_code", "emblem"),
            platform_name=system_settings.get("platform_name", "OW³教学评AI平台"),
            expires_at=token_data["expires_at"].isoformat() if token_data else None,
        )
    )


@router.get("/class/options", response_model=ApiResponse[list[ClassOptionGrade]])
def class_login_options(db: Session = Depends(get_db)) -> ApiResponse[list[ClassOptionGrade]]:
    """登录页「按年级选班级」用的公开班级清单。

    只暴露班级名称与编号——不含人数、学生姓名或班级码，避免未登录状态泄露名单。
    """
    classes = db.scalars(
        select(SchoolClass).order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
    ).all()
    grouped: dict[int, list[ClassOptionItem]] = {}
    for school_class in classes:
        grouped.setdefault(school_class.grade_no, []).append(
            ClassOptionItem(
                id=school_class.id,
                class_name=school_class.class_name,
                grade_no=school_class.grade_no,
                class_no=school_class.class_no,
            )
        )
    return ApiResponse(
        data=[
            ClassOptionGrade(grade_no=grade_no, classes=items)
            for grade_no, items in sorted(grouped.items())
        ]
    )


@router.post("/class/roster", response_model=ApiResponse[ClassRosterPayload])
def class_roster(
    payload: ClassRosterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiResponse[ClassRosterPayload]:
    """取本班名单：按班级列表选择（class_id），或输入老师投屏的班级码（class_code）。

    名单公开，凭据仍是学生自己的密码；班级码只是「我更想直接用码进班」的快捷方式。
    """
    if payload.class_id is not None:
        school_class = db.get(SchoolClass, payload.class_id)
    elif payload.class_code:
        school_class = find_class_by_code(payload.class_code, db)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择班级或输入班级码")
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    profiles = db.scalars(
        select(StudentProfile)
        .where(StudentProfile.class_id == school_class.id)
        .options(selectinload(StudentProfile.user))
    ).all()
    seat_label_by_student: dict[int, str] = {}
    assignments = db.scalars(
        select(ClassSeatAssignment)
        .where(ClassSeatAssignment.class_id == school_class.id)
        .options(selectinload(ClassSeatAssignment.seat))
    ).all()
    for assignment in assignments:
        if assignment.seat is not None:
            seat_label_by_student[assignment.student_user_id] = assignment.seat.seat_label

    students = [
        ClassRosterStudent(
            user_id=profile.user_id,
            display_name=profile.user.display_name if profile.user else profile.student_no,
            student_no=profile.student_no,
            seat_label=seat_label_by_student.get(profile.user_id),
        )
        for profile in profiles
        if profile.user is not None and profile.user.is_active
    ]
    students.sort(key=lambda item: item.student_no)

    return ApiResponse(
        data=ClassRosterPayload(
            class_id=school_class.id,
            class_name=school_class.class_name,
            class_code=normalize_class_code(school_class.class_code),
            student_count=len(students),
            students=students,
        )
    )


@router.post("/student/login-by-class", response_model=ApiResponse[LoginPayload])
def student_login_by_class(
    payload: ClassLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiResponse[LoginPayload]:
    """选班级 + 点选名单 + 密码登录。班级只负责定位学生，凭据仍是学生自己的密码。"""
    school_class = db.get(SchoolClass, payload.class_id)
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    key = f"{resolve_client_ip(request) or 'unknown'}:{payload.student_user_id}"
    _password_guard(key)
    profile = db.scalar(
        select(StudentProfile).where(
            StudentProfile.user_id == payload.student_user_id,
            StudentProfile.class_id == school_class.id,
        )
    )
    user = db.get(User, payload.student_user_id) if profile is not None else None
    if user is None or user.user_type != "student" or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该学生不在本班名单中")
    if not verify_password(payload.password, user.password_hash):
        _password_miss(key)
    ensure_student_login_attendance(user, request, db)
    db.commit()
    return ApiResponse(data=build_login_payload(user))


@router.post("/class/guest", response_model=ApiResponse[ClassGuestPayload])
def class_guest_login(
    payload: ClassCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiResponse[ClassGuestPayload]:
    """只输班级码 → 只读旁听令牌。没有学生身份，只能看本班学案与活动清单。"""
    school_class = _resolve_class_or_404(payload.class_code, request, db)
    token, expires_at = create_class_guest_token(
        class_id=school_class.id,
        class_name=school_class.class_name,
    )
    return ApiResponse(
        data=ClassGuestPayload(
            access_token=token,
            expires_at=expires_at.isoformat(),
            class_id=school_class.id,
            class_name=school_class.class_name,
        )
    )
