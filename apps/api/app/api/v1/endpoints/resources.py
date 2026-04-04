from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.models import ResourceCategory, ResourceItem, User
from app.schemas.common import ApiResponse

router = APIRouter()


class StaffResourceCategoryCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    sort_order: int = Field(default=1, ge=1, le=9999)

    @field_validator("name", "description", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class StaffResourceItemCreatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category_id: int | None = Field(default=None, ge=1)
    resource_type: str = Field(default="article", min_length=1, max_length=30)
    summary: str | None = Field(default=None, max_length=1000)
    content: str | None = Field(default=None, max_length=20000)
    external_url: str | None = Field(default=None, max_length=255)
    sort_order: int = Field(default=1, ge=1, le=9999)
    is_published: bool = True

    @field_validator("title", "resource_type", "summary", "content", "external_url", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


def serialize_resource_item(item: ResourceItem) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "resource_type": item.resource_type,
        "summary": item.summary,
        "content": item.content,
        "external_url": item.external_url,
        "sort_order": item.sort_order,
        "is_published": item.is_published,
        "owner_name": item.owner_staff.display_name if item.owner_staff else "系统内置",
        "category": {
            "id": item.category.id,
            "name": item.category.name,
        }
        if item.category
        else None,
    }


def load_resource_or_404(resource_id: int, db: Session) -> ResourceItem:
    item = db.scalar(
        select(ResourceItem)
        .where(ResourceItem.id == resource_id)
        .options(selectinload(ResourceItem.category), selectinload(ResourceItem.owner_staff))
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    return item


@router.get("/student", response_model=ApiResponse)
def resource_student_list(
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    _ = user
    categories = list(
        db.scalars(
            select(ResourceCategory)
            .options(selectinload(ResourceCategory.items).selectinload(ResourceItem.owner_staff))
            .order_by(ResourceCategory.sort_order.asc(), ResourceCategory.id.asc())
        ).all()
    )

    category_payloads: list[dict] = []
    featured_items: list[dict] = []
    for category in categories:
        published_items = [item for item in category.items if item.is_published]
        serialized_items = [serialize_resource_item(item) for item in published_items]
        category_payloads.append(
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "item_count": len(serialized_items),
                "items": serialized_items,
            }
        )
        featured_items.extend(serialized_items[:2])

    return ApiResponse(
        data={
            "categories": category_payloads,
            "featured_items": featured_items[:6],
            "total_count": sum(item["item_count"] for item in category_payloads),
        }
    )


@router.get("/staff/bootstrap", response_model=ApiResponse)
def resource_staff_bootstrap(
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    _ = user
    categories = list(
        db.scalars(
            select(ResourceCategory)
            .options(selectinload(ResourceCategory.items).selectinload(ResourceItem.owner_staff))
            .order_by(ResourceCategory.sort_order.asc(), ResourceCategory.id.asc())
        ).all()
    )
    items = list(
        db.scalars(
            select(ResourceItem)
            .options(selectinload(ResourceItem.category), selectinload(ResourceItem.owner_staff))
            .order_by(ResourceItem.sort_order.asc(), ResourceItem.id.asc())
        ).all()
    )
    return ApiResponse(
        data={
            "categories": [
                {
                    "id": item.id,
                    "name": item.name,
                    "description": item.description,
                    "sort_order": item.sort_order,
                    "item_count": len(item.items),
                }
                for item in categories
            ],
            "items": [serialize_resource_item(item) for item in items],
        }
    )


@router.post("/staff/categories", response_model=ApiResponse)
def create_resource_category(
    payload: StaffResourceCategoryCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    _ = user
    category = ResourceCategory(
        name=payload.name,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(category)
    db.commit()
    return resource_staff_bootstrap(user=user, db=db)


@router.post("/staff/items", response_model=ApiResponse)
def create_resource_item(
    payload: StaffResourceItemCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    if payload.category_id is not None and db.get(ResourceCategory, payload.category_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源分类不存在")

    item = ResourceItem(
        owner_staff_user_id=user.id,
        category_id=payload.category_id,
        title=payload.title,
        resource_type=payload.resource_type,
        summary=payload.summary,
        content=payload.content,
        external_url=payload.external_url,
        sort_order=payload.sort_order,
        is_published=payload.is_published,
    )
    db.add(item)
    db.commit()
    return resource_staff_bootstrap(user=user, db=db)


@router.get("/{resource_id}", response_model=ApiResponse)
def resource_detail(
    resource_id: int,
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    _ = user
    item = load_resource_or_404(resource_id, db)
    if not item.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")

    related_items = list(
        db.scalars(
            select(ResourceItem)
            .where(
                ResourceItem.is_published.is_(True),
                ResourceItem.id != item.id,
                ResourceItem.category_id == item.category_id,
            )
            .options(selectinload(ResourceItem.category), selectinload(ResourceItem.owner_staff))
            .order_by(ResourceItem.sort_order.asc(), ResourceItem.id.asc())
            .limit(4)
        ).all()
    )

    return ApiResponse(
        data={
            **serialize_resource_item(item),
            "related_items": [serialize_resource_item(related) for related in related_items],
        }
    )
