from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReviewTemplate, User

DEFAULT_REVIEW_TEMPLATES = (
    {
        "title": "结构完整",
        "group_name": "课堂表现",
        "sort_order": 10,
        "score": 90,
        "comment": "作品结构清晰，内容完整，能准确表达本课主题。建议再补充一个更贴近生活的案例，让表达更有说服力。",
    },
    {
        "title": "创意表现好",
        "group_name": "课堂表现",
        "sort_order": 20,
        "score": 95,
        "comment": "你的作品有自己的想法，展示方式也很有亮点。后续如果能把关键步骤再说明得更具体，会更优秀。",
    },
    {
        "title": "基础达标",
        "group_name": "改进建议",
        "sort_order": 10,
        "score": 82,
        "comment": "任务基本完成，能够体现本课要求。建议继续完善细节，并补充过程说明，让作品更完整。",
    },
    {
        "title": "继续完善",
        "group_name": "改进建议",
        "sort_order": 20,
        "score": 72,
        "comment": "已经完成了基础提交，但内容还可以继续充实。请重点补充关键知识点说明，并检查作品的完整性。",
    },
)


def ensure_default_review_templates(session: Session) -> None:
    has_templates = session.scalar(select(ReviewTemplate.id).limit(1))
    if has_templates is not None:
        return

    staff_users = session.scalars(select(User).where(User.user_type == "staff")).all()
    if not staff_users:
        return

    for staff_user in staff_users:
        session.add_all(
            [
                ReviewTemplate(
                    staff_user_id=staff_user.id,
                    title=payload["title"],
                    group_name=payload["group_name"],
                    sort_order=payload["sort_order"],
                    score=payload["score"],
                    comment=payload["comment"],
                )
                for payload in DEFAULT_REVIEW_TEMPLATES
            ]
        )
