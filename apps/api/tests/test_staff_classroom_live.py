"""课堂实时状态接口（GET /staff/classroom/live）的回归测试。

设计要点：
1. 数据自建、与 demo 数据隔离（班级/学生/学案全部用运行期随机后缀命名），
   因此本模块可以单独运行，也不依赖 test_smoke.py 的执行顺序。
2. 只覆盖接口契约：鉴权、无会话空态、签到统计、提交三档、空班级。
"""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEST_RUNTIME_ROOT = PROJECT_ROOT / ".pytest-runtime"
TEST_DB_PATH = TEST_RUNTIME_ROOT / "learnsite-test.db"
TEST_STORAGE_ROOT = TEST_RUNTIME_ROOT / "storage"

os.environ.setdefault("LEARNSITE_DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")
os.environ.setdefault("LEARNSITE_STORAGE_ROOT", str(TEST_STORAGE_ROOT))

from app.core.security import hash_password  # noqa: E402
from app.db.demo_seed import seed_demo_data  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AttendanceRecord,
    ClassroomSession,
    LessonPlan,
    SchoolClass,
    StudentProfile,
    Submission,
    Task,
    TeacherClassAssignment,
    User,
)

API_PREFIX = "/api/v1"
SUFFIX = uuid.uuid4().hex[:6]


@pytest.fixture(scope="session", autouse=True)
def ensure_demo_data():
    """幂等初始化：已有数据时不再重复播种，避免与其他测试模块互相清库。"""
    TEST_RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)
    init_db()
    seed_demo_data()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def staff_headers(client: TestClient, username: str = "t1", password: str = "222221") -> dict[str, str]:
    response = client.post(
        f"{API_PREFIX}/auth/staff/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _next_id(db, model) -> int:
    return int(db.scalar(select(func.max(model.id))) or 0) + 1


def _create_live_class() -> dict:
    """建一个班 + 3 名学生 + 2 活动学案 + 进行中会话 + 2 条签到 + 3 条提交。"""
    now = datetime.now().replace(microsecond=0)
    today = date.today()
    with SessionLocal() as db:
        teacher = db.scalar(select(User).where(User.username == "t1"))
        assert teacher is not None

        # 班级身份是 (entry_year, class_no)：测试班固定为 2099 级，
        # 与演示数据（2026 级等）互不干扰，班号 1/2 可以复用。
        school_class = SchoolClass(
            entry_year=2099,
            grade_no=99,
            class_no=1,
            class_name=f"99{SUFFIX}实时测试班",
        )
        empty_class = SchoolClass(
            entry_year=2099,
            grade_no=99,
            class_no=2,
            class_name=f"99{SUFFIX}空班级",
        )
        db.add_all([school_class, empty_class])
        db.flush()

        db.add_all(
            [
                TeacherClassAssignment(staff_user_id=teacher.id, class_id=school_class.id),
                TeacherClassAssignment(staff_user_id=teacher.id, class_id=empty_class.id),
            ]
        )

        students: list[User] = []
        for index in range(1, 4):
            student = User(
                username=f"live{SUFFIX}{index}",
                password_hash=hash_password("12345"),
                display_name=f"实时学生{index}",
                user_type="student",
                is_active=True,
            )
            db.add(student)
            db.flush()
            db.add(
                StudentProfile(
                    user_id=student.id,
                    student_no=f"99{SUFFIX}{index}",
                    grade_no=99,
                    class_id=school_class.id,
                    gender="未知",
                    entry_year=now.year,
                )
            )
            students.append(student)

        plan = LessonPlan(
            id=_next_id(db, LessonPlan),
            lesson_id=None,
            title=f"实时状态学案{SUFFIX}",
            content="",
            status="active",
            assigned_date=today,
        )
        db.add(plan)
        db.flush()

        first_task = Task(
            id=_next_id(db, Task),
            plan_id=plan.id,
            title="活动一",
            task_type="upload",
            submission_scope="individual",
            sort_order=1,
        )
        second_task = Task(
            id=_next_id(db, Task) + 1,
            plan_id=plan.id,
            title="活动二",
            task_type="upload",
            submission_scope="individual",
            sort_order=2,
        )
        db.add_all([first_task, second_task])
        db.flush()

        db.add(
            ClassroomSession(
                class_id=school_class.id,
                plan_id=plan.id,
                started_by_staff_id=teacher.id,
                status="active",
                started_at=now,
            )
        )

        # 学生一、二已签到，学生三未签到
        for student in students[:2]:
            db.add(
                AttendanceRecord(
                    class_id=school_class.id,
                    student_id=student.id,
                    seat_id=None,
                    attendance_date=today,
                    checked_in_at=now,
                    client_ip="127.0.0.1",
                    signin_source="login",
                )
            )

        # 学生一交了 1/2（partial），学生二交了 2/2（completed），学生三 0/2（none）
        submission_rows = [
            (first_task.id, students[0].id),
            (first_task.id, students[1].id),
            (second_task.id, students[1].id),
        ]
        next_submission_id = _next_id(db, Submission)
        for offset, (task_id, student_id) in enumerate(submission_rows):
            db.add(
                Submission(
                    id=next_submission_id + offset,
                    task_id=task_id,
                    student_id=student_id,
                    submit_status="submitted",
                    submitted_at=now,
                    is_recommended=False,
                )
            )

        db.commit()
        return {
            "class_id": school_class.id,
            "empty_class_id": empty_class.id,
            "student_nos": [f"99{SUFFIX}{index}" for index in range(1, 4)],
        }


@pytest.fixture(scope="module")
def live_fixture() -> dict:
    return _create_live_class()


def test_live_endpoint_reports_attendance_and_submission_stages(client: TestClient, live_fixture: dict):
    teacher = staff_headers(client)
    response = client.get(
        f"{API_PREFIX}/staff/classroom/live",
        params={"class_id": live_fixture["class_id"]},
        headers=teacher,
    )

    assert response.status_code == 200
    payload = response.json()["data"]

    assert payload["session"] is not None
    assert payload["session"]["status"] == "active"
    assert payload["session"]["plan_title"] == f"实时状态学案{SUFFIX}"
    # 学案未绑定课次时，「上哪节课」回落到学案标题，保证首屏不空
    assert payload["session"]["lesson_title"] == f"实时状态学案{SUFFIX}"
    assert payload["session"]["task_count"] == 2

    attendance = payload["attendance"]
    assert attendance["student_count"] == 3
    assert attendance["checked_in_count"] == 2
    assert attendance["pending_signin_count"] == 1
    assert [item["student_no"] for item in attendance["pending_students"]] == [live_fixture["student_nos"][2]]

    submission = payload["submission"]
    assert submission["task_count"] == 2
    assert submission["submitted_count"] == 3
    assert submission["pending_review_count"] == 3
    assert submission["completed_student_count"] == 1
    assert submission["partial_student_count"] == 1
    assert submission["none_student_count"] == 1

    stages = {item["student_no"]: item["submission_stage"] for item in payload["students"]}
    assert stages == {
        live_fixture["student_nos"][0]: "partial",
        live_fixture["student_nos"][1]: "completed",
        live_fixture["student_nos"][2]: "none",
    }
    signed_in = {item["student_no"]: item["signed_in_at"] is not None for item in payload["students"]}
    assert signed_in[live_fixture["student_nos"][2]] is False
    assert payload["generated_at"]


def test_live_endpoint_returns_empty_state_for_never_started_class(client: TestClient, live_fixture: dict):
    teacher = staff_headers(client)
    response = client.get(
        f"{API_PREFIX}/staff/classroom/live",
        params={"class_id": live_fixture["empty_class_id"]},
        headers=teacher,
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["session"] is None
    assert payload["attendance"]["student_count"] == 0
    assert payload["attendance"]["checked_in_count"] == 0
    assert payload["attendance"]["pending_students"] == []
    assert payload["submission"]["task_count"] == 0
    assert payload["students"] == []


def test_live_endpoint_rejects_teacher_without_class_access(client: TestClient, live_fixture: dict):
    other_teacher = staff_headers(client, "t2")
    response = client.get(
        f"{API_PREFIX}/staff/classroom/live",
        params={"class_id": live_fixture["class_id"]},
        headers=other_teacher,
    )

    assert response.status_code == 403
    assert "无权" in response.json()["detail"]
