"""教师端学情报告接口（原 staff.py 的 learning-reports 段）。

从 staff.py 拆出，routes 前缀仍由 router.py 以 `/staff` 挂载，因此路径保持不变。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff
from app.api.deps.db import get_db
from app.models import LearningReport, LessonPlan, SchoolClass, StudentProfile, User
from app.schemas.common import ApiResponse
from app.services.learning_reports import (
    build_class_learning_overview,
    call_provider_for_learning_report,
    provider_is_demo as learning_report_provider_is_demo,
    resolve_report_provider,
)
from app.services.semester import normalize_semester_key
from app.services.staff_access import get_accessible_class_ids, staff_can_access_class
from app.services.system_settings import read_current_semester_key

router = APIRouter()


class LearningReportGeneratePayload(BaseModel):
    class_id: int = Field(ge=1)
    lesson_plan_id: int | None = Field(default=None, ge=1)
    # 统计学期（如 "2026-1"）；不传则取「当前学期」设置。指定 lesson_plan_id 时以学案为准。
    semester_key: str | None = Field(default=None, max_length=16)


class LearningReportSummary(BaseModel):
    id: int
    class_id: int
    class_name: str
    lesson_plan_id: int | None
    lesson_plan_title: str | None
    teacher_id: int | None
    teacher_name: str
    title: str
    status: str
    error_message: str | None
    created_at: str | None


class LearningReportDetail(LearningReportSummary):
    content_md: str


class LearningReportListData(BaseModel):
    items: list[LearningReportSummary]
    total: int
    page: int
    page_size: int


class LearningReportDetailData(BaseModel):
    report: LearningReportDetail


class LearningReportGenerateData(BaseModel):
    report: LearningReportDetail


def serialize_learning_report(report: LearningReport, *, with_content: bool = False) -> dict:
    payload = {
        "id": report.id,
        "class_id": report.class_id,
        "class_name": report.school_class.class_name if report.school_class else "",
        "lesson_plan_id": report.lesson_plan_id,
        "lesson_plan_title": report.lesson_plan.title if report.lesson_plan else None,
        "teacher_id": report.teacher_id,
        "teacher_name": report.teacher.display_name if report.teacher else "",
        "title": report.title,
        "status": report.status,
        "error_message": report.error_message,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }
    if with_content:
        payload["content_md"] = report.content_md
    return payload


def load_learning_report_or_404(report_id: int, staff: User, db: Session) -> LearningReport:
    report = db.scalar(
        select(LearningReport)
        .where(LearningReport.id == report_id)
        .options(
            selectinload(LearningReport.school_class),
            selectinload(LearningReport.teacher),
            selectinload(LearningReport.lesson_plan),
        )
    )
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学情报告不存在")
    if not staff_can_access_class(staff, report.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级的学情报告")
    return report


@router.get("/learning-reports", response_model=ApiResponse[LearningReportListData])
def list_learning_reports(
    class_id: int | None = Query(default=None, ge=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse[LearningReportListData]:
    accessible_class_ids = get_accessible_class_ids(staff, db)
    if not accessible_class_ids:
        return ApiResponse(data=LearningReportListData(items=[], total=0, page=page, page_size=page_size))

    filters = [LearningReport.class_id.in_(accessible_class_ids)]
    if class_id is not None:
        if class_id not in accessible_class_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该班级的学情报告")
        filters.append(LearningReport.class_id == class_id)

    total = db.scalar(select(func.count()).select_from(LearningReport).where(*filters)) or 0
    rows = db.scalars(
        select(LearningReport)
        .where(*filters)
        .options(
            selectinload(LearningReport.school_class),
            selectinload(LearningReport.teacher),
            selectinload(LearningReport.lesson_plan),
        )
        .order_by(LearningReport.created_at.desc(), LearningReport.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return ApiResponse(
        data=LearningReportListData(
            items=[serialize_learning_report(item) for item in rows],  # type: ignore[arg-type]
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/learning-reports/{report_id}", response_model=ApiResponse[LearningReportDetailData])
def get_learning_report(
    report_id: int,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse[LearningReportDetailData]:
    report = load_learning_report_or_404(report_id, staff, db)
    return ApiResponse(data=LearningReportDetailData(report=serialize_learning_report(report, with_content=True)))  # type: ignore[arg-type]


@router.post("/learning-reports/generate", response_model=ApiResponse[LearningReportGenerateData])
def generate_learning_report(
    payload: LearningReportGeneratePayload,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse[LearningReportGenerateData]:
    if not staff_can_access_class(staff, payload.class_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权为该班级生成学情报告")

    school_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == payload.class_id)
        .options(selectinload(SchoolClass.students).selectinload(StudentProfile.user))
    )
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    if payload.lesson_plan_id is not None:
        plan = db.get(LessonPlan, payload.lesson_plan_id)
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学案不存在")

    # 指定了单份学案时以学案为准；否则按所选学期（缺省为当前学期）统计。
    resolved_semester_key = (
        None
        if payload.lesson_plan_id is not None
        else (
            read_current_semester_key(db)
            if payload.semester_key is None
            else normalize_semester_key(payload.semester_key)
        )
    )

    provider = resolve_report_provider(db)
    if provider is None or learning_report_provider_is_demo(provider):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="尚未配置可用的 AI Provider，请先在系统设置中接入真实模型服务",
        )

    overview = build_class_learning_overview(
        school_class,
        db,
        lesson_plan_id=payload.lesson_plan_id,
        semester_key=resolved_semester_key,
    )
    content_md, provider_error = call_provider_for_learning_report(provider, overview, db)
    if provider_error or not content_md.strip():
        error_message = provider_error or "AI 返回内容为空"
        db.add(
            LearningReport(
                class_id=payload.class_id,
                teacher_id=staff.id,
                lesson_plan_id=payload.lesson_plan_id,
                title=f"{school_class.class_name} 学情报告（生成失败）",
                content_md="",
                status="failed",
                error_message=error_message,
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI 生成学情报告失败：{error_message}",
        )

    if overview.get("scope") is not None:
        scope_suffix = f" · {overview['scope']['plan_title']}"
    elif overview.get("semester_label"):
        scope_suffix = f" · {overview['semester_label']}"
    else:
        scope_suffix = " · 全部数据"
    report = LearningReport(
        class_id=payload.class_id,
        teacher_id=staff.id,
        lesson_plan_id=payload.lesson_plan_id,
        title=f"{school_class.class_name} AI 学情报告{scope_suffix}",
        content_md=content_md.strip(),
        status="completed",
        error_message=None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ApiResponse(
        message="学情报告已生成",
        data=LearningReportGenerateData(
            report={**serialize_learning_report(report, with_content=True), "class_name": school_class.class_name}  # type: ignore[arg-type]
        ),
    )
