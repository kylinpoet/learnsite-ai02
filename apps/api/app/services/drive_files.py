from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import DriveFile, DriveSpace, User
from app.services.system_settings import load_group_drive_upload_limits

DRIVE_STORAGE_ROOT = settings.storage_root / "drives"


def drive_space_dir(space: DriveSpace) -> Path:
    return DRIVE_STORAGE_ROOT / f"space_{space.id}"


def format_drive_file_name(
    space: DriveSpace,
    original_name: str,
    existing_names: set[str] | None = None,
) -> str:
    original_path = Path(original_name)
    stem = original_path.stem or "file"
    suffix = original_path.suffix
    candidate = original_name or f"{stem}{suffix}"
    index = 2
    known_names = existing_names if existing_names is not None else {item.stored_name for item in space.files}
    while candidate in known_names:
        candidate = f"{stem} ({index}){suffix}"
        index += 1
    known_names.add(candidate)
    return candidate


def stored_drive_file_path(drive_file: DriveFile) -> Path:
    ext = drive_file.file_ext or "bin"
    return drive_space_dir(drive_file.space) / f"{drive_file.id}.{ext}"


def guess_drive_media_type(drive_file: DriveFile) -> str:
    media_type, _ = mimetypes.guess_type(drive_file.original_name)
    return media_type or "application/octet-stream"


def validate_group_drive_uploads(
    space: DriveSpace,
    staged_files: list[tuple[str, str, bytes]],
    db: Session,
) -> None:
    if space.owner_type != "group":
        return

    limits = load_group_drive_upload_limits(db)
    max_file_count = int(limits["max_file_count"])
    single_file_max_bytes = int(limits["single_file_max_mb"]) * 1024 * 1024
    allowed_extensions = {item.lower() for item in limits["allowed_extensions"]}

    if len(space.files) + len(staged_files) > max_file_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"当前小组网盘最多允许 {max_file_count} 个文件，请先删除部分文件后再上传",
        )

    for original_name, file_ext, content in staged_files:
        if len(content) > single_file_max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"文件 {original_name} 超过单个文件 {limits['single_file_max_mb']} MB 限制",
            )
        if allowed_extensions and file_ext.lower() not in allowed_extensions:
            normalized_ext = f".{file_ext}" if file_ext else "无扩展名"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"文件 {original_name} 的类型 {normalized_ext} 不在允许范围内，"
                    f"当前仅支持：{', '.join(limits['allowed_extensions'])}"
                ),
            )


async def upload_files_to_drive_space(
    space: DriveSpace,
    upload_items: list[UploadFile],
    uploaded_by: User,
    db: Session,
) -> list[DriveFile]:
    staged_files: list[tuple[str, str, bytes]] = []
    total_new_bytes = 0
    created_files: list[DriveFile] = []

    for upload in upload_items:
        original_name = Path(upload.filename or "file").name or "file"
        content = await upload.read()
        await upload.close()
        file_ext = Path(original_name).suffix.lstrip(".").lower() or "bin"
        staged_files.append((original_name, file_ext, content))
        total_new_bytes += len(content)

    validate_group_drive_uploads(space, staged_files, db)

    quota_bytes = space.quota_mb * 1024 * 1024
    if space.used_bytes + total_new_bytes > quota_bytes:
        remaining_mb = max((quota_bytes - space.used_bytes) / 1024 / 1024, 0)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"网盘空间不足，当前剩余 {remaining_mb:.1f} MB",
        )

    existing_names = {item.stored_name for item in space.files}
    target_dir = drive_space_dir(space)
    target_dir.mkdir(parents=True, exist_ok=True)

    for original_name, file_ext, content in staged_files:
        stored_name = format_drive_file_name(space, original_name, existing_names)
        drive_file = DriveFile(
            space_id=space.id,
            uploaded_by_user_id=uploaded_by.id,
            original_name=original_name,
            stored_name=stored_name,
            file_ext=file_ext,
            size_bytes=len(content),
            folder_path="/",
        )
        db.add(drive_file)
        db.flush()
        (target_dir / f"{drive_file.id}.{file_ext}").write_bytes(content)
        created_files.append(drive_file)

    space.used_bytes += total_new_bytes
    db.commit()
    return created_files
