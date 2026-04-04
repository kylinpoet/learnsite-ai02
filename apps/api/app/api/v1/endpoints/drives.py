from __future__ import annotations

from math import ceil
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_student
from app.api.deps.db import get_db
from app.models import DriveFile, DriveSpace, SystemSetting, User
from app.schemas.common import ApiResponse
from app.services.drive_files import (
    guess_drive_media_type,
    stored_drive_file_path,
    upload_files_to_drive_space,
)
from app.services.classroom_switches import (
    build_student_classroom_context,
    ensure_feature_access,
    resolve_feature_access,
    serialize_classroom_capabilities,
)
from app.services.group_operation_logs import log_group_operation
from app.services.student_groups import ensure_group_drive_space, load_student_group_membership

router = APIRouter()

DEFAULT_STUDENT_DRIVE_QUOTA_MB = 128


def build_content_disposition(filename: str, disposition: str = "attachment") -> str:
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip() or "download.bin"
    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'


def load_quota_mb(setting_key: str, default_value: int, db: Session) -> int:
    setting = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == setting_key))
    if setting is None:
        return default_value
    try:
        return max(1, int(setting.setting_value))
    except ValueError:
        return default_value


def load_personal_drive_space(student: User, db: Session) -> DriveSpace:
    space = db.scalar(
        select(DriveSpace)
        .where(DriveSpace.owner_type == "student", DriveSpace.owner_id == student.id)
        .options(
            selectinload(DriveSpace.files)
            .selectinload(DriveFile.uploaded_by_user)
            .selectinload(User.student_profile)
        )
    )
    if space is not None:
        return space

    space = DriveSpace(
        owner_type="student",
        owner_id=student.id,
        display_name=f"{student.display_name}的个人网盘",
        quota_mb=load_quota_mb("student_drive_quota_mb", DEFAULT_STUDENT_DRIVE_QUOTA_MB, db),
        used_bytes=0,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return load_personal_drive_space(student, db)


def load_group_membership(
    student: User,
    db: Session,
    *,
    include_members: bool = False,
):
    return load_student_group_membership(student.id, db, include_members=include_members)


def load_group_drive_space_for_student(
    student: User,
    db: Session,
    *,
    include_members: bool = False,
):
    membership = load_group_membership(student, db, include_members=include_members)
    if membership is None:
        return None, None
    return membership, ensure_group_drive_space(membership.group, db)


def student_can_access_space(space: DriveSpace, student: User, db: Session) -> bool:
    if space.owner_type == "student":
        return space.owner_id == student.id
    if space.owner_type == "group":
        membership = load_group_membership(student, db)
        return membership is not None and membership.group_id == space.owner_id
    return False


def student_can_delete_drive_file(
    drive_file: DriveFile,
    student: User,
    db: Session,
    *,
    group_membership=None,
) -> bool:
    space = drive_file.space
    if space.owner_type == "student":
        return space.owner_id == student.id
    if space.owner_type != "group":
        return False

    membership = group_membership or load_group_membership(student, db)
    if membership is None or membership.group_id != space.owner_id:
        return False
    return membership.role == "leader" or drive_file.uploaded_by_user_id == student.id


def load_drive_file_for_student(file_id: int, student: User, db: Session) -> DriveFile:
    drive_file = db.scalar(
        select(DriveFile)
        .where(DriveFile.id == file_id)
        .options(selectinload(DriveFile.space))
    )
    if drive_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="网盘文件不存在")
    if not student_can_access_space(drive_file.space, student, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该网盘文件")
    return drive_file


def format_display_name(space: DriveSpace, original_name: str) -> str:
    original_path = Path(original_name)
    stem = original_path.stem or "file"
    suffix = original_path.suffix
    candidate = original_name
    index = 2
    existing_names = {item.stored_name for item in space.files}
    while candidate in existing_names:
        candidate = f"{stem} ({index}){suffix}"
        index += 1
    return candidate


def serialize_drive_file(
    drive_file: DriveFile,
    *,
    student: User,
    db: Session,
    group_membership=None,
) -> dict:
    uploaded_by = drive_file.uploaded_by_user
    profile = uploaded_by.student_profile if uploaded_by else None
    return {
        "id": drive_file.id,
        "name": drive_file.stored_name,
        "original_name": drive_file.original_name,
        "ext": drive_file.file_ext,
        "size_bytes": drive_file.size_bytes,
        "size_kb": max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0,
        "updated_at": drive_file.updated_at.isoformat() if drive_file.updated_at else None,
        "folder_path": drive_file.folder_path,
        "uploaded_by_user_id": uploaded_by.id if uploaded_by else None,
        "uploaded_by_name": uploaded_by.display_name if uploaded_by else None,
        "uploaded_by_student_no": (
            profile.student_no if profile else (uploaded_by.username if uploaded_by else None)
        ),
        "can_delete": student_can_delete_drive_file(
            drive_file,
            student,
            db,
            group_membership=group_membership,
        ),
    }


def serialize_drive_space(
    space: DriveSpace,
    *,
    student: User,
    db: Session,
    group_membership=None,
    enabled: bool = True,
    message: str = "",
) -> dict:
    quota_bytes = space.quota_mb * 1024 * 1024
    remaining_bytes = max(quota_bytes - space.used_bytes, 0)
    usage_percent = round((space.used_bytes / quota_bytes) * 100, 1) if quota_bytes else 0
    files = sorted(space.files, key=lambda item: (item.updated_at, item.id), reverse=True)
    return {
        "id": space.id,
        "owner_type": space.owner_type,
        "display_name": space.display_name,
        "quota_mb": space.quota_mb,
        "used_bytes": space.used_bytes,
        "remaining_bytes": remaining_bytes,
        "usage_percent": usage_percent,
        "file_count": len(files),
        "files": [
            serialize_drive_file(
                item,
                student=student,
                db=db,
                group_membership=group_membership,
            )
            for item in files
        ],
        "enabled": enabled,
        "message": message,
    }


def empty_group_space_payload(message: str) -> dict:
    return {
        "enabled": False,
        "message": message,
        "id": None,
        "owner_type": None,
        "display_name": "小组共享网盘",
        "quota_mb": 0,
        "used_bytes": 0,
        "remaining_bytes": 0,
        "usage_percent": 0,
        "file_count": 0,
        "files": [],
        "group_id": None,
        "group_name": None,
        "group_no": None,
        "class_name": None,
        "member_count": 0,
        "my_role": None,
    }


def serialize_group_drive_space(
    membership,
    space: DriveSpace | None,
    *,
    student: User,
    db: Session,
    enabled_override: bool | None = None,
    message_override: str | None = None,
) -> dict:
    if membership is None or space is None:
        return empty_group_space_payload("你当前还没有加入小组，暂时无法使用共享网盘。")

    payload = serialize_drive_space(
        space,
        student=student,
        db=db,
        group_membership=membership,
    )
    payload.update(
        {
            "enabled": True,
            "message": "",
            "group_id": membership.group.id,
            "group_name": membership.group.name,
            "group_no": membership.group.group_no,
            "class_name": membership.group.school_class.class_name,
            "member_count": len(membership.group.memberships),
            "my_role": membership.role,
        }
    )
    if enabled_override is not None:
        payload["enabled"] = bool(enabled_override)
    if message_override is not None:
        payload["message"] = message_override
    return payload


def serialize_drive_payload(
    personal_space: DriveSpace,
    group_membership,
    group_space: DriveSpace | None,
    *,
    student: User,
    db: Session,
    personal_enabled: bool = True,
    personal_message: str = "",
    group_enabled: bool | None = None,
    group_message: str | None = None,
    classroom_capabilities: dict | None = None,
) -> dict:
    return {
        "personal_space": serialize_drive_space(
            personal_space,
            student=student,
            db=db,
            enabled=personal_enabled,
            message=personal_message,
        ),
        "group_space": serialize_group_drive_space(
            group_membership,
            group_space,
            student=student,
            db=db,
            enabled_override=group_enabled,
            message_override=group_message,
        ),
        "classroom_capabilities": classroom_capabilities or {},
    }


async def upload_files_to_space(
    space: DriveSpace,
    upload_items: list[UploadFile],
    student: User,
    db: Session,
) -> list[DriveFile]:
    return await upload_files_to_drive_space(space, upload_items, student, db)


@router.get("/me", response_model=ApiResponse)
def my_drive(
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    capability_context = build_student_classroom_context(student, db, request)
    personal_enabled, personal_message = resolve_feature_access(capability_context, "drive")
    group_enabled, group_message = resolve_feature_access(capability_context, "group_drive")
    discussion_enabled, discussion_message = resolve_feature_access(capability_context, "group_discussion")
    classroom_capabilities = serialize_classroom_capabilities(
        capability_context,
        feature_states={
            "drive": (personal_enabled, personal_message),
            "group_drive": (group_enabled, group_message),
            "group_discussion": (discussion_enabled, discussion_message),
        },
    )

    personal_space = load_personal_drive_space(student, db)
    group_membership, group_space = load_group_drive_space_for_student(
        student,
        db,
        include_members=True,
    )
    return ApiResponse(
        data=serialize_drive_payload(
            personal_space,
            group_membership,
            group_space,
            student=student,
            db=db,
            personal_enabled=personal_enabled,
            personal_message=personal_message,
            group_enabled=group_enabled,
            group_message=group_message,
            classroom_capabilities=classroom_capabilities,
        )
    )


@router.post("/me/files", response_model=ApiResponse)
async def upload_my_drive_files(
    request: Request,
    files: list[UploadFile] | None = File(default=None),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    capability_context = build_student_classroom_context(student, db, request)
    ensure_feature_access(capability_context, "drive")

    upload_items = [item for item in (files or []) if item.filename]
    if not upload_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择要上传的文件")

    personal_space = load_personal_drive_space(student, db)
    await upload_files_to_space(personal_space, upload_items, student, db)

    refreshed_personal_space = load_personal_drive_space(student, db)
    group_membership, group_space = load_group_drive_space_for_student(
        student,
        db,
        include_members=True,
    )
    return ApiResponse(
        message="文件已上传到个人网盘",
        data=serialize_drive_payload(
            refreshed_personal_space,
            group_membership,
            group_space,
            student=student,
            db=db,
            personal_enabled=True,
            personal_message="",
            group_enabled=resolve_feature_access(capability_context, "group_drive")[0],
            group_message=resolve_feature_access(capability_context, "group_drive")[1],
            classroom_capabilities=serialize_classroom_capabilities(
                capability_context,
                feature_states={
                    "drive": (True, ""),
                    "group_drive": resolve_feature_access(capability_context, "group_drive"),
                    "group_discussion": resolve_feature_access(capability_context, "group_discussion"),
                },
            ),
        ),
    )


@router.post("/group/files", response_model=ApiResponse)
async def upload_group_drive_files(
    request: Request,
    files: list[UploadFile] | None = File(default=None),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    capability_context = build_student_classroom_context(student, db, request)
    ensure_feature_access(capability_context, "group_drive")

    upload_items = [item for item in (files or []) if item.filename]
    if not upload_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择要上传的文件")

    group_membership, group_space = load_group_drive_space_for_student(
        student,
        db,
        include_members=True,
    )
    if group_membership is None or group_space is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前学生尚未加入小组")

    created_files = await upload_files_to_space(group_space, upload_items, student, db)
    for drive_file in created_files:
        log_group_operation(
            db,
            event_type="group_file_uploaded",
            event_label="共享文件上传",
            title=f"{student.display_name} 上传了 {drive_file.stored_name}",
            description=f"文件已同步到小组共享空间，当前文件大小约 {max(1, ceil(drive_file.size_bytes / 1024)) if drive_file.size_bytes else 0} KB。",
            actor=student,
            actor_role=group_membership.role,
            group=group_membership.group,
            file=drive_file,
        )
    db.commit()

    refreshed_personal_space = load_personal_drive_space(student, db)
    refreshed_group_membership, refreshed_group_space = load_group_drive_space_for_student(
        student,
        db,
        include_members=True,
    )
    return ApiResponse(
        message="文件已上传到小组网盘",
        data=serialize_drive_payload(
            refreshed_personal_space,
            refreshed_group_membership,
            refreshed_group_space,
            student=student,
            db=db,
            personal_enabled=resolve_feature_access(capability_context, "drive")[0],
            personal_message=resolve_feature_access(capability_context, "drive")[1],
            group_enabled=True,
            group_message="",
            classroom_capabilities=serialize_classroom_capabilities(
                capability_context,
                feature_states={
                    "drive": resolve_feature_access(capability_context, "drive"),
                    "group_drive": (True, ""),
                    "group_discussion": resolve_feature_access(capability_context, "group_discussion"),
                },
            ),
        ),
    )


@router.delete("/files/{file_id}", response_model=ApiResponse)
def delete_drive_file(
    file_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    drive_file = load_drive_file_for_student(file_id, student, db)
    capability_context = build_student_classroom_context(student, db, request)
    switch_key = "group_drive" if drive_file.space.owner_type == "group" else "drive"
    ensure_feature_access(capability_context, switch_key)
    if not student_can_delete_drive_file(drive_file, student, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前只允许删除自己上传的共享文件；组长可删除本组全部共享文件",
        )
    space = drive_file.space
    file_path = stored_drive_file_path(drive_file)
    if file_path.exists():
        file_path.unlink()
    space.used_bytes = max(space.used_bytes - drive_file.size_bytes, 0)
    group_membership = load_group_membership(student, db) if space.owner_type == "group" else None
    if group_membership is not None and group_membership.group_id == space.owner_id:
        log_group_operation(
            db,
            event_type="group_file_deleted",
            event_label="共享文件删除",
            title=f"{student.display_name} 删除了 {drive_file.stored_name}",
            description="文件已从小组共享空间移除，可在操作日志中继续追溯本次删除记录。",
            actor=student,
            actor_role=group_membership.role,
            group=group_membership.group,
            file=drive_file,
        )
    db.delete(drive_file)
    db.commit()

    refreshed_personal_space = load_personal_drive_space(student, db)
    group_membership, group_space = load_group_drive_space_for_student(
        student,
        db,
        include_members=True,
    )
    return ApiResponse(
        message="文件已删除",
        data=serialize_drive_payload(
            refreshed_personal_space,
            group_membership,
            group_space,
            student=student,
            db=db,
            personal_enabled=resolve_feature_access(capability_context, "drive")[0],
            personal_message=resolve_feature_access(capability_context, "drive")[1],
            group_enabled=resolve_feature_access(capability_context, "group_drive")[0],
            group_message=resolve_feature_access(capability_context, "group_drive")[1],
            classroom_capabilities=serialize_classroom_capabilities(
                capability_context,
                feature_states={
                    "drive": resolve_feature_access(capability_context, "drive"),
                    "group_drive": resolve_feature_access(capability_context, "group_drive"),
                    "group_discussion": resolve_feature_access(capability_context, "group_discussion"),
                },
            ),
        ),
    )


@router.get("/files/{file_id}")
def download_drive_file(
    file_id: int,
    request: Request,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> FileResponse:
    drive_file = load_drive_file_for_student(file_id, student, db)
    capability_context = build_student_classroom_context(student, db, request)
    switch_key = "group_drive" if drive_file.space.owner_type == "group" else "drive"
    ensure_feature_access(capability_context, switch_key)
    file_path = stored_drive_file_path(drive_file)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="网盘文件不存在")

    response = FileResponse(
        path=file_path,
        media_type=guess_drive_media_type(drive_file),
        filename=drive_file.stored_name,
    )
    response.headers["Content-Disposition"] = build_content_disposition(drive_file.stored_name)
    return response
