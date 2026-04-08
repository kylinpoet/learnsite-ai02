from __future__ import annotations

import base64
from datetime import date, datetime, time
from html import escape
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.models import (
    AIProvider,
    AttendanceRecord,
    Base,
    ClassSeatAssignment,
    ClassroomSession,
    ComputerRoom,
    ComputerSeat,
    CurriculumBook,
    CurriculumLesson,
    CurriculumUnit,
    GroupOperationLog,
    GroupTaskDraft,
    LessonPlan,
    PeerReviewVote,
    QuestionBank,
    Quiz,
    QuizAttempt,
    QuizAttemptAnswer,
    QuizQuestion,
    QuizQuestionLink,
    QuizQuestionOption,
    ResourceCategory,
    ResourceItem,
    ReviewTemplate,
    SchoolClass,
    StaffProfile,
    StudentGroup,
    StudentGroupMember,
    StudentLessonPlanProgress,
    StudentProfile,
    Submission,
    SubmissionFile,
    Task,
    TaskResourceLink,
    TaskTemplate,
    TeacherClassAssignment,
    TypingRecord,
    TypingSet,
    User,
)
from app.services.review_templates import ensure_default_review_templates
from app.services.system_settings import ensure_system_setting_defaults
from app.services.submission_files import stored_file_path


CLASS_STUDENT_NAMES = {
    "701班": ["林知夏", "陈思源", "许一诺", "韩若溪", "郑嘉木", "宋书航", "周雨桐", "吴晨曦", "沈沐阳", "何可欣"],
    "702班": ["唐嘉禾", "顾安宁", "徐泽宇", "梁语彤", "姚嘉宁", "冯景晨", "任星妍", "谢梓航", "邹若萱", "彭子墨"],
    "703班": ["程以晴", "蒋浩然", "杜思雨", "罗景行", "马书瑶", "曹嘉程", "范语宁", "潘奕辰", "卢安歌", "戴子辰"],
    "809班": ["夏云舟", "周可欣", "高知远", "叶心语", "丁承泽", "郭若宁", "邵安琪", "苏景明", "龚诗涵", "贺宇辰"],
    "812班": ["黎星晚", "姜嘉禾", "孟子昂", "段书瑶", "白沐宸", "雷语汐", "侯泽洋", "贾可馨", "陶景行", "孔安宁"],
}

ROOM_LAYOUTS = [
    {"name": "七年级机房A", "rows": 2, "cols": 6, "base_ip": "10.7.1.", "start_host": 11},
    {"name": "七年级机房B", "rows": 2, "cols": 6, "base_ip": "10.7.2.", "start_host": 11},
    {"name": "八年级机房A", "rows": 2, "cols": 6, "base_ip": "10.8.1.", "start_host": 21},
    {"name": "八年级机房B", "rows": 2, "cols": 6, "base_ip": "10.8.2.", "start_host": 21},
]

DEFAULT_AI_PROVIDER = {
    "name": "Default OpenAI Compatible",
    "provider_type": "openai-compatible",
    "base_url": "https://api.example.com/v1",
    "api_key": "demo-key-change-me",
    "model_name": "gpt-4o-mini",
    "is_default": True,
    "is_enabled": True,
}


def build_demo_pdf_bytes(text: str) -> bytes:
    safe_text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 16 Tf 48 760 Td ({safe_text}) Tj ET"
    stream_bytes = stream.encode("utf-8")
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    buffer = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(buffer))
        buffer.extend(f"{index} 0 obj\n{obj}\nendobj\n".encode("utf-8"))

    xref_start = len(buffer)
    buffer.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buffer.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        buffer.extend(f"{offset:010} 00000 n \n".encode("ascii"))
    buffer.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n".encode("ascii"))
    buffer.extend(f"startxref\n{xref_start}\n%%EOF\n".encode("ascii"))
    return bytes(buffer)


def build_demo_docx_bytes(text: str) -> bytes:
    document_text = escape(text)
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>"
        f"{document_text}"
        "</w:t></w:r></w:p></w:body></w:document>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types_xml)
        docx.writestr("_rels/.rels", rels_xml)
        docx.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def build_seed_file_bytes(submission_file: SubmissionFile) -> bytes:
    ext = submission_file.file_ext.lower()
    title = f"OW³教学评AI平台 demo file: {submission_file.original_name}"

    if ext == "pdf":
        return build_demo_pdf_bytes(title)
    if ext == "png":
        return base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+b4mQAAAAASUVORK5CYII="
        )
    if ext == "docx":
        return build_demo_docx_bytes(title)
    if ext in {"md", "txt"}:
        return f"# OW³教学评AI平台 Demo\n\n{title}\n".encode("utf-8")

    return f"OW³教学评AI平台 demo attachment\n{title}\n".encode("utf-8")


def ensure_seed_submission_storage(session) -> None:
    session.flush()
    files = session.scalars(select(SubmissionFile)).all()
    for submission_file in files:
        file_path = stored_file_path(submission_file)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if not file_path.exists():
            file_path.write_bytes(build_seed_file_bytes(submission_file))
        actual_size = file_path.stat().st_size
        submission_file.size_kb = max(1, (actual_size + 1023) // 1024)


def seed_system_settings(session) -> None:
    ensure_system_setting_defaults(session)


def seed_ai_providers(session) -> None:
    session.add(AIProvider(**DEFAULT_AI_PROVIDER))


def create_room_with_seats(session, name: str, rows: int, cols: int, base_ip: str, start_host: int) -> ComputerRoom:
    room = ComputerRoom(name=name, row_count=rows, col_count=cols, description=f"{name} 固定 IP 机房")
    session.add(room)
    session.flush()

    seat_index = 0
    for row_no in range(1, rows + 1):
        for col_no in range(1, cols + 1):
            seat_index += 1
            session.add(
                ComputerSeat(
                    room_id=room.id,
                    row_no=row_no,
                    col_no=col_no,
                    seat_label=f"{row_no}-{col_no}",
                    ip_address=f"{base_ip}{start_host + seat_index - 1}",
                    hostname=f"{room.name.replace('机房', 'pc').replace('年级', '')}-{seat_index:02d}",
                    is_enabled=True,
                )
            )
    session.flush()
    return room


def create_staff_user(session, username: str, display_name: str, title: str, is_admin: bool) -> User:
    user = User(
        username=username,
        password_hash=hash_password("222221"),
        display_name=display_name,
        user_type="staff",
    )
    session.add(user)
    session.flush()
    session.add(StaffProfile(user_id=user.id, is_admin=is_admin, title=title))
    return user


def create_class(session, grade_no: int, class_no: int, room: ComputerRoom, head_teacher_name: str | None) -> SchoolClass:
    school_class = SchoolClass(
        grade_no=grade_no,
        class_no=class_no,
        class_name=f"{grade_no}{class_no:02d}班",
        head_teacher_name=head_teacher_name,
        default_room_id=room.id,
    )
    session.add(school_class)
    session.flush()
    return school_class


def create_students_for_class(session, school_class: SchoolClass, names: list[str]) -> list[User]:
    students: list[User] = []
    for index, name in enumerate(names, start=1):
        username = f"{school_class.grade_no}{school_class.class_no:02d}{index:02d}"
        user = User(
            username=username,
            password_hash=hash_password("12345"),
            display_name=name,
            user_type="student",
        )
        session.add(user)
        session.flush()
        session.add(
            StudentProfile(
                user_id=user.id,
                student_no=username,
                grade_no=school_class.grade_no,
                class_id=school_class.id,
                gender="未知",
                entry_year=2026 - (school_class.grade_no - 6),
            )
        )
        students.append(user)
    session.flush()
    return students


def create_teacher_class_assignments(session, teacher: User, classes: list[SchoolClass]) -> None:
    for school_class in classes:
        session.add(TeacherClassAssignment(staff_user_id=teacher.id, class_id=school_class.id))


def assign_students_to_room_seats(session, school_class: SchoolClass) -> list[ClassSeatAssignment]:
    if school_class.default_room is None:
        return []

    seats = list(school_class.default_room.seats)
    students = sorted(school_class.students, key=lambda item: item.student_no)
    assignments: list[ClassSeatAssignment] = []
    for profile, seat in zip(students, seats, strict=False):
        assignment = ClassSeatAssignment(
            class_id=school_class.id,
            seat_id=seat.id,
            student_user_id=profile.user_id,
        )
        session.add(assignment)
        assignments.append(assignment)
    session.flush()
    return assignments


def create_attendance_record(session, school_class: SchoolClass, assignment: ClassSeatAssignment, checked_in_at: datetime) -> None:
    session.add(
        AttendanceRecord(
            class_id=school_class.id,
            student_id=assignment.student_user_id,
            seat_id=assignment.seat_id,
            attendance_date=checked_in_at.date(),
            checked_in_at=checked_in_at,
            client_ip=assignment.seat.ip_address if assignment.seat else None,
            signin_source="seed",
        )
    )


def build_group_chunks(students: list[StudentProfile]) -> list[list[StudentProfile]]:
    total = len(students)
    if total <= 0:
        return []

    if total <= 4:
        group_count = 1
    elif total <= 8:
        group_count = 2
    else:
        group_count = 3

    base_size = total // group_count
    remainder = total % group_count
    chunks: list[list[StudentProfile]] = []
    start = 0

    for index in range(group_count):
        chunk_size = base_size + (1 if index < remainder else 0)
        chunks.append(students[start : start + chunk_size])
        start += chunk_size

    return [chunk for chunk in chunks if chunk]


def seed_student_groups(session, classes_by_name: dict[str, SchoolClass]) -> None:
    for school_class in classes_by_name.values():
        students = sorted(school_class.students, key=lambda item: item.student_no)
        for group_no, members in enumerate(build_group_chunks(students), start=1):
            leader = members[0]
            group = StudentGroup(
                class_id=school_class.id,
                group_no=group_no,
                name=f"{school_class.class_name} 第{group_no}组",
                description="负责课堂协作、资料共享与作品共创。",
                leader_user_id=leader.user_id,
            )
            session.add(group)
            session.flush()

            for member_index, profile in enumerate(members):
                session.add(
                    StudentGroupMember(
                        group_id=group.id,
                        student_user_id=profile.user_id,
                        role="leader" if member_index == 0 else "member",
                    )
                )
    session.flush()


def ensure_seed_student_groups(session) -> None:
    has_group = session.scalar(select(StudentGroup.id).limit(1))
    if has_group:
        return

    classes = session.scalars(
        select(SchoolClass).options(selectinload(SchoolClass.students))
    ).all()
    if not classes:
        return

    classes_by_name = {school_class.class_name: school_class for school_class in classes}
    seed_student_groups(session, classes_by_name)


def ensure_runtime_schema() -> None:
    inspector = inspect(engine)

    task_columns = {column["name"] for column in inspector.get_columns("tasks")}
    submission_columns = {column["name"] for column in inspector.get_columns("submissions")}
    student_profile_columns = {column["name"] for column in inspector.get_columns("student_profiles")}
    profile_change_audit_columns = {column["name"] for column in inspector.get_columns("profile_change_audit_logs")}
    task_template_columns = {column["name"] for column in inspector.get_columns("task_templates")} if "task_templates" in inspector.get_table_names() else set()

    with engine.begin() as connection:
        if "submission_scope" not in task_columns:
            connection.execute(
                text("ALTER TABLE tasks ADD COLUMN submission_scope VARCHAR(20) NOT NULL DEFAULT 'individual'")
            )
        if "config_json" not in task_columns:
            connection.execute(
                text("ALTER TABLE tasks ADD COLUMN config_json TEXT")
            )
        if "group_id" not in submission_columns:
            connection.execute(
                text("ALTER TABLE submissions ADD COLUMN group_id INTEGER")
            )
        if "photo_path" not in student_profile_columns:
            connection.execute(
                text("ALTER TABLE student_profiles ADD COLUMN photo_path VARCHAR(255)")
            )
        if "actor_username" not in profile_change_audit_columns:
            connection.execute(
                text("ALTER TABLE profile_change_audit_logs ADD COLUMN actor_username VARCHAR(60)")
            )
        if "target_class_name" not in profile_change_audit_columns:
            connection.execute(
                text("ALTER TABLE profile_change_audit_logs ADD COLUMN target_class_name VARCHAR(80)")
            )
        if "batch_token" not in profile_change_audit_columns:
            connection.execute(
                text("ALTER TABLE profile_change_audit_logs ADD COLUMN batch_token VARCHAR(48)")
            )
        if task_template_columns and "group_name" not in task_template_columns:
            connection.execute(
                text("ALTER TABLE task_templates ADD COLUMN group_name VARCHAR(60) NOT NULL DEFAULT ''")
            )
        if task_template_columns and "sort_order" not in task_template_columns:
            connection.execute(
                text("ALTER TABLE task_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1000")
            )
        if task_template_columns and "is_pinned" not in task_template_columns:
            connection.execute(
                text("ALTER TABLE task_templates ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0")
            )
        if task_template_columns and "last_used_at" not in task_template_columns:
            connection.execute(
                text("ALTER TABLE task_templates ADD COLUMN last_used_at DATETIME")
            )
        if task_template_columns and "use_count" not in task_template_columns:
            connection.execute(
                text("ALTER TABLE task_templates ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0")
            )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_group_id ON submissions (group_id)"))
        if task_template_columns:
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_task_templates_group_name ON task_templates (group_name)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_task_templates_sort_order ON task_templates (sort_order)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_task_templates_is_pinned ON task_templates (is_pinned)")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_task_templates_last_used_at ON task_templates (last_used_at)")
            )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_profile_change_audit_logs_actor_username ON profile_change_audit_logs (actor_username)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_profile_change_audit_logs_target_class_name ON profile_change_audit_logs (target_class_name)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_profile_change_audit_logs_batch_token ON profile_change_audit_logs (batch_token)")
        )
        connection.execute(
            text("UPDATE tasks SET submission_scope = 'individual' WHERE submission_scope IS NULL OR submission_scope = ''")
        )
        if task_template_columns:
            connection.execute(
                text("UPDATE task_templates SET group_name = '' WHERE group_name IS NULL")
            )
            connection.execute(
                text("UPDATE task_templates SET sort_order = 1000 WHERE sort_order IS NULL OR sort_order < 1")
            )
            connection.execute(
                text("UPDATE task_templates SET is_pinned = 0 WHERE is_pinned IS NULL")
            )
            connection.execute(
                text("UPDATE task_templates SET use_count = 0 WHERE use_count IS NULL")
            )


def ensure_demo_group_tasks(session) -> None:
    group_task_ids = {58, 76, 83}
    tasks = session.scalars(select(Task).where(Task.id.in_(group_task_ids))).all()
    for task in tasks:
        if task.task_type != "reading":
            task.submission_scope = "group"


def seed_curriculum(session) -> dict[str, CurriculumLesson]:
    book7 = CurriculumBook(name="七年级下册 信息科技", subject="信息科技", edition="浙教版", grade_scope="七年级下册")
    book8a = CurriculumBook(name="八年级上册 信息科技", subject="信息科技", edition="浙教版", grade_scope="八年级上册")
    book8b = CurriculumBook(name="八年级下册 信息科技", subject="信息科技", edition="浙教版", grade_scope="八年级下册")
    session.add_all([book7, book8a, book8b])
    session.flush()

    unit7 = CurriculumUnit(book_id=book7.id, term_no=2, unit_no=3, title="第三单元 智能技术初探")
    unit8a = CurriculumUnit(book_id=book8a.id, term_no=1, unit_no=1, title="第一单元 互联网与网络素养")
    unit8b = CurriculumUnit(book_id=book8b.id, term_no=2, unit_no=2, title="第二单元 物联网与智能感知")
    session.add_all([unit7, unit8a, unit8b])
    session.flush()

    lessons = {
        "grade7_ai_intro": CurriculumLesson(id=14, unit_id=unit7.id, lesson_no=7, title="第7课 人工智能基础"),
        "grade7_ai_scene": CurriculumLesson(id=24, unit_id=unit7.id, lesson_no=8, title="第8课 智能应用体验"),
        "grade8_web_intro": CurriculumLesson(id=16, unit_id=unit8a.id, lesson_no=1, title="第1课 互联网"),
        "grade8_web_search": CurriculumLesson(id=21, unit_id=unit8a.id, lesson_no=2, title="第2课 网络搜索与信息甄别"),
        "grade8_iot": CurriculumLesson(id=18, unit_id=unit8b.id, lesson_no=6, title="第6课 物联网"),
        "grade8_sensing": CurriculumLesson(id=22, unit_id=unit8b.id, lesson_no=7, title="第7课 智能感知"),
    }
    session.add_all(list(lessons.values()))
    session.flush()
    return lessons


def seed_lesson_plans(session, lessons: dict[str, CurriculumLesson]) -> list[LessonPlan]:
    plans = [
        LessonPlan(id=14, lesson_id=lessons["grade7_ai_intro"].id, title="七下第三单元 第7课 人工智能基础", status="published", assigned_date=date(2026, 3, 10)),
        LessonPlan(id=24, lesson_id=lessons["grade7_ai_scene"].id, title="七下第三单元 第8课 智能应用体验", status="active", assigned_date=date(2026, 3, 28)),
        LessonPlan(id=16, lesson_id=lessons["grade8_web_intro"].id, title="八上第一单元 第1课 互联网", status="published", assigned_date=date(2026, 3, 12)),
        LessonPlan(id=21, lesson_id=lessons["grade8_web_search"].id, title="八上第一单元 第2课 网络搜索与信息甄别", status="published", assigned_date=date(2026, 3, 16)),
        LessonPlan(id=18, lesson_id=lessons["grade8_iot"].id, title="八下第二单元 第6课 物联网", status="active", assigned_date=date(2026, 3, 28)),
        LessonPlan(id=22, lesson_id=lessons["grade8_sensing"].id, title="八下第二单元 第7课 智能感知", status="published", assigned_date=date(2026, 3, 30)),
    ]
    session.add_all(plans)
    session.flush()

    tasks = [
        Task(id=55, plan_id=14, title="导读：什么是人工智能", task_type="reading", sort_order=1, description="<p>阅读教材中的人工智能定义，并说说你理解的“智能”。</p>"),
        Task(id=56, plan_id=14, title="活动一：识别生活中的 AI", task_type="upload_image", sort_order=2, description="<p>拍一张照片或写一段说明，记录你发现的一个人工智能应用场景。</p>"),
        Task(id=57, plan_id=24, title="案例导读：校园里的智能服务", task_type="reading", sort_order=1, description="<p>阅读校园门禁、刷脸签到、智能广播等案例，思考它们解决了什么问题。</p>"),
        Task(id=58, plan_id=24, title="活动二：设计一个智能应用", task_type="upload_image", submission_scope="group", sort_order=2, description="<p>用图片、流程图或文字说明，设计一个适合校园使用的智能应用。</p>"),
        Task(id=63, plan_id=16, title="阅读任务：互联网的基本结构", task_type="reading", sort_order=1, description="<p>了解互联网、网站、浏览器和域名之间的关系。</p>"),
        Task(id=67, plan_id=16, title="活动一：画出你的互联网路线图", task_type="upload_image", sort_order=2, description="<p>用思维导图或结构图说明你访问网页时可能经过的路径。</p>"),
        Task(id=71, plan_id=21, title="阅读任务：高效检索与可信信息", task_type="reading", sort_order=1, description="<p>比较关键词搜索、短语搜索和筛选条件的差异。</p>"),
        Task(id=72, plan_id=21, title="活动一：甄别网络信息", task_type="upload_image", sort_order=2, description="<p>选择一条网络信息，说明你如何判断它是否可信。</p>"),
        Task(id=74, plan_id=18, title="导读：认识物联网", task_type="reading", sort_order=1, description="<p>阅读“感知层、网络层、应用层”的基本概念。</p>"),
        Task(id=75, plan_id=18, title="活动一：生活中的物联网设备", task_type="upload_image", sort_order=2, description="<p>整理一个物联网设备案例，说明它使用了哪些传感器或网络连接。</p>"),
        Task(id=76, plan_id=18, title="活动二：物联网场景设计", task_type="upload_image", submission_scope="group", sort_order=3, description="<p>为教室、校园或家庭设计一个物联网应用场景，突出数据采集与反馈。</p>"),
        Task(id=81, plan_id=22, title="阅读任务：智能感知系统", task_type="reading", sort_order=1, description="<p>阅读传感器、数据采集和实时反馈的基本流程。</p>"),
        Task(id=82, plan_id=22, title="活动一：智能感知案例观察", task_type="upload_image", sort_order=2, description="<p>观察一个智能感知案例，说明输入、处理和输出环节。</p>"),
        Task(id=83, plan_id=22, title="活动二：编写感知流程说明", task_type="programming", submission_scope="group", sort_order=3, description="<p>使用伪代码或流程步骤，描述一个简单的智能感知系统逻辑。</p>"),
    ]
    session.add_all(tasks)
    session.flush()

    plan_content = {
        14: "<p>本课聚焦人工智能的基本概念、典型特点和身边案例。</p>",
        24: "<p>本课将继续围绕“智能应用体验”，引导学生把创意转成可落地的场景设计。</p>",
        16: "<p>本课帮助学生理解互联网、网站与浏览器的关系，并建立网络素养意识。</p>",
        21: "<p>本课强调信息检索方法和信息真实性判断，是网络学习中的关键能力。</p>",
        18: "<p>本课从感知、连接、应用三个层面理解物联网，并完成一个物联网场景案例。</p>",
        22: "<p>本课进一步进入智能感知主题，帮助学生理解“数据如何被感知与反馈”。</p>",
    }
    for plan in plans:
        plan.content = plan_content[plan.id]
    return plans


def seed_progress_for_students(session, classes_by_name: dict[str, SchoolClass]) -> None:
    grade7_pending_plan_ids = [24]
    grade7_completed_plan_ids = [14]
    grade8_pending_plan_ids = [18, 22]
    grade8_completed_plan_ids = [16, 21]

    for school_class in classes_by_name.values():
        profiles = sorted(school_class.students, key=lambda item: item.student_no)
        if school_class.grade_no == 7:
            pending_ids = grade7_pending_plan_ids
            completed_ids = grade7_completed_plan_ids
        else:
            pending_ids = grade8_pending_plan_ids
            completed_ids = grade8_completed_plan_ids

        for profile in profiles:
            for plan_id in completed_ids:
                session.add(
                    StudentLessonPlanProgress(
                        student_id=profile.user_id,
                        plan_id=plan_id,
                        progress_status="completed",
                        assigned_date=date(2026, 3, 10),
                        completed_date=date(2026, 3, 20),
                    )
                )
            for plan_id in pending_ids:
                session.add(
                    StudentLessonPlanProgress(
                        student_id=profile.user_id,
                        plan_id=plan_id,
                        progress_status="pending",
                        assigned_date=date(2026, 3, 28),
                        completed_date=None,
                    )
                )
    session.flush()


def seed_classroom_sessions(session, teachers: dict[str, User], classes_by_name: dict[str, SchoolClass]) -> None:
    session.add_all(
        [
            ClassroomSession(
                class_id=classes_by_name["701班"].id,
                plan_id=24,
                started_by_staff_id=teachers["t1"].id,
                status="active",
                started_at=datetime(2026, 3, 31, 8, 20, 0),
            ),
            ClassroomSession(
                class_id=classes_by_name["809班"].id,
                plan_id=18,
                started_by_staff_id=teachers["t2"].id,
                status="active",
                started_at=datetime(2026, 3, 31, 9, 5, 0),
            ),
            ClassroomSession(
                class_id=classes_by_name["702班"].id,
                plan_id=14,
                started_by_staff_id=teachers["t1"].id,
                status="completed",
                started_at=datetime(2026, 3, 29, 14, 0, 0),
            ),
        ]
    )
    session.flush()


def seed_attendance(session, classes_by_name: dict[str, SchoolClass]) -> None:
    today = date.today()
    attendance_plan = {
        "701班": [3, 6, 9, 12],
        "702班": [8, 10],
        "809班": [3, 6, 9, 12, 15],
        "812班": [9, 14],
    }

    for class_name, minute_offsets in attendance_plan.items():
        school_class = classes_by_name[class_name]
        room = school_class.default_room
        if room is None:
            continue
        seats = sorted(room.seats, key=lambda item: (item.row_no, item.col_no, item.id))
        students = sorted(school_class.students, key=lambda item: item.student_no)
        for seat, profile, minute in zip(seats, students, minute_offsets, strict=False):
            session.add(
                AttendanceRecord(
                    class_id=school_class.id,
                    student_id=profile.user_id,
                    seat_id=seat.id,
                    attendance_date=today,
                    checked_in_at=datetime.combine(today, time(8, minute)),
                    client_ip=seat.ip_address,
                    signin_source="seed",
                )
            )
    session.flush()


def seed_submissions(session, classes_by_name: dict[str, SchoolClass]) -> None:
    class_809_students = sorted(classes_by_name["809班"].students, key=lambda item: item.student_no)
    class_701_students = sorted(classes_by_name["701班"].students, key=lambda item: item.student_no)

    submission_rows = [
        Submission(
            id=6611,
            task_id=75,
            student_id=class_809_students[0].user_id,
            submit_status="submitted",
            score=None,
            is_recommended=False,
            peer_review_score=1,
            submission_note="我整理了教室里的智能门锁和温湿度传感器，并画出了它们的连接关系。",
            teacher_comment=None,
            submitted_at=datetime(2026, 3, 31, 10, 20, 0),
        ),
        Submission(
            id=6612,
            task_id=75,
            student_id=class_809_students[1].user_id,
            submit_status="submitted",
            score=None,
            is_recommended=False,
            peer_review_score=None,
            submission_note="我记录了校园访客登记系统的设备组成和数据流向。",
            teacher_comment=None,
            submitted_at=datetime(2026, 3, 31, 10, 32, 0),
        ),
        Submission(
            id=6631,
            task_id=76,
            student_id=class_809_students[0].user_id,
            submit_status="reviewed",
            score=120,
            is_recommended=True,
            peer_review_score=3,
            submission_note="我设计了一个“智能教室环境监测”场景，包含感知、提醒和联动控制三个环节。",
            teacher_comment="场景设计完整，逻辑清楚，已经达到推荐展示标准。",
            submitted_at=datetime(2026, 3, 31, 11, 8, 0),
        ),
        Submission(
            id=6701,
            task_id=58,
            student_id=class_701_students[0].user_id,
            submit_status="submitted",
            score=None,
            is_recommended=False,
            peer_review_score=None,
            submission_note="我设计了一个“智能图书角”方案，加入了借阅提醒和语音推荐。",
            teacher_comment=None,
            submitted_at=datetime(2026, 3, 31, 9, 46, 0),
        ),
    ]
    session.add_all(submission_rows)
    session.flush()

    session.add_all(
        [
            SubmissionFile(submission_id=6611, original_name="物联网设备观察.pdf", file_ext="pdf", size_kb=320, file_role="attachment"),
            SubmissionFile(submission_id=6612, original_name="校园物联案例.txt", file_ext="txt", size_kb=20, file_role="attachment"),
            SubmissionFile(submission_id=6631, original_name="智能教室场景图.png", file_ext="png", size_kb=420, file_role="attachment"),
            SubmissionFile(submission_id=6631, original_name="场景设计说明.docx", file_ext="docx", size_kb=180, file_role="attachment"),
            SubmissionFile(submission_id=6701, original_name="智能图书角方案.md", file_ext="md", size_kb=24, file_role="attachment"),
        ]
    )
    session.flush()

    session.add(
        PeerReviewVote(
            task_id=75,
            reviewer_student_id=class_809_students[1].user_id,
            target_submission_id=6611,
            score=1,
        )
    )
    session.flush()


def create_quiz_question(
    session,
    bank: QuestionBank,
    *,
    content: str,
    options: list[tuple[str, str]],
    correct_key: str,
    difficulty: str = "基础",
    explanation: str | None = None,
) -> QuizQuestion:
    question = QuizQuestion(
        bank_id=bank.id,
        question_type="single_choice",
        content=content,
        difficulty=difficulty,
        explanation=explanation,
    )
    session.add(question)
    session.flush()

    session.add_all(
        [
            QuizQuestionOption(
                question_id=question.id,
                option_key=option_key,
                option_text=option_text,
                is_correct=option_key == correct_key,
            )
            for option_key, option_text in options
        ]
    )
    session.flush()
    return question


def seed_quizzes(session, teachers: dict[str, User], classes_by_name: dict[str, SchoolClass]) -> None:
    today = date.today()
    bank_ai = QuestionBank(
        owner_staff_user_id=teachers["t1"].id,
        title="七年级智能基础题库",
        description="围绕人工智能基础与智能应用体验的课堂常识题。",
        scope_type="staff",
    )
    bank_network = QuestionBank(
        owner_staff_user_id=teachers["t2"].id,
        title="八年级网络与物联题库",
        description="围绕互联网、信息甄别与物联网主题的课堂常识题。",
        scope_type="staff",
    )
    session.add_all([bank_ai, bank_network])
    session.flush()

    grade7_questions = [
        create_quiz_question(
            session,
            bank_ai,
            content="下列哪一项最符合“人工智能”的课堂定义？",
            options=[
                ("A", "完全不依赖数据的程序"),
                ("B", "能模拟人的感知、判断或学习的技术"),
                ("C", "所有会发光的电子设备"),
                ("D", "只能离线运行的软件"),
            ],
            correct_key="B",
            explanation="人工智能强调感知、判断、学习和决策等智能行为。",
        ),
        create_quiz_question(
            session,
            bank_ai,
            content="校园刷脸签到系统中，最关键的识别环节通常依赖什么？",
            options=[
                ("A", "随机猜测"),
                ("B", "图像采集与特征匹配"),
                ("C", "手工抄写名单"),
                ("D", "只靠座位号判断"),
            ],
            correct_key="B",
        ),
        create_quiz_question(
            session,
            bank_ai,
            content="设计一个智能应用时，首先更应该明确什么？",
            options=[
                ("A", "界面颜色"),
                ("B", "要解决的问题和使用场景"),
                ("C", "设备价格越高越好"),
                ("D", "先决定宣传口号"),
            ],
            correct_key="B",
        ),
        create_quiz_question(
            session,
            bank_ai,
            content="下列哪项更适合作为智能应用的输入信息？",
            options=[
                ("A", "传感器采集的数据"),
                ("B", "随意想象的结果"),
                ("C", "没有来源的传闻"),
                ("D", "不变化的空白页面"),
            ],
            correct_key="A",
        ),
    ]
    grade8_questions = [
        create_quiz_question(
            session,
            bank_network,
            content="浏览器、网站和互联网三者之间的关系，正确的是哪一项？",
            options=[
                ("A", "浏览器等于互联网"),
                ("B", "网站通过互联网被浏览器访问"),
                ("C", "互联网只存在于浏览器里"),
                ("D", "网站不能通过网络访问"),
            ],
            correct_key="B",
        ),
        create_quiz_question(
            session,
            bank_network,
            content="判断网络信息是否可信时，哪种做法更合理？",
            options=[
                ("A", "只看标题是否吸引人"),
                ("B", "核对来源、时间和多个证据"),
                ("C", "谁转发得多就一定可信"),
                ("D", "只看评论区人数"),
            ],
            correct_key="B",
        ),
        create_quiz_question(
            session,
            bank_network,
            content="物联网通常由感知、网络和什么层构成？",
            options=[
                ("A", "应用层"),
                ("B", "手绘层"),
                ("C", "娱乐层"),
                ("D", "口号层"),
            ],
            correct_key="A",
        ),
        create_quiz_question(
            session,
            bank_network,
            content="智能感知系统里，传感器最主要的作用是什么？",
            options=[
                ("A", "采集环境或对象的数据"),
                ("B", "直接打印成绩单"),
                ("C", "替代所有网络连接"),
                ("D", "只负责播放音乐"),
            ],
            correct_key="A",
        ),
    ]

    quiz_definitions: list[tuple[Quiz, list[QuizQuestion]]] = []
    for class_name, owner_key, title, description, questions in [
        ("701班", "t1", "701班 常识测验：智能应用基础", "围绕人工智能概念与校园智能场景的课堂测验。", grade7_questions),
        ("702班", "t1", "702班 常识测验：智能应用基础", "围绕人工智能概念与校园智能场景的课堂测验。", grade7_questions),
        ("703班", "t2", "703班 常识测验：智能应用基础", "围绕人工智能概念与校园智能场景的课堂测验。", grade7_questions),
        ("809班", "t2", "809班 常识测验：网络与物联", "围绕网络素养、信息甄别与物联网主题的课堂测验。", grade8_questions),
        ("812班", "admin", "812班 常识测验：网络与物联", "围绕网络素养、信息甄别与物联网主题的课堂测验。", grade8_questions),
    ]:
        quiz = Quiz(
            owner_staff_user_id=teachers[owner_key].id,
            class_id=classes_by_name[class_name].id,
            title=title,
            description=description,
            status="active",
        )
        session.add(quiz)
        session.flush()
        for index, question in enumerate(questions, start=1):
            session.add(
                QuizQuestionLink(
                    quiz_id=quiz.id,
                    question_id=question.id,
                    sort_order=index,
                )
            )
        quiz_definitions.append((quiz, questions))
    session.flush()

    def add_attempt(
        quiz: Quiz,
        student: StudentProfile,
        question_rows: list[QuizQuestion],
        selected_keys: list[str],
        *,
        started_hour: int,
        started_minute: int,
    ) -> None:
        started_at = datetime.combine(today, time(started_hour, started_minute))
        answer_map = {question.id: option_key for question, option_key in zip(question_rows, selected_keys, strict=False)}
        correct_count = 0
        for question in question_rows:
            correct_option = next((item.option_key for item in question.options if item.is_correct), None)
            if answer_map.get(question.id) == correct_option:
                correct_count += 1

        total_count = len(question_rows)
        score = round(correct_count * 100 / total_count) if total_count else 0

        attempt = QuizAttempt(
            quiz_id=quiz.id,
            student_user_id=student.user_id,
            status="submitted",
            score=score,
            correct_count=correct_count,
            total_count=total_count,
            started_at=started_at,
            submitted_at=started_at.replace(minute=min(started_at.minute + 2, 59)),
        )
        session.add(attempt)
        session.flush()

        for question in question_rows:
            selected_key = answer_map.get(question.id)
            correct_option = next((item.option_key for item in question.options if item.is_correct), None)
            session.add(
                QuizAttemptAnswer(
                    attempt_id=attempt.id,
                    question_id=question.id,
                    selected_option_key=selected_key,
                    is_correct=selected_key == correct_option,
                )
            )

    class_701_students = sorted(classes_by_name["701班"].students, key=lambda item: item.student_no)
    class_809_students = sorted(classes_by_name["809班"].students, key=lambda item: item.student_no)
    quiz_701 = next(item for item in quiz_definitions if item[0].school_class and item[0].school_class.class_name == "701班")
    quiz_809 = next(item for item in quiz_definitions if item[0].school_class and item[0].school_class.class_name == "809班")
    add_attempt(quiz_701[0], class_701_students[0], quiz_701[1], ["B", "B", "B", "A"], started_hour=8, started_minute=42)
    add_attempt(quiz_701[0], class_701_students[1], quiz_701[1], ["B", "B", "A", "A"], started_hour=8, started_minute=47)
    add_attempt(quiz_809[0], class_809_students[0], quiz_809[1], ["B", "B", "A", "A"], started_hour=9, started_minute=18)
    add_attempt(quiz_809[0], class_809_students[1], quiz_809[1], ["B", "A", "A", "A"], started_hour=9, started_minute=26)
    session.flush()


def seed_typing(session, teachers: dict[str, User], classes_by_name: dict[str, SchoolClass]) -> None:
    today = date.today()
    typing_sets = [
        TypingSet(
            owner_staff_user_id=teachers["t1"].id,
            title="英文基础 · School AI Lab",
            typing_mode="english",
            difficulty="基础",
            description="面向七年级的英文短句输入训练。",
            content="School AI Lab helps students explore smart ideas with clear thinking and careful typing.",
            is_active=True,
        ),
        TypingSet(
            owner_staff_user_id=teachers["t1"].id,
            title="中文基础 · 智能应用体验",
            typing_mode="chinese",
            difficulty="基础",
            description="围绕当前智能应用主题的中文输入训练。",
            content="智能应用让校园服务更高效，也提醒我们关注数据来源与使用场景。",
            is_active=True,
        ),
        TypingSet(
            owner_staff_user_id=teachers["t2"].id,
            title="英文进阶 · Network Search",
            typing_mode="english",
            difficulty="进阶",
            description="适合八年级的信息检索主题短文训练。",
            content="Search with better keywords, compare sources, and check the date before trusting online information.",
            is_active=True,
        ),
        TypingSet(
            owner_staff_user_id=teachers["t2"].id,
            title="中文进阶 · 物联网设计",
            typing_mode="chinese",
            difficulty="进阶",
            description="围绕物联网与智能感知的中文输入训练。",
            content="物联网系统通过传感器采集数据，再借助网络传输和应用平台完成反馈。",
            is_active=True,
        ),
    ]
    session.add_all(typing_sets)
    session.flush()

    class_701_students = sorted(classes_by_name["701班"].students, key=lambda item: item.student_no)
    class_809_students = sorted(classes_by_name["809班"].students, key=lambda item: item.student_no)
    session.add_all(
        [
            TypingRecord(
                student_user_id=class_701_students[0].user_id,
                class_id=classes_by_name["701班"].id,
                typing_set_id=typing_sets[0].id,
                typed_chars=82,
                duration_sec=70,
                speed_cpm=70,
                accuracy_percent=97,
                played_at=datetime.combine(today, time(8, 12)),
            ),
            TypingRecord(
                student_user_id=class_701_students[1].user_id,
                class_id=classes_by_name["701班"].id,
                typing_set_id=typing_sets[1].id,
                typed_chars=36,
                duration_sec=40,
                speed_cpm=54,
                accuracy_percent=93,
                played_at=datetime.combine(today, time(8, 18)),
            ),
            TypingRecord(
                student_user_id=class_809_students[0].user_id,
                class_id=classes_by_name["809班"].id,
                typing_set_id=typing_sets[2].id,
                typed_chars=94,
                duration_sec=62,
                speed_cpm=83,
                accuracy_percent=96,
                played_at=datetime.combine(today, time(9, 12)),
            ),
            TypingRecord(
                student_user_id=class_809_students[1].user_id,
                class_id=classes_by_name["809班"].id,
                typing_set_id=typing_sets[3].id,
                typed_chars=34,
                duration_sec=42,
                speed_cpm=49,
                accuracy_percent=91,
                played_at=datetime.combine(today, time(9, 17)),
            ),
        ]
    )
    session.flush()


def seed_resources(session, teachers: dict[str, User]) -> None:
    categories = [
        ResourceCategory(name="课堂导学", sort_order=1, description="与当前学案同步使用的导学资源。"),
        ResourceCategory(name="工具与素材", sort_order=2, description="适合课堂创作、检索和素材参考。"),
        ResourceCategory(name="拓展阅读", sort_order=3, description="课后延伸阅读与案例观察。"),
    ]
    session.add_all(categories)
    session.flush()
    category_by_name = {item.name: item for item in categories}

    session.add_all(
        [
            ResourceItem(
                owner_staff_user_id=teachers["t1"].id,
                category_id=category_by_name["课堂导学"].id,
                title="人工智能基础导读卡",
                resource_type="article",
                summary="帮助学生快速回顾“感知、判断、学习”三个关键词。",
                content="<p>人工智能通常指让机器表现出类似人类感知、判断、学习与决策能力的技术。</p><p>课堂上可先从门禁识别、语音助手、推荐系统等案例入手。</p>",
                sort_order=1,
                is_published=True,
            ),
            ResourceItem(
                owner_staff_user_id=teachers["t2"].id,
                category_id=category_by_name["课堂导学"].id,
                title="网络搜索关键词示例表",
                resource_type="article",
                summary="示例展示如何从模糊问题拆成更有效的搜索关键词。",
                content="<p>尝试把“我想了解校园垃圾分类”拆成“校园 垃圾分类 数据”“垃圾分类 校园 案例”等更具体的关键词。</p>",
                sort_order=2,
                is_published=True,
            ),
            ResourceItem(
                owner_staff_user_id=teachers["t1"].id,
                category_id=category_by_name["工具与素材"].id,
                title="在线流程图工具推荐",
                resource_type="link",
                summary="适合学生快速绘制智能应用流程说明。",
                external_url="https://app.diagrams.net/",
                content="<p>可用于绘制智能应用、物联网场景或感知系统流程图。</p>",
                sort_order=1,
                is_published=True,
            ),
            ResourceItem(
                owner_staff_user_id=teachers["t2"].id,
                category_id=category_by_name["工具与素材"].id,
                title="像素画灵感素材包说明",
                resource_type="article",
                summary="整理适合课堂创作的像素图灵感方向。",
                content="<p>可以尝试校园机器人、网络图标、物联网设备、传感器等主题。</p>",
                sort_order=2,
                is_published=True,
            ),
            ResourceItem(
                owner_staff_user_id=teachers["admin"].id,
                category_id=category_by_name["拓展阅读"].id,
                title="物联网在校园中的应用案例",
                resource_type="article",
                summary="从门禁、环境监测、图书管理三个方面理解物联网。",
                content="<p>校园物联网案例通常包含传感器、网络传输、数据平台和教师/学生端反馈界面。</p>",
                sort_order=1,
                is_published=True,
            ),
        ]
    )
    session.flush()


def seed_task_resources(session) -> None:
    if session.scalar(select(TaskResourceLink.id).limit(1)) is not None:
        return

    resource_items = list(
        session.scalars(select(ResourceItem).order_by(ResourceItem.id.asc())).all()
    )
    if not resource_items:
        return

    resource_id_by_index = {index: item.id for index, item in enumerate(resource_items)}
    link_specs = [
        (55, 0, "attachment", 1),
        (57, 0, "attachment", 1),
        (57, 2, "external_link", 2),
        (63, 1, "attachment", 1),
        (71, 1, "attachment", 1),
        (74, 4, "attachment", 1),
        (81, 4, "attachment", 1),
        (81, 2, "external_link", 2),
    ]

    session.add_all(
        [
            TaskResourceLink(
                task_id=task_id,
                resource_id=resource_id_by_index[resource_index],
                relation_type=relation_type,
                sort_order=sort_order,
            )
            for task_id, resource_index, relation_type, sort_order in link_specs
            if resource_index in resource_id_by_index
        ]
    )
    session.flush()


def seed_fresh_demo_data(session) -> None:
    seed_system_settings(session)
    seed_ai_providers(session)

    rooms = [create_room_with_seats(session, **payload) for payload in ROOM_LAYOUTS]
    room_by_name = {room.name: room for room in rooms}

    teachers = {
        "admin": create_staff_user(session, "admin", "系统管理员", "平台管理员", True),
        "t1": create_staff_user(session, "t1", "教师1", "信息科技教师", False),
        "t2": create_staff_user(session, "t2", "教师2", "信息科技教师", False),
    }

    classes_by_name = {
        "701班": create_class(session, 7, 1, room_by_name["七年级机房A"], "教师1"),
        "702班": create_class(session, 7, 2, room_by_name["七年级机房A"], "教师1"),
        "703班": create_class(session, 7, 3, room_by_name["七年级机房B"], "教师2"),
        "809班": create_class(session, 8, 9, room_by_name["八年级机房A"], "教师2"),
        "812班": create_class(session, 8, 12, room_by_name["八年级机房B"], None),
    }

    create_teacher_class_assignments(session, teachers["t1"], [classes_by_name["701班"], classes_by_name["702班"]])
    create_teacher_class_assignments(session, teachers["t2"], [classes_by_name["703班"], classes_by_name["809班"]])

    for class_name, school_class in classes_by_name.items():
        create_students_for_class(session, school_class, CLASS_STUDENT_NAMES[class_name])
    session.flush()

    session.refresh(classes_by_name["701班"])
    session.refresh(classes_by_name["702班"])
    session.refresh(classes_by_name["703班"])
    session.refresh(classes_by_name["809班"])
    session.refresh(classes_by_name["812班"])

    seed_student_groups(session, classes_by_name)
    lessons = seed_curriculum(session)
    seed_lesson_plans(session, lessons)
    seed_progress_for_students(session, classes_by_name)
    seed_classroom_sessions(session, teachers, classes_by_name)
    seed_attendance(session, classes_by_name)
    seed_submissions(session, classes_by_name)
    seed_quizzes(session, teachers, classes_by_name)
    seed_typing(session, teachers, classes_by_name)
    seed_resources(session, teachers)
    seed_task_resources(session)
    ensure_default_review_templates(session)
    ensure_seed_submission_storage(session)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()

    with SessionLocal() as session:
        ensure_system_setting_defaults(session)
        session.commit()
