from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import DriveFile, DriveSpace, StudentGroup, StudentGroupMember, StudentProfile, SystemSetting, User

DEFAULT_GROUP_DRIVE_QUOTA_MB = 256


def load_group_drive_quota_mb(db: Session) -> int:
    setting = db.scalar(
        select(SystemSetting).where(SystemSetting.setting_key == "group_drive_quota_mb")
    )
    if setting is None:
        return DEFAULT_GROUP_DRIVE_QUOTA_MB
    try:
        return max(1, int(setting.setting_value))
    except ValueError:
        return DEFAULT_GROUP_DRIVE_QUOTA_MB


def load_student_group_membership(
    student_user_id: int,
    db: Session,
    *,
    include_members: bool = False,
) -> StudentGroupMember | None:
    query = select(StudentGroupMember).where(StudentGroupMember.student_user_id == student_user_id).options(
        selectinload(StudentGroupMember.group).selectinload(StudentGroup.school_class),
        selectinload(StudentGroupMember.group).selectinload(StudentGroup.leader),
    )

    if include_members:
        query = query.options(
            selectinload(StudentGroupMember.group)
            .selectinload(StudentGroup.memberships)
            .selectinload(StudentGroupMember.student)
            .selectinload(User.student_profile)
            .selectinload(StudentProfile.school_class)
        )

    return db.scalar(query)


def ensure_group_drive_space(group: StudentGroup, db: Session) -> DriveSpace:
    space = db.scalar(
        select(DriveSpace)
        .where(DriveSpace.owner_type == "group", DriveSpace.owner_id == group.id)
        .options(
            selectinload(DriveSpace.files)
            .selectinload(DriveFile.uploaded_by_user)
            .selectinload(User.student_profile)
        )
    )
    if space is not None:
        return space

    space = DriveSpace(
        owner_type="group",
        owner_id=group.id,
        display_name=f"{group.name}共享网盘",
        quota_mb=load_group_drive_quota_mb(db),
        used_bytes=0,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return ensure_group_drive_space(group, db)
