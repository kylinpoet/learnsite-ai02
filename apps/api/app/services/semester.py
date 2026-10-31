"""学年学期的换算与标识。

国内中学每学年固定两个学期：

    第一学期：当年 9 月 ~ 次年 1 月
    第二学期：次年 2 月 ~ 次年 8 月（暑假算在第二学期内收尾）

因此「某一天属于哪个学期」是可由日期推导的派生量，和 class_cohort 里的
年级换算一样集中在本模块，避免各处各写一套日期判断。

学期用一个稳定的字符串标识（如 "2026-1"）承载，学案建好时就冻结所属学期：
之后管理员把「当前学期」滚动到新学期，历史学案仍归属原学期，
按学期筛选因此退化成一次等值查询。
"""

from datetime import date

# 每学年固定两个学期。
SEMESTER_LABELS: dict[int, str] = {
    1: "第一学期",
    2: "第二学期",
}
MIN_SEMESTER_NO = 1
MAX_SEMESTER_NO = 2

# 无法解析的学期统一显示成这个标签，界面上便于筛出「未归属」的数据。
UNASSIGNED_SEMESTER_LABEL = "未归属学期"


def is_valid_semester_no(semester_no: int) -> bool:
    return MIN_SEMESTER_NO <= semester_no <= MAX_SEMESTER_NO


def resolve_school_year_for_date(value: date) -> int:
    """某一天所属的学年：9 月开学进入新学年，1~8 月仍属上一学年。"""
    return value.year if value.month >= 9 else value.year - 1


def resolve_semester_no_for_date(value: date) -> int:
    """某一天所属的学期序号：9~12 月与次年 1 月为第一学期，2~8 月为第二学期。"""
    if value.month >= 9 or value.month == 1:
        return 1
    return 2


def resolve_semester_key_for_date(value: date) -> str:
    """某一天所属的学期标识，例如 2026-10-08 → "2026-1"。"""
    return format_semester_key(
        resolve_school_year_for_date(value),
        resolve_semester_no_for_date(value),
    )


def format_semester_key(school_year: int, semester_no: int) -> str:
    """学期标识：学年 + 学期序号，例如 (2026, 1) → "2026-1"。"""
    return f"{int(school_year)}-{int(semester_no)}"


def parse_semester_key(value: str | None) -> tuple[int, int] | None:
    """把学期标识解析回 (学年, 学期序号)；格式非法时返回 None。"""
    raw = (value or "").strip()
    if not raw:
        return None
    year_text, separator, semester_text = raw.partition("-")
    if not separator:
        return None
    try:
        school_year = int(year_text)
        semester_no = int(semester_text)
    except ValueError:
        return None
    if not is_valid_semester_no(semester_no):
        return None
    return school_year, semester_no


def normalize_semester_key(value: str | None) -> str | None:
    """把任意输入收敛成合法的学期标识；无法解析时返回 None。"""
    parsed = parse_semester_key(value)
    if parsed is None:
        return None
    return format_semester_key(*parsed)


def format_semester_label(school_year: int | None, semester_no: int | None) -> str:
    """学期展示名，例如 "2026学年第一学期"；信息不全时回退为「未归属学期」。"""
    if school_year is None or semester_no is None or not is_valid_semester_no(semester_no):
        return UNASSIGNED_SEMESTER_LABEL
    return f"{int(school_year)}学年{SEMESTER_LABELS[semester_no]}"


def format_semester_key_label(value: str | None) -> str:
    """由学期标识直接得到展示名，例如 "2026-1" → "2026学年第一学期"。"""
    parsed = parse_semester_key(value)
    if parsed is None:
        return UNASSIGNED_SEMESTER_LABEL
    return format_semester_label(*parsed)


def semester_options() -> list[dict[str, object]]:
    """供前端下拉使用的学期选项。"""
    return [
        {"semester_no": semester_no, "label": label}
        for semester_no, label in SEMESTER_LABELS.items()
    ]


def semester_date_range(semester_key: str | None) -> tuple[date, date] | None:
    """学期标识对应的日期闭区间 [起, 止)，用于按日期字段（如签到）过滤。

    第一学期：9/1 ~ 次年 1/31；第二学期：2/1 ~ 8/31。
    解析失败时返回 None，调用方按「不过滤」处理。
    """
    parsed = parse_semester_key(semester_key)
    if parsed is None:
        return None
    school_year, semester_no = parsed
    if semester_no == 1:
        return date(school_year, 9, 1), date(school_year + 1, 2, 1)
    return date(school_year + 1, 2, 1), date(school_year + 1, 9, 1)
