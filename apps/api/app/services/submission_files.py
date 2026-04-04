from __future__ import annotations

import mimetypes
from pathlib import Path

from app.core.config import settings
from app.models import SubmissionFile

SUBMISSION_STORAGE_ROOT = settings.storage_root / "submissions"
PREVIEWABLE_EXTENSIONS = {
    "gif",
    "jpeg",
    "jpg",
    "md",
    "pdf",
    "png",
    "svg",
    "txt",
    "webp",
}


def submission_dir(submission_id: int) -> Path:
    return SUBMISSION_STORAGE_ROOT / str(submission_id)


def stored_file_path(submission_file: SubmissionFile) -> Path:
    ext = submission_file.file_ext or "bin"
    return submission_dir(submission_file.submission_id) / f"{submission_file.id}.{ext}"


def guess_media_type(submission_file: SubmissionFile) -> str:
    media_type, _ = mimetypes.guess_type(submission_file.original_name)
    if media_type:
        return media_type
    if submission_file.file_ext.lower() == "md":
        return "text/markdown"
    return "application/octet-stream"


def is_previewable_file(submission_file: SubmissionFile) -> bool:
    media_type = guess_media_type(submission_file)
    return submission_file.file_ext.lower() in PREVIEWABLE_EXTENSIONS or media_type.startswith("image/")
