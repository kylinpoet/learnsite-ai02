from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ComputerRoom(TimestampMixin, Base):
    __tablename__ = "computer_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    col_count: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    seats: Mapped[list[ComputerSeat]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="(ComputerSeat.row_no, ComputerSeat.col_no, ComputerSeat.id)",
    )
    classes: Mapped[list[SchoolClass]] = relationship(back_populates="default_room")


class ComputerSeat(TimestampMixin, Base):
    __tablename__ = "computer_seats"
    __table_args__ = (
        UniqueConstraint("room_id", "row_no", "col_no", name="uq_computer_seats_room_row_col"),
        UniqueConstraint("ip_address", name="uq_computer_seats_ip_address"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("computer_rooms.id"), nullable=False, index=True)
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    col_no: Mapped[int] = mapped_column(Integer, nullable=False)
    seat_label: Mapped[str] = mapped_column(String(30), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    room: Mapped[ComputerRoom] = relationship(back_populates="seats")
    class_assignments: Mapped[list[ClassSeatAssignment]] = relationship(
        back_populates="seat",
        cascade="all, delete-orphan",
    )
    attendance_records: Mapped[list[AttendanceRecord]] = relationship(back_populates="seat")


class SchoolClass(TimestampMixin, Base):
    __tablename__ = "school_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grade_no: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    class_no: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    head_teacher_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    default_room_id: Mapped[int | None] = mapped_column(
        ForeignKey("computer_rooms.id"),
        nullable=True,
        index=True,
    )

    students: Mapped[list[StudentProfile]] = relationship(back_populates="school_class")
    classroom_sessions: Mapped[list[ClassroomSession]] = relationship(back_populates="school_class")
    default_room: Mapped[ComputerRoom | None] = relationship(back_populates="classes")
    teacher_assignments: Mapped[list[TeacherClassAssignment]] = relationship(
        back_populates="school_class",
        cascade="all, delete-orphan",
    )
    student_groups: Mapped[list[StudentGroup]] = relationship(
        back_populates="school_class",
        cascade="all, delete-orphan",
        order_by="(StudentGroup.group_no, StudentGroup.id)",
    )
    seat_assignments: Mapped[list[ClassSeatAssignment]] = relationship(
        back_populates="school_class",
        cascade="all, delete-orphan",
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    user_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    student_profile: Mapped[StudentProfile | None] = relationship(
        back_populates="user",
        uselist=False,
    )
    staff_profile: Mapped[StaffProfile | None] = relationship(
        back_populates="user",
        uselist=False,
    )
    progresses: Mapped[list[StudentLessonPlanProgress]] = relationship(back_populates="student")
    attendance_records: Mapped[list[AttendanceRecord]] = relationship(back_populates="student")
    submissions: Mapped[list[Submission]] = relationship(back_populates="student")
    read_task_records: Mapped[list[TaskReadRecord]] = relationship(back_populates="student")
    review_templates: Mapped[list[ReviewTemplate]] = relationship(back_populates="staff_user")
    task_templates: Mapped[list[TaskTemplate]] = relationship(
        back_populates="owner_staff",
        cascade="all, delete-orphan",
        order_by="(TaskTemplate.is_pinned.desc(), TaskTemplate.sort_order.asc(), TaskTemplate.last_used_at.desc(), TaskTemplate.id.desc())",
    )
    peer_review_votes_given: Mapped[list[PeerReviewVote]] = relationship(
        back_populates="reviewer",
        foreign_keys="PeerReviewVote.reviewer_student_id",
    )
    teacher_class_assignments: Mapped[list[TeacherClassAssignment]] = relationship(
        back_populates="staff_user",
        foreign_keys="TeacherClassAssignment.staff_user_id",
        cascade="all, delete-orphan",
    )
    led_groups: Mapped[list[StudentGroup]] = relationship(
        back_populates="leader",
        foreign_keys="StudentGroup.leader_user_id",
    )
    group_memberships: Mapped[list[StudentGroupMember]] = relationship(
        back_populates="student",
        foreign_keys="StudentGroupMember.student_user_id",
    )
    seat_assignments: Mapped[list[ClassSeatAssignment]] = relationship(
        back_populates="student",
        foreign_keys="ClassSeatAssignment.student_user_id",
    )
    class_transfer_requests: Mapped[list[StudentClassTransferRequest]] = relationship(
        back_populates="student",
        foreign_keys="StudentClassTransferRequest.student_user_id",
    )
    reviewed_class_transfer_requests: Mapped[list[StudentClassTransferRequest]] = relationship(
        back_populates="reviewed_by_staff",
        foreign_keys="StudentClassTransferRequest.reviewed_by_staff_user_id",
    )


class StudentProfile(TimestampMixin, Base):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    student_no: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    grade_no: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=False, default="未知")
    entry_year: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship(back_populates="student_profile")
    school_class: Mapped[SchoolClass] = relationship(back_populates="students")


class StudentClassTransferRequest(TimestampMixin, Base):
    __tablename__ = "student_class_transfer_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    current_class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    target_class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    reviewed_by_staff_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    student: Mapped[User] = relationship(
        back_populates="class_transfer_requests",
        foreign_keys=[student_user_id],
    )
    current_class: Mapped[SchoolClass] = relationship(foreign_keys=[current_class_id])
    target_class: Mapped[SchoolClass] = relationship(foreign_keys=[target_class_id])
    reviewed_by_staff: Mapped[User | None] = relationship(
        back_populates="reviewed_class_transfer_requests",
        foreign_keys=[reviewed_by_staff_user_id],
    )


class StaffProfile(TimestampMixin, Base):
    __tablename__ = "staff_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped[User] = relationship(back_populates="staff_profile")


class TeacherClassAssignment(TimestampMixin, Base):
    __tablename__ = "teacher_class_assignments"
    __table_args__ = (
        UniqueConstraint("staff_user_id", "class_id", name="uq_teacher_class_assignments_staff_class"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    staff_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)

    staff_user: Mapped[User] = relationship(
        back_populates="teacher_class_assignments",
        foreign_keys=[staff_user_id],
    )
    school_class: Mapped[SchoolClass] = relationship(back_populates="teacher_assignments")


class ClassSeatAssignment(TimestampMixin, Base):
    __tablename__ = "class_seat_assignments"
    __table_args__ = (
        UniqueConstraint("class_id", "student_user_id", name="uq_class_seat_assignments_class_student"),
        UniqueConstraint("class_id", "seat_id", name="uq_class_seat_assignments_class_seat"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    seat_id: Mapped[int] = mapped_column(ForeignKey("computer_seats.id"), nullable=False, index=True)
    student_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    school_class: Mapped[SchoolClass] = relationship(back_populates="seat_assignments")
    seat: Mapped[ComputerSeat] = relationship(back_populates="class_assignments")
    student: Mapped[User] = relationship(
        back_populates="seat_assignments",
        foreign_keys=[student_user_id],
    )


class StudentGroup(TimestampMixin, Base):
    __tablename__ = "student_groups"
    __table_args__ = (
        UniqueConstraint("class_id", "group_no", name="uq_student_groups_class_group_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    group_no: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    leader_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    school_class: Mapped[SchoolClass] = relationship(back_populates="student_groups")
    leader: Mapped[User | None] = relationship(
        back_populates="led_groups",
        foreign_keys=[leader_user_id],
    )
    memberships: Mapped[list[StudentGroupMember]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="(StudentGroupMember.role.desc(), StudentGroupMember.id)",
    )
    submissions: Mapped[list[Submission]] = relationship(
        back_populates="group",
        foreign_keys="Submission.group_id",
    )


class StudentGroupMember(TimestampMixin, Base):
    __tablename__ = "student_group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "student_user_id", name="uq_student_group_members_group_student"),
        UniqueConstraint("student_user_id", name="uq_student_group_members_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("student_groups.id"), nullable=False, index=True)
    student_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")

    group: Mapped[StudentGroup] = relationship(back_populates="memberships")
    student: Mapped[User] = relationship(
        back_populates="group_memberships",
        foreign_keys=[student_user_id],
    )


class ReviewTemplate(TimestampMixin, Base):
    __tablename__ = "review_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    staff_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(30), nullable=False)
    group_name: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")

    staff_user: Mapped[User] = relationship(back_populates="review_templates")


class TaskTemplate(TimestampMixin, Base):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_staff_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    group_name: Mapped[str] = mapped_column(String(60), nullable=False, default="", index=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    task_title: Mapped[str] = mapped_column(String(120), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    submission_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    task_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1000, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    owner_staff: Mapped[User] = relationship(back_populates="task_templates")


class DriveSpace(TimestampMixin, Base):
    __tablename__ = "drive_spaces"
    __table_args__ = (
        UniqueConstraint("owner_type", "owner_id", name="uq_drive_spaces_owner"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    quota_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=128)
    used_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    files: Mapped[list[DriveFile]] = relationship(
        back_populates="space",
        cascade="all, delete-orphan",
        order_by="(DriveFile.updated_at.desc(), DriveFile.id.desc())",
    )


class DriveFile(TimestampMixin, Base):
    __tablename__ = "drive_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    space_id: Mapped[int] = mapped_column(ForeignKey("drive_spaces.id"), nullable=False, index=True)
    uploaded_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_ext: Mapped[str] = mapped_column(String(30), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    folder_path: Mapped[str] = mapped_column(String(255), nullable=False, default="/")

    space: Mapped[DriveSpace] = relationship(back_populates="files")
    uploaded_by_user: Mapped[User] = relationship(foreign_keys=[uploaded_by_user_id])


class SystemSetting(TimestampMixin, Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    setting_key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    setting_value: Mapped[str] = mapped_column(Text, nullable=False, default="")


class AIProvider(TimestampMixin, Base):
    __tablename__ = "ai_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    provider_type: Mapped[str] = mapped_column(String(40), nullable=False, default="openai-compatible")
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class QuestionBank(TimestampMixin, Base):
    __tablename__ = "question_banks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_staff_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False, default="staff")

    owner_staff: Mapped[User | None] = relationship(foreign_keys=[owner_staff_user_id])
    questions: Mapped[list[QuizQuestion]] = relationship(
        back_populates="bank",
        cascade="all, delete-orphan",
        order_by="(QuizQuestion.id.asc())",
    )


class QuizQuestion(TimestampMixin, Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("question_banks.id"), nullable=False, index=True)
    question_type: Mapped[str] = mapped_column(String(30), nullable=False, default="single_choice")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="基础")
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    bank: Mapped[QuestionBank] = relationship(back_populates="questions")
    options: Mapped[list[QuizQuestionOption]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="(QuizQuestionOption.option_key.asc(), QuizQuestionOption.id.asc())",
    )
    quiz_links: Mapped[list[QuizQuestionLink]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
    )


class QuizQuestionOption(TimestampMixin, Base):
    __tablename__ = "quiz_question_options"
    __table_args__ = (
        UniqueConstraint("question_id", "option_key", name="uq_quiz_question_options_question_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id"), nullable=False, index=True)
    option_key: Mapped[str] = mapped_column(String(5), nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    question: Mapped[QuizQuestion] = relationship(back_populates="options")


class Quiz(TimestampMixin, Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_staff_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("school_classes.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")

    owner_staff: Mapped[User | None] = relationship(foreign_keys=[owner_staff_user_id])
    school_class: Mapped[SchoolClass | None] = relationship(foreign_keys=[class_id])
    question_links: Mapped[list[QuizQuestionLink]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="(QuizQuestionLink.sort_order.asc(), QuizQuestionLink.id.asc())",
    )
    attempts: Mapped[list[QuizAttempt]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="(QuizAttempt.started_at.desc(), QuizAttempt.id.desc())",
    )


class QuizQuestionLink(TimestampMixin, Base):
    __tablename__ = "quiz_question_links"
    __table_args__ = (
        UniqueConstraint("quiz_id", "question_id", name="uq_quiz_question_links_quiz_question"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id"), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    quiz: Mapped[Quiz] = relationship(back_populates="question_links")
    question: Mapped[QuizQuestion] = relationship(back_populates="quiz_links")


class QuizAttempt(TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"), nullable=False, index=True)
    student_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True, index=True)

    quiz: Mapped[Quiz] = relationship(back_populates="attempts")
    student: Mapped[User] = relationship(foreign_keys=[student_user_id])
    answers: Mapped[list[QuizAttemptAnswer]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="(QuizAttemptAnswer.id.asc())",
    )


class QuizAttemptAnswer(TimestampMixin, Base):
    __tablename__ = "quiz_attempt_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_quiz_attempt_answers_attempt_question"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("quiz_attempts.id"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("quiz_questions.id"), nullable=False, index=True)
    selected_option_key: Mapped[str | None] = mapped_column(String(5), nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    attempt: Mapped[QuizAttempt] = relationship(back_populates="answers")
    question: Mapped[QuizQuestion] = relationship(foreign_keys=[question_id])


class TypingSet(TimestampMixin, Base):
    __tablename__ = "typing_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_staff_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    typing_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="english")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="基础")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    owner_staff: Mapped[User | None] = relationship(foreign_keys=[owner_staff_user_id])
    records: Mapped[list[TypingRecord]] = relationship(
        back_populates="typing_set",
        cascade="all, delete-orphan",
        order_by="(TypingRecord.played_at.desc(), TypingRecord.id.desc())",
    )


class TypingRecord(TimestampMixin, Base):
    __tablename__ = "typing_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False, index=True)
    typing_set_id: Mapped[int] = mapped_column(ForeignKey("typing_sets.id"), nullable=False, index=True)
    typed_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    speed_cpm: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accuracy_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    played_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)

    student: Mapped[User] = relationship(foreign_keys=[student_user_id])
    school_class: Mapped[SchoolClass] = relationship(foreign_keys=[class_id])
    typing_set: Mapped[TypingSet] = relationship(back_populates="records")


class ResourceCategory(TimestampMixin, Base):
    __tablename__ = "resource_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list[ResourceItem]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="(ResourceItem.sort_order.asc(), ResourceItem.id.asc())",
    )


class ResourceItem(TimestampMixin, Base):
    __tablename__ = "resource_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_staff_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("resource_categories.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False, default="article")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    owner_staff: Mapped[User | None] = relationship(foreign_keys=[owner_staff_user_id])
    category: Mapped[ResourceCategory | None] = relationship(back_populates="items")
    task_links: Mapped[list[TaskResourceLink]] = relationship(
        back_populates="resource_item",
        cascade="all, delete-orphan",
        order_by="(TaskResourceLink.sort_order.asc(), TaskResourceLink.id.asc())",
    )


class CurriculumBook(TimestampMixin, Base):
    __tablename__ = "curriculum_books"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(50), nullable=False)
    edition: Mapped[str] = mapped_column(String(100), nullable=False)
    grade_scope: Mapped[str] = mapped_column(String(50), nullable=False)

    units: Mapped[list[CurriculumUnit]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="(CurriculumUnit.term_no, CurriculumUnit.unit_no, CurriculumUnit.id)",
    )


class CurriculumUnit(TimestampMixin, Base):
    __tablename__ = "curriculum_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("curriculum_books.id"), nullable=False)
    term_no: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)

    book: Mapped[CurriculumBook] = relationship(back_populates="units")
    lessons: Mapped[list[CurriculumLesson]] = relationship(
        back_populates="unit",
        cascade="all, delete-orphan",
        order_by="(CurriculumLesson.lesson_no, CurriculumLesson.id)",
    )


class CurriculumLesson(TimestampMixin, Base):
    __tablename__ = "curriculum_lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("curriculum_units.id"), nullable=False)
    lesson_no: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    unit: Mapped[CurriculumUnit] = relationship(back_populates="lessons")
    lesson_plans: Mapped[list[LessonPlan]] = relationship(back_populates="lesson")


class LessonPlan(TimestampMixin, Base):
    __tablename__ = "lesson_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("curriculum_lessons.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="published")
    assigned_date: Mapped[date] = mapped_column(Date, nullable=False)

    lesson: Mapped[CurriculumLesson] = relationship(back_populates="lesson_plans")
    tasks: Mapped[list[Task]] = relationship(back_populates="lesson_plan")
    progresses: Mapped[list[StudentLessonPlanProgress]] = relationship(back_populates="lesson_plan")
    classroom_sessions: Mapped[list[ClassroomSession]] = relationship(back_populates="lesson_plan")


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("lesson_plans.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    submission_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    lesson_plan: Mapped[LessonPlan] = relationship(back_populates="tasks")
    submissions: Mapped[list[Submission]] = relationship(back_populates="task")
    group_drafts: Mapped[list[GroupTaskDraft]] = relationship(back_populates="task")
    group_draft_versions: Mapped[list[GroupTaskDraftVersion]] = relationship(
        back_populates="task",
        order_by="(GroupTaskDraftVersion.version_no.desc(), GroupTaskDraftVersion.id.desc())",
    )
    read_records: Mapped[list[TaskReadRecord]] = relationship(back_populates="task")
    peer_review_votes: Mapped[list[PeerReviewVote]] = relationship(back_populates="task")
    resource_links: Mapped[list[TaskResourceLink]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="(TaskResourceLink.sort_order.asc(), TaskResourceLink.id.asc())",
    )
    web_assets: Mapped[list[TaskWebAsset]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="(TaskWebAsset.slot.asc(), TaskWebAsset.relative_path.asc(), TaskWebAsset.id.asc())",
    )
    discussion_posts: Mapped[list[TaskDiscussionPost]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="(TaskDiscussionPost.created_at.asc(), TaskDiscussionPost.id.asc())",
    )
    data_submissions: Mapped[list[TaskDataSubmission]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="(TaskDataSubmission.created_at.desc(), TaskDataSubmission.id.desc())",
    )


class TaskWebAsset(TimestampMixin, Base):
    __tablename__ = "task_web_assets"
    __table_args__ = (
        UniqueConstraint("task_id", "slot", "relative_path", name="uq_task_web_assets_task_slot_path"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    slot: Mapped[str] = mapped_column(String(30), nullable=False, index=True, default="web")
    relative_path: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    size_kb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)

    task: Mapped[Task] = relationship(back_populates="web_assets")


class TaskResourceLink(TimestampMixin, Base):
    __tablename__ = "task_resources"
    __table_args__ = (
        UniqueConstraint("task_id", "resource_id", name="uq_task_resources_task_resource"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resource_items.id"), nullable=False, index=True)
    relation_type: Mapped[str] = mapped_column(String(30), nullable=False, default="reference")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    task: Mapped[Task] = relationship(back_populates="resource_links")
    resource_item: Mapped[ResourceItem] = relationship(back_populates="task_links")


class TaskDiscussionPost(TimestampMixin, Base):
    __tablename__ = "task_discussion_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    parent_post_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_discussion_posts.id"),
        nullable=True,
        index=True,
    )
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    task: Mapped[Task] = relationship(back_populates="discussion_posts")
    author: Mapped[User] = relationship(foreign_keys=[author_user_id])
    parent_post: Mapped[TaskDiscussionPost | None] = relationship(
        remote_side="TaskDiscussionPost.id",
        back_populates="replies",
    )
    replies: Mapped[list[TaskDiscussionPost]] = relationship(
        back_populates="parent_post",
        cascade="all, delete-orphan",
        order_by="(TaskDiscussionPost.created_at.asc(), TaskDiscussionPost.id.asc())",
    )


class TaskDataSubmission(TimestampMixin, Base):
    __tablename__ = "task_data_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    submitted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    source_label: Mapped[str] = mapped_column(String(80), nullable=False, default="webhook")
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    task: Mapped[Task] = relationship(back_populates="data_submissions")
    submitted_by_user: Mapped[User | None] = relationship(foreign_keys=[submitted_by_user_id])


class GroupTaskDraft(TimestampMixin, Base):
    __tablename__ = "group_task_drafts"
    __table_args__ = (
        UniqueConstraint("task_id", "group_id", name="uq_group_task_drafts_task_group"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("student_groups.id"), nullable=False, index=True)
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    draft_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    task: Mapped[Task] = relationship(back_populates="group_drafts")
    group: Mapped[StudentGroup] = relationship()
    updated_by_user: Mapped[User] = relationship(foreign_keys=[updated_by_user_id])


class GroupTaskDraftVersion(TimestampMixin, Base):
    __tablename__ = "group_task_draft_versions"
    __table_args__ = (
        UniqueConstraint("task_id", "group_id", "version_no", name="uq_group_task_draft_versions_task_group_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("student_groups.id"), nullable=False, index=True)
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    previous_version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    event_label: Mapped[str] = mapped_column(String(40), nullable=False)
    draft_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)

    task: Mapped[Task] = relationship(back_populates="group_draft_versions")
    group: Mapped[StudentGroup] = relationship()
    updated_by_user: Mapped[User] = relationship(foreign_keys=[updated_by_user_id])


class GroupOperationLog(TimestampMixin, Base):
    __tablename__ = "group_operation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    group_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    group_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_name: Mapped[str] = mapped_column(String(120), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    event_label: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    actor_student_no: Mapped[str | None] = mapped_column(String(30), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    task_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    task_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submission_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)


class ProfileChangeAuditLog(TimestampMixin, Base):
    __tablename__ = "profile_change_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    event_label: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actor_username: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    target_student_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    target_student_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_student_no: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    class_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    class_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    target_class_name: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    field_key: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    field_label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    before_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_token: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)


class TaskReadRecord(TimestampMixin, Base):
    __tablename__ = "task_read_records"
    __table_args__ = (
        UniqueConstraint("task_id", "student_id", name="uq_task_read_records_task_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    task: Mapped[Task] = relationship(back_populates="read_records")
    student: Mapped[User] = relationship(back_populates="read_task_records")


class Submission(TimestampMixin, Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("student_groups.id"), nullable=True, index=True)
    submit_status: Mapped[str] = mapped_column(String(30), nullable=False, default="submitted")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    peer_review_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submission_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    task: Mapped[Task] = relationship(back_populates="submissions")
    student: Mapped[User] = relationship(back_populates="submissions")
    group: Mapped[StudentGroup | None] = relationship(back_populates="submissions")
    files: Mapped[list[SubmissionFile]] = relationship(back_populates="submission")
    peer_review_votes: Mapped[list[PeerReviewVote]] = relationship(back_populates="target_submission")


class SubmissionFile(TimestampMixin, Base):
    __tablename__ = "submission_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_ext: Mapped[str] = mapped_column(String(30), nullable=False)
    size_kb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_role: Mapped[str] = mapped_column(String(30), nullable=False, default="attachment")

    submission: Mapped[Submission] = relationship(back_populates="files")


class PeerReviewVote(TimestampMixin, Base):
    __tablename__ = "peer_review_votes"
    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "reviewer_student_id",
            "target_submission_id",
            name="uq_peer_review_votes_task_reviewer_target",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    reviewer_student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    target_submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    task: Mapped[Task] = relationship(back_populates="peer_review_votes")
    reviewer: Mapped[User] = relationship(
        back_populates="peer_review_votes_given",
        foreign_keys=[reviewer_student_id],
    )
    target_submission: Mapped[Submission] = relationship(back_populates="peer_review_votes")


class StudentLessonPlanProgress(TimestampMixin, Base):
    __tablename__ = "student_lesson_plan_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("lesson_plans.id"), nullable=False)
    progress_status: Mapped[str] = mapped_column(String(30), nullable=False)
    assigned_date: Mapped[date] = mapped_column(Date, nullable=False)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    student: Mapped[User] = relationship(back_populates="progresses")
    lesson_plan: Mapped[LessonPlan] = relationship(back_populates="progresses")


class AttendanceRecord(TimestampMixin, Base):
    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    seat_id: Mapped[int | None] = mapped_column(ForeignKey("computer_seats.id"), nullable=True)
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signin_source: Mapped[str] = mapped_column(String(30), nullable=False, default="login")

    student: Mapped[User] = relationship(back_populates="attendance_records")
    seat: Mapped[ComputerSeat | None] = relationship(back_populates="attendance_records")


class ClassroomSession(TimestampMixin, Base):
    __tablename__ = "classroom_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("lesson_plans.id"), nullable=False)
    started_by_staff_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)

    school_class: Mapped[SchoolClass] = relationship(back_populates="classroom_sessions")
    lesson_plan: Mapped[LessonPlan] = relationship(back_populates="classroom_sessions")
