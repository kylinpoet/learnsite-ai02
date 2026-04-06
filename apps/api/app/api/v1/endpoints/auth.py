from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.deps.db import get_db
from app.core.security import create_access_token, decode_access_token, verify_password
from app.models import User
from app.schemas.auth import LoginPayload, LoginRequest, UserSummary
from app.schemas.common import ApiResponse
from app.services.attendance import ensure_student_login_attendance
from app.services.staff_access import build_staff_roles, is_admin_staff
from app.services.system_settings import read_system_settings

router = APIRouter()


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


@router.post("/student/login", response_model=ApiResponse)
def student_login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApiResponse:
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


@router.post("/staff/login", response_model=ApiResponse)
def staff_login(payload: LoginRequest, db: Session = Depends(get_db)) -> ApiResponse:
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


@router.get("/me", response_model=ApiResponse)
def current_user(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiResponse:
    raw_token = request.headers.get("authorization", "")
    token = raw_token.split(" ", 1)[1].strip() if raw_token.lower().startswith("bearer ") else ""
    token_data = decode_access_token(token) if token else None
    roles = [user.user_type]
    if user.user_type == "staff":
        roles = build_staff_roles(user)
    elif is_admin_staff(user):
        roles.append("admin")
    return ApiResponse(
        data={
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "roles": roles,
            "theme": read_system_settings(db).get("theme_code", "sky"),
            "expires_at": token_data["expires_at"].isoformat() if token_data else None,
        }
    )
