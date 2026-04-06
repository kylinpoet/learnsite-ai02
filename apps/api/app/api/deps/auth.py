from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.deps.db import get_db
from app.core.security import decode_access_token
from app.models import User
from app.services.staff_access import is_admin_staff

bearer_scheme = HTTPBearer(auto_error=False)
TASK_RUNTIME_COOKIE_NAME = "learnsite_task_token"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    task_runtime_token: str | None = Cookie(default=None, alias=TASK_RUNTIME_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    raw_token = credentials.credentials if credentials is not None else (task_runtime_token or "").strip()
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
        )

    token_data = decode_access_token(raw_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        )

    user = db.get(User, token_data["user_id"])
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def require_student(user: User = Depends(get_current_user)) -> User:
    if user.user_type != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required",
        )
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.user_type != "staff":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return user


def require_admin(user: User = Depends(require_staff)) -> User:
    if not is_admin_staff(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
