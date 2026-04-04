from __future__ import annotations

from datetime import date, datetime

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AttendanceRecord, ComputerRoom, ComputerSeat, SchoolClass, User

LOOPBACK_IPS = {"127.0.0.1", "::1", "localhost"}


def resolve_client_ip(request: Request) -> str:
    forwarded_ip = request.headers.get("x-learnsite-device-ip") or request.headers.get("x-forwarded-for")
    if forwarded_ip:
        return forwarded_ip.split(",")[0].strip()

    if request.client is not None:
        return request.client.host or ""

    return ""


def load_loopback_demo_seat(student: User, db: Session) -> ComputerSeat | None:
    profile = student.student_profile
    if profile is None:
        return None

    school_class = db.scalar(
        select(SchoolClass)
        .where(SchoolClass.id == profile.class_id)
        .options(selectinload(SchoolClass.default_room).selectinload(ComputerRoom.seats))
    )
    if school_class is None or school_class.default_room is None:
        return None

    seats = sorted(
        [seat for seat in school_class.default_room.seats if seat.is_enabled],
        key=lambda item: (item.row_no, item.col_no, item.id),
    )
    if not seats:
        return None

    try:
        seat_index = max(int(profile.student_no[-2:]) - 1, 0)
    except ValueError:
        seat_index = max(student.id - 1, 0)

    return seats[seat_index % len(seats)]


def resolve_login_seat(student: User, client_ip: str, db: Session) -> ComputerSeat | None:
    if client_ip and client_ip not in LOOPBACK_IPS:
        seat = db.scalar(
            select(ComputerSeat)
            .where(ComputerSeat.ip_address == client_ip, ComputerSeat.is_enabled == True)  # noqa: E712
            .options(selectinload(ComputerSeat.room))
        )
        if seat is not None:
            return seat

    if client_ip in LOOPBACK_IPS:
        return load_loopback_demo_seat(student, db)

    return None


def ensure_student_login_attendance(student: User, request: Request, db: Session) -> AttendanceRecord | None:
    profile = student.student_profile
    if profile is None:
        return None

    today = date.today()
    client_ip = resolve_client_ip(request)
    seat = resolve_login_seat(student, client_ip, db)

    record = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.class_id == profile.class_id,
            AttendanceRecord.student_id == student.id,
            AttendanceRecord.attendance_date == today,
        )
    )
    if record is not None:
        if seat is not None and record.seat_id != seat.id:
            record.seat_id = seat.id
        if client_ip:
            record.client_ip = client_ip
        return record

    record = AttendanceRecord(
        class_id=profile.class_id,
        student_id=student.id,
        seat_id=seat.id if seat is not None else None,
        attendance_date=today,
        checked_in_at=datetime.now(),
        client_ip=client_ip or None,
        signin_source="login",
    )
    db.add(record)
    db.flush()
    return record
