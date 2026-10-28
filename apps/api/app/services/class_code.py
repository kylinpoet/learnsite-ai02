"""班级码：学生登录页用来换取本班名单的短口令。

班级码是「名单的访问口令」而不是身份凭据：拿到它只能看到本班姓名列表，
正式登录仍需学生自己的密码。因此字符集去掉 0/O/1/I/L 这类投屏与小抄都容易看错的字符。
"""

from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SchoolClass

CLASS_CODE_LENGTH = 6
CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_CLASS_CODE_RETRY_LIMIT = 32


def normalize_class_code(value: str | None) -> str:
    return (value or "").strip().upper().replace("-", "").replace(" ", "")


def _random_code() -> str:
    return "".join(secrets.choice(CLASS_CODE_ALPHABET) for _ in range(CLASS_CODE_LENGTH))


def generate_unique_class_code(db: Session) -> str:
    for _ in range(_CLASS_CODE_RETRY_LIMIT):
        candidate = _random_code()
        exists = db.scalar(select(SchoolClass.id).where(SchoolClass.class_code == candidate))
        if exists is None:
            return candidate
    raise RuntimeError("无法生成唯一的班级码，请检查 school_classes.class_code 唯一索引")


def ensure_class_code(school_class: SchoolClass, db: Session) -> str:
    """读取班级码；历史数据没有码时补一个并落库。"""
    if school_class.class_code:
        return school_class.class_code
    school_class.class_code = generate_unique_class_code(db)
    db.flush()
    return school_class.class_code


def regenerate_class_code(school_class: SchoolClass, db: Session) -> str:
    school_class.class_code = generate_unique_class_code(db)
    db.flush()
    return school_class.class_code


def find_class_by_code(raw_code: str | None, db: Session) -> SchoolClass | None:
    code = normalize_class_code(raw_code)
    if len(code) != CLASS_CODE_LENGTH:
        return None
    return db.scalar(select(SchoolClass).where(SchoolClass.class_code == code))
