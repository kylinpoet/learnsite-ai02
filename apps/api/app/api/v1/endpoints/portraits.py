"""学生画像接口：模板管理、班级模板绑定、教师查看与学生自查。"""

from __future__ import annotations

import json
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.models import PortraitTemplate, StudentProfile, SystemSetting, User
from app.schemas.common import ApiResponse
from app.services.staff_access import staff_can_access_class
from app.services.student_portraits import (
    build_student_portrait,
    default_template_config,
    normalize_template_config,
)
from app.services.system_settings import load_setting_value

router = APIRouter()

PORTRAIT_TEMPLATE_BINDING_KEY = "portrait_template_by_class"


class PortraitTemplateUpsertPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)
    config: dict[str, object] | None = None


class PortraitClassBindingPayload(BaseModel):
    class_id: int = Field(ge=1)
    template_id: int | None = Field(default=None, ge=1)


def _normalize_template_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写画像模板名称")
    return name[:80]


def _serialize_template(template: PortraitTemplate, *, viewer: User | None = None) -> dict:
    dimensions = normalize_template_config(_load_config(template.config_json))["dimensions"]
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "is_system": template.is_system,
        "is_owned": bool(viewer is not None and template.owner_staff_id == viewer.id),
        "owner_staff_id": template.owner_staff_id,
        "sort_order": template.sort_order,
        "config": {"dimensions": dimensions},
    }


def _load_config(raw_json: str | None) -> dict:
    if not raw_json:
        return default_template_config()
    try:
        parsed = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return default_template_config()
    return parsed if isinstance(parsed, dict) else default_template_config()


def _read_template_binding_by_class(db: Session) -> dict[int, int]:
    raw = load_setting_value(PORTRAIT_TEMPLATE_BINDING_KEY, db)
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(payload, dict):
        return {}
    result: dict[int, int] = {}
    for key, value in payload.items():
        try:
            class_id = int(key)
            template_id = int(value)
        except (TypeError, ValueError):
            continue
        if class_id > 0 and template_id > 0:
            result[class_id] = template_id
    return result


def _write_template_binding_by_class(binding: dict[int, int], db: Session) -> None:
    serialized = json.dumps({str(k): v for k, v in binding.items()}, ensure_ascii=False)
    row = db.scalar(select(SystemSetting).where(SystemSetting.setting_key == PORTRAIT_TEMPLATE_BINDING_KEY))
    if row is None:
        db.add(SystemSetting(setting_key=PORTRAIT_TEMPLATE_BINDING_KEY, setting_value=serialized))
    else:
        row.setting_value = serialized


def _system_default_template(db: Session) -> PortraitTemplate | None:
    return db.scalar(
        select(PortraitTemplate)
        .where(PortraitTemplate.is_system == True)  # noqa: E712
        .order_by(PortraitTemplate.sort_order.asc(), PortraitTemplate.id.asc())
    )


def _readable_template_or_404(template_id: int, viewer: User, db: Session) -> PortraitTemplate:
    template = db.get(PortraitTemplate, template_id)
    if template is None or (not template.is_system and template.owner_staff_id != viewer.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="画像模板不存在")
    return template


def _resolve_template_for_class(
    db: Session,
    *,
    class_id: int | None,
    viewer: User,
    template_id: int | None = None,
) -> PortraitTemplate | None:
    if template_id is not None:
        return _readable_template_or_404(template_id, viewer, db)
    if class_id is not None:
        bound_id = _read_template_binding_by_class(db).get(class_id)
        if bound_id is not None:
            bound = db.get(PortraitTemplate, bound_id)
            if bound is not None:
                return bound
    return _system_default_template(db)


def _fallback_template() -> SimpleNamespace:
    return SimpleNamespace(id=0, name="默认画像模板", config_json=json.dumps(default_template_config(), ensure_ascii=False))


def _load_staff_viewable_student(student_id: int, staff: User, db: Session) -> StudentProfile:
    profile = db.scalar(
        select(StudentProfile)
        .where(StudentProfile.user_id == student_id)
        .options(
            selectinload(StudentProfile.user),
            selectinload(StudentProfile.school_class),
        )
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生不存在")
    if not staff_can_access_class(staff, profile.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该学生画像")
    return profile


@router.get("/templates", response_model=ApiResponse)
def list_portrait_templates(
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    templates = db.scalars(
        select(PortraitTemplate)
        .where((PortraitTemplate.is_system == True) | (PortraitTemplate.owner_staff_id == staff.id))  # noqa: E712
        .order_by(PortraitTemplate.is_system.desc(), PortraitTemplate.sort_order.asc(), PortraitTemplate.id.asc())
    ).all()
    return ApiResponse(
        data={
            "templates": [_serialize_template(item, viewer=staff) for item in templates],
            "dimension_options": normalize_template_config(default_template_config())["dimensions"],
        }
    )


@router.post("/templates", response_model=ApiResponse)
def create_portrait_template(
    payload: PortraitTemplateUpsertPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    config = normalize_template_config(payload.config or default_template_config())
    template = PortraitTemplate(
        owner_staff_id=staff.id,
        name=_normalize_template_name(payload.name),
        description=(payload.description or "").strip() or None,
        config_json=json.dumps(config, ensure_ascii=False),
        is_system=False,
        sort_order=100,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return ApiResponse(message="画像模板已创建", data={"template": _serialize_template(template, viewer=staff)})


@router.put("/templates/{template_id}", response_model=ApiResponse)
def update_portrait_template(
    template_id: int,
    payload: PortraitTemplateUpsertPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = db.get(PortraitTemplate, template_id)
    if template is None or template.owner_staff_id != staff.id or template.is_system:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="画像模板不存在或不可修改")
    config = normalize_template_config(payload.config or default_template_config())
    template.name = _normalize_template_name(payload.name)
    template.description = (payload.description or "").strip() or None
    template.config_json = json.dumps(config, ensure_ascii=False)
    db.commit()
    db.refresh(template)
    return ApiResponse(message="画像模板已更新", data={"template": _serialize_template(template, viewer=staff)})


@router.delete("/templates/{template_id}", response_model=ApiResponse)
def delete_portrait_template(
    template_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    template = db.get(PortraitTemplate, template_id)
    if template is None or template.owner_staff_id != staff.id or template.is_system:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="画像模板不存在或不可删除")
    binding = _read_template_binding_by_class(db)
    if any(value == template_id for value in binding.values()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该模板仍被班级使用，请先切换班级模板后再删除",
        )
    db.delete(template)
    db.commit()
    return ApiResponse(message="画像模板已删除", data={"deleted_id": template_id})


@router.post("/templates/{template_id}/duplicate", response_model=ApiResponse)
def duplicate_portrait_template(
    template_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    source = _readable_template_or_404(template_id, staff, db)
    config = normalize_template_config(_load_config(source.config_json))
    template = PortraitTemplate(
        owner_staff_id=staff.id,
        name=f"{source.name}（副本）"[:80],
        description=source.description,
        config_json=json.dumps(config, ensure_ascii=False),
        is_system=False,
        sort_order=100,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return ApiResponse(message="已复制为新模板", data={"template": _serialize_template(template, viewer=staff)})


@router.get("/staff/class-binding", response_model=ApiResponse)
def get_portrait_class_binding(
    class_id: int = Query(ge=1),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not staff_can_access_class(staff, class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级")
    bound_id = _read_template_binding_by_class(db).get(class_id)
    system_default = _system_default_template(db)
    return ApiResponse(
        data={
            "class_id": class_id,
            "template_id": bound_id or (system_default.id if system_default else None),
            "is_bound": bound_id is not None,
        }
    )


@router.put("/staff/class-binding", response_model=ApiResponse)
def update_portrait_class_binding(
    payload: PortraitClassBindingPayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if not staff_can_access_class(staff, payload.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权管理该班级")
    binding = _read_template_binding_by_class(db)
    if payload.template_id is None:
        binding.pop(payload.class_id, None)
    else:
        _readable_template_or_404(payload.template_id, staff, db)
        binding[payload.class_id] = payload.template_id
    _write_template_binding_by_class(binding, db)
    db.commit()
    return ApiResponse(
        message="班级画像模板已更新",
        data={"class_id": payload.class_id, "template_id": payload.template_id},
    )


@router.get("/staff/students/{student_user_id}", response_model=ApiResponse)
def get_staff_student_portrait(
    student_user_id: int,
    template_id: int | None = Query(default=None, ge=1),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = _load_staff_viewable_student(student_user_id, staff, db)
    template = _resolve_template_for_class(
        db, class_id=profile.class_id, viewer=staff, template_id=template_id
    ) or _fallback_template()
    portrait = build_student_portrait(db, student=profile.user, profile=profile, template=template)
    return ApiResponse(data={"portrait": portrait})


@router.get("/student/me", response_model=ApiResponse)
def get_my_portrait(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = db.scalar(
        select(StudentProfile)
        .where(StudentProfile.user_id == student.id)
        .options(selectinload(StudentProfile.school_class))
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生资料不存在")
    template = _resolve_template_for_class(db, class_id=profile.class_id, viewer=student) or _fallback_template()
    portrait = build_student_portrait(db, student=student, profile=profile, template=template)
    return ApiResponse(data={"portrait": portrait})
