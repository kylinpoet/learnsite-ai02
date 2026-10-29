from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AIProvider,
    AttendanceRecord,
    LessonPlan,
    PeerReviewVote,
    SchoolClass,
    StudentLessonPlanProgress,
    StudentProfile,
    Submission,
    Task,
)
from app.services import ai_provider_client
from app.services.assistant_settings import read_assistant_runtime_settings
from app.services.system_settings import read_system_settings

logger = logging.getLogger(__name__)

# 教师评分等级映射（与提交批改端约定一致：G/A/B/C/D/E/F）
SCORE_GRADE_MAP = {120: "G", 100: "A", 80: "B", 60: "C", 40: "D", 20: "E", 0: "F"}

LEARNING_REPORT_TIMEOUT_SECONDS = 60.0
MAX_PROMPT_STUDENT_LINES = 60


def resolve_report_provider(db: Session) -> AIProvider | None:
    """取默认启用的 AI Provider（与学伴 resolve_provider 同一套排序约定）。"""
    providers = list(
        db.scalars(
            select(AIProvider)
            .where(AIProvider.is_enabled == True)  # noqa: E712
            .order_by(AIProvider.is_default.desc(), AIProvider.id.asc())
        ).all()
    )
    return providers[0] if providers else None


def provider_is_demo(provider: AIProvider | None) -> bool:
    if provider is None:
        return True
    base_url = (provider.base_url or "").lower()
    api_key = (provider.api_key or "").lower()
    return "example.com" in base_url or api_key.startswith("demo-") or api_key == "demo-key-change-me"


def build_class_learning_overview(
    school_class: SchoolClass,
    db: Session,
    *,
    lesson_plan_id: int | None = None,
) -> dict:
    """聚合班级学情统计：提交/评分/互评/签到/学案进度（教师视角，供 AI prompt 组装）。"""
    profiles = sorted(school_class.students, key=lambda item: item.student_no)
    student_ids = [profile.user_id for profile in profiles]
    no_student_filter = student_ids or [-1]

    plan: LessonPlan | None = None
    task_ids: list[int] | None = None
    if lesson_plan_id is not None:
        plan = db.get(LessonPlan, lesson_plan_id)
        task_ids = list(
            db.scalars(select(Task.id).where(Task.plan_id == lesson_plan_id)).all()
        ) or [-1]

    submission_filters = [Submission.student_id.in_(no_student_filter)]
    if task_ids is not None:
        submission_filters.append(Submission.task_id.in_(task_ids))
    submission_rows = db.scalars(select(Submission).where(*submission_filters)).all()

    submission_count_by_student: dict[int, int] = defaultdict(int)
    reviewed_count_by_student: dict[int, int] = defaultdict(int)
    score_values_by_student: dict[int, list[int]] = defaultdict(list)
    score_counts: dict[int, int] = defaultdict(int)
    peer_score_sum = 0
    peer_scored_count = 0
    recommended_count = 0
    pending_review_count = 0
    earliest_submitted_at: datetime | None = None
    latest_submitted_at: datetime | None = None

    for submission in submission_rows:
        submission_count_by_student[submission.student_id] += 1
        if submission.submit_status == "reviewed":
            reviewed_count_by_student[submission.student_id] += 1
        elif submission.submit_status == "submitted":
            pending_review_count += 1
        if submission.is_recommended:
            recommended_count += 1
        if submission.score is not None:
            score_counts[submission.score] += 1
            score_values_by_student[submission.student_id].append(submission.score)
        if submission.peer_review_score is not None:
            peer_score_sum += submission.peer_review_score
            peer_scored_count += 1
        submitted_at = submission.submitted_at or submission.updated_at
        if submitted_at is not None:
            if earliest_submitted_at is None or submitted_at < earliest_submitted_at:
                earliest_submitted_at = submitted_at
            if latest_submitted_at is None or submitted_at > latest_submitted_at:
                latest_submitted_at = submitted_at

    vote_filters = [PeerReviewVote.reviewer_student_id.in_(no_student_filter)]
    if task_ids is not None:
        vote_filters.append(PeerReviewVote.task_id.in_(task_ids))
    vote_rows = db.scalars(select(PeerReviewVote).where(*vote_filters)).all()
    vote_count_by_reviewer: dict[int, int] = defaultdict(int)
    for vote in vote_rows:
        vote_count_by_reviewer[vote.reviewer_student_id] += 1

    attendance_filters = [AttendanceRecord.class_id == school_class.id]
    if plan is not None:
        attendance_filters.append(AttendanceRecord.attendance_date == plan.assigned_date)
    attendance_rows = db.scalars(select(AttendanceRecord).where(*attendance_filters)).all()
    attendance_count_by_student: dict[int, int] = defaultdict(int)
    attendance_dates: set = set()
    for record in attendance_rows:
        attendance_count_by_student[record.student_id] += 1
        attendance_dates.add(record.attendance_date)

    completed_plans_by_student: dict[int, int] = defaultdict(int)
    if lesson_plan_id is None:
        progress_rows = db.scalars(
            select(StudentLessonPlanProgress).where(
                StudentLessonPlanProgress.student_id.in_(no_student_filter),
                StudentLessonPlanProgress.progress_status == "completed",
            )
        ).all()
        for progress in progress_rows:
            completed_plans_by_student[progress.student_id] += 1

    grade_counts: dict[str, int] = defaultdict(int)
    for score_value, count in score_counts.items():
        grade_label = SCORE_GRADE_MAP.get(score_value, f"{score_value}分")
        grade_counts[grade_label] += count
    all_score_values = [value for values in score_values_by_student.values() for value in values]

    student_lines: list[dict] = []
    for profile in profiles:
        scores = score_values_by_student.get(profile.user_id, [])
        student_lines.append(
            {
                "student_no": profile.student_no,
                "display_name": profile.user.display_name,
                "submission_count": submission_count_by_student.get(profile.user_id, 0),
                "reviewed_count": reviewed_count_by_student.get(profile.user_id, 0),
                "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
                "peer_vote_count": vote_count_by_reviewer.get(profile.user_id, 0),
                "attendance_count": attendance_count_by_student.get(profile.user_id, 0),
                "completed_plan_count": completed_plans_by_student.get(profile.user_id, 0),
            }
        )

    student_count = len(profiles)
    attendance_covered_students = len(attendance_count_by_student)
    return {
        "class_name": school_class.class_name,
        "student_count": student_count,
        "scope": (
            {"plan_id": plan.id, "plan_title": plan.title, "assigned_date": plan.assigned_date.isoformat()}
            if plan is not None
            else None
        ),
        "submission": {
            "total": len(submission_rows),
            "reviewed": sum(reviewed_count_by_student.values()),
            "pending_review": pending_review_count,
            "recommended": recommended_count,
            "earliest_submitted_at": earliest_submitted_at.isoformat() if earliest_submitted_at else None,
            "latest_submitted_at": latest_submitted_at.isoformat() if latest_submitted_at else None,
        },
        "scores": {
            "average": round(sum(all_score_values) / len(all_score_values), 1) if all_score_values else None,
            "distribution": dict(sorted(grade_counts.items())),
        },
        "peer_review": {
            "vote_count": len(vote_rows),
            "participating_students": len(vote_count_by_reviewer),
            "participation_rate": round(len(vote_count_by_reviewer) / student_count * 100, 1)
            if student_count
            else 0,
            "average_peer_score": round(peer_score_sum / peer_scored_count, 2) if peer_scored_count else None,
        },
        "attendance": {
            "record_count": len(attendance_rows),
            "covered_students": attendance_covered_students,
            "covered_dates": len(attendance_dates),
            "attendance_rate": round(attendance_covered_students / student_count * 100, 1)
            if student_count
            else 0,
        },
        "students": student_lines[:MAX_PROMPT_STUDENT_LINES],
    }


def format_overview_as_prompt_text(overview: dict) -> str:
    lines: list[str] = []
    lines.append(f"班级：{overview['class_name']}（共 {overview['student_count']} 名学生）")
    scope = overview.get("scope")
    if scope is not None:
        lines.append(
            f"统计范围：学案《{scope['plan_title']}》（布置日期 {scope['assigned_date']}，plan_id={scope['plan_id']}）"
        )
    else:
        lines.append("统计范围：该班级全部历史数据")

    submission = overview["submission"]
    lines.append(
        "活动提交："
        f"总提交 {submission['total']} 次，已评分 {submission['reviewed']} 次，"
        f"待评分 {submission['pending_review']} 次，教师推荐 {submission['recommended']} 次"
    )
    if submission["earliest_submitted_at"]:
        lines.append(f"提交时间范围：{submission['earliest_submitted_at']} 至 {submission['latest_submitted_at']}")

    scores = overview["scores"]
    distribution_text = "、".join(f"{grade} 级 {count} 份" for grade, count in scores["distribution"].items())
    lines.append(
        f"教师评分：平均分 {scores['average'] if scores['average'] is not None else '暂无'}"
        "（评分等级映射：G=120/A=100/B=80/C=60/D=40/E=20/F=0）"
        + (f"；分布：{distribution_text}" if distribution_text else "")
    )

    peer_review = overview["peer_review"]
    lines.append(
        "同伴互评："
        f"共 {peer_review['vote_count']} 票，{peer_review['participating_students']} 名学生参与"
        f"（参与率 {peer_review['participation_rate']}%），"
        f"作品平均互评分 {peer_review['average_peer_score'] if peer_review['average_peer_score'] is not None else '暂无'}"
    )

    attendance = overview["attendance"]
    lines.append(
        "课堂签到："
        f"累计 {attendance['record_count']} 人次，覆盖 {attendance['covered_dates']} 个日期，"
        f"{attendance['covered_students']} 名学生有签到记录（签到覆盖率 {attendance['attendance_rate']}%）"
    )

    lines.append("")
    lines.append("学生明细（学号 | 姓名 | 提交次数 | 已评分次数 | 平均分 | 互评投票数 | 签到次数 | 完成学案数）：")
    for item in overview["students"]:
        avg_score = item["avg_score"] if item["avg_score"] is not None else "-"
        lines.append(
            f"{item['student_no']} | {item['display_name']} | {item['submission_count']} | "
            f"{item['reviewed_count']} | {avg_score} | {item['peer_vote_count']} | "
            f"{item['attendance_count']} | {item['completed_plan_count']}"
        )
    return "\n".join(lines)


def build_learning_report_messages(overview: dict) -> list[dict]:
    system_prompt = (
        "你是 OW³教学评AI平台 的 AI 学情分析师，服务对象是教师。"
        "请基于给定的班级学情统计数据，输出一份结构化 Markdown 学情分析报告，"
        "只依据数据说话，不编造数据里不存在的信息。"
        "报告必须包含以下章节："
        "## 一、总体概况（数据概览与整体判断）、"
        "## 二、班级优势、"
        "## 三、薄弱点与风险、"
        "## 四、教学建议（给出可落地的下一步行动，含分层建议）。"
        "面向教师口吻，条理清晰，长度控制在 600 字左右，直接输出 Markdown 正文，"
        "不要用代码块包裹，不要输出与报告无关的寒暄。"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": format_overview_as_prompt_text(overview)},
    ]


def call_provider_for_learning_report(
    provider: AIProvider,
    overview: dict,
    db: Session,
) -> tuple[str, str | None]:
    """调用 AI Provider 生成学情报告 Markdown。返回 (content, error)，成功时 error 为 None。"""
    system_settings = read_system_settings(db)
    remote_proxy_url = str(system_settings.get("remote_proxy_url") or "").strip() or None
    runtime_settings = read_assistant_runtime_settings(db)
    generation_params = {
        "temperature": float(runtime_settings.get("temperature", 0.4)),
        "thinking": {"type": "disabled"},
    }
    content, error, _reasoning = ai_provider_client.chat_completion(
        provider.base_url,
        provider.api_key,
        build_learning_report_messages(overview),
        generation_params,
        model=provider.model_name,
        proxy_url=remote_proxy_url,
        timeout=LEARNING_REPORT_TIMEOUT_SECONDS,
    )
    if content is not None:
        logger.warning(
            "[LEARNING_REPORT] completion_success provider_id=%s provider_name=%s",
            provider.id,
            provider.name,
        )
    else:
        logger.warning(
            "[LEARNING_REPORT] completion_error provider_id=%s provider_name=%s error=%s",
            provider.id,
            provider.name,
            error,
        )
    return content or "", error
