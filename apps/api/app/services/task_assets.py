from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import settings

TASK_ASSET_ROOT = settings.storage_root / "task_assets"


def task_asset_task_dir(task_id: int) -> Path:
    return TASK_ASSET_ROOT / str(task_id)


def task_asset_slot_dir(task_id: int, slot: str) -> Path:
    return task_asset_task_dir(task_id) / slot


def normalize_relative_path(value: str) -> str:
    normalized = value.replace("\\", "/").strip().lstrip("/")
    while "//" in normalized:
        normalized = normalized.replace("//", "/")
    if not normalized:
        raise ValueError("Asset path cannot be empty")
    parts = [part.strip() for part in normalized.split("/") if part.strip()]
    if any(part in {".", ".."} for part in parts):
        raise ValueError("Asset path contains unsupported segment")
    return "/".join(parts)


def ensure_slot_dir(task_id: int, slot: str) -> Path:
    directory = task_asset_slot_dir(task_id, slot)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def clear_slot_dir(task_id: int, slot: str) -> None:
    directory = task_asset_slot_dir(task_id, slot)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)


def clear_task_dir(task_id: int) -> None:
    directory = task_asset_task_dir(task_id)
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)


def resolve_asset_file_path(task_id: int, slot: str, relative_path: str) -> Path:
    normalized = normalize_relative_path(relative_path)
    target = task_asset_slot_dir(task_id, slot) / Path(normalized)
    resolved = target.resolve()
    slot_root = task_asset_slot_dir(task_id, slot).resolve()
    if slot_root not in resolved.parents and resolved != slot_root:
        raise ValueError("Asset path is out of slot root")
    return resolved


def write_asset_file(task_id: int, slot: str, relative_path: str, content: bytes) -> str:
    normalized = normalize_relative_path(relative_path)
    target = resolve_asset_file_path(task_id, slot, normalized)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return normalized

