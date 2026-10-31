"""届别与年级的换算。

初中三年制下，班级「跟届走」：同一届的班级从七年级读到九年级是同一行记录，
年级随升班递增，而入学年份（届）终身不变。因此年级是派生量：

    年级 = 当前学年 - 入学年份 + 7

本模块集中这份换算，避免各处各写一个公式（历史上这里散落过硬编码 2026，
且公式差了一年，见 school_classes 重建迁移的注释）。
"""

# 初中学段年级范围：七年级(7) ~ 九年级(9)。
MIN_GRADE_NO = 7
MAX_GRADE_NO = 9


def resolve_grade_no(entry_year: int, current_school_year: int) -> int:
    """由入学年份与当前学年推导年级。

    入学当年即为七年级，每过一年升一级。允许推导出超出 7~9 的范围——
    调用方需要自己判断「已毕业」并归档，这里不做截断。
    """
    return current_school_year - entry_year + MIN_GRADE_NO


def resolve_entry_year(grade_no: int, current_school_year: int) -> int:
    """由年级与当前学年反推入学年份（resolve_grade_no 的逆运算）。"""
    return current_school_year - (grade_no - MIN_GRADE_NO)


def is_graduated(grade_no: int) -> bool:
    """年级超过九年级即已毕业，对应入学年份的那一届应当归档。"""
    return grade_no > MAX_GRADE_NO


def format_class_name(grade_no: int, class_no: int) -> str:
    """班级显示名：年级数字 + 两位班号，例如 701班、812班。"""
    return f"{grade_no}{class_no:02d}班"


_GRADE_LABELS = {7: "七年级", 8: "八年级", 9: "九年级"}


def format_grade_label(grade_no: int) -> str:
    """年级的中文写法，例如 7 → 七年级；超出初中范围时回退成「7 年级」。"""
    return _GRADE_LABELS.get(grade_no, f"{grade_no} 年级")


def format_class_label(class_name: str, entry_year: int) -> str:
    """带届别的班级标签，用于跨届重名时消歧，例如「701班 · 2026届」。"""
    return f"{class_name} · {entry_year}届"
