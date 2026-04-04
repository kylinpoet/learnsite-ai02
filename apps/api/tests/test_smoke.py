from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEST_RUNTIME_ROOT = PROJECT_ROOT / ".pytest-runtime"
TEST_DB_PATH = TEST_RUNTIME_ROOT / "learnsite-test.db"
TEST_STORAGE_ROOT = TEST_RUNTIME_ROOT / "storage"

os.environ["LEARNSITE_DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["LEARNSITE_STORAGE_ROOT"] = str(TEST_STORAGE_ROOT)

from app.main import app

API_PREFIX = "/api/v1"
DB_PATH = TEST_DB_PATH
SUBMISSION_STORAGE = TEST_STORAGE_ROOT / "submissions"


@pytest.fixture(scope="session", autouse=True)
def reset_demo_data():
    TEST_RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    if SUBMISSION_STORAGE.exists():
        shutil.rmtree(SUBMISSION_STORAGE)
    yield


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


def test_application_title_and_health():
    assert app.title == "LearnSite API"
    with TestClient(app) as client:
        response = client.get(f"{API_PREFIX}/health")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "healthy"


def test_cors_preflight_allows_local_dev_origins():
    with TestClient(app) as client:
        localhost_response = client.options(
            f"{API_PREFIX}/auth/student/login",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
        )
        loopback_response = client.options(
            f"{API_PREFIX}/auth/student/login",
            headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"},
        )

    assert localhost_response.status_code == 200
    assert localhost_response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert loopback_response.status_code == 200
    assert loopback_response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_student_login_auto_signs_from_bound_loopback_ip():
    with TestClient(app) as client:
        headers = student_headers(client, username="70105", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})
        me_response = client.get(f"{API_PREFIX}/auth/me", headers=headers)
        home_response = client.get(f"{API_PREFIX}/lesson-plans/student/home", headers=headers)
        teacher = staff_headers(client, "t1")
        dashboard_response = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher)

    assert me_response.status_code == 200
    assert me_response.json()["data"]["username"] == "70105"
    assert "student" in me_response.json()["data"]["roles"]

    assert home_response.status_code == 200
    home_payload = home_response.json()["data"]
    assert home_payload["profile"]["class_name"] == "701班"
    assert any(item["name"] == "郑嘉木" for item in home_payload["attendance_today"])

    assert dashboard_response.status_code == 200
    roster = find_roster(dashboard_response.json()["data"], "701班")
    seat = find_seat_by_student(roster, "70105")
    assert seat["signed_in_today"] is True
    assert seat["checked_in_at"]
    assert seat["student"]["submission_count"] >= 0
    assert seat["student"]["reviewed_submission_count"] >= 0
    assert seat["student"]["pending_review_count"] >= 0
    assert seat["student"]["focus_plan_submission_status"] in {"reviewed", "submitted", "not_started", None}
    assert sum(1 for item in roster["seats"] if item["student"]) == roster["checked_in_count"]


def test_student_can_open_reading_task_and_mark_it_read():
    with TestClient(app) as client:
        headers = student_headers(client, username="70101", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})

        detail_response = client.get(f"{API_PREFIX}/tasks/57", headers=headers)
        assert detail_response.status_code == 200
        detail_payload = detail_response.json()["data"]
        assert detail_payload["task_type"] == "reading"
        assert detail_payload["course"]["title"] == "七下第三单元 第8课 智能应用体验"
        assert detail_payload["task_navigation"]["next_task"]["id"] == 58
        assert detail_payload["reading_progress"]["is_read"] is False
        assert detail_payload["reading_progress"]["read_at"] is None

        mark_read_response = client.post(f"{API_PREFIX}/tasks/57/mark-read", headers=headers)
        assert mark_read_response.status_code == 200
        mark_read_payload = mark_read_response.json()["data"]
        assert mark_read_payload["reading_progress"]["is_read"] is True
        assert mark_read_payload["reading_progress"]["read_at"]
        assert mark_read_payload["reading_progress"]["can_mark_read"] is False

        refreshed_response = client.get(f"{API_PREFIX}/tasks/57", headers=headers)
        assert refreshed_response.status_code == 200
        refreshed_payload = refreshed_response.json()["data"]
        assert refreshed_payload["reading_progress"]["is_read"] is True


def test_student_personal_drive_upload_download_and_delete():
    with TestClient(app) as client:
        headers = student_headers(client, username="70101", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})

        initial_response = client.get(f"{API_PREFIX}/drives/me", headers=headers)
        assert initial_response.status_code == 200
        initial_payload = initial_response.json()["data"]
        assert initial_payload["personal_space"]["quota_mb"] == 128
        assert initial_payload["personal_space"]["file_count"] == 0

        upload_response = client.post(
            f"{API_PREFIX}/drives/me/files",
            headers=headers,
            files=[("files", ("my-notes.html", b"<p>hello drive</p>", "text/html"))],
        )
        assert upload_response.status_code == 200
        upload_payload = upload_response.json()["data"]
        assert upload_payload["personal_space"]["file_count"] == 1
        uploaded_file = upload_payload["personal_space"]["files"][0]
        assert uploaded_file["name"] == "my-notes.html"

        download_response = client.get(f"{API_PREFIX}/drives/files/{uploaded_file['id']}", headers=headers)
        assert download_response.status_code == 200
        assert download_response.content == b"<p>hello drive</p>"

        delete_response = client.delete(f"{API_PREFIX}/drives/files/{uploaded_file['id']}", headers=headers)
        assert delete_response.status_code == 200
        delete_payload = delete_response.json()["data"]
        assert delete_payload["personal_space"]["file_count"] == 0


def test_student_group_page_and_shared_drive_permissions():
    with TestClient(app) as client:
        leader_headers = student_headers(
            client,
            username="70101",
            extra_headers={"x-learnsite-device-ip": "127.0.0.1"},
        )
        member_headers = student_headers(client, username="70102")

        group_response = client.get(f"{API_PREFIX}/groups/me", headers=leader_headers)
        assert group_response.status_code == 200
        group_payload = group_response.json()["data"]
        assert group_payload["group"]["class_name"].startswith("701")
        assert group_payload["group"]["group_no"] == 1
        assert group_payload["group"]["me_role"] == "leader"
        assert group_payload["today_summary"]["member_count"] == len(group_payload["members"])
        assert group_payload["shared_drive"]["enabled"] is True
        assert group_payload["members"][0]["role"] == "leader"

        drive_response = client.get(f"{API_PREFIX}/drives/me", headers=leader_headers)
        assert drive_response.status_code == 200
        drive_payload = drive_response.json()["data"]
        assert drive_payload["group_space"]["enabled"] is True
        assert drive_payload["group_space"]["group_name"] == group_payload["group"]["name"]

        upload_response = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=leader_headers,
            files=[("files", ("group-plan.txt", b"group notes", "text/plain"))],
        )
        assert upload_response.status_code == 200
        upload_payload = upload_response.json()["data"]
        assert upload_payload["group_space"]["file_count"] == 1
        uploaded_file = upload_payload["group_space"]["files"][0]

        group_refresh = client.get(f"{API_PREFIX}/groups/me", headers=leader_headers)
        assert group_refresh.status_code == 200
        refreshed_group_payload = group_refresh.json()["data"]
        assert refreshed_group_payload["shared_drive"]["file_count"] == 1
        assert refreshed_group_payload["shared_drive"]["recent_files"][0]["id"] == uploaded_file["id"]

        member_drive = client.get(f"{API_PREFIX}/drives/me", headers=member_headers)
        assert member_drive.status_code == 200
        member_group_space = member_drive.json()["data"]["group_space"]
        leader_uploaded_file = next(
            item for item in member_group_space["files"] if item["id"] == uploaded_file["id"]
        )
        assert leader_uploaded_file["uploaded_by_student_no"] == "70101"
        assert leader_uploaded_file["can_delete"] is False

        member_download = client.get(f"{API_PREFIX}/drives/files/{uploaded_file['id']}", headers=member_headers)
        assert member_download.status_code == 200
        assert member_download.content == b"group notes"

        blocked_delete = client.delete(f"{API_PREFIX}/drives/files/{uploaded_file['id']}", headers=member_headers)
        assert blocked_delete.status_code == 403
        assert blocked_delete.json()["detail"] == "当前只允许删除自己上传的共享文件；组长可删除本组全部共享文件"

        member_upload = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=member_headers,
            files=[("files", ("member-notes.txt", b"member notes", "text/plain"))],
        )
        assert member_upload.status_code == 200
        member_uploaded_file = next(
            item
            for item in member_upload.json()["data"]["group_space"]["files"]
            if item["original_name"] == "member-notes.txt"
        )
        assert member_uploaded_file["uploaded_by_student_no"] == "70102"
        assert member_uploaded_file["can_delete"] is True

        member_delete_own = client.delete(
            f"{API_PREFIX}/drives/files/{member_uploaded_file['id']}",
            headers=member_headers,
        )
        assert member_delete_own.status_code == 200
        assert member_delete_own.json()["data"]["group_space"]["file_count"] == 1

        leader_after_member_delete = client.get(f"{API_PREFIX}/drives/me", headers=leader_headers)
        assert leader_after_member_delete.status_code == 200
        leader_group_space = leader_after_member_delete.json()["data"]["group_space"]
        leader_view_file = next(item for item in leader_group_space["files"] if item["id"] == uploaded_file["id"])
        assert leader_view_file["can_delete"] is True

        leader_delete = client.delete(f"{API_PREFIX}/drives/files/{uploaded_file['id']}", headers=leader_headers)
        assert leader_delete.status_code == 200
        delete_payload = leader_delete.json()["data"]
        assert delete_payload["group_space"]["file_count"] == 0


def test_staff_can_view_class_groups_and_download_shared_files():
    with TestClient(app) as client:
        leader_headers = student_headers(
            client,
            username="70101",
            extra_headers={"x-learnsite-device-ip": "127.0.0.1"},
        )
        teacher_one = staff_headers(client, "t1")
        teacher_two = staff_headers(client, "t2")
        admin = staff_headers(client, "admin")

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher_one).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]

        upload_response = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=leader_headers,
            files=[("files", ("group-teacher-check.txt", b"group file for teacher", "text/plain"))],
        )
        assert upload_response.status_code == 200
        shared_file = upload_response.json()["data"]["group_space"]["files"][0]

        teacher_overview = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher_one,
        )
        assert teacher_overview.status_code == 200
        teacher_payload = teacher_overview.json()["data"]
        assert teacher_payload["class"]["id"] == class_701["id"]
        assert teacher_payload["class"]["group_count"] >= 1
        assert teacher_payload["class"]["shared_file_count"] >= 1
        assert any(
            file_item["id"] == shared_file["id"]
            for group in teacher_payload["groups"]
            for file_item in group["shared_drive"]["files"]
        )

        download_response = client.get(
            f"{API_PREFIX}/staff/drives/files/{shared_file['id']}",
            headers=teacher_one,
        )
        assert download_response.status_code == 200
        assert download_response.content == b"group file for teacher"

        blocked_overview = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher_two,
        )
        assert blocked_overview.status_code == 403

        blocked_download = client.get(
            f"{API_PREFIX}/staff/drives/files/{shared_file['id']}",
            headers=teacher_two,
        )
        assert blocked_download.status_code == 403

        admin_overview = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=admin,
        )
        assert admin_overview.status_code == 200
        assert admin_overview.json()["data"]["class"]["id"] == class_701["id"]


def test_staff_can_upload_files_to_group_shared_space_and_students_can_read_them():
    with TestClient(app) as client:
        teacher_one = staff_headers(client, "t1")
        blocked_teacher = staff_headers(client, "t2")

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher_one).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]
        teacher_name = dashboard_payload["current_user"]["display_name"]

        overview_response = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher_one,
        )
        assert overview_response.status_code == 200
        target_group = next(item for item in overview_response.json()["data"]["groups"] if item["members"])
        leader_student_no = next(
            member["student_no"]
            for member in target_group["members"]
            if member["role"] == "leader"
        )
        leader_headers = student_headers(client, username=leader_student_no)

        blocked_upload = client.post(
            f"{API_PREFIX}/staff/groups/{target_group['id']}/drive/files",
            headers=blocked_teacher,
            files=[("files", ("blocked.txt", b"blocked", "text/plain"))],
        )
        assert blocked_upload.status_code == 403

        upload_response = client.post(
            f"{API_PREFIX}/staff/groups/{target_group['id']}/drive/files",
            headers=teacher_one,
            files=[("files", ("teacher-pack.txt", b"teacher handout", "text/plain"))],
        )
        assert upload_response.status_code == 200
        upload_payload = upload_response.json()["data"]
        uploaded_group = next(item for item in upload_payload["groups"] if item["id"] == target_group["id"])
        uploaded_file = next(
            item
            for item in uploaded_group["shared_drive"]["files"]
            if item["original_name"] == "teacher-pack.txt"
        )
        assert uploaded_file["uploaded_by_name"] == teacher_name
        assert any(log["event_type"] == "teacher_group_file_uploaded" for log in uploaded_group["operation_logs"])

        student_drive = client.get(f"{API_PREFIX}/drives/me", headers=leader_headers)
        assert student_drive.status_code == 200
        group_space = student_drive.json()["data"]["group_space"]
        student_visible_file = next(item for item in group_space["files"] if item["id"] == uploaded_file["id"])
        assert student_visible_file["uploaded_by_name"] == teacher_name

        student_download = client.get(
            f"{API_PREFIX}/drives/files/{uploaded_file['id']}",
            headers=leader_headers,
        )
        assert student_download.status_code == 200
        assert student_download.content == b"teacher handout"

        student_group_page = client.get(f"{API_PREFIX}/groups/me", headers=leader_headers)
        assert student_group_page.status_code == 200
        assert "teacher_group_file_uploaded" in {
            item["event_type"] for item in student_group_page.json()["data"]["operation_logs"]
        }

        cleanup_response = client.delete(
            f"{API_PREFIX}/drives/files/{uploaded_file['id']}",
            headers=leader_headers,
        )
        assert cleanup_response.status_code == 200


def test_staff_can_manage_groups_rebuild_and_adjust_leader():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]

        initial_management = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/group-management",
            headers=teacher,
        )
        assert initial_management.status_code == 200
        initial_payload = initial_management.json()["data"]
        student_70101 = next(item for item in initial_payload["students"] if item["student_no"] == "70101")
        student_70102 = next(item for item in initial_payload["students"] if item["student_no"] == "70102")

        create_response = client.post(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher,
            json={},
        )
        assert create_response.status_code == 200
        created_payload = create_response.json()["data"]
        assert created_payload["class"]["group_count"] == initial_payload["class"]["group_count"] + 1
        new_group = max(created_payload["groups"], key=lambda item: item["group_no"])

        save_groups = []
        for group in created_payload["groups"]:
            member_user_ids = [member["user_id"] for member in group["members"]]
            if group["id"] == new_group["id"]:
                member_user_ids = [student_70101["user_id"], student_70102["user_id"]]
                leader_user_id = student_70102["user_id"]
                name = "701 Project Group"
                description = "Teacher-adjusted project group for classroom collaboration."
            else:
                member_user_ids = [
                    user_id for user_id in member_user_ids if user_id not in {student_70101["user_id"], student_70102["user_id"]}
                ]
                leader_user_id = member_user_ids[0] if member_user_ids else None
                name = group["name"]
                description = group["description"]

            save_groups.append(
                {
                    "id": group["id"],
                    "name": name,
                    "description": description,
                    "leader_user_id": leader_user_id,
                    "member_user_ids": member_user_ids,
                }
            )

        save_response = client.put(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/group-management",
            headers=teacher,
            json={"groups": save_groups},
        )
        assert save_response.status_code == 200
        saved_payload = save_response.json()["data"]
        project_group = next(item for item in saved_payload["groups"] if item["id"] == new_group["id"])
        assert project_group["name"] == "701 Project Group"
        assert project_group["leader_user_id"] == student_70102["user_id"]
        assert {member["student_no"] for member in project_group["members"]} == {"70101", "70102"}

        student_group = client.get(
            f"{API_PREFIX}/groups/me",
            headers=student_headers(client, "70102"),
        )
        assert student_group.status_code == 200
        student_group_payload = student_group.json()["data"]
        assert student_group_payload["group"]["name"] == "701 Project Group"
        assert student_group_payload["group"]["me_role"] == "leader"

        rebuild_response = client.post(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups/rebuild",
            headers=teacher,
            json={"group_count": 3},
        )
        assert rebuild_response.status_code == 200
        rebuild_payload = rebuild_response.json()["data"]
        non_empty_groups = [item for item in rebuild_payload["groups"] if item["member_count"] > 0]
        assert len(non_empty_groups) == 3
        assert sum(item["member_count"] for item in non_empty_groups) == rebuild_payload["class"]["student_count"]

        empty_group = next(item for item in rebuild_payload["groups"] if item["member_count"] == 0 and not item["has_shared_files"])
        delete_response = client.delete(
            f"{API_PREFIX}/staff/groups/{empty_group['id']}",
            headers=teacher,
        )
        assert delete_response.status_code == 200
        delete_payload = delete_response.json()["data"]
        assert all(item["id"] != empty_group["id"] for item in delete_payload["groups"])


def test_student_and_staff_can_see_group_activity_feed():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student = student_headers(
            client,
            username="70105",
            extra_headers={"x-learnsite-device-ip": "127.0.0.1"},
        )

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        available_classes = dashboard_payload["launchpad"]["classes"]
        assert available_classes

        task_id = None
        for plan in dashboard_payload["launchpad"]["ready_plans"]:
            progress_response = client.get(
                f"{API_PREFIX}/staff/classes/{class_701['id']}/plans/{plan['id']}/group-task-progress",
                headers=teacher,
            )
            assert progress_response.status_code == 200
            tasks = progress_response.json()["data"]["tasks"]
            if tasks:
                task_id = tasks[0]["task_id"]
                break

        assert task_id is not None

        student_group_response = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert student_group_response.status_code == 200
        student_group_id = student_group_response.json()["data"]["group"]["id"]

        upload_response = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=student,
            files=[("files", ("activity-feed.txt", b"group activity", "text/plain"))],
        )
        assert upload_response.status_code == 200

        submit_response = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student,
            data={"submission_note": "课堂动态专项验证"},
            files=[("files", ("activity-submit.txt", b"group submit", "text/plain"))],
        )
        assert submit_response.status_code == 200
        submission_id = submit_response.json()["data"]["current_submission"]["id"]

        review_response = client.post(
            f"{API_PREFIX}/submissions/{submission_id}/score",
            headers=teacher,
            json={"score": 100, "teacher_comment": "课堂动态链路验证通过"},
        )
        assert review_response.status_code == 200

        student_group_page = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert student_group_page.status_code == 200
        student_activity_feed = student_group_page.json()["data"]["activity_feed"]
        student_event_types = {item["event_type"] for item in student_activity_feed}
        assert "attendance" in student_event_types
        assert "drive_upload" in student_event_types
        assert "group_submission" in student_event_types
        assert "submission_reviewed" in student_event_types
        reviewed_event = next(item for item in student_activity_feed if item["event_type"] == "submission_reviewed")
        assert reviewed_event["submission_id"] == submission_id
        assert "100 分" in reviewed_event["description"]

        staff_group_overview = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher,
        )
        assert staff_group_overview.status_code == 200
        group_payload = next(
            item
            for item in staff_group_overview.json()["data"]["groups"]
            if item["id"] == student_group_id
        )
        staff_event_types = {item["event_type"] for item in group_payload["activity_feed"]}
        assert "drive_upload" in staff_event_types
        assert "submission_reviewed" in staff_event_types


def test_group_programming_task_shared_draft_is_visible_to_all_members():
    with TestClient(app) as client:
        student_a = student_headers(client, username="70101")
        student_b = student_headers(client, username="70102")
        task_id = 83

        detail_response = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_a)
        assert detail_response.status_code == 200
        detail_payload = detail_response.json()["data"]
        assert detail_payload["task_type"] == "programming"
        assert detail_payload["submission_scope"] == "group"
        assert detail_payload["submission_policy"]["draft_enabled"] is True
        assert detail_payload["group_collaboration"]["group_id"]
        initial_draft = detail_payload["group_draft"]
        initial_version = initial_draft["version_no"] if initial_draft else 0

        blocked_individual = client.put(
            f"{API_PREFIX}/tasks/82/group-draft",
            headers=student_a,
            json={"submission_note": "<p>should fail</p>"},
        )
        assert blocked_individual.status_code == 400

        first_draft_response = client.put(
            f"{API_PREFIX}/tasks/{task_id}/group-draft",
            headers=student_a,
            json={
                "submission_note": "<p>第一位组员的共享草稿</p>",
                "source_code": "print('draft-a')",
            },
        )
        assert first_draft_response.status_code == 200
        first_draft = first_draft_response.json()["data"]
        assert first_draft["submission_note"] == "<p>第一位组员的共享草稿</p>"
        assert first_draft["source_code"] == "print('draft-a')"
        assert first_draft["updated_by_student_no"] == "70101"
        assert first_draft["version_no"] == initial_version + 1

        member_b_detail = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_b)
        assert member_b_detail.status_code == 200
        member_b_payload = member_b_detail.json()["data"]
        assert member_b_payload["group_draft"]["submission_note"] == first_draft["submission_note"]
        assert member_b_payload["group_draft"]["source_code"] == first_draft["source_code"]
        assert member_b_payload["group_draft"]["updated_by_student_no"] == "70101"

        second_draft_response = client.put(
            f"{API_PREFIX}/tasks/{task_id}/group-draft",
            headers=student_b,
            json={
                "submission_note": "<p>第二位组员继续补充后的版本</p>",
                "source_code": "print('draft-b')",
            },
        )
        assert second_draft_response.status_code == 200
        second_draft = second_draft_response.json()["data"]
        assert second_draft["submission_note"] == "<p>第二位组员继续补充后的版本</p>"
        assert second_draft["source_code"] == "print('draft-b')"
        assert second_draft["updated_by_student_no"] == "70102"
        assert second_draft["version_no"] == first_draft["version_no"] + 1

        member_a_refresh = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_a)
        assert member_a_refresh.status_code == 200
        member_a_payload = member_a_refresh.json()["data"]
        assert member_a_payload["group_draft"]["submission_note"] == second_draft["submission_note"]
        assert member_a_payload["group_draft"]["source_code"] == second_draft["source_code"]
        assert member_a_payload["group_draft"]["updated_by_student_no"] == "70102"

        submit_response = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_b,
            data={
                "submission_note": "<p>正式提交版本</p>",
                "draft_source_code": "print('final-group')",
            },
        )
        assert submit_response.status_code == 200
        submit_payload = submit_response.json()["data"]
        assert submit_payload["current_submission"]["submission_scope"] == "group"
        assert submit_payload["current_submission"]["submitted_by_student_no"] == "70102"
        assert submit_payload["group_draft"]["submission_note"] == "<p>正式提交版本</p>"
        assert submit_payload["group_draft"]["source_code"] == "print('final-group')"
        assert submit_payload["group_draft"]["updated_by_student_no"] == "70102"
        assert submit_payload["group_draft"]["version_no"] == second_draft["version_no"] + 1

        member_a_after_submit = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_a)
        assert member_a_after_submit.status_code == 200
        member_a_after_submit_payload = member_a_after_submit.json()["data"]
        assert member_a_after_submit_payload["current_submission"]["submitted_by_student_no"] == "70102"
        assert member_a_after_submit_payload["group_draft"]["submission_note"] == "<p>正式提交版本</p>"
        assert member_a_after_submit_payload["group_draft"]["source_code"] == "print('final-group')"


def test_group_draft_history_endpoint_returns_versions_and_final_snapshot():
    with TestClient(app) as client:
        student_a = student_headers(client, username="70101")
        student_b = student_headers(client, username="70102")
        task_id = 83

        baseline_history_response = client.get(f"{API_PREFIX}/tasks/{task_id}/group-draft/history", headers=student_a)
        assert baseline_history_response.status_code == 200
        baseline_items = baseline_history_response.json()["data"]["items"]

        first_sync = client.put(
            f"{API_PREFIX}/tasks/{task_id}/group-draft",
            headers=student_a,
            json={
                "submission_note": "<p>history-version-a</p>",
                "source_code": "print('history-a')",
            },
        )
        assert first_sync.status_code == 200

        second_sync = client.put(
            f"{API_PREFIX}/tasks/{task_id}/group-draft",
            headers=student_b,
            json={
                "submission_note": "<p>history-version-b</p>",
                "source_code": "print('history-b')",
            },
        )
        assert second_sync.status_code == 200

        submit_response = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_b,
            data={
                "submission_note": "<p>history-final</p>",
                "draft_source_code": "print('history-final')",
            },
        )
        assert submit_response.status_code == 200

        history_response = client.get(f"{API_PREFIX}/tasks/{task_id}/group-draft/history", headers=student_a)
        assert history_response.status_code == 200
        history_items = history_response.json()["data"]["items"]
        assert len(history_items) >= len(baseline_items) + 3

        latest_three = history_items[:3]
        assert latest_three[0]["event_type"] == "submitted"
        assert latest_three[0]["submission_note"] == "<p>history-final</p>"
        assert latest_three[0]["source_code"] == "print('history-final')"
        assert latest_three[0]["previous_version_no"] == latest_three[1]["version_no"]

        assert latest_three[1]["event_type"] == "synced"
        assert latest_three[1]["submission_note"] == "<p>history-version-b</p>"
        assert latest_three[1]["source_code"] == "print('history-b')"

        assert latest_three[2]["event_type"] == "synced"
        assert latest_three[2]["submission_note"] == "<p>history-version-a</p>"
        assert latest_three[2]["source_code"] == "print('history-a')"


def test_group_operation_logs_are_persisted_for_teacher_and_student_views():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student = student_headers(client, username="70101")

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]

        create_response = client.post(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher,
            json={},
        )
        assert create_response.status_code == 200
        created_groups = create_response.json()["data"]["groups"]
        created_group = max(created_groups, key=lambda item: item["group_no"])

        delete_response = client.delete(
            f"{API_PREFIX}/staff/groups/{created_group['id']}",
            headers=teacher,
        )
        assert delete_response.status_code == 200

        draft_response = client.put(
            f"{API_PREFIX}/tasks/83/group-draft",
            headers=student,
            json={
                "submission_note": "<p>日志追溯测试草稿</p>",
                "source_code": "print('trace-log')",
            },
        )
        assert draft_response.status_code == 200

        upload_response = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=student,
            files=[("files", ("trace-log.txt", b"trace", "text/plain"))],
        )
        assert upload_response.status_code == 200
        uploaded_file = next(
            item
            for item in upload_response.json()["data"]["group_space"]["files"]
            if item["original_name"] == "trace-log.txt"
        )

        remove_response = client.delete(
            f"{API_PREFIX}/drives/files/{uploaded_file['id']}",
            headers=student,
        )
        assert remove_response.status_code == 200

        student_group_page = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert student_group_page.status_code == 200
        student_group_payload = student_group_page.json()["data"]
        student_log_types = {item["event_type"] for item in student_group_payload["operation_logs"]}
        assert "group_draft_synced" in student_log_types
        assert "group_file_uploaded" in student_log_types
        assert "group_file_deleted" in student_log_types

        student_group_id = student_group_payload["group"]["id"]
        teacher_overview = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/groups",
            headers=teacher,
        )
        assert teacher_overview.status_code == 200
        teacher_group = next(
            item
            for item in teacher_overview.json()["data"]["groups"]
            if item["id"] == student_group_id
        )
        teacher_group_log_types = {item["event_type"] for item in teacher_group["operation_logs"]}
        assert "group_draft_synced" in teacher_group_log_types
        assert "group_file_uploaded" in teacher_group_log_types

        management_payload = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/group-management",
            headers=teacher,
        )
        assert management_payload.status_code == 200
        management_log_types = {item["event_type"] for item in management_payload.json()["data"]["operation_logs"]}
        assert "group_created" in management_log_types
        assert "group_deleted" in management_log_types


def test_staff_can_filter_and_export_group_operation_logs():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student = student_headers(client, username="70101")

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]

        student_group_page = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert student_group_page.status_code == 200
        student_group_payload = student_group_page.json()["data"]
        student_group_id = student_group_payload["group"]["id"]
        student_user_id = next(
            item["user_id"]
            for item in student_group_payload["members"]
            if item["student_no"] == "70101"
        )

        upload_response = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=student,
            files=[("files", ("log-filter-smoke.txt", b"log filter smoke", "text/plain"))],
        )
        assert upload_response.status_code == 200

        filtered_logs = client.get(
            (
                f"{API_PREFIX}/staff/classes/{class_701['id']}/group-operation-logs"
                f"?group_id={student_group_id}&event_type=group_file_uploaded&actor_user_id={student_user_id}&keyword=log-filter-smoke"
            ),
            headers=teacher,
        )
        assert filtered_logs.status_code == 200
        filtered_payload = filtered_logs.json()["data"]
        assert filtered_payload["total_count"] >= 1
        assert any(item["file_name"] == "log-filter-smoke.txt" for item in filtered_payload["items"])
        assert all(item["event_type"] == "group_file_uploaded" for item in filtered_payload["items"])
        assert all(item["actor_user_id"] == student_user_id for item in filtered_payload["items"])

        export_response = client.get(
            (
                f"{API_PREFIX}/staff/classes/{class_701['id']}/group-operation-logs/export"
                f"?group_id={student_group_id}&event_type=group_file_uploaded&actor_user_id={student_user_id}&keyword=log-filter-smoke"
            ),
            headers=teacher,
        )
        assert export_response.status_code == 200
        assert "text/csv" in export_response.headers["content-type"]
        export_text = export_response.content.decode("utf-8-sig")
        assert "log-filter-smoke.txt" in export_text
        assert "group_file_uploaded" in export_text


def test_staff_can_view_group_task_progress_by_class_and_plan():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        blocked_teacher = staff_headers(client, "t2")
        student = student_headers(
            client,
            username="70101",
            extra_headers={"x-learnsite-device-ip": "127.0.0.1"},
        )

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        class_701 = dashboard_payload["launchpad"]["classes"][0]
        plan_id = 22
        task_id = 83

        initial_progress = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/plans/{plan_id}/group-task-progress",
            headers=teacher,
        )
        assert initial_progress.status_code == 200
        initial_payload = initial_progress.json()["data"]
        assert initial_payload["class"]["id"] == class_701["id"]
        assert initial_payload["plan"]["id"] == plan_id
        assert any(item["task_id"] == task_id for item in initial_payload["tasks"])

        student_group = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert student_group.status_code == 200
        student_group_id = student_group.json()["data"]["group"]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student,
            data={"submission_note": "小组共同提交进度测试"},
            files=[("files", ("group-progress.txt", b"group progress", "text/plain"))],
        )
        assert submit_response.status_code == 200
        submit_payload = submit_response.json()["data"]
        submission_id = submit_payload["current_submission"]["id"]

        submitted_progress = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/plans/{plan_id}/group-task-progress",
            headers=teacher,
        )
        assert submitted_progress.status_code == 200
        submitted_payload = submitted_progress.json()["data"]
        assert submitted_payload["summary"]["submitted_count"] >= 1
        task_progress = next(item for item in submitted_payload["tasks"] if item["task_id"] == task_id)
        group_progress = next(item for item in task_progress["items"] if item["group_id"] == student_group_id)
        assert group_progress["status"] == "submitted"
        assert group_progress["submission_id"] == submission_id
        assert group_progress["file_count"] == 1
        assert group_progress["submitted_by_name"]

        score_response = client.post(
            f"{API_PREFIX}/submissions/{submission_id}/score",
            headers=teacher,
            json={"score": 100, "teacher_comment": "小组协作完成度高"},
        )
        assert score_response.status_code == 200

        reviewed_progress = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/plans/{plan_id}/group-task-progress",
            headers=teacher,
        )
        assert reviewed_progress.status_code == 200
        reviewed_payload = reviewed_progress.json()["data"]
        assert reviewed_payload["summary"]["reviewed_count"] >= 1
        reviewed_task_progress = next(item for item in reviewed_payload["tasks"] if item["task_id"] == task_id)
        reviewed_group_progress = next(item for item in reviewed_task_progress["items"] if item["group_id"] == student_group_id)
        assert reviewed_group_progress["status"] == "reviewed"
        assert reviewed_group_progress["score"] == 100

        blocked_response = client.get(
            f"{API_PREFIX}/staff/classes/{class_701['id']}/plans/{plan_id}/group-task-progress",
            headers=blocked_teacher,
        )
        assert blocked_response.status_code == 403


def test_group_submission_is_shared_across_group_members_and_files_are_accessible():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student_a = student_headers(client, username="70101")
        student_b = student_headers(client, username="70102")
        task_id = 58

        group_a_response = client.get(f"{API_PREFIX}/groups/me", headers=student_a)
        group_b_response = client.get(f"{API_PREFIX}/groups/me", headers=student_b)
        assert group_a_response.status_code == 200
        assert group_b_response.status_code == 200
        group_a = group_a_response.json()["data"]["group"]
        group_b = group_b_response.json()["data"]["group"]
        assert group_a["id"] == group_b["id"]

        first_submit = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_a,
            data={"submission_note": "<p>第一版小组流程说明</p>"},
            files=[("files", ("group-idea-v1.txt", b"group-v1", "text/plain"))],
        )
        assert first_submit.status_code == 200
        first_payload = first_submit.json()["data"]
        first_submission = first_payload["current_submission"]
        submission_id = first_submission["id"]
        first_file_id = first_submission["files"][0]["id"]
        first_submitter = first_submission["submitted_by_name"]
        assert first_submission["submission_scope"] == "group"
        assert first_submission["group_id"] == group_a["id"]
        assert first_submission["submitted_by_student_no"] == "70101"

        task_for_student_b = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_b)
        assert task_for_student_b.status_code == 200
        student_b_payload = task_for_student_b.json()["data"]
        assert student_b_payload["submission_scope"] == "group"
        assert student_b_payload["current_submission"]["id"] == submission_id
        assert student_b_payload["current_submission"]["group_id"] == group_a["id"]
        assert student_b_payload["current_submission"]["submitted_by_name"] == first_submitter
        assert student_b_payload["current_submission"]["submitted_by_student_no"] == "70101"
        assert student_b_payload["current_submission"]["files"][0]["id"] == first_file_id

        student_b_work_list = client.get(f"{API_PREFIX}/submissions/mine", headers=student_b)
        assert student_b_work_list.status_code == 200
        shared_item = next(
            item
            for item in student_b_work_list.json()["data"]["items"]
            if item["submission_id"] == submission_id
        )
        assert shared_item["submission_scope"] == "group"
        assert shared_item["group_id"] == group_a["id"]
        assert shared_item["submitted_by_name"] == first_submitter
        assert shared_item["file_count"] == 1

        student_b_detail = client.get(f"{API_PREFIX}/submissions/{submission_id}", headers=student_b)
        assert student_b_detail.status_code == 200
        student_b_detail_payload = student_b_detail.json()["data"]
        assert student_b_detail_payload["submission"]["submission_scope"] == "group"
        assert student_b_detail_payload["submission"]["group_id"] == group_a["id"]
        assert student_b_detail_payload["submission"]["submitted_by_name"] == first_submitter

        student_b_file = client.get(
            f"{API_PREFIX}/submissions/files/{first_file_id}?disposition=inline",
            headers=student_b,
        )
        assert student_b_file.status_code == 200
        assert b"group-v1" in student_b_file.content

        second_submit = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_b,
            data={"submission_note": "<p>第二版小组流程说明</p>"},
            files=[("files", ("group-idea-v2.txt", b"group-v2", "text/plain"))],
        )
        assert second_submit.status_code == 200
        second_payload = second_submit.json()["data"]
        second_submission = second_payload["current_submission"]
        second_file_id = second_submission["files"][0]["id"]
        second_submitter = second_submission["submitted_by_name"]
        assert second_submission["id"] == submission_id
        assert second_submission["submission_scope"] == "group"
        assert second_submission["group_id"] == group_a["id"]
        assert second_submission["submitted_by_student_no"] == "70102"
        assert second_submission["files"][0]["name"] == "group-idea-v2.txt"
        assert "第二版小组流程说明" in (second_submission["submission_note"] or "")

        task_for_student_a = client.get(f"{API_PREFIX}/tasks/{task_id}", headers=student_a)
        assert task_for_student_a.status_code == 200
        student_a_payload = task_for_student_a.json()["data"]
        assert student_a_payload["current_submission"]["id"] == submission_id
        assert student_a_payload["current_submission"]["submitted_by_name"] == second_submitter
        assert student_a_payload["current_submission"]["submitted_by_student_no"] == "70102"
        assert student_a_payload["current_submission"]["files"][0]["id"] == second_file_id

        student_a_file = client.get(
            f"{API_PREFIX}/submissions/files/{second_file_id}?disposition=inline",
            headers=student_a,
        )
        assert student_a_file.status_code == 200
        assert b"group-v2" in student_a_file.content

        teacher_task = client.get(f"{API_PREFIX}/submissions/teacher/task/{task_id}", headers=teacher)
        assert teacher_task.status_code == 200
        teacher_items = teacher_task.json()["data"]["items"]
        assert any(
            item["submission_id"] == submission_id
            and item["submitted_by_name"] == second_submitter
            and item["file_count"] == 1
            for item in teacher_items
        )

        review_response = client.post(
            f"{API_PREFIX}/submissions/{submission_id}/score",
            headers=teacher,
            json={"score": 100, "teacher_comment": "小组共同提交链路测试通过"},
        )
        assert review_response.status_code == 200

        blocked_a = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_a,
            data={"submission_note": "评阅后再次提交应被拦截"},
        )
        blocked_b = client.post(
            f"{API_PREFIX}/tasks/{task_id}/submit",
            headers=student_b,
            data={"submission_note": "评阅后再次提交应被拦截"},
        )
        assert blocked_a.status_code == 409
        assert blocked_b.status_code == 409


def test_student_profile_center_and_password_change():
    with TestClient(app) as client:
        headers = student_headers(client, username="70105", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})
        teacher = staff_headers(client, "t1")
        teacher_two = staff_headers(client, "t2")

        profile_response = client.get(f"{API_PREFIX}/profiles/student/me", headers=headers)
        assert profile_response.status_code == 200
        profile_payload = profile_response.json()["data"]
        assert profile_payload["profile"]["student_no"] == "70105"
        assert profile_payload["profile"]["name"]
        assert profile_payload["profile"]["class_name"] == "701班"
        assert profile_payload["attendance_summary"]["checked_in_today"] is True
        assert profile_payload["attendance_summary"]["total_count"] >= 1
        assert profile_payload["attendance_records"]
        assert profile_payload["attendance_records"][0]["client_ip"] == "127.0.0.1"

        update_name_response = client.put(
            f"{API_PREFIX}/profiles/student/name",
            headers=headers,
            json={"name": "70105测试姓名"},
        )
        assert update_name_response.status_code == 200

        update_gender_response = client.put(
            f"{API_PREFIX}/profiles/student/gender",
            headers=headers,
            json={"gender": "女"},
        )
        assert update_gender_response.status_code == 200

        upload_photo_response = client.post(
            f"{API_PREFIX}/profiles/student/photo",
            headers=headers,
            files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nprofile-avatar", "image/png")},
        )
        assert upload_photo_response.status_code == 200

        photo_response = client.get(f"{API_PREFIX}/profiles/student/photo", headers=headers)
        assert photo_response.status_code == 200
        assert photo_response.headers.get("content-type", "").startswith("image/")

        options_response = client.get(
            f"{API_PREFIX}/profiles/student/class-transfer/options",
            headers=headers,
        )
        assert options_response.status_code == 200
        options_payload = options_response.json()["data"]
        target_class = next(item for item in options_payload["classes"] if item["class_name"] == "702班")

        create_transfer_response = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=headers,
            json={"target_class_id": target_class["id"], "reason": "想调整到702班"},
        )
        assert create_transfer_response.status_code == 200
        transfer_request = create_transfer_response.json()["data"]["request"]
        assert transfer_request["status"] == "pending"

        my_requests_response = client.get(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=headers,
        )
        assert my_requests_response.status_code == 200
        assert any(item["id"] == transfer_request["id"] for item in my_requests_response.json()["data"]["requests"])

        staff_list_response = client.get(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests?status_filter=pending",
            headers=teacher,
        )
        assert staff_list_response.status_code == 200
        assert any(item["id"] == transfer_request["id"] for item in staff_list_response.json()["data"]["items"])

        review_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/{transfer_request['id']}/review",
            headers=teacher,
            json={"decision": "approve", "review_note": "同意调整"},
        )
        assert review_response.status_code == 200
        assert review_response.json()["data"]["request"]["status"] == "approved"

        audit_list_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits?keyword=70105测试姓名",
            headers=teacher,
        )
        assert audit_list_response.status_code == 200
        audit_payload = audit_list_response.json()["data"]
        assert audit_payload["items"]
        assert any(item["event_type"] == "student_name_updated" for item in audit_payload["items"])
        assert any(item["event_type"] == "class_transfer_reviewed" for item in audit_payload["items"])

        audit_export_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits/export?keyword=70105",
            headers=teacher,
        )
        assert audit_export_response.status_code == 200
        assert "text/csv" in audit_export_response.headers.get("content-type", "")
        audit_export_text = audit_export_response.content.decode("utf-8-sig")
        assert "事件类型" in audit_export_text
        assert "操作者账号" in audit_export_text
        assert "目标班级" in audit_export_text
        assert "处理批次号" in audit_export_text
        assert "student_name_updated" in audit_export_text
        assert "70105测试姓名" in audit_export_text

        forbidden_audit_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits?class_id={target_class['id']}",
            headers=teacher_two,
        )
        assert forbidden_audit_response.status_code == 403

        refreshed_profile_response = client.get(f"{API_PREFIX}/profiles/student/me", headers=headers)
        assert refreshed_profile_response.status_code == 200
        refreshed_payload = refreshed_profile_response.json()["data"]
        assert refreshed_payload["profile"]["name"] == "70105测试姓名"
        assert refreshed_payload["profile"]["gender"] == "女"
        assert refreshed_payload["profile"]["class_name"] == "702班"

        delete_photo_response = client.delete(f"{API_PREFIX}/profiles/student/photo", headers=headers)
        assert delete_photo_response.status_code == 200
        photo_after_delete = client.get(f"{API_PREFIX}/profiles/student/photo", headers=headers)
        assert photo_after_delete.status_code == 404

        change_password_response = client.post(
            f"{API_PREFIX}/profiles/student/password",
            headers=headers,
            json={
                "current_password": "12345",
                "new_password": "1234567",
                "confirm_password": "1234567",
            },
        )
        assert change_password_response.status_code == 200

        old_login_response = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70105", "password": "12345"},
        )
        assert old_login_response.status_code == 401

        new_login_response = client.post(
            f"{API_PREFIX}/auth/student/login",
            headers={"x-learnsite-device-ip": "127.0.0.1"},
            json={"username": "70105", "password": "1234567"},
        )
        assert new_login_response.status_code == 200


def test_staff_can_batch_review_class_transfer_requests():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student_one = student_headers(client, "70108")
        student_two = student_headers(client, "70109")

        options_one = client.get(f"{API_PREFIX}/profiles/student/class-transfer/options", headers=student_one)
        options_two = client.get(f"{API_PREFIX}/profiles/student/class-transfer/options", headers=student_two)
        assert options_one.status_code == 200
        assert options_two.status_code == 200

        target_class_one = next(
            item for item in options_one.json()["data"]["classes"] if item["class_name"] == "702班"
        )
        target_class_two = next(
            item for item in options_two.json()["data"]["classes"] if item["class_name"] == "702班"
        )

        request_one = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=student_one,
            json={"target_class_id": target_class_one["id"], "reason": "申请批量审核1"},
        )
        request_two = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=student_two,
            json={"target_class_id": target_class_two["id"], "reason": "申请批量审核2"},
        )
        assert request_one.status_code == 200
        assert request_two.status_code == 200

        request_one_id = request_one.json()["data"]["request"]["id"]
        request_two_id = request_two.json()["data"]["request"]["id"]

        batch_review_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/batch-review",
            headers=teacher,
            json={
                "request_ids": [request_one_id, request_two_id],
                "decision": "approve",
                "review_note": "批量审核通过",
            },
        )
        assert batch_review_response.status_code == 200
        batch_result = batch_review_response.json()["data"]["batch_result"]
        assert batch_result["selected_count"] == 2
        assert batch_result["processed_count"] == 2
        assert batch_result["skipped_count"] == 0
        assert batch_result["approved_count"] == 2
        assert batch_result["audit_batch_token"]
        audit_batch_token = batch_result["audit_batch_token"]

        batch_audit_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits?batch_token={audit_batch_token}",
            headers=teacher,
        )
        assert batch_audit_response.status_code == 200
        batch_audit_items = batch_audit_response.json()["data"]["items"]
        assert batch_audit_items
        assert all(item["batch_token"] == audit_batch_token for item in batch_audit_items)
        assert {item["target_student_no"] for item in batch_audit_items if item["target_student_no"]} >= {
            "70108",
            "70109",
        }

        batch_audit_export_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits/export?batch_token={audit_batch_token}",
            headers=teacher,
        )
        assert batch_audit_export_response.status_code == 200
        batch_audit_export_text = batch_audit_export_response.content.decode("utf-8-sig")
        assert audit_batch_token in batch_audit_export_text

        refreshed_one = client.get(f"{API_PREFIX}/profiles/student/me", headers=student_one)
        refreshed_two = client.get(f"{API_PREFIX}/profiles/student/me", headers=student_two)
        assert refreshed_one.status_code == 200
        assert refreshed_two.status_code == 200
        assert refreshed_one.json()["data"]["profile"]["class_name"] == "702班"
        assert refreshed_two.json()["data"]["profile"]["class_name"] == "702班"

        second_batch_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/batch-review",
            headers=teacher,
            json={
                "request_ids": [request_one_id, request_two_id],
                "decision": "approve",
                "review_note": "重复执行应跳过",
            },
        )
        assert second_batch_response.status_code == 200
        second_result = second_batch_response.json()["data"]["batch_result"]
        assert second_result["processed_count"] == 0
        assert second_result["skipped_count"] == 2
        assert second_result["audit_batch_token"] is None


def test_staff_can_batch_unreview_class_transfer_requests():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student_one = student_headers(client, "70106")
        student_two = student_headers(client, "70107")
        student_three = student_headers(client, "70110")

        options_one = client.get(f"{API_PREFIX}/profiles/student/class-transfer/options", headers=student_one)
        options_two = client.get(f"{API_PREFIX}/profiles/student/class-transfer/options", headers=student_two)
        options_three = client.get(f"{API_PREFIX}/profiles/student/class-transfer/options", headers=student_three)
        assert options_one.status_code == 200
        assert options_two.status_code == 200
        assert options_three.status_code == 200

        target_class_one = next(
            item for item in options_one.json()["data"]["classes"] if item["class_name"] == "702班"
        )
        target_class_two = next(
            item for item in options_two.json()["data"]["classes"] if item["class_name"] == "702班"
        )
        target_class_three = next(
            item for item in options_three.json()["data"]["classes"] if item["class_name"] == "702班"
        )

        request_one = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=student_one,
            json={"target_class_id": target_class_one["id"], "reason": "撤销审核测试-通过"},
        )
        request_two = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=student_two,
            json={"target_class_id": target_class_two["id"], "reason": "撤销审核测试-拒绝"},
        )
        request_three = client.post(
            f"{API_PREFIX}/profiles/student/class-transfer/requests",
            headers=student_three,
            json={"target_class_id": target_class_three["id"], "reason": "撤销审核测试-待处理"},
        )
        assert request_one.status_code == 200
        assert request_two.status_code == 200
        assert request_three.status_code == 200

        request_one_id = request_one.json()["data"]["request"]["id"]
        request_two_id = request_two.json()["data"]["request"]["id"]
        request_three_id = request_three.json()["data"]["request"]["id"]

        approve_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/{request_one_id}/review",
            headers=teacher,
            json={"decision": "approve", "review_note": "先通过，再撤销"},
        )
        reject_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/{request_two_id}/review",
            headers=teacher,
            json={"decision": "reject", "review_note": "先拒绝，再撤销"},
        )
        assert approve_response.status_code == 200
        assert reject_response.status_code == 200

        batch_unreview_response = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/batch-unreview",
            headers=teacher,
            json={
                "request_ids": [request_one_id, request_two_id, request_three_id],
                "reason": "统一撤销回待审核",
            },
        )
        assert batch_unreview_response.status_code == 200
        batch_result = batch_unreview_response.json()["data"]["batch_result"]
        assert batch_result["selected_count"] == 3
        assert batch_result["processed_count"] == 2
        assert batch_result["skipped_count"] == 1
        assert batch_result["rolled_back_approved_count"] == 1
        assert batch_result["reopened_rejected_count"] == 1
        assert batch_result["audit_batch_token"]

        pending_list_response = client.get(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests?status_filter=pending",
            headers=teacher,
        )
        assert pending_list_response.status_code == 200
        pending_items = {
            item["id"]: item
            for item in pending_list_response.json()["data"]["items"]
            if item["id"] in {request_one_id, request_two_id, request_three_id}
        }
        assert set(pending_items.keys()) == {request_one_id, request_two_id, request_three_id}
        assert pending_items[request_one_id]["reviewed_by_name"] is None
        assert pending_items[request_two_id]["reviewed_by_name"] is None

        refreshed_one = client.get(f"{API_PREFIX}/profiles/student/me", headers=student_one)
        refreshed_two = client.get(f"{API_PREFIX}/profiles/student/me", headers=student_two)
        assert refreshed_one.status_code == 200
        assert refreshed_two.status_code == 200
        assert refreshed_one.json()["data"]["profile"]["class_name"] == "701班"
        assert refreshed_two.json()["data"]["profile"]["class_name"] == "701班"

        audit_response = client.get(
            f"{API_PREFIX}/profiles/staff/profile-change-audits?event_type=class_transfer_unreviewed",
            headers=teacher,
        )
        assert audit_response.status_code == 200
        assert audit_response.json()["data"]["items"]
        assert any(item["event_type"] == "class_transfer_unreviewed" for item in audit_response.json()["data"]["items"])

        second_batch_unreview = client.post(
            f"{API_PREFIX}/profiles/staff/class-transfer/requests/batch-unreview",
            headers=teacher,
            json={
                "request_ids": [request_one_id, request_two_id, request_three_id],
                "reason": "重复撤销应跳过",
            },
        )
        assert second_batch_unreview.status_code == 200
        second_result = second_batch_unreview.json()["data"]["batch_result"]
        assert second_result["processed_count"] == 0
        assert second_result["skipped_count"] == 3
        assert second_result["audit_batch_token"] is None


def test_student_quiz_home_start_submit_and_daily_ranking():
    with TestClient(app) as client:
        headers = student_headers(client, username="70103")

        home_response = client.get(f"{API_PREFIX}/quizzes/student/home", headers=headers)
        assert home_response.status_code == 200
        home_payload = home_response.json()["data"]
        assert home_payload["available_quizzes"]
        quiz_id = home_payload["available_quizzes"][0]["id"]

        start_response = client.post(
            f"{API_PREFIX}/quizzes/start",
            headers=headers,
            json={"quiz_id": quiz_id},
        )
        assert start_response.status_code == 200
        start_payload = start_response.json()["data"]
        assert start_payload["questions"]
        attempt_id = start_payload["attempt"]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/quizzes/attempts/{attempt_id}/submit",
            headers=headers,
            json={
                "answers": [
                    {
                        "question_id": question["id"],
                        "selected_option_key": question["options"][0]["key"],
                    }
                    for question in start_payload["questions"]
                ]
            },
        )
        assert submit_response.status_code == 200
        summary = submit_response.json()["data"]["summary"]
        assert summary["attempt_id"] == attempt_id
        assert summary["score"] is not None
        assert summary["total_count"] == len(start_payload["questions"])

        ranking_response = client.get(f"{API_PREFIX}/quizzes/rankings/daily", headers=headers)
        assert ranking_response.status_code == 200
        ranking_payload = ranking_response.json()["data"]
        assert ranking_payload["class_name"] == "701班"
        assert any(item["student_no"] == "70103" for item in ranking_payload["items"])


def test_staff_can_create_quiz_bank_question_and_quiz():
    with TestClient(app) as client:
        headers = staff_headers(client, username="t1")

        bootstrap_response = client.get(f"{API_PREFIX}/quizzes/staff/bootstrap", headers=headers)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        assert any(item["class_name"] == "701班" for item in bootstrap_payload["classes"])

        bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=headers,
            json={"title": "课堂新题库", "description": "用于 smoke 测试的题库"},
        )
        assert bank_response.status_code == 200
        bank_payload = bank_response.json()["data"]
        new_bank = next(item for item in bank_payload["banks"] if item["title"] == "课堂新题库")

        question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=headers,
            json={
                "bank_id": new_bank["id"],
                "content": "下列哪一项更适合用作课堂搜索关键词？",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "更具体的主题词", "is_correct": True},
                    {"option_key": "B", "option_text": "随便输入一个字", "is_correct": False},
                    {"option_key": "C", "option_text": "只输入标点", "is_correct": False},
                    {"option_key": "D", "option_text": "完全不输入", "is_correct": False},
                ],
            },
        )
        assert question_response.status_code == 200
        question_payload = question_response.json()["data"]
        refreshed_bank = next(item for item in question_payload["banks"] if item["id"] == new_bank["id"])
        assert refreshed_bank["question_count"] == 1
        question_id = refreshed_bank["questions"][0]["id"]
        class_701 = next(item for item in question_payload["classes"] if item["class_name"] == "701班")

        quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=headers,
            json={
                "title": "701班 Smoke 测验",
                "description": "自动化测试创建的测验",
                "class_id": class_701["id"],
                "question_ids": [question_id],
            },
        )
        assert quiz_response.status_code == 200
        quiz_payload = quiz_response.json()["data"]
        created_quiz = next(item for item in quiz_payload["quizzes"] if item["title"] == "701班 Smoke 测验")
        assert created_quiz["class_name"] == "701班"
        assert created_quiz["question_count"] == 1


def test_staff_can_update_quiz_bank_and_delete_only_when_empty():
    with TestClient(app) as client:
        teacher = staff_headers(client, username="t1")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=teacher,
            json={"title": "题库编辑前名称", "description": "题库编辑前说明"},
        )
        assert create_bank_response.status_code == 200
        create_bank_payload = create_bank_response.json()["data"]
        created_bank = next(item for item in create_bank_payload["banks"] if item["title"] == "题库编辑前名称")

        update_bank_response = client.put(
            f"{API_PREFIX}/quizzes/staff/banks/{created_bank['id']}",
            headers=teacher,
            json={"title": "题库编辑后名称", "description": "题库编辑后说明"},
        )
        assert update_bank_response.status_code == 200
        update_bank_payload = update_bank_response.json()["data"]
        updated_bank = next(item for item in update_bank_payload["banks"] if item["id"] == created_bank["id"])
        assert updated_bank["title"] == "题库编辑后名称"
        assert updated_bank["description"] == "题库编辑后说明"

        create_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": created_bank["id"],
                "content": "题库删除保护测试题目",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "选项A", "is_correct": True},
                    {"option_key": "B", "option_text": "选项B", "is_correct": False},
                    {"option_key": "C", "option_text": "选项C", "is_correct": False},
                    {"option_key": "D", "option_text": "选项D", "is_correct": False},
                ],
            },
        )
        assert create_question_response.status_code == 200
        create_question_payload = create_question_response.json()["data"]
        bank_with_question = next(item for item in create_question_payload["banks"] if item["id"] == created_bank["id"])
        question_id = next(item["id"] for item in bank_with_question["questions"] if item["content"] == "题库删除保护测试题目")

        blocked_delete_bank_response = client.delete(
            f"{API_PREFIX}/quizzes/staff/banks/{created_bank['id']}",
            headers=teacher,
        )
        assert blocked_delete_bank_response.status_code == 409
        assert "仍有题目" in blocked_delete_bank_response.json()["detail"]

        delete_question_response = client.delete(
            f"{API_PREFIX}/quizzes/staff/questions/{question_id}",
            headers=teacher,
        )
        assert delete_question_response.status_code == 200

        delete_bank_response = client.delete(
            f"{API_PREFIX}/quizzes/staff/banks/{created_bank['id']}",
            headers=teacher,
        )
        assert delete_bank_response.status_code == 200
        delete_bank_payload = delete_bank_response.json()["data"]
        assert all(item["id"] != created_bank["id"] for item in delete_bank_payload["banks"])


def test_staff_can_toggle_quiz_status_and_student_home_filters_inactive():
    with TestClient(app) as client:
        teacher = staff_headers(client, username="t1")
        student = student_headers(client, username="70103")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=teacher,
            json={"title": "测验状态切换题库", "description": "用于 smoke 验证启用停用"},
        )
        assert create_bank_response.status_code == 200
        bank_payload = create_bank_response.json()["data"]
        bank = next(item for item in bank_payload["banks"] if item["title"] == "测验状态切换题库")

        create_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": bank["id"],
                "content": "状态切换测试题目：哪项更适合课堂信息检索？",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "明确关键词", "is_correct": True},
                    {"option_key": "B", "option_text": "只输入标点", "is_correct": False},
                    {"option_key": "C", "option_text": "随机输入", "is_correct": False},
                    {"option_key": "D", "option_text": "不输入内容", "is_correct": False},
                ],
            },
        )
        assert create_question_response.status_code == 200
        question_payload = create_question_response.json()["data"]
        refreshed_bank = next(item for item in question_payload["banks"] if item["id"] == bank["id"])
        question_id = next(
            item["id"] for item in refreshed_bank["questions"] if item["content"] == "状态切换测试题目：哪项更适合课堂信息检索？"
        )
        class_701 = next(item for item in question_payload["classes"] if item["class_name"] == "701班")

        quiz_title = "状态切换 Smoke 测验"
        create_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=teacher,
            json={
                "title": quiz_title,
                "description": "用于验证教师停用后学生端隐藏",
                "class_id": class_701["id"],
                "question_ids": [question_id],
            },
        )
        assert create_quiz_response.status_code == 200
        quiz_payload = create_quiz_response.json()["data"]
        created_quiz = max(
            (item for item in quiz_payload["quizzes"] if item["title"] == quiz_title),
            key=lambda item: item["id"],
        )
        assert created_quiz["status"] == "active"

        student_home_before = client.get(f"{API_PREFIX}/quizzes/student/home", headers=student)
        assert student_home_before.status_code == 200
        assert any(item["id"] == created_quiz["id"] for item in student_home_before.json()["data"]["available_quizzes"])

        deactivate_response = client.put(
            f"{API_PREFIX}/quizzes/staff/quizzes/{created_quiz['id']}/status",
            headers=teacher,
            json={"status": "inactive"},
        )
        assert deactivate_response.status_code == 200
        deactivate_payload = deactivate_response.json()["data"]
        deactivated_quiz = next(item for item in deactivate_payload["quizzes"] if item["id"] == created_quiz["id"])
        assert deactivated_quiz["status"] == "inactive"

        student_home_after_deactivate = client.get(f"{API_PREFIX}/quizzes/student/home", headers=student)
        assert student_home_after_deactivate.status_code == 200
        assert all(
            item["id"] != created_quiz["id"]
            for item in student_home_after_deactivate.json()["data"]["available_quizzes"]
        )

        activate_response = client.put(
            f"{API_PREFIX}/quizzes/staff/quizzes/{created_quiz['id']}/status",
            headers=teacher,
            json={"status": "active"},
        )
        assert activate_response.status_code == 200
        activate_payload = activate_response.json()["data"]
        activated_quiz = next(item for item in activate_payload["quizzes"] if item["id"] == created_quiz["id"])
        assert activated_quiz["status"] == "active"

        student_home_after_activate = client.get(f"{API_PREFIX}/quizzes/student/home", headers=student)
        assert student_home_after_activate.status_code == 200
        assert any(
            item["id"] == created_quiz["id"]
            for item in student_home_after_activate.json()["data"]["available_quizzes"]
        )


def test_staff_can_delete_quiz_question_and_block_when_linked():
    with TestClient(app) as client:
        headers = staff_headers(client, username="t1")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=headers,
            json={"title": "题目删除测试题库", "description": "用于 smoke 验证题目删除"},
        )
        assert create_bank_response.status_code == 200
        bank_payload = create_bank_response.json()["data"]
        bank = next(item for item in bank_payload["banks"] if item["title"] == "题目删除测试题库")

        create_deletable_question = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=headers,
            json={
                "bank_id": bank["id"],
                "content": "可删除题目：用于验证删除成功",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "选项A", "is_correct": True},
                    {"option_key": "B", "option_text": "选项B", "is_correct": False},
                    {"option_key": "C", "option_text": "选项C", "is_correct": False},
                    {"option_key": "D", "option_text": "选项D", "is_correct": False},
                ],
            },
        )
        assert create_deletable_question.status_code == 200
        deletable_payload = create_deletable_question.json()["data"]
        refreshed_bank = next(item for item in deletable_payload["banks"] if item["id"] == bank["id"])
        deletable_question_id = next(
            item["id"] for item in refreshed_bank["questions"] if item["content"] == "可删除题目：用于验证删除成功"
        )

        delete_unlinked_question = client.delete(
            f"{API_PREFIX}/quizzes/staff/questions/{deletable_question_id}",
            headers=headers,
        )
        assert delete_unlinked_question.status_code == 200
        delete_unlinked_payload = delete_unlinked_question.json()["data"]
        refreshed_bank_after_delete = next(item for item in delete_unlinked_payload["banks"] if item["id"] == bank["id"])
        assert all(item["id"] != deletable_question_id for item in refreshed_bank_after_delete["questions"])

        create_linked_question = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=headers,
            json={
                "bank_id": bank["id"],
                "content": "被测验引用题目：用于验证删除拦截",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "选项A", "is_correct": True},
                    {"option_key": "B", "option_text": "选项B", "is_correct": False},
                    {"option_key": "C", "option_text": "选项C", "is_correct": False},
                    {"option_key": "D", "option_text": "选项D", "is_correct": False},
                ],
            },
        )
        assert create_linked_question.status_code == 200
        linked_payload = create_linked_question.json()["data"]
        linked_bank = next(item for item in linked_payload["banks"] if item["id"] == bank["id"])
        linked_question_id = next(
            item["id"] for item in linked_bank["questions"] if item["content"] == "被测验引用题目：用于验证删除拦截"
        )
        class_701 = next(item for item in linked_payload["classes"] if item["class_name"] == "701班")

        create_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=headers,
            json={
                "title": "题目删除拦截测试测验",
                "description": "用于验证题目被测验引用后不可删除",
                "class_id": class_701["id"],
                "question_ids": [linked_question_id],
            },
        )
        assert create_quiz_response.status_code == 200

        delete_linked_question = client.delete(
            f"{API_PREFIX}/quizzes/staff/questions/{linked_question_id}",
            headers=headers,
        )
        assert delete_linked_question.status_code == 409
        assert "测验引用" in delete_linked_question.json()["detail"]


def test_staff_can_update_quiz_question_and_block_after_answered():
    with TestClient(app) as client:
        teacher = staff_headers(client, username="t1")
        student = student_headers(client, username="70103")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=teacher,
            json={"title": "题目编辑测试题库", "description": "用于 smoke 验证题目编辑"},
        )
        assert create_bank_response.status_code == 200
        bank_payload = create_bank_response.json()["data"]
        bank = next(item for item in bank_payload["banks"] if item["title"] == "题目编辑测试题库")

        create_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": bank["id"],
                "content": "编辑前题目：哪项是有效检索策略？",
                "difficulty": "基础",
                "explanation": "编辑前解析",
                "options": [
                    {"option_key": "A", "option_text": "使用明确关键词", "is_correct": True},
                    {"option_key": "B", "option_text": "随机输入字符", "is_correct": False},
                    {"option_key": "C", "option_text": "只输入标点", "is_correct": False},
                    {"option_key": "D", "option_text": "不输入内容", "is_correct": False},
                ],
            },
        )
        assert create_question_response.status_code == 200
        created_payload = create_question_response.json()["data"]
        refreshed_bank = next(item for item in created_payload["banks"] if item["id"] == bank["id"])
        question_id = next(item["id"] for item in refreshed_bank["questions"] if "编辑前题目" in item["content"])

        update_question_response = client.put(
            f"{API_PREFIX}/quizzes/staff/questions/{question_id}",
            headers=teacher,
            json={
                "content": "编辑后题目：课堂检索前第一步应先做什么？",
                "difficulty": "提升",
                "explanation": "编辑后解析：先明确目标再检索。",
                "options": [
                    {"option_key": "A", "option_text": "立即复制第一条结果", "is_correct": False},
                    {"option_key": "B", "option_text": "不看题目直接搜索", "is_correct": False},
                    {"option_key": "C", "option_text": "先明确检索目标与关键词", "is_correct": True},
                    {"option_key": "D", "option_text": "只看图片不看文字", "is_correct": False},
                ],
            },
        )
        assert update_question_response.status_code == 200
        updated_payload = update_question_response.json()["data"]
        updated_bank = next(item for item in updated_payload["banks"] if item["id"] == bank["id"])
        updated_question = next(item for item in updated_bank["questions"] if item["id"] == question_id)
        assert updated_question["difficulty"] == "提升"
        assert "编辑后题目" in updated_question["content"]
        assert "编辑后解析" in (updated_question["explanation"] or "")
        assert any(option["key"] == "C" and option["is_correct"] for option in updated_question["options"])

        class_701 = next(item for item in updated_payload["classes"] if item["class_name"] == "701班")
        create_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=teacher,
            json={
                "title": "题目编辑拦截验证测验",
                "description": "用于验证题目在有作答后不可编辑",
                "class_id": class_701["id"],
                "question_ids": [question_id],
            },
        )
        assert create_quiz_response.status_code == 200
        quiz_payload = create_quiz_response.json()["data"]
        created_quiz = max(
            (item for item in quiz_payload["quizzes"] if item["title"] == "题目编辑拦截验证测验"),
            key=lambda item: item["id"],
        )

        start_response = client.post(
            f"{API_PREFIX}/quizzes/start",
            headers=student,
            json={"quiz_id": created_quiz["id"]},
        )
        assert start_response.status_code == 200
        start_payload = start_response.json()["data"]
        attempt_id = start_payload["attempt"]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/quizzes/attempts/{attempt_id}/submit",
            headers=student,
            json={
                "answers": [
                    {
                        "question_id": question["id"],
                        "selected_option_key": question["options"][0]["key"],
                    }
                    for question in start_payload["questions"]
                ]
            },
        )
        assert submit_response.status_code == 200

        blocked_update_response = client.put(
            f"{API_PREFIX}/quizzes/staff/questions/{question_id}",
            headers=teacher,
            json={
                "content": "有作答后再次编辑应被拦截",
                "difficulty": "挑战",
                "explanation": "应返回冲突",
                "options": [
                    {"option_key": "A", "option_text": "选项A", "is_correct": True},
                    {"option_key": "B", "option_text": "选项B", "is_correct": False},
                ],
            },
        )
        assert blocked_update_response.status_code == 409
        assert "作答记录" in blocked_update_response.json()["detail"]


def test_staff_can_update_quiz_and_block_after_attempt_started():
    with TestClient(app) as client:
        teacher = staff_headers(client, username="t1")
        student = student_headers(client, username="70103")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=teacher,
            json={"title": "测验编辑测试题库", "description": "用于 smoke 验证测验编辑"},
        )
        assert create_bank_response.status_code == 200
        bank_payload = create_bank_response.json()["data"]
        bank = next(item for item in bank_payload["banks"] if item["title"] == "测验编辑测试题库")

        create_first_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": bank["id"],
                "content": "测验编辑题目一：搜索前应该先做什么？",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "先明确目标", "is_correct": True},
                    {"option_key": "B", "option_text": "随机搜索", "is_correct": False},
                    {"option_key": "C", "option_text": "直接复制答案", "is_correct": False},
                    {"option_key": "D", "option_text": "不看题目", "is_correct": False},
                ],
            },
        )
        assert create_first_question_response.status_code == 200
        first_question_payload = create_first_question_response.json()["data"]
        first_bank = next(item for item in first_question_payload["banks"] if item["id"] == bank["id"])
        question_one_id = next(item["id"] for item in first_bank["questions"] if "测验编辑题目一" in item["content"])

        create_second_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": bank["id"],
                "content": "测验编辑题目二：检索结果如何初筛？",
                "difficulty": "提升",
                "options": [
                    {"option_key": "A", "option_text": "看发布时间与来源", "is_correct": True},
                    {"option_key": "B", "option_text": "只看标题", "is_correct": False},
                    {"option_key": "C", "option_text": "只看图片", "is_correct": False},
                    {"option_key": "D", "option_text": "只看点赞数", "is_correct": False},
                ],
            },
        )
        assert create_second_question_response.status_code == 200
        second_question_payload = create_second_question_response.json()["data"]
        second_bank = next(item for item in second_question_payload["banks"] if item["id"] == bank["id"])
        question_two_id = next(item["id"] for item in second_bank["questions"] if "测验编辑题目二" in item["content"])
        class_701 = next(item for item in second_question_payload["classes"] if item["class_name"] == "701班")

        create_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=teacher,
            json={
                "title": "测验编辑前标题",
                "description": "编辑前说明",
                "class_id": class_701["id"],
                "question_ids": [question_one_id],
            },
        )
        assert create_quiz_response.status_code == 200
        create_quiz_payload = create_quiz_response.json()["data"]
        created_quiz = max(
            (item for item in create_quiz_payload["quizzes"] if item["title"] == "测验编辑前标题"),
            key=lambda item: item["id"],
        )
        assert created_quiz["question_ids"] == [question_one_id]

        update_quiz_response = client.put(
            f"{API_PREFIX}/quizzes/staff/quizzes/{created_quiz['id']}",
            headers=teacher,
            json={
                "title": "测验编辑后标题",
                "description": "编辑后说明",
                "class_id": class_701["id"],
                "question_ids": [question_one_id, question_two_id],
            },
        )
        assert update_quiz_response.status_code == 200
        update_quiz_payload = update_quiz_response.json()["data"]
        updated_quiz = next(item for item in update_quiz_payload["quizzes"] if item["id"] == created_quiz["id"])
        assert updated_quiz["title"] == "测验编辑后标题"
        assert updated_quiz["description"] == "编辑后说明"
        assert updated_quiz["question_count"] == 2
        assert updated_quiz["question_ids"] == [question_one_id, question_two_id]

        student_home_after_update = client.get(f"{API_PREFIX}/quizzes/student/home", headers=student)
        assert student_home_after_update.status_code == 200
        visible_quiz = next(item for item in student_home_after_update.json()["data"]["available_quizzes"] if item["id"] == created_quiz["id"])
        assert visible_quiz["title"] == "测验编辑后标题"
        assert visible_quiz["question_count"] == 2

        start_response = client.post(
            f"{API_PREFIX}/quizzes/start",
            headers=student,
            json={"quiz_id": created_quiz["id"]},
        )
        assert start_response.status_code == 200
        start_payload = start_response.json()["data"]
        assert len(start_payload["questions"]) == 2
        attempt_id = start_payload["attempt"]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/quizzes/attempts/{attempt_id}/submit",
            headers=student,
            json={
                "answers": [
                    {
                        "question_id": question["id"],
                        "selected_option_key": question["options"][0]["key"],
                    }
                    for question in start_payload["questions"]
                ]
            },
        )
        assert submit_response.status_code == 200

        blocked_update_response = client.put(
            f"{API_PREFIX}/quizzes/staff/quizzes/{created_quiz['id']}",
            headers=teacher,
            json={
                "title": "作答后尝试编辑",
                "description": "应被拦截",
                "class_id": class_701["id"],
                "question_ids": [question_one_id],
            },
        )
        assert blocked_update_response.status_code == 409
        assert "作答记录" in blocked_update_response.json()["detail"]


def test_staff_can_delete_quiz_and_block_after_attempt_started():
    with TestClient(app) as client:
        teacher = staff_headers(client, username="t1")
        student = student_headers(client, username="70103")

        create_bank_response = client.post(
            f"{API_PREFIX}/quizzes/staff/banks",
            headers=teacher,
            json={"title": "测验删除测试题库", "description": "用于 smoke 验证测验删除"},
        )
        assert create_bank_response.status_code == 200
        bank_payload = create_bank_response.json()["data"]
        bank = next(item for item in bank_payload["banks"] if item["title"] == "测验删除测试题库")

        create_question_response = client.post(
            f"{API_PREFIX}/quizzes/staff/questions",
            headers=teacher,
            json={
                "bank_id": bank["id"],
                "content": "测验删除题目：以下哪项更适合检索？",
                "difficulty": "基础",
                "options": [
                    {"option_key": "A", "option_text": "明确主题关键词", "is_correct": True},
                    {"option_key": "B", "option_text": "随机输入字符", "is_correct": False},
                    {"option_key": "C", "option_text": "只输入标点", "is_correct": False},
                    {"option_key": "D", "option_text": "完全不输入", "is_correct": False},
                ],
            },
        )
        assert create_question_response.status_code == 200
        question_payload = create_question_response.json()["data"]
        refreshed_bank = next(item for item in question_payload["banks"] if item["id"] == bank["id"])
        question_id = next(item["id"] for item in refreshed_bank["questions"] if "测验删除题目" in item["content"])
        class_701 = next(item for item in question_payload["classes"] if item["class_name"] == "701班")

        create_deletable_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=teacher,
            json={
                "title": "可删除测验",
                "description": "无作答记录可删除",
                "class_id": class_701["id"],
                "question_ids": [question_id],
            },
        )
        assert create_deletable_quiz_response.status_code == 200
        deletable_payload = create_deletable_quiz_response.json()["data"]
        deletable_quiz = max(
            (item for item in deletable_payload["quizzes"] if item["title"] == "可删除测验"),
            key=lambda item: item["id"],
        )

        delete_deletable_response = client.delete(
            f"{API_PREFIX}/quizzes/staff/quizzes/{deletable_quiz['id']}",
            headers=teacher,
        )
        assert delete_deletable_response.status_code == 200
        delete_deletable_payload = delete_deletable_response.json()["data"]
        assert all(item["id"] != deletable_quiz["id"] for item in delete_deletable_payload["quizzes"])

        create_blocked_quiz_response = client.post(
            f"{API_PREFIX}/quizzes/staff/quizzes",
            headers=teacher,
            json={
                "title": "作答后不可删除测验",
                "description": "用于验证删除拦截",
                "class_id": class_701["id"],
                "question_ids": [question_id],
            },
        )
        assert create_blocked_quiz_response.status_code == 200
        blocked_payload = create_blocked_quiz_response.json()["data"]
        blocked_quiz = max(
            (item for item in blocked_payload["quizzes"] if item["title"] == "作答后不可删除测验"),
            key=lambda item: item["id"],
        )

        start_response = client.post(
            f"{API_PREFIX}/quizzes/start",
            headers=student,
            json={"quiz_id": blocked_quiz["id"]},
        )
        assert start_response.status_code == 200
        start_payload = start_response.json()["data"]
        attempt_id = start_payload["attempt"]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/quizzes/attempts/{attempt_id}/submit",
            headers=student,
            json={
                "answers": [
                    {
                        "question_id": question["id"],
                        "selected_option_key": question["options"][0]["key"],
                    }
                    for question in start_payload["questions"]
                ]
            },
        )
        assert submit_response.status_code == 200

        blocked_delete_response = client.delete(
            f"{API_PREFIX}/quizzes/staff/quizzes/{blocked_quiz['id']}",
            headers=teacher,
        )
        assert blocked_delete_response.status_code == 409
        assert "作答记录" in blocked_delete_response.json()["detail"]


def test_teacher_scope_admin_bootstrap_and_room_layout_update():
    with TestClient(app) as client:
        teacher_one = staff_headers(client, "t1")
        teacher_two = staff_headers(client, "t2")
        admin = staff_headers(client, "admin")

        t1_dashboard = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher_one).json()["data"]
        t2_dashboard = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher_two).json()["data"]
        admin_dashboard = client.get(f"{API_PREFIX}/staff/dashboard", headers=admin).json()["data"]
        bootstrap = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin).json()["data"]

        assert {item["class_name"] for item in t1_dashboard["launchpad"]["classes"]} == {"701班", "702班"}
        assert {item["class_name"] for item in t2_dashboard["launchpad"]["classes"]} == {"703班", "809班"}
        assert {item["class_name"] for item in admin_dashboard["launchpad"]["classes"]} == {"701班", "702班", "703班", "809班", "812班"}
        assert {item["username"] for item in bootstrap["teachers"]} >= {"admin", "t1", "t2"}
        assert len(bootstrap["rooms"]) >= 4

        room = next(item for item in bootstrap["rooms"] if item["name"] == "七年级机房A")
        first_seat = room["seats"][0]
        second_seat = room["seats"][1]
        seats_payload = [
            {
                **seat,
                "row_no": seat["row_no"] if seat["id"] not in {first_seat["id"], second_seat["id"]} else (first_seat["row_no"] if seat["id"] == second_seat["id"] else second_seat["row_no"]),
                "col_no": seat["col_no"] if seat["id"] not in {first_seat["id"], second_seat["id"]} else (first_seat["col_no"] if seat["id"] == second_seat["id"] else second_seat["col_no"]),
            }
            for seat in room["seats"]
        ]
        save_response = client.put(
            f"{API_PREFIX}/settings/admin/rooms/{room['id']}/seats",
            headers=admin,
            json={"row_count": room["row_count"], "col_count": room["col_count"], "seats": seats_payload},
        )
        assert save_response.status_code == 200

        refreshed_bootstrap = save_response.json()["data"]
        refreshed_room = next(item for item in refreshed_bootstrap["rooms"] if item["id"] == room["id"])
        refreshed_first = next(item for item in refreshed_room["seats"] if item["id"] == first_seat["id"])
        refreshed_second = next(item for item in refreshed_room["seats"] if item["id"] == second_seat["id"])
        assert (refreshed_first["row_no"], refreshed_first["col_no"]) == (second_seat["row_no"], second_seat["col_no"])
        assert (refreshed_second["row_no"], refreshed_second["col_no"]) == (first_seat["row_no"], first_seat["col_no"])


def test_dashboard_roster_grid_matches_room_layout_with_virtual_cells():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        admin = staff_headers(client, "admin")

        bootstrap = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin).json()["data"]
        room = next(item for item in bootstrap["rooms"] if item["name"] == "七年级机房A")

        original_row_count = room["row_count"]
        col_count = room["col_count"]
        expanded_row_count = original_row_count + 1
        seats_payload = [
            {
                "id": seat["id"],
                "row_no": seat["row_no"],
                "col_no": seat["col_no"],
                "seat_label": seat["seat_label"],
                "ip_address": seat["ip_address"],
                "hostname": seat.get("hostname"),
                "is_enabled": seat["is_enabled"],
            }
            for seat in room["seats"]
        ]

        save_response = client.put(
            f"{API_PREFIX}/settings/admin/rooms/{room['id']}/seats",
            headers=admin,
            json={"row_count": expanded_row_count, "col_count": col_count, "seats": seats_payload},
        )
        assert save_response.status_code == 200

        dashboard_response = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher)
        assert dashboard_response.status_code == 200
        roster = find_roster(dashboard_response.json()["data"], "701班")
        assert roster["room"]["id"] == room["id"]
        assert roster["room"]["row_count"] == expanded_row_count
        assert len(roster["seats"]) == expanded_row_count * col_count

        virtual_last_row = [item for item in roster["seats"] if item["row_no"] == expanded_row_count]
        assert len(virtual_last_row) == col_count
        assert all(item["is_virtual"] is True for item in virtual_last_row)
        assert all(item["student"] is None for item in virtual_last_row)

        restore_response = client.put(
            f"{API_PREFIX}/settings/admin/rooms/{room['id']}/seats",
            headers=admin,
            json={"row_count": original_row_count, "col_count": col_count, "seats": seats_payload},
        )
        assert restore_response.status_code == 200


def test_admin_can_create_large_room_and_import_seat_bindings():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")

        room_response = client.post(
            f"{API_PREFIX}/settings/admin/rooms",
            headers=admin,
            json={
                "name": "导入测试机房",
                "row_count": 21,
                "col_count": 2,
                "description": "用于验证大于 20 的机房行列和座位表导入",
                "ip_prefix": "10.21.1.",
                "ip_start": 11,
            },
        )
        assert room_response.status_code == 200
        room = next(item for item in room_response.json()["data"]["rooms"] if item["name"] == "导入测试机房")
        assert room["row_count"] == 21
        assert room["col_count"] == 2

        csv_content = "\n".join([
            "行号,列号,座位号,IP地址,主机名,是否启用",
            "1,1,前排01,10.21.1.101,pc-front-01,是",
            "21,2,后排42,10.21.1.142,pc-back-42,否",
        ])
        import_response = client.post(
            f"{API_PREFIX}/settings/admin/rooms/{room['id']}/seats/import",
            headers=admin,
            files={"file": ("seat-import.csv", csv_content.encode("utf-8-sig"), "text/csv")},
        )
        assert import_response.status_code == 200
        import_payload = import_response.json()["data"]
        assert import_payload["row_count"] == 21
        assert import_payload["col_count"] == 2
        assert len(import_payload["seats"]) == 42
        imported_first = next(item for item in import_payload["seats"] if item["row_no"] == 1 and item["col_no"] == 1)
        imported_last = next(item for item in import_payload["seats"] if item["row_no"] == 21 and item["col_no"] == 2)
        assert imported_first["seat_label"] == "前排01"
        assert imported_first["ip_address"] == "10.21.1.101"
        assert imported_last["seat_label"] == "后排42"
        assert imported_last["is_enabled"] is False

        save_response = client.put(
            f"{API_PREFIX}/settings/admin/rooms/{room['id']}/seats",
            headers=admin,
            json=import_payload,
        )
        assert save_response.status_code == 200
        saved_room = next(item for item in save_response.json()["data"]["rooms"] if item["id"] == room["id"])
        saved_first = next(item for item in saved_room["seats"] if item["row_no"] == 1 and item["col_no"] == 1)
        saved_last = next(item for item in saved_room["seats"] if item["row_no"] == 21 and item["col_no"] == 2)
        assert saved_room["row_count"] == 21
        assert saved_room["col_count"] == 2
        assert len(saved_room["seats"]) == 42
        assert saved_first["seat_label"] == "前排01"
        assert saved_first["hostname"] == "pc-front-01"
        assert saved_last["seat_label"] == "后排42"
        assert saved_last["ip_address"] == "10.21.1.142"
        assert saved_last["is_enabled"] is False

        delete_response = client.delete(f"{API_PREFIX}/settings/admin/rooms/{room['id']}", headers=admin)
        assert delete_response.status_code == 200


def test_admin_can_crud_room_class_teacher_and_curriculum():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")

        room_payload = client.post(
            f"{API_PREFIX}/settings/admin/rooms",
            headers=admin,
            json={"name": "九年级机房A", "row_count": 2, "col_count": 5, "description": "临时测试机房", "ip_prefix": "10.9.1.", "ip_start": 31},
        )
        assert room_payload.status_code == 200
        room = next(item for item in room_payload.json()["data"]["rooms"] if item["name"] == "九年级机房A")

        class_payload = client.post(
            f"{API_PREFIX}/settings/admin/classes",
            headers=admin,
            json={"grade_no": 9, "class_no": 1, "head_teacher_name": "教师3", "default_room_id": room["id"]},
        )
        assert class_payload.status_code == 200
        school_class = next(item for item in class_payload.json()["data"]["classes"] if item["class_name"] == "901班")

        teacher_payload = client.post(
            f"{API_PREFIX}/settings/admin/teachers",
            headers=admin,
            json={"username": "t3", "display_name": "教师3", "title": "信息科技教师", "is_admin": False, "password": "222221", "class_ids": [school_class["id"]]},
        )
        assert teacher_payload.status_code == 200
        assert any(item["username"] == "t3" for item in teacher_payload.json()["data"]["teachers"])

        books_response = client.post(
            f"{API_PREFIX}/curriculum/books",
            headers=admin,
            json={"name": "九年级上册 信息科技", "subject": "信息科技", "edition": "浙教版", "grade_scope": "九年级上册"},
        )
        assert books_response.status_code == 200
        book = next(item for item in books_response.json()["data"]["books"] if item["name"] == "九年级上册 信息科技")

        units_response = client.post(
            f"{API_PREFIX}/curriculum/units",
            headers=admin,
            json={"book_id": book["id"], "term_no": 1, "unit_no": 1, "title": "第一单元 数据与网络"},
        )
        assert units_response.status_code == 200
        book = next(item for item in units_response.json()["data"]["books"] if item["id"] == book["id"])
        unit = next(item for item in book["units"] if item["title"] == "第一单元 数据与网络")

        lessons_response = client.post(
            f"{API_PREFIX}/curriculum/lessons",
            headers=admin,
            json={"unit_id": unit["id"], "lesson_no": 1, "title": "第1课 数据采集", "summary": "测试课次"},
        )
        assert lessons_response.status_code == 200
        book_after_lesson = next(item for item in lessons_response.json()["data"]["books"] if item["id"] == book["id"])
        unit_after_lesson = next(item for item in book_after_lesson["units"] if item["id"] == unit["id"])
        lesson = next(item for item in unit_after_lesson["lessons"] if item["title"] == "第1课 数据采集")

        assert client.delete(f"{API_PREFIX}/curriculum/lessons/{lesson['id']}", headers=admin).status_code == 200
        assert client.delete(f"{API_PREFIX}/curriculum/units/{unit['id']}", headers=admin).status_code == 200
        assert client.delete(f"{API_PREFIX}/curriculum/books/{book['id']}", headers=admin).status_code == 200
        assert client.delete(f"{API_PREFIX}/settings/admin/teachers/{next(item['id'] for item in teacher_payload.json()['data']['teachers'] if item['username'] == 't3')}", headers=admin).status_code == 200
        assert client.delete(f"{API_PREFIX}/settings/admin/classes/{school_class['id']}", headers=admin).status_code == 200
        assert client.delete(f"{API_PREFIX}/settings/admin/rooms/{room['id']}", headers=admin).status_code == 200


def test_admin_can_import_curriculum_tree_from_csv():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")
        csv_content = (
            "教材名称,学科,版本,适用范围,学期,单元序号,单元标题,课次序号,课次标题,课次摘要\n"
            "#示例：七年级下册 信息科技,信息科技,浙教版,七年级下册,2,3,第三单元 智能技术初探,7,第7课 人工智能基础,示例行自动忽略\n"
            "八年级下册 信息科技,信息科技,浙教版,八年级下册,2,2,第二单元 物联网与智能感知,6,第6课 物联网,\n"
        )

        response = client.post(
            f"{API_PREFIX}/curriculum/import",
            headers=admin,
            files={"file": ("curriculum-import.csv", csv_content.encode("utf-8"), "text/csv")},
        )
        assert response.status_code == 200
        payload = response.json()["data"]
        assert "books" in payload
        assert payload["import_result"]["processed_row_count"] == 1


def test_teacher_can_update_and_delete_draft_lesson_plan():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        curriculum = client.get(f"{API_PREFIX}/curriculum/tree", headers=teacher).json()["data"]["books"]
        lesson_id = find_lesson_id_by_title(curriculum, "第8课 智能应用体验")

        create_response = client.post(
            f"{API_PREFIX}/lesson-plans/staff",
            headers=teacher,
            json={
                "lesson_id": lesson_id,
                "title": "可编辑删除学案-初稿",
                "content": "<p>初稿内容</p>",
                "assigned_date": "2026-03-31",
                "status": "draft",
                "tasks": [
                    {"title": "阅读导学", "task_type": "reading", "description": "<p>阅读</p>", "sort_order": 1, "is_required": True},
                    {"title": "上传作品", "task_type": "upload_image", "description": "<p>上传</p>", "sort_order": 2, "is_required": True},
                ],
            },
        )
        assert create_response.status_code == 200
        created_plan = create_response.json()["data"]["plan"]
        assert created_plan["title"] == "可编辑删除学案-初稿"

        update_response = client.put(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
            json={
                "lesson_id": lesson_id,
                "title": "可编辑删除学案-更新版",
                "content": "<p>更新后的正文</p>",
                "assigned_date": "2026-04-01",
                "status": "draft",
                "tasks": [
                    {"title": "更新任务A", "task_type": "reading", "description": "<p>A</p>", "sort_order": 1, "is_required": True},
                ],
            },
        )
        assert update_response.status_code == 200
        updated_plan = update_response.json()["data"]["plan"]
        assert updated_plan["title"] == "可编辑删除学案-更新版"
        assert len(updated_plan["tasks"]) == 1
        assert updated_plan["tasks"][0]["title"] == "更新任务A"

        delete_response = client.delete(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["data"]["deleted_id"] == created_plan["id"]

        detail_after_delete = client.get(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
        )
        assert detail_after_delete.status_code == 404


def test_teacher_can_update_and_delete_active_plan_with_progress():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        curriculum = client.get(f"{API_PREFIX}/curriculum/tree", headers=teacher).json()["data"]["books"]
        lesson_id = find_lesson_id_by_title(curriculum, "第8课 智能应用体验")

        create_response = client.post(
            f"{API_PREFIX}/lesson-plans/staff",
            headers=teacher,
            json={
                "lesson_id": lesson_id,
                "title": "开课后可编辑删除-初稿",
                "content": "<p>初始正文</p>",
                "assigned_date": "2026-04-01",
                "status": "draft",
                "tasks": [
                    {"title": "阅读任务A", "task_type": "reading", "description": "<p>任务A</p>", "sort_order": 1, "is_required": True},
                    {"title": "上传任务B", "task_type": "upload_image", "description": "<p>任务B</p>", "sort_order": 2, "is_required": True},
                ],
            },
        )
        assert create_response.status_code == 200
        created_plan = create_response.json()["data"]["plan"]
        assert client.post(f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}/publish", headers=teacher).status_code == 200

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher)
        assert dashboard_payload.status_code == 200
        class_701 = find_class(dashboard_payload.json()["data"], "701班")
        start_response = client.post(
            f"{API_PREFIX}/classroom/sessions",
            headers=teacher,
            json={"class_id": class_701["id"], "plan_id": created_plan["id"]},
        )
        assert start_response.status_code == 200

        detail_response = client.get(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
        )
        assert detail_response.status_code == 200
        detail_plan = detail_response.json()["data"]["plan"]
        assert detail_plan["progress"]["pending_count"] > 0
        existing_task_id = detail_plan["tasks"][0]["id"]

        update_response = client.put(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
            json={
                "lesson_id": lesson_id,
                "title": "开课后可编辑删除-更新版",
                "content": "<p>开课后更新正文</p>",
                "assigned_date": "2026-04-02",
                "status": "published",
                "tasks": [
                    {
                        "id": existing_task_id,
                        "title": "阅读任务A-更新",
                        "task_type": "reading",
                        "description": "<p>更新任务A</p>",
                        "sort_order": 1,
                        "is_required": True,
                    },
                ],
            },
        )
        assert update_response.status_code == 200
        updated_plan = update_response.json()["data"]["plan"]
        assert updated_plan["title"] == "开课后可编辑删除-更新版"
        assert len(updated_plan["tasks"]) == 1
        assert updated_plan["tasks"][0]["title"] == "阅读任务A-更新"

        delete_response = client.delete(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["data"]["deleted_id"] == created_plan["id"]

        detail_after_delete = client.get(
            f"{API_PREFIX}/lesson-plans/staff/{created_plan['id']}",
            headers=teacher,
        )
        assert detail_after_delete.status_code == 404


def test_teacher_can_complete_full_teaching_roundtrip():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        student = student_headers(client, "70101", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})

        curriculum = client.get(f"{API_PREFIX}/curriculum/tree", headers=teacher).json()["data"]["books"]
        lesson_id = find_lesson_id_by_title(curriculum, "第8课 智能应用体验")

        create_plan_response = client.post(
            f"{API_PREFIX}/lesson-plans/staff",
            headers=teacher,
            json={
                "lesson_id": lesson_id,
                "title": "七下第8课 课堂闭环测试学案",
                "content": "<p><strong>课前导读：</strong>先观察你身边的智能应用场景。</p>",
                "assigned_date": "2026-03-31",
                "status": "draft",
                "tasks": [
                    {"title": "阅读任务：智能应用观察", "task_type": "reading", "description": "<p>先阅读导学内容。</p>", "sort_order": 1, "is_required": True},
                    {"title": "活动一：提交我的智能应用方案", "task_type": "upload_image", "description": "<p>上传图片或文字说明。</p>", "sort_order": 2, "is_required": True},
                ],
            },
        )
        assert create_plan_response.status_code == 200
        plan = create_plan_response.json()["data"]["plan"]
        upload_task_id = next(item["id"] for item in plan["tasks"] if item["task_type"] == "upload_image")

        assert client.post(f"{API_PREFIX}/lesson-plans/staff/{plan['id']}/publish", headers=teacher).status_code == 200

        dashboard = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        class_701 = find_class(dashboard, "701班")
        start_response = client.post(
            f"{API_PREFIX}/classroom/sessions",
            headers=teacher,
            json={"class_id": class_701["id"], "plan_id": plan["id"]},
        )
        assert start_response.status_code == 200
        session_payload = start_response.json()["data"]
        assert session_payload["progress_created_count"] >= 1

        student_home = client.get(f"{API_PREFIX}/lesson-plans/student/home", headers=student).json()["data"]
        assert any(item["id"] == plan["id"] for item in student_home["pending_courses"])

        task_submit = client.post(
            f"{API_PREFIX}/tasks/{upload_task_id}/submit",
            headers=student,
            data={"submission_note": "<p><strong>这是我的智能应用方案。</strong></p><ul><li>先观察</li><li>再设计</li></ul>"},
            files=[("files", ("ai-plan.txt", b"smart app idea", "text/plain"))],
        )
        assert task_submit.status_code == 200
        task_payload = task_submit.json()["data"]
        submission_id = task_payload["current_submission"]["id"]
        assert task_payload["current_submission"]["status"] == "submitted"
        assert "<strong>这是我的智能应用方案。</strong>" in (task_payload["current_submission"]["submission_note"] or "")

        teacher_task = client.get(f"{API_PREFIX}/submissions/teacher/task/{upload_task_id}", headers=teacher)
        assert teacher_task.status_code == 200
        teacher_items = teacher_task.json()["data"]["items"]
        assert any(item["submission_id"] == submission_id for item in teacher_items)
        assert any(
            item["submission_id"] == submission_id
            and "<strong>这是我的智能应用方案。</strong>" in (item["submission_note"] or "")
            for item in teacher_items
        )

        score_response = client.post(
            f"{API_PREFIX}/submissions/{submission_id}/score",
            headers=teacher,
            json={"score": 120, "teacher_comment": "方案完整，推荐展示。"},
        )
        assert score_response.status_code == 200
        assert score_response.json()["data"]["submission"]["is_recommended"] is True

        student_task = client.get(f"{API_PREFIX}/tasks/{upload_task_id}", headers=student)
        assert student_task.status_code == 200
        student_task_payload = student_task.json()["data"]
        assert student_task_payload["current_submission"]["status"] == "reviewed"
        assert student_task_payload["current_submission"]["can_resubmit"] is False
        assert student_task_payload["recommended_showcase"]["count"] >= 1
        assert student_task_payload["recommended_showcase"]["items"][0]["submission_id"] == submission_id

        blocked_resubmit = client.post(
            f"{API_PREFIX}/tasks/{upload_task_id}/submit",
            headers=student,
            data={"submission_note": "想再次修改"},
        )
        assert blocked_resubmit.status_code == 409
        assert blocked_resubmit.json()["detail"] == "作业已评价，不能再次提交"


def test_teacher_cannot_review_other_teachers_class_work():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")
        admin = staff_headers(client, "admin")
        blocked = client.get(f"{API_PREFIX}/submissions/teacher/task/75", headers=teacher)
        allowed = client.get(f"{API_PREFIX}/submissions/teacher/task/75", headers=admin)

    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "无权查看该任务作品"
    assert allowed.status_code == 200
    assert allowed.json()["data"]["summary"]["submission_count"] >= 1


def test_admin_can_update_system_settings_and_teacher_admin_role():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")
        teacher = staff_headers(client, "t1")

        bootstrap_response = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]

        original_system = bootstrap_payload["system"]
        target_teacher = next(item for item in bootstrap_payload["teachers"] if item["username"] == "t1")
        review_preset_text = "通过 · 测试|同意调班，教学安排已确认。"
        unreview_preset_text = "撤销 · 测试|撤销本次审核，等待补充材料后再处理。"

        system_update = client.put(
            f"{API_PREFIX}/settings/system",
            headers=admin,
            json={
                "school_name": "系统设置测试学校",
                "active_grade_nos": [7, 8, 9],
                "student_register_enabled": True,
                "assistant_enabled": original_system["assistant_enabled"],
                "auto_attendance_on_login": original_system["auto_attendance_on_login"],
                "class_transfer_review_note_presets_text": review_preset_text,
                "class_transfer_unreview_reason_presets_text": unreview_preset_text,
            },
        )
        assert system_update.status_code == 200
        system_payload = system_update.json()["data"]
        assert system_payload["school_name"] == "系统设置测试学校"
        assert system_payload["active_grade_nos"] == [7, 8, 9]
        assert system_payload["student_register_enabled"] is True
        assert system_payload["class_transfer_review_note_presets_text"] == review_preset_text
        assert system_payload["class_transfer_unreview_reason_presets_text"] == unreview_preset_text

        promote_response = client.put(
            f"{API_PREFIX}/settings/admin/teachers/{target_teacher['id']}",
            headers=admin,
            json={
                "username": target_teacher["username"],
                "display_name": target_teacher["display_name"],
                "title": target_teacher["title"],
                "password": None,
                "is_admin": True,
                "class_ids": target_teacher["class_ids"],
            },
        )
        assert promote_response.status_code == 200
        promoted_teacher = next(
            item
            for item in promote_response.json()["data"]["teachers"]
            if item["id"] == target_teacher["id"]
        )
        assert promoted_teacher["is_admin"] is True

        teacher_me = client.get(f"{API_PREFIX}/auth/me", headers=teacher)
        assert teacher_me.status_code == 200
        assert "admin" in teacher_me.json()["data"]["roles"]

        restore_teacher = client.put(
            f"{API_PREFIX}/settings/admin/teachers/{target_teacher['id']}",
            headers=admin,
            json={
                "username": target_teacher["username"],
                "display_name": target_teacher["display_name"],
                "title": target_teacher["title"],
                "password": None,
                "is_admin": target_teacher["is_admin"],
                "class_ids": target_teacher["class_ids"],
            },
        )
        assert restore_teacher.status_code == 200

        teacher_me_after_restore = client.get(f"{API_PREFIX}/auth/me", headers=teacher)
        assert teacher_me_after_restore.status_code == 200
        assert "admin" not in teacher_me_after_restore.json()["data"]["roles"]

        restore_system = client.put(
            f"{API_PREFIX}/settings/system",
            headers=admin,
            json=original_system,
        )
        assert restore_system.status_code == 200


def test_group_drive_upload_limits_apply_to_student_and_teacher_uploads():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")
        teacher = staff_headers(client, "t1")
        student = student_headers(client, "70101")

        bootstrap_response = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin)
        assert bootstrap_response.status_code == 200
        original_system = bootstrap_response.json()["data"]["system"]

        drive_payload = client.get(f"{API_PREFIX}/drives/me", headers=student)
        assert drive_payload.status_code == 200
        baseline_group_space = drive_payload.json()["data"]["group_space"]
        baseline_file_count = baseline_group_space["file_count"]
        group_id = baseline_group_space["group_id"]
        assert group_id is not None

        updated_system = {
            **original_system,
            "group_drive_file_max_count": baseline_file_count + 2,
            "group_drive_single_file_max_mb": 1,
            "group_drive_allowed_extensions": "txt",
        }

        update_response = client.put(
            f"{API_PREFIX}/settings/system",
            headers=admin,
            json=updated_system,
        )
        assert update_response.status_code == 200

        try:
            blocked_extension = client.post(
                f"{API_PREFIX}/drives/group/files",
                headers=student,
                files=[("files", ("blocked.png", b"png", "image/png"))],
            )
            assert blocked_extension.status_code == 400
            assert "不在允许范围内" in blocked_extension.json()["detail"]

            blocked_size = client.post(
                f"{API_PREFIX}/staff/groups/{group_id}/drive/files",
                headers=teacher,
                files=[("files", ("oversized.txt", b"x" * (2 * 1024 * 1024), "text/plain"))],
            )
            assert blocked_size.status_code == 400
            assert "1 MB" in blocked_size.json()["detail"]

            first_valid = client.post(
                f"{API_PREFIX}/drives/group/files",
                headers=student,
                files=[("files", ("limit-one.txt", b"one", "text/plain"))],
            )
            assert first_valid.status_code == 200

            second_valid = client.post(
                f"{API_PREFIX}/staff/groups/{group_id}/drive/files",
                headers=teacher,
                files=[("files", ("limit-two.txt", b"two", "text/plain"))],
            )
            assert second_valid.status_code == 200

            blocked_count = client.post(
                f"{API_PREFIX}/staff/groups/{group_id}/drive/files",
                headers=teacher,
                files=[("files", ("limit-three.txt", b"three", "text/plain"))],
            )
            assert blocked_count.status_code == 400
            assert "最多允许" in blocked_count.json()["detail"]
        finally:
            restore_response = client.put(
                f"{API_PREFIX}/settings/system",
                headers=admin,
                json=original_system,
            )
            assert restore_response.status_code == 200


def test_admin_can_read_and_update_assistant_prompt_settings():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")

        bootstrap_response = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        assert bootstrap_payload["assistant_prompts"]["general_prompt"]
        assert bootstrap_payload["assistant_prompts"]["lesson_prompt"]

        update_response = client.put(
            f"{API_PREFIX}/settings/assistant-prompts",
            headers=admin,
            json={
                "general_prompt": "General buddy prompt for smoke test.",
                "lesson_prompt": "Lesson buddy prompt for smoke test.",
            },
        )
        assert update_response.status_code == 200
        update_payload = update_response.json()["data"]
        assert update_payload["general_prompt"] == "General buddy prompt for smoke test."
        assert update_payload["lesson_prompt"] == "Lesson buddy prompt for smoke test."

        read_response = client.get(f"{API_PREFIX}/settings/assistant-prompts", headers=admin)
        assert read_response.status_code == 200
        assert read_response.json()["data"] == update_payload


def test_ai_companion_bootstrap_context_and_preview_reply():
    with TestClient(app) as client:
        student = student_headers(client, "70101", extra_headers={"x-learnsite-device-ip": "127.0.0.1"})

        bootstrap_response = client.get(f"{API_PREFIX}/assistants/companion/bootstrap", headers=student)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        assert bootstrap_payload["enabled"] is True
        assert bootstrap_payload["capabilities"]["multimodal"] is True
        assert bootstrap_payload["default_knowledge_base_ids"]["general"]
        assert bootstrap_payload["knowledge_bases"]
        selected_provider = bootstrap_payload.get("active_provider")
        selected_provider_id = selected_provider["id"] if selected_provider else None

        context_response = client.get(f"{API_PREFIX}/assistants/companion/context?task_id=57", headers=student)
        assert context_response.status_code == 200
        context_payload = context_response.json()["data"]["context"]
        assert context_payload["kind"] == "task"
        assert context_payload["identifiers"]["task_id"] == 57
        assert context_payload["title"]

        reply_response = client.post(
            f"{API_PREFIX}/assistants/companion/respond",
            headers=student,
            json={
                "scope": "lesson",
                "message": "帮我理解这道任务应该先做什么",
                "provider_id": selected_provider_id,
                "task_id": 57,
                "knowledge_base_ids": ["lesson-plan", "task-guidance"],
                "attachments": [
                    {
                        "name": "question.png",
                        "mime_type": "image/png",
                        "size_kb": 128,
                        "kind": "image",
                    }
                ],
                "conversation": [],
            },
        )
        assert reply_response.status_code == 200
        reply_payload = reply_response.json()["data"]
        assert reply_payload["reply"]["provider_mode"] == "preview"
        assert reply_payload["reply"]["content"]
        assert reply_payload["context"]["identifiers"]["task_id"] == 57
        if selected_provider_id is not None:
            assert reply_payload["active_provider"]["id"] == selected_provider_id

        stream_response = client.post(
            f"{API_PREFIX}/assistants/companion/respond/stream",
            headers=student,
            json={
                "scope": "general",
                "message": "帮我给出三步复习计划",
                "provider_id": selected_provider_id,
                "conversation": [],
                "stream": True,
            },
        )
        assert stream_response.status_code == 200
        assert "text/event-stream" in stream_response.headers.get("content-type", "")
        stream_text = stream_response.text
        assert "event: token" in stream_text
        assert "event: done" in stream_text
        assert '"provider_mode"' in stream_text

        invalid_provider_response = client.post(
            f"{API_PREFIX}/assistants/companion/respond",
            headers=student,
            json={
                "scope": "general",
                "message": "请给我一个复习建议",
                "provider_id": 999999,
                "conversation": [],
            },
        )
        assert invalid_provider_response.status_code == 400
        assert "provider" in invalid_provider_response.json()["detail"].lower()


def test_staff_attendance_api_and_export():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        attendance_response = client.get(f"{API_PREFIX}/staff/attendance", headers=teacher)
        assert attendance_response.status_code == 200
        attendance_payload = attendance_response.json()["data"]
        assert attendance_payload["classes"]
        assert attendance_payload["selected_class_id"]
        assert attendance_payload["summary"]["student_count"] >= attendance_payload["summary"]["present_count"]
        assert attendance_payload["records"]

        class_id = attendance_payload["selected_class_id"]
        export_response = client.get(
            f"{API_PREFIX}/staff/attendance/export?class_id={class_id}&mode=present",
            headers=teacher,
        )
        assert export_response.status_code == 200
        assert "text/csv" in export_response.headers["content-type"]
        export_text = export_response.content.decode("utf-8-sig")
        assert "日期,班级,学号" in export_text


def test_staff_student_management_reset_password_status_ungroup_and_batch_actions():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
        available_classes = dashboard_payload["launchpad"]["classes"]
        assert available_classes

        students_response = client.get(
            f"{API_PREFIX}/staff/students?class_id={class_701['id']}",
            headers=teacher,
        )
        assert students_response.status_code == 200
        students_payload = students_response.json()["data"]
        target_student = next(item for item in students_payload["items"] if item["student_no"] == "70101")

        reset_response = client.post(
            f"{API_PREFIX}/staff/students/{target_student['user_id']}/reset-password",
            headers=teacher,
            json={"new_password": "701011"},
        )
        assert reset_response.status_code == 200
        assert reset_response.json()["data"]["new_password"] == "701011"

        login_with_new_password = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70101", "password": "701011"},
        )
        assert login_with_new_password.status_code == 200

        disable_response = client.post(
            f"{API_PREFIX}/staff/students/{target_student['user_id']}/status",
            headers=teacher,
            json={"is_active": False},
        )
        assert disable_response.status_code == 200

        disabled_login = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70101", "password": "701011"},
        )
        assert disabled_login.status_code == 401

        restore_response = client.post(
            f"{API_PREFIX}/staff/students/{target_student['user_id']}/status",
            headers=teacher,
            json={"is_active": True},
        )
        assert restore_response.status_code == 200

        submissions_response = client.get(
            f"{API_PREFIX}/staff/students/{target_student['user_id']}/submissions",
            headers=teacher,
        )
        assert submissions_response.status_code == 200
        assert submissions_response.json()["data"]["student"]["student_no"] == "70101"

        ungroup_response = client.post(
            f"{API_PREFIX}/staff/students/{target_student['user_id']}/ungroup",
            headers=teacher,
        )
        assert ungroup_response.status_code == 200

        refreshed_students = client.get(
            f"{API_PREFIX}/staff/students?class_id={class_701['id']}&include_inactive=true",
            headers=teacher,
        )
        assert refreshed_students.status_code == 200
        refreshed_target = next(
            item
            for item in refreshed_students.json()["data"]["items"]
            if item["student_no"] == "70101"
        )
        assert refreshed_target["is_active"] is True
        assert refreshed_target["current_group_id"] is None

        batch_target = next(
            item
            for item in refreshed_students.json()["data"]["items"]
            if item["student_no"] == "70102"
        )

        batch_disable = client.post(
            f"{API_PREFIX}/staff/students/batch-action",
            headers=teacher,
            json={
                "student_user_ids": [target_student["user_id"], batch_target["user_id"]],
                "action": "deactivate",
            },
        )
        assert batch_disable.status_code == 200
        assert batch_disable.json()["data"]["batch_result"]["affected_count"] >= 1

        disabled_batch_login = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70102", "password": "12345"},
        )
        assert disabled_batch_login.status_code == 401

        batch_activate = client.post(
            f"{API_PREFIX}/staff/students/batch-action",
            headers=teacher,
            json={
                "student_user_ids": [target_student["user_id"], batch_target["user_id"]],
                "action": "activate",
            },
        )
        assert batch_activate.status_code == 200

        restored_batch_login = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70102", "password": "12345"},
        )
        assert restored_batch_login.status_code == 200

        batch_reset = client.post(
            f"{API_PREFIX}/staff/students/batch-action",
            headers=teacher,
            json={
                "student_user_ids": [target_student["user_id"]],
                "action": "reset_password",
            },
        )
        assert batch_reset.status_code == 200
        assert batch_reset.json()["data"]["batch_result"]["used_default_password_rule"] is True

        login_after_batch_reset = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "70101", "password": "123456"},
        )
        assert login_after_batch_reset.status_code == 200

        batch_ungroup = client.post(
            f"{API_PREFIX}/staff/students/batch-action",
            headers=teacher,
            json={
                "student_user_ids": [batch_target["user_id"]],
                "action": "ungroup",
            },
        )
        assert batch_ungroup.status_code == 200
        assert batch_ungroup.json()["data"]["batch_result"]["affected_count"] == 1

        batch_refreshed_students = client.get(
            f"{API_PREFIX}/staff/students?class_id={class_701['id']}&include_inactive=true",
            headers=teacher,
        )
        assert batch_refreshed_students.status_code == 200
        refreshed_batch_target = next(
            item
            for item in batch_refreshed_students.json()["data"]["items"]
            if item["student_no"] == "70102"
        )
        assert refreshed_batch_target["is_active"] is True
        assert refreshed_batch_target["current_group_id"] is None


def test_staff_lesson_agent_binding_flow_and_context_injection():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        bootstrap_response = client.get(f"{API_PREFIX}/assistants/staff/lesson-agents", headers=teacher)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        class_701 = next(item for item in bootstrap_payload["classes"] if item["class_name"] == "701班")
        plan_24 = next(item for item in bootstrap_payload["plans"] if item["id"] == 24)

        save_response = client.post(
            f"{API_PREFIX}/assistants/staff/lesson-agents",
            headers=teacher,
            json={
                "name": "701 第8课课时学伴",
                "class_id": class_701["id"],
                "plan_id": plan_24["id"],
                "knowledge_base_ids": ["lesson-plan", "classroom-routines"],
                "prompt_template": "请优先输出课堂可执行步骤和分层提示。",
                "is_enabled": True,
            },
        )
        assert save_response.status_code == 200
        saved_payload = save_response.json()["data"]
        binding = next(item for item in saved_payload["bindings"] if item["name"] == "701 第8课课时学伴")

        launchpad_response = client.get(f"{API_PREFIX}/classroom/launchpad", headers=teacher)
        assert launchpad_response.status_code == 200
        session_id = launchpad_response.json()["data"]["active_sessions"][0]["session_id"]

        context_response = client.get(
            f"{API_PREFIX}/assistants/companion/context?session_id={session_id}",
            headers=teacher,
        )
        assert context_response.status_code == 200
        context_payload = context_response.json()["data"]["context"]
        assert context_payload["assistant_binding"]["binding_id"] == binding["binding_id"]
        assert "lesson-plan" in context_payload["recommended_knowledge_base_ids"]

        respond_response = client.post(
            f"{API_PREFIX}/assistants/companion/respond",
            headers=teacher,
            json={
                "scope": "lesson",
                "message": "给我一个这节课可执行的 3 步课堂引导",
                "session_id": session_id,
                "knowledge_base_ids": [],
                "attachments": [],
                "conversation": [],
            },
        )
        assert respond_response.status_code == 200
        respond_payload = respond_response.json()["data"]
        assert respond_payload["context"]["assistant_binding"]["binding_id"] == binding["binding_id"]
        assert respond_payload["reply"]["content"]

        delete_response = client.delete(
            f"{API_PREFIX}/assistants/staff/lesson-agents/{binding['binding_id']}",
            headers=teacher,
        )
        assert delete_response.status_code == 200


def test_staff_can_close_classroom_session_from_session_center():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        launchpad_response = client.get(f"{API_PREFIX}/classroom/launchpad", headers=teacher)
        assert launchpad_response.status_code == 200
        launchpad_payload = launchpad_response.json()["data"]

        session_id: int | None = None
        if launchpad_payload["active_sessions"]:
            session_id = launchpad_payload["active_sessions"][0]["session_id"]
        else:
            dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
            available_classes = dashboard_payload["launchpad"]["classes"]
            assert available_classes
            plan_id = dashboard_payload["launchpad"]["ready_plans"][0]["id"]
            create_response = client.post(
                f"{API_PREFIX}/classroom/sessions",
                headers=teacher,
                json={"class_id": available_classes[0]["id"], "plan_id": plan_id},
            )
            assert create_response.status_code == 200
            session_id = create_response.json()["data"]["session"]["session_id"]

        assert session_id is not None

        close_response = client.post(f"{API_PREFIX}/classroom/sessions/{session_id}/close", headers=teacher)
        assert close_response.status_code == 200
        closed_payload = close_response.json()["data"]
        assert closed_payload["status"] == "completed"

        detail_response = client.get(f"{API_PREFIX}/classroom/sessions/{session_id}", headers=teacher)
        assert detail_response.status_code == 200
        assert detail_response.json()["data"]["status"] == "completed"

        refreshed_launchpad = client.get(f"{API_PREFIX}/classroom/launchpad", headers=teacher)
        assert refreshed_launchpad.status_code == 200
        assert all(
            item["session_id"] != session_id for item in refreshed_launchpad.json()["data"]["active_sessions"]
        )


def test_staff_can_manage_classroom_switches_roll_call_and_force_offline():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        launchpad_response = client.get(f"{API_PREFIX}/classroom/launchpad", headers=teacher)
        assert launchpad_response.status_code == 200
        launchpad_payload = launchpad_response.json()["data"]

        session_id: int | None = None
        if launchpad_payload["active_sessions"]:
            session_id = launchpad_payload["active_sessions"][0]["session_id"]
        else:
            dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
            available_classes = dashboard_payload["launchpad"]["classes"]
            assert available_classes
            plan_id = dashboard_payload["launchpad"]["ready_plans"][0]["id"]
            create_response = client.post(
                f"{API_PREFIX}/classroom/sessions",
                headers=teacher,
                json={"class_id": available_classes[0]["id"], "plan_id": plan_id},
            )
            assert create_response.status_code == 200
            session_id = create_response.json()["data"]["session"]["session_id"]

        assert session_id is not None

        switch_response = client.put(
            f"{API_PREFIX}/classroom/sessions/{session_id}/switches",
            headers=teacher,
            json={
                "drive": False,
                "peer_review": False,
                "programming_control": False,
                "group_discussion": False,
                "ip_lock": True,
            },
        )
        assert switch_response.status_code == 200
        switch_payload = switch_response.json()["data"]
        assert switch_payload["switches"]["drive"] is False
        assert switch_payload["switches"]["peer_review"] is False
        assert switch_payload["switches"]["programming_control"] is False
        assert switch_payload["switches"]["group_discussion"] is False
        assert switch_payload["switches"]["ip_lock"] is True
        assert isinstance(switch_payload["switch_config"], list)
        assert any(item["key"] == "programming_control" for item in switch_payload["switch_config"])
        assert isinstance(switch_payload["tasks"], list)
        if switch_payload["tasks"]:
            progress = switch_payload["tasks"][0]["progress"]
            assert "pending_count" in progress
            assert "submitted_count" in progress
            assert "reviewed_count" in progress

        roll_call_response = client.post(
            f"{API_PREFIX}/classroom/sessions/{session_id}/roll-call",
            headers=teacher,
            json={"only_pending_signin": False},
        )
        assert roll_call_response.status_code == 200
        roll_call_payload = roll_call_response.json()["data"]
        assert roll_call_payload["session_id"] == session_id
        assert roll_call_payload["student"]["display_name"]
        assert roll_call_payload["student"]["student_no"]
        assert isinstance(roll_call_payload["used_pending_pool"], bool)
        assert isinstance(roll_call_payload["dedupe_applied"], bool)
        assert roll_call_payload["dedupe_window_minutes"] > 0
        assert isinstance(roll_call_payload["recent_history"], list)
        assert roll_call_payload["recent_history"]
        assert roll_call_payload["recent_history"][0]["student_user_id"] == roll_call_payload["student"]["user_id"]

        second_roll_call_response = client.post(
            f"{API_PREFIX}/classroom/sessions/{session_id}/roll-call",
            headers=teacher,
            json={"only_pending_signin": False},
        )
        assert second_roll_call_response.status_code == 200
        second_roll_call_payload = second_roll_call_response.json()["data"]
        assert second_roll_call_payload["recent_history"]
        assert second_roll_call_payload["recent_history"][0]["student_user_id"] == second_roll_call_payload["student"]["user_id"]
        if second_roll_call_payload["dedupe_applied"]:
            assert second_roll_call_payload["student"]["user_id"] != roll_call_payload["student"]["user_id"]

        force_offline_response = client.post(
            f"{API_PREFIX}/classroom/sessions/{session_id}/force-offline",
            headers=teacher,
            json={"note": "课堂演示：临时统一下线"},
        )
        assert force_offline_response.status_code == 200
        force_payload = force_offline_response.json()["data"]
        assert force_payload["session_id"] == session_id
        assert force_payload["target_student_count"] >= force_payload["checked_in_count"]
        assert force_payload["note"] == "课堂演示：临时统一下线"
        assert force_payload["issued_at"]


def test_student_capabilities_follow_classroom_switches_and_ip_lock():
    with TestClient(app) as client:
        teacher = staff_headers(client, "t1")

        launchpad_response = client.get(f"{API_PREFIX}/classroom/launchpad", headers=teacher)
        assert launchpad_response.status_code == 200
        launchpad_payload = launchpad_response.json()["data"]

        session_id: int | None = None
        if launchpad_payload["active_sessions"]:
            session_id = launchpad_payload["active_sessions"][0]["session_id"]
        else:
            dashboard_payload = client.get(f"{API_PREFIX}/staff/dashboard", headers=teacher).json()["data"]
            available_classes = dashboard_payload["launchpad"]["classes"]
            assert available_classes
            plan_id = dashboard_payload["launchpad"]["ready_plans"][0]["id"]
            create_response = client.post(
                f"{API_PREFIX}/classroom/sessions",
                headers=teacher,
                json={"class_id": available_classes[0]["id"], "plan_id": plan_id},
            )
            assert create_response.status_code == 200
            session_id = create_response.json()["data"]["session"]["session_id"]

        assert session_id is not None

        switch_off_response = client.put(
            f"{API_PREFIX}/classroom/sessions/{session_id}/switches",
            headers=teacher,
            json={
                "drive": False,
                "group_drive": False,
                "group_discussion": False,
                "programming_control": False,
                "ip_lock": False,
            },
        )
        assert switch_off_response.status_code == 200

        student = student_headers(client, username="70101")
        student["x-learnsite-device-ip"] = "127.0.0.1"

        drive_response = client.get(f"{API_PREFIX}/drives/me", headers=student)
        assert drive_response.status_code == 200
        drive_payload = drive_response.json()["data"]
        assert drive_payload["personal_space"]["enabled"] is False
        assert drive_payload["group_space"]["enabled"] is False
        assert drive_payload["classroom_capabilities"]["drive"]["enabled"] is False
        assert drive_payload["classroom_capabilities"]["group_drive"]["enabled"] is False

        blocked_personal_upload = client.post(
            f"{API_PREFIX}/drives/me/files",
            headers=student,
            files=[("files", ("blocked-personal.txt", b"blocked", "text/plain"))],
        )
        assert blocked_personal_upload.status_code == 409

        blocked_group_upload = client.post(
            f"{API_PREFIX}/drives/group/files",
            headers=student,
            files=[("files", ("blocked-group.txt", b"blocked", "text/plain"))],
        )
        assert blocked_group_upload.status_code == 409

        group_response = client.get(f"{API_PREFIX}/groups/me", headers=student)
        assert group_response.status_code == 200
        group_payload = group_response.json()["data"]
        assert group_payload["classroom_capabilities"]["group_discussion"]["enabled"] is False
        assert group_payload["activity_feed"] == []
        assert group_payload["operation_logs"] == []

        task_response = client.get(f"{API_PREFIX}/tasks/83", headers=student)
        assert task_response.status_code == 200
        task_payload = task_response.json()["data"]
        assert task_payload["task_type"] == "programming"
        assert task_payload["classroom_capabilities"]["programming_control"]["enabled"] is False
        assert task_payload["can_submit"] is False
        assert task_payload["submit_blocked_message"]

        blocked_group_draft = client.put(
            f"{API_PREFIX}/tasks/83/group-draft",
            headers=student,
            json={"submission_note": "<p>blocked</p>", "source_code": "print('blocked')"},
        )
        assert blocked_group_draft.status_code == 409

        blocked_program_submit = client.post(
            f"{API_PREFIX}/tasks/83/submit",
            headers=student,
            data={"submission_note": "<p>blocked submit</p>", "draft_source_code": "print('blocked')"},
        )
        assert blocked_program_submit.status_code == 409

        switch_ip_lock_response = client.put(
            f"{API_PREFIX}/classroom/sessions/{session_id}/switches",
            headers=teacher,
            json={
                "drive": True,
                "group_drive": True,
                "group_discussion": True,
                "programming_control": True,
                "ip_lock": True,
            },
        )
        assert switch_ip_lock_response.status_code == 200

        offsite_student = student_headers(client, username="70101")
        offsite_student["x-learnsite-device-ip"] = "10.10.10.10"
        ip_locked_upload = client.post(
            f"{API_PREFIX}/drives/me/files",
            headers=offsite_student,
            files=[("files", ("ip-locked.txt", b"blocked", "text/plain"))],
        )
        assert ip_locked_upload.status_code == 403
        assert "IP" in ip_locked_upload.json()["detail"]


def test_admin_can_batch_create_classes_and_import_students():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")

        batch_response = client.post(
            f"{API_PREFIX}/settings/admin/classes/batch",
            headers=admin,
            json={
                "overwrite_existing": False,
                "items": [
                    {"grade_no": 9, "class_no": 2, "head_teacher_name": "教师9A", "default_room_id": None},
                    {"grade_no": 9, "class_no": 3, "head_teacher_name": "教师9B", "default_room_id": None},
                ],
            },
        )
        assert batch_response.status_code == 200
        batch_payload = batch_response.json()["data"]["batch_result"]
        assert batch_payload["created_count"] >= 2

        csv_content = "\n".join(
            [
                "姓名,学号,账号,班级,性别,初始密码",
                "批量学生甲,90201,90201,902班,男,abc123",
                "批量学生乙,90301,90301,903班,女,abc123",
            ]
        )
        import_response = client.post(
            f"{API_PREFIX}/settings/admin/students/import",
            headers=admin,
            data={"update_existing": "false", "default_password": "123456"},
            files={"file": ("students-import.csv", csv_content.encode("utf-8-sig"), "text/csv")},
        )
        assert import_response.status_code == 200
        import_payload = import_response.json()["data"]["import_result"]
        assert import_payload["created_count"] >= 2

        student_login = client.post(
            f"{API_PREFIX}/auth/student/login",
            json={"username": "90201", "password": "abc123"},
        )
        assert student_login.status_code == 200


def test_system_theme_can_be_configured_and_is_shared_to_staff_and_student():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")
        teacher = staff_headers(client, "t1")
        student = student_headers(client, "70102")

        bootstrap_response = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        original_system = bootstrap_payload["system"]
        assert any(item["code"] == "forest" for item in bootstrap_payload["theme_presets"])

        update_payload = {
            **original_system,
            "theme_code": "forest",
        }
        update_response = client.put(
            f"{API_PREFIX}/settings/system",
            headers=admin,
            json=update_payload,
        )
        assert update_response.status_code == 200
        assert update_response.json()["data"]["theme_code"] == "forest"

        theme_catalog = client.get(f"{API_PREFIX}/settings/themes")
        assert theme_catalog.status_code == 200
        assert theme_catalog.json()["data"]["current_theme_code"] == "forest"

        teacher_me = client.get(f"{API_PREFIX}/auth/me", headers=teacher)
        student_me = client.get(f"{API_PREFIX}/auth/me", headers=student)
        assert teacher_me.status_code == 200
        assert student_me.status_code == 200
        assert teacher_me.json()["data"]["theme"] == "forest"
        assert student_me.json()["data"]["theme"] == "forest"

        restore_response = client.put(
            f"{API_PREFIX}/settings/system",
            headers=admin,
            json=original_system,
        )
        assert restore_response.status_code == 200


def test_admin_can_promote_classes_and_archive_history():
    with TestClient(app) as client:
        admin = staff_headers(client, "admin")

        bootstrap_response = client.get(f"{API_PREFIX}/settings/admin/bootstrap", headers=admin)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        class_701 = next(item for item in bootstrap_payload["classes"] if item["class_name"] == "701班")

        preview_response = client.post(
            f"{API_PREFIX}/settings/admin/promotions/preview",
            headers=admin,
            json={"source_class_ids": [class_701["id"]], "grade_increment": 1},
        )
        assert preview_response.status_code == 200
        preview_payload = preview_response.json()["data"]
        assert preview_payload["summary"]["source_class_count"] == 1
        assert preview_payload["summary"]["ready_count"] == 1
        assert preview_payload["items"][0]["target_class_name"] == "801班"

        execute_response = client.post(
            f"{API_PREFIX}/settings/admin/promotions/execute",
            headers=admin,
            json={
                "source_class_ids": [class_701["id"]],
                "grade_increment": 1,
                "copy_teacher_assignments": True,
                "archive_source_classes": True,
            },
        )
        assert execute_response.status_code == 200
        execute_payload = execute_response.json()["data"]
        result_payload = execute_payload["promotion_result"]
        assert result_payload["moved_student_count"] >= 1
        assert result_payload["archived_count"] == 1

        active_class_names = {item["class_name"] for item in execute_payload["classes"]}
        assert "701班" not in active_class_names
        assert "801班" in active_class_names

        archived_payload = execute_payload["archived_classes"]
        assert any(item["original_class_name"] == "701班" for item in archived_payload)
        assert execute_payload["stats"]["archived_class_count"] >= 1


def test_student_typing_home_submit_and_rankings_with_staff_set_creation():
    with TestClient(app) as client:
        student = student_headers(client, "70101")
        teacher = staff_headers(client, "t1")

        home_response = client.get(f"{API_PREFIX}/typing/home", headers=student)
        assert home_response.status_code == 200
        home_payload = home_response.json()["data"]
        assert home_payload["typing_sets"]
        typing_set_id = home_payload["typing_sets"][0]["id"]

        submit_response = client.post(
            f"{API_PREFIX}/typing/sessions",
            headers=student,
            json={
                "typing_set_id": typing_set_id,
                "typed_chars": 120,
                "duration_sec": 60,
                "accuracy_percent": 96,
            },
        )
        assert submit_response.status_code == 200
        submit_payload = submit_response.json()["data"]
        assert submit_payload["summary"]["speed_cpm"] == 120
        assert submit_payload["summary"]["today_rank"] is None or submit_payload["summary"]["today_rank"] >= 1

        class_ranking = client.get(f"{API_PREFIX}/typing/rankings?scope=class", headers=student)
        grade_ranking = client.get(f"{API_PREFIX}/typing/rankings?scope=grade", headers=student)
        school_ranking = client.get(f"{API_PREFIX}/typing/rankings?scope=school", headers=student)
        assert class_ranking.status_code == 200
        assert grade_ranking.status_code == 200
        assert school_ranking.status_code == 200
        assert class_ranking.json()["data"]["scope"] == "class"
        assert grade_ranking.json()["data"]["scope"] == "grade"
        assert school_ranking.json()["data"]["scope"] == "school"

        bootstrap_response = client.get(f"{API_PREFIX}/typing/staff/bootstrap", headers=teacher)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        original_count = len(bootstrap_payload["sets"])

        create_response = client.post(
            f"{API_PREFIX}/typing/staff/sets",
            headers=teacher,
            json={
                "title": "Smoke 拼音练习",
                "typing_mode": "pinyin",
                "difficulty": "提升",
                "description": "用于 smoke test 的拼音练习。",
                "content": "ren gong zhi neng ying yong rang ke tang geng you qu",
                "is_active": True,
            },
        )
        assert create_response.status_code == 200
        create_payload = create_response.json()["data"]
        assert len(create_payload["sets"]) == original_count + 1
        assert any(item["title"] == "Smoke 拼音练习" for item in create_payload["sets"])


def test_student_resources_and_staff_resource_management():
    with TestClient(app) as client:
        student = student_headers(client, "70101")
        teacher = staff_headers(client, "t1")

        student_list = client.get(f"{API_PREFIX}/resources/student", headers=student)
        assert student_list.status_code == 200
        student_payload = student_list.json()["data"]
        assert student_payload["categories"]
        first_item = next(
            item
            for category in student_payload["categories"]
            if category["items"]
            for item in category["items"]
        )

        detail_response = client.get(f"{API_PREFIX}/resources/{first_item['id']}", headers=student)
        assert detail_response.status_code == 200
        detail_payload = detail_response.json()["data"]
        assert detail_payload["title"] == first_item["title"]
        assert "related_items" in detail_payload

        bootstrap_response = client.get(f"{API_PREFIX}/resources/staff/bootstrap", headers=teacher)
        assert bootstrap_response.status_code == 200
        bootstrap_payload = bootstrap_response.json()["data"]
        original_category_count = len(bootstrap_payload["categories"])
        original_item_count = len(bootstrap_payload["items"])

        category_response = client.post(
            f"{API_PREFIX}/resources/staff/categories",
            headers=teacher,
            json={
                "name": "Smoke 资源分类",
                "description": "用于 smoke test 的资源分类。",
                "sort_order": 99,
            },
        )
        assert category_response.status_code == 200
        category_payload = category_response.json()["data"]
        assert len(category_payload["categories"]) == original_category_count + 1
        category_id = next(item["id"] for item in category_payload["categories"] if item["name"] == "Smoke 资源分类")

        item_response = client.post(
            f"{API_PREFIX}/resources/staff/items",
            headers=teacher,
            json={
                "title": "Smoke 资源文章",
                "category_id": category_id,
                "resource_type": "article",
                "summary": "用于 smoke test 的资源内容。",
                "content": "<p>这是一篇 smoke test 资源文章。</p>",
                "external_url": None,
                "sort_order": 1,
                "is_published": True,
            },
        )
        assert item_response.status_code == 200
        item_payload = item_response.json()["data"]
        assert len(item_payload["items"]) == original_item_count + 1
        assert any(item["title"] == "Smoke 资源文章" for item in item_payload["items"])
