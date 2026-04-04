from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SchoolClass, TeacherClassAssignment, User
from app.services.system_settings import read_archived_class_ids


def is_admin_staff(user: User) -> bool:
    return bool(user.staff_profile and user.staff_profile.is_admin)


def build_staff_roles(user: User) -> list[str]:
    roles = ["staff"]
    if is_admin_staff(user):
        roles.append("admin")
    return roles


def get_accessible_class_ids(user: User, db: Session) -> set[int]:
    archived_class_ids = read_archived_class_ids(db)
    if is_admin_staff(user):
        class_ids = set(db.scalars(select(SchoolClass.id)).all())
        return class_ids - archived_class_ids

    class_ids = set(
        db.scalars(
            select(TeacherClassAssignment.class_id).where(
                TeacherClassAssignment.staff_user_id == user.id
            )
        ).all()
    )
    return class_ids - archived_class_ids


def staff_can_access_class(user: User, class_id: int, db: Session) -> bool:
    return class_id in get_accessible_class_ids(user, db)
