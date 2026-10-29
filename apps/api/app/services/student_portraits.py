"""学生画像：基于平台已有学习数据计算各维度得分与评级。

画像不含 AI 生成，全部指标由数据库中的真实记录推导；模板只决定
「展示哪些维度、多少分算优秀/达标」。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping

from sqlalchemy import Integer, func, select
from sqlalchemy.orm import Session

from app.models import (
    AttendanceRecord,
    ClassroomSession,
    CompanionConversation,
    DriveFile,
    GroupTaskDraft,
    LessonPlan,
    PeerReviewVote,
    QuizAttempt,
    StudentGroupMember,
    StudentLessonPlanProgress,
    StudentProfile,
    Submission,
    TaskDiscussionPost,
    TaskReadRecord,
    TypingRecord,
    User,
)

# 维度定义：key / 展示名 / 说明 / 默认是否展示 / 默认优秀线 / 默认达标线
DIMENSION_DEFS: list[dict[str, Any]] = [
    {
        "key": "task_completion",
        "label": "活动完成",
        "description": "已下发学案中完成的比例",
        "enabled": True,
        "excellent": 90,
        "pass": 60,
    },
    {
        "key": "work_quality",
        "label": "作品质量",
        "description": "提交作品的平均得分（按满分 120 折算）",
        "enabled": True,
        "excellent": 85,
        "pass": 60,
    },
    {
        "key": "quiz",
        "label": "测验成绩",
        "description": "测验的平均正确率",
        "enabled": True,
        "excellent": 85,
        "pass": 60,
    },
    {
        "key": "typing",
        "label": "打字能力",
        "description": "打字训练的平均正确率",
        "enabled": False,
        "excellent": 90,
        "pass": 70,
    },
    {
        "key": "attendance",
        "label": "出勤表现",
        "description": "开课时段的出勤比例",
        "enabled": True,
        "excellent": 95,
        "pass": 80,
    },
    {
        "key": "participation",
        "label": "课堂参与",
        "description": "讨论发言与阅读完成次数",
        "enabled": True,
        "excellent": 80,
        "pass": 40,
    },
    {
        "key": "peer_review",
        "label": "互评参与",
        "description": "给出与收到的互评次数",
        "enabled": False,
        "excellent": 80,
        "pass": 40,
    },
    {
        "key": "collaboration",
        "label": "小组协作",
        "description": "小组归属与协作草稿记录",
        "enabled": False,
        "excellent": 80,
        "pass": 40,
    },
    {
        "key": "proactivity",
        "label": "学习主动性",
        "description": "云盘上传与 AI 学伴使用次数",
        "enabled": False,
        "excellent": 80,
        "pass": 40,
    },
]

DIMENSION_BY_KEY = {item["key"]: item for item in DIMENSION_DEFS}

RATING_LABELS = {
    "excellent": "优秀",
    "pass": "达标",
    "need_improve": "待提升",
}


def default_template_config() -> dict[str, Any]:
    return {
        "dimensions": [
            {
                "key": item["key"],
                "label": item["label"],
                "enabled": item["enabled"],
                "excellent": item["excellent"],
                "pass": item["pass"],
            }
            for item in DIMENSION_DEFS
        ]
    }


def _clamp_score(value: Any, fallback: int) -> int:
    try:
        score = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(0, min(100, score))


def normalize_template_config(raw: Mapping[str, Any] | None) -> dict[str, Any]:
    """把任意来源的模板配置归一化成完整维度列表，未知维度丢弃、缺失维度补默认。"""
    data = raw if isinstance(raw, Mapping) else {}
    incoming_items = data.get("dimensions")
    incoming: dict[str, Mapping[str, Any]] = {}
    if isinstance(incoming_items, list):
        for item in incoming_items:
            if isinstance(item, Mapping) and item.get("key"):
                incoming[str(item["key"])] = item

    dimensions: list[dict[str, Any]] = []
    for base in DIMENSION_DEFS:
        item = incoming.get(base["key"], {})
        label = str(item.get("label") or base["label"]).strip()[:40] or base["label"]
        excellent = _clamp_score(item.get("excellent"), base["excellent"])
        pass_line = _clamp_score(item.get("pass"), base["pass"])
        if excellent < pass_line:
            excellent = pass_line
        dimensions.append(
            {
                "key": base["key"],
                "label": label,
                "enabled": bool(item.get("enabled", base["enabled"])),
                "excellent": excellent,
                "pass": pass_line,
            }
        )
    return {"dimensions": dimensions}


def _rating_for(score: float | None, config_item: Mapping[str, Any]) -> str | None:
    if score is None:
        return None
    if score >= config_item["excellent"]:
        return "excellent"
    if score >= config_item["pass"]:
        return "pass"
    return "need_improve"


def _percent(numerator: float | None, denominator: float | None) -> float | None:
    if not denominator:
        return None
    return round(numerator / denominator * 100, 1)


def _build_metrics(db: Session, profile: StudentProfile) -> dict[str, dict[str, Any]]:
    """一次性聚合各维度原始数据，返回 key -> {score, metrics}。"""
    student_id = profile.user_id
    class_id = profile.class_id

    result: dict[str, dict[str, Any]] = {}

    # 活动完成：按学案进度行统计（隐藏学案不计入应完成）
    progress_rows = db.execute(
        select(StudentLessonPlanProgress.progress_status, LessonPlan.is_hidden)
        .join(LessonPlan, LessonPlan.id == StudentLessonPlanProgress.plan_id)
        .where(StudentLessonPlanProgress.student_id == student_id)
    ).all()
    visible_progress = [row for row in progress_rows if not row[1]]
    assigned_count = len(visible_progress)
    completed_count = sum(1 for row in visible_progress if row[0] != "pending")
    result["task_completion"] = {
        "score": _percent(completed_count, assigned_count),
        "metrics": [
            {"label": "应完成学案", "value": str(assigned_count)},
            {"label": "已完成学案", "value": str(completed_count)},
        ],
    }

    # 作品质量：提交作品的教师评分（满分 120）
    submission_stats = db.execute(
        select(
            func.count(Submission.id),
            func.avg(Submission.score),
            func.sum(func.cast(Submission.is_recommended, Integer)),
        ).where(Submission.student_id == student_id)
    ).one()
    submission_count = int(submission_stats[0] or 0)
    avg_score = float(submission_stats[1]) if submission_stats[1] is not None else None
    recommended_count = int(submission_stats[2] or 0)
    quality_score = round(avg_score / 120 * 100, 1) if avg_score is not None else None
    result["work_quality"] = {
        "score": quality_score,
        "metrics": [
            {"label": "提交作品", "value": f"{submission_count} 次"},
            {"label": "平均得分", "value": f"{round(avg_score, 1)}" if avg_score is not None else "暂无评分"},
            {"label": "推荐作品", "value": f"{recommended_count} 次"},
        ],
    }

    # 测验：平均正确率
    quiz_rows = db.execute(
        select(QuizAttempt.correct_count, QuizAttempt.total_count).where(
            QuizAttempt.student_user_id == student_id,
            QuizAttempt.total_count > 0,
        )
    ).all()
    quiz_total = sum(int(row[1] or 0) for row in quiz_rows)
    quiz_correct = sum(int(row[0] or 0) for row in quiz_rows)
    result["quiz"] = {
        "score": _percent(quiz_correct, quiz_total),
        "metrics": [
            {"label": "测验次数", "value": f"{len(quiz_rows)} 次"},
            {"label": "累计正确率", "value": f"{round(_percent(quiz_correct, quiz_total) or 0, 1)}%"},
        ],
    }

    # 打字：平均正确率 + 最高速度
    typing_stats = db.execute(
        select(func.avg(TypingRecord.accuracy_percent), func.max(TypingRecord.speed_cpm), func.count(TypingRecord.id)).where(
            TypingRecord.student_user_id == student_id
        )
    ).one()
    typing_accuracy = float(typing_stats[0]) if typing_stats[0] is not None else None
    result["typing"] = {
        "score": round(typing_accuracy, 1) if typing_accuracy is not None else None,
        "metrics": [
            {"label": "训练次数", "value": f"{int(typing_stats[2] or 0)} 次"},
            {"label": "最高速度", "value": f"{int(typing_stats[1] or 0)} 字/分"},
            {"label": "平均正确率", "value": f"{round(typing_accuracy, 1)}%" if typing_accuracy is not None else "暂无记录"},
        ],
    }

    # 出勤：出勤记录 / 本班开课次数
    attended_count = int(
        db.scalar(
            select(func.count(AttendanceRecord.id)).where(AttendanceRecord.student_id == student_id)
        )
        or 0
    )
    session_count = int(
        db.scalar(
            select(func.count(ClassroomSession.id)).where(ClassroomSession.class_id == class_id)
        )
        or 0
    )
    result["attendance"] = {
        "score": min(_percent(attended_count, session_count) or 0.0, 100.0) if session_count else None,
        "metrics": [
            {"label": "出勤次数", "value": f"{attended_count} 次"},
            {"label": "本班开课", "value": f"{session_count} 次"},
        ],
    }

    # 课堂参与：讨论发言 + 阅读完成
    discussion_count = int(
        db.scalar(
            select(func.count(TaskDiscussionPost.id)).where(TaskDiscussionPost.author_user_id == student_id)
        )
        or 0
    )
    read_count = int(
        db.scalar(select(func.count(TaskReadRecord.id)).where(TaskReadRecord.student_id == student_id)) or 0
    )
    result["participation"] = {
        "score": min(100.0, discussion_count * 20 + read_count * 10),
        "metrics": [
            {"label": "讨论发言", "value": f"{discussion_count} 条"},
            {"label": "阅读完成", "value": f"{read_count} 次"},
        ],
    }

    # 互评参与：给出 + 收到
    given_votes = int(
        db.scalar(
            select(func.count(PeerReviewVote.id)).where(PeerReviewVote.reviewer_student_id == student_id)
        )
        or 0
    )
    received_votes = int(
        db.scalar(
            select(func.count(PeerReviewVote.id))
            .join(Submission, Submission.id == PeerReviewVote.target_submission_id)
            .where(Submission.student_id == student_id)
        )
        or 0
    )
    result["peer_review"] = {
        "score": min(100.0, (given_votes + received_votes) * 20),
        "metrics": [
            {"label": "给出互评", "value": f"{given_votes} 次"},
            {"label": "收到互评", "value": f"{received_votes} 次"},
        ],
    }

    # 小组协作：小组归属 + 小组草稿数
    membership = db.scalar(
        select(StudentGroupMember).where(StudentGroupMember.student_user_id == student_id)
    )
    group_draft_count = 0
    group_name = "未分组"
    if membership is not None:
        group_name = membership.group.name if membership.group else "未分组"
        group_draft_count = int(
            db.scalar(
                select(func.count(GroupTaskDraft.id)).where(GroupTaskDraft.group_id == membership.group_id)
            )
            or 0
        )
    result["collaboration"] = {
        "score": min(100.0, (40.0 if membership is not None else 0.0) + group_draft_count * 15),
        "metrics": [
            {"label": "所属小组", "value": group_name},
            {"label": "小组协作记录", "value": f"{group_draft_count} 次"},
        ],
    }

    # 学习主动性：云盘上传 + AI 学伴对话
    drive_count = int(
        db.scalar(select(func.count(DriveFile.id)).where(DriveFile.uploaded_by_user_id == student_id)) or 0
    )
    companion_count = int(
        db.scalar(
            select(func.count(CompanionConversation.id)).where(CompanionConversation.user_id == student_id)
        )
        or 0
    )
    result["proactivity"] = {
        "score": min(100.0, drive_count * 20 + companion_count * 10),
        "metrics": [
            {"label": "云盘上传", "value": f"{drive_count} 个文件"},
            {"label": "AI 学伴对话", "value": f"{companion_count} 个话题"},
        ],
    }

    return result


def build_student_portrait(
    db: Session,
    *,
    student: User,
    profile: StudentProfile,
    template,
) -> dict[str, Any]:
    config = normalize_template_config_from_json(template.config_json)
    metrics_by_key = _build_metrics(db, profile)

    dimensions: list[dict[str, Any]] = []
    enabled_scores: list[float] = []
    rating_counts = {"excellent": 0, "pass": 0, "need_improve": 0}
    for config_item in config["dimensions"]:
        key = config_item["key"]
        base = DIMENSION_BY_KEY[key]
        metric = metrics_by_key.get(key, {"score": None, "metrics": []})
        score = metric["score"]
        rating = _rating_for(score, config_item)
        if config_item["enabled"] and rating is not None:
            enabled_scores.append(float(score))
            rating_counts[rating] += 1
        dimensions.append(
            {
                "key": key,
                "label": config_item["label"],
                "description": base["description"],
                "enabled": config_item["enabled"],
                "score": round(score, 1) if score is not None else None,
                "rating": rating,
                "rating_label": RATING_LABELS.get(rating) if rating else None,
                "excellent": config_item["excellent"],
                "pass": config_item["pass"],
                "metrics": metric["metrics"],
            }
        )

    overall_score = round(sum(enabled_scores) / len(enabled_scores), 1) if enabled_scores else None

    return {
        "student": {
            "user_id": student.id,
            "name": student.display_name,
            "student_no": profile.student_no,
            "class_id": profile.class_id,
            "class_name": profile.school_class.class_name if profile.school_class else None,
            "grade_no": profile.grade_no,
            "gender": profile.gender,
        },
        "template": {
            "id": template.id,
            "name": template.name,
        },
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "overall_score": overall_score,
        "rating_counts": rating_counts,
        "dimensions": dimensions,
    }


def normalize_template_config_from_json(raw_json: str | None) -> dict[str, Any]:
    import json

    if not raw_json:
        return default_template_config()
    try:
        parsed = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return default_template_config()
    return normalize_template_config(parsed)
