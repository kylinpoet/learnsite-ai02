"""test_smoke.py 的共享测试辅助函数。

提取到这里以便复用；pytest 只会收集 `test_*.py`,因此本文件不会被当作测试用例。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

API_PREFIX = "/api/v1"


def student_headers(
    client: TestClient,
    username: str = "70101",
    password: str = "12345",
    extra_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    response = client.post(
        f"{API_PREFIX}/auth/student/login",
        json={"username": username, "password": password},
        headers=extra_headers or {},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def staff_headers(client: TestClient, username: str = "t1", password: str = "222221") -> dict[str, str]:
    response = client.post(
        f"{API_PREFIX}/auth/staff/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def find_class(payload: dict, class_name: str) -> dict:
    return next(item for item in payload["launchpad"]["classes"] if item["class_name"] == class_name)


def find_roster(payload: dict, class_name: str) -> dict:
    return next(item for item in payload["class_rosters"] if item["class_name"] == class_name)


def find_seat_by_student(roster: dict, student_no: str) -> dict:
    return next(item for item in roster["seats"] if item["student"] and item["student"]["student_no"] == student_no)


def find_lesson_id_by_title(books: list[dict], lesson_title: str) -> int:
    for book in books:
        for unit in book["units"]:
            for lesson in unit["lessons"]:
                if lesson["title"] == lesson_title:
                    return lesson["id"]
    raise AssertionError(f"lesson not found: {lesson_title}")


def create_published_plan_with_active_session(
    client: TestClient,
    teacher_headers: dict[str, str],
    *,
    lesson_id: int,
    title: str,
    content: str,
    assigned_date: str,
    tasks: list[dict],
    class_id: int = 1,
) -> dict:
    create_response = client.post(
        f"{API_PREFIX}/lesson-plans/staff",
        headers=teacher_headers,
        json={
            "lesson_id": lesson_id,
            "title": title,
            "content": content,
            "assigned_date": assigned_date,
            "status": "draft",
            "tasks": tasks,
        },
    )
    assert create_response.status_code == 200
    created_plan = create_response.json()["data"]["plan"]

    publish_response = client.post(
        f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}/publish",
        headers=teacher_headers,
    )
    assert publish_response.status_code == 200

    start_response = client.post(
        f"{API_PREFIX}/classroom/sessions",
        headers=teacher_headers,
        json={"class_id": class_id, "plan_id": created_plan["id"]},
    )
    assert start_response.status_code == 200
    return created_plan


def start_classroom_session_for_plan(
    client: TestClient,
    teacher_headers: dict[str, str],
    *,
    class_id: int,
    plan_id: int,
) -> int:
    start_response = client.post(
        f"{API_PREFIX}/classroom/sessions",
        headers=teacher_headers,
        json={"class_id": class_id, "plan_id": plan_id},
    )
    assert start_response.status_code == 200
    return start_response.json()["data"]["session"]["session_id"]
