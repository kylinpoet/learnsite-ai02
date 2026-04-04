from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_staff, require_student
from app.api.deps.db import get_db
from app.models import (
    QuestionBank,
    Quiz,
    QuizAttempt,
    QuizAttemptAnswer,
    QuizQuestion,
    QuizQuestionLink,
    QuizQuestionOption,
    SchoolClass,
    StudentProfile,
    User,
)
from app.schemas.common import ApiResponse
from app.services.staff_access import get_accessible_class_ids, is_admin_staff

router = APIRouter()


class StartQuizPayload(BaseModel):
    quiz_id: int = Field(ge=1)


class QuizAnswerSubmitItem(BaseModel):
    question_id: int = Field(ge=1)
    selected_option_key: str | None = Field(default=None, max_length=5)

    @field_validator("selected_option_key", mode="before")
    @classmethod
    def normalize_option_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip().upper()
        return cleaned or None


class SubmitQuizPayload(BaseModel):
    answers: list[QuizAnswerSubmitItem] = Field(default_factory=list)


class StaffBankPayloadBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("title", "description", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class StaffBankCreatePayload(StaffBankPayloadBase):
    pass


class StaffBankUpdatePayload(StaffBankPayloadBase):
    pass


class StaffQuestionOptionPayload(BaseModel):
    option_key: str = Field(min_length=1, max_length=5)
    option_text: str = Field(min_length=1, max_length=500)
    is_correct: bool = False

    @field_validator("option_key", "option_text", mode="before")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return str(value).strip()


class StaffQuestionPayloadBase(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    difficulty: str = Field(default="基础", min_length=1, max_length=20)
    explanation: str | None = Field(default=None, max_length=2000)
    options: list[StaffQuestionOptionPayload] = Field(min_length=2, max_length=8)

    @field_validator("content", "difficulty", "explanation", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[StaffQuestionOptionPayload]) -> list[StaffQuestionOptionPayload]:
        seen_keys: set[str] = set()
        correct_count = 0
        for item in value:
            option_key = item.option_key.strip().upper()
            if option_key in seen_keys:
                raise ValueError("选项键不能重复")
            seen_keys.add(option_key)
            item.option_key = option_key
            if item.is_correct:
                correct_count += 1
        if correct_count != 1:
            raise ValueError("单选题必须且只能有 1 个正确答案")
        return value


class StaffQuestionCreatePayload(StaffQuestionPayloadBase):
    bank_id: int = Field(ge=1)


class StaffQuestionUpdatePayload(StaffQuestionPayloadBase):
    pass


class StaffQuizPayloadBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    class_id: int = Field(ge=1)
    question_ids: list[int] = Field(min_length=1, max_length=50)

    @field_validator("title", "description", mode="before")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @field_validator("question_ids")
    @classmethod
    def deduplicate_question_ids(cls, value: list[int]) -> list[int]:
        unique_ids: list[int] = []
        seen: set[int] = set()
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            unique_ids.append(item)
        if not unique_ids:
            raise ValueError("至少选择 1 道题目")
        return unique_ids


class StaffQuizCreatePayload(StaffQuizPayloadBase):
    pass


class StaffQuizUpdatePayload(StaffQuizPayloadBase):
    pass


class StaffQuizStatusUpdatePayload(BaseModel):
    status: str = Field(min_length=1, max_length=30)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        cleaned = str(value).strip().lower()
        if cleaned not in {"active", "inactive"}:
            raise ValueError("测验状态仅支持 active 或 inactive")
        return cleaned


def load_student_profile(user: User, db: Session) -> StudentProfile:
    profile = db.scalar(
        select(StudentProfile)
        .where(StudentProfile.user_id == user.id)
        .options(selectinload(StudentProfile.school_class))
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生档案不存在")
    return profile


def load_quiz_with_questions(quiz_id: int, db: Session) -> Quiz:
    quiz = db.scalar(
        select(Quiz)
        .where(Quiz.id == quiz_id)
        .options(
            selectinload(Quiz.school_class),
            selectinload(Quiz.question_links)
            .selectinload(QuizQuestionLink.question)
            .selectinload(QuizQuestion.options),
        )
    )
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测验不存在")
    return quiz


def load_attempt_with_details(attempt_id: int, db: Session) -> QuizAttempt:
    attempt = db.scalar(
        select(QuizAttempt)
        .where(QuizAttempt.id == attempt_id)
        .options(
            selectinload(QuizAttempt.student).selectinload(User.student_profile),
            selectinload(QuizAttempt.quiz).selectinload(Quiz.school_class),
            selectinload(QuizAttempt.quiz)
            .selectinload(Quiz.question_links)
            .selectinload(QuizQuestionLink.question)
            .selectinload(QuizQuestion.options),
            selectinload(QuizAttempt.answers),
        )
    )
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测验作答不存在")
    return attempt


def today_range() -> tuple[datetime, datetime]:
    current_day = date.today()
    start_at = datetime.combine(current_day, datetime.min.time())
    end_at = datetime.combine(current_day, datetime.max.time())
    return start_at, end_at


def serialize_question(question: QuizQuestion) -> dict:
    return {
        "id": question.id,
        "content": question.content,
        "difficulty": question.difficulty,
        "options": [
            {
                "key": option.option_key,
                "text": option.option_text,
            }
            for option in question.options
        ],
    }


def serialize_question_for_staff(question: QuizQuestion) -> dict:
    return {
        "id": question.id,
        "content": question.content,
        "difficulty": question.difficulty,
        "explanation": question.explanation,
        "options": [
            {
                "id": option.id,
                "key": option.option_key,
                "text": option.option_text,
                "is_correct": option.is_correct,
            }
            for option in question.options
        ],
    }


def serialize_bank(bank: QuestionBank) -> dict:
    return {
        "id": bank.id,
        "title": bank.title,
        "description": bank.description,
        "scope_type": bank.scope_type,
        "owner_name": bank.owner_staff.display_name if bank.owner_staff else "系统内置",
        "question_count": len(bank.questions),
        "questions": [serialize_question_for_staff(question) for question in bank.questions],
    }


def serialize_quiz_for_staff(quiz: Quiz) -> dict:
    submitted_attempts = [item for item in quiz.attempts if item.status == "submitted" and item.score is not None]
    average_score = round(sum(item.score or 0 for item in submitted_attempts) / len(submitted_attempts)) if submitted_attempts else None
    return {
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "status": quiz.status,
        "class_id": quiz.class_id,
        "class_name": quiz.school_class.class_name if quiz.school_class else "全部班级",
        "question_count": len(quiz.question_links),
        "question_ids": [link.question_id for link in quiz.question_links],
        "attempt_count": len(submitted_attempts),
        "average_score": average_score,
        "updated_at": quiz.updated_at.isoformat() if quiz.updated_at else None,
    }


def serialize_attempt_summary(attempt: QuizAttempt) -> dict:
    return {
        "id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "quiz_title": attempt.quiz.title if attempt.quiz else "",
        "score": attempt.score,
        "correct_count": attempt.correct_count,
        "total_count": attempt.total_count,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "status": attempt.status,
    }


def build_class_daily_ranking(class_id: int, db: Session) -> dict:
    start_at, end_at = today_range()
    attempts = list(
        db.scalars(
            select(QuizAttempt)
            .join(StudentProfile, StudentProfile.user_id == QuizAttempt.student_user_id)
            .where(
                StudentProfile.class_id == class_id,
                QuizAttempt.status == "submitted",
                QuizAttempt.submitted_at >= start_at,
                QuizAttempt.submitted_at <= end_at,
            )
            .options(
                selectinload(QuizAttempt.student).selectinload(User.student_profile),
                selectinload(QuizAttempt.quiz).selectinload(Quiz.school_class),
            )
            .order_by(QuizAttempt.score.desc(), QuizAttempt.submitted_at.asc(), QuizAttempt.id.asc())
        ).all()
    )

    best_attempt_by_student: dict[int, QuizAttempt] = {}
    for attempt in attempts:
        existing = best_attempt_by_student.get(attempt.student_user_id)
        if existing is None:
            best_attempt_by_student[attempt.student_user_id] = attempt
            continue
        existing_score = existing.score or 0
        next_score = attempt.score or 0
        if next_score > existing_score:
            best_attempt_by_student[attempt.student_user_id] = attempt
        elif next_score == existing_score:
            existing_time = existing.submitted_at or existing.started_at
            next_time = attempt.submitted_at or attempt.started_at
            if next_time < existing_time:
                best_attempt_by_student[attempt.student_user_id] = attempt

    ranking_attempts = sorted(
        best_attempt_by_student.values(),
        key=lambda item: (
            -(item.score or 0),
            item.submitted_at or item.started_at,
            item.id,
        ),
    )

    items: list[dict] = []
    for index, attempt in enumerate(ranking_attempts, start=1):
        student_profile = attempt.student.student_profile if attempt.student else None
        items.append(
            {
                "rank": index,
                "student_name": attempt.student.display_name if attempt.student else "未知学生",
                "student_no": student_profile.student_no if student_profile else "",
                "score": attempt.score or 0,
                "quiz_title": attempt.quiz.title if attempt.quiz else "",
                "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            }
        )

    class_profiles = list(
        db.scalars(
            select(StudentProfile)
            .where(StudentProfile.class_id == class_id)
            .options(selectinload(StudentProfile.user), selectinload(StudentProfile.school_class))
            .order_by(StudentProfile.student_no.asc())
        ).all()
    )
    attempted_student_ids = {item.student_user_id for item in ranking_attempts}
    pending_students = [
        {
            "student_name": profile.user.display_name if profile.user else "",
            "student_no": profile.student_no,
        }
        for profile in class_profiles
        if profile.user_id not in attempted_student_ids
    ]

    class_name = class_profiles[0].school_class.class_name if class_profiles and class_profiles[0].school_class else ""
    return {
        "class_id": class_id,
        "class_name": class_name,
        "items": items,
        "pending_students": pending_students,
        "generated_at": datetime.now().isoformat(),
    }


def assert_can_manage_bank(user: User, bank: QuestionBank) -> None:
    if is_admin_staff(user):
        return
    if bank.owner_staff_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能编辑其他教师的题库")


def assert_can_manage_quiz(user: User, quiz: Quiz) -> None:
    if is_admin_staff(user):
        return
    if quiz.owner_staff_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能编辑其他教师的测验")


@router.get("/student/home", response_model=ApiResponse)
def quiz_student_home(
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(user, db)
    quizzes = list(
        db.scalars(
            select(Quiz)
            .where(Quiz.class_id == profile.class_id, Quiz.status == "active")
            .options(selectinload(Quiz.question_links))
            .order_by(Quiz.updated_at.desc(), Quiz.id.desc())
        ).all()
    )
    attempts = list(
        db.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.student_user_id == user.id)
            .options(selectinload(QuizAttempt.quiz))
            .order_by(QuizAttempt.started_at.desc(), QuizAttempt.id.desc())
        ).all()
    )

    submitted_attempts = [item for item in attempts if item.status == "submitted" and item.score is not None]
    average_score = round(sum(item.score or 0 for item in submitted_attempts) / len(submitted_attempts)) if submitted_attempts else None
    best_score = max((item.score or 0 for item in submitted_attempts), default=None)
    ranking = build_class_daily_ranking(profile.class_id, db)
    my_rank = next((item["rank"] for item in ranking["items"] if item["student_no"] == profile.student_no), None)
    attempt_by_quiz: dict[int, QuizAttempt] = {}
    for attempt in submitted_attempts:
        current = attempt_by_quiz.get(attempt.quiz_id)
        if current is None or (attempt.submitted_at or attempt.started_at) > (current.submitted_at or current.started_at):
            attempt_by_quiz[attempt.quiz_id] = attempt

    payload = {
        "overview": {
            "average_score": average_score,
            "best_score": best_score,
            "attempt_count": len(submitted_attempts),
            "today_rank": my_rank,
            "today_participants": len(ranking["items"]),
        },
        "available_quizzes": [
            {
                "id": quiz.id,
                "title": quiz.title,
                "description": quiz.description,
                "question_count": len(quiz.question_links),
                "last_score": attempt_by_quiz.get(quiz.id).score if attempt_by_quiz.get(quiz.id) else None,
                "last_submitted_at": (
                    attempt_by_quiz.get(quiz.id).submitted_at.isoformat()
                    if attempt_by_quiz.get(quiz.id) and attempt_by_quiz.get(quiz.id).submitted_at
                    else None
                ),
            }
            for quiz in quizzes
        ],
        "recent_attempts": [serialize_attempt_summary(item) for item in submitted_attempts[:5]],
        "ranking_preview": {
            "class_name": ranking["class_name"],
            "items": ranking["items"][:5],
            "pending_students": ranking["pending_students"][:5],
        },
    }
    return ApiResponse(data=payload)


@router.post("/start", response_model=ApiResponse)
def start_quiz(
    payload: StartQuizPayload,
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(user, db)
    quiz = load_quiz_with_questions(payload.quiz_id, db)
    if quiz.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前测验未开放")
    if quiz.class_id is not None and quiz.class_id != profile.class_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="该测验不属于当前班级")
    if not quiz.question_links:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前测验还没有配置题目")

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        student_user_id=user.id,
        status="in_progress",
        score=None,
        correct_count=0,
        total_count=len(quiz.question_links),
        started_at=datetime.now(),
        submitted_at=None,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return ApiResponse(
        data={
            "attempt": {
                "id": attempt.id,
                "quiz_id": quiz.id,
                "title": quiz.title,
                "description": quiz.description,
                "question_count": len(quiz.question_links),
                "started_at": attempt.started_at.isoformat(),
            },
            "questions": [serialize_question(link.question) for link in quiz.question_links],
        }
    )


@router.post("/attempts/{attempt_id}/submit", response_model=ApiResponse)
def submit_quiz_attempt(
    attempt_id: int,
    payload: SubmitQuizPayload,
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    attempt = load_attempt_with_details(attempt_id, db)
    if attempt.student_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能提交其他学生的测验")
    if attempt.status == "submitted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="本次测验已经提交")

    answer_map: dict[int, str | None] = {}
    for item in payload.answers:
        answer_map[item.question_id] = item.selected_option_key

    for existing in list(attempt.answers):
        db.delete(existing)
    db.flush()

    correct_count = 0
    total_count = len(attempt.quiz.question_links)
    detailed_answers: list[dict] = []
    for link in attempt.quiz.question_links:
        question = link.question
        selected_key = answer_map.get(question.id)
        correct_option = next((item.option_key for item in question.options if item.is_correct), None)
        is_correct = bool(selected_key and selected_key == correct_option)
        if is_correct:
            correct_count += 1
        db.add(
            QuizAttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_option_key=selected_key,
                is_correct=is_correct,
            )
        )
        detailed_answers.append(
            {
                "question_id": question.id,
                "content": question.content,
                "selected_option_key": selected_key,
                "correct_option_key": correct_option,
                "is_correct": is_correct,
                "explanation": question.explanation,
            }
        )

    attempt.status = "submitted"
    attempt.correct_count = correct_count
    attempt.total_count = total_count
    attempt.score = round(correct_count * 100 / total_count) if total_count else 0
    attempt.submitted_at = datetime.now()
    db.commit()
    db.refresh(attempt)

    profile = load_student_profile(user, db)
    ranking = build_class_daily_ranking(profile.class_id, db)
    my_rank = next((item["rank"] for item in ranking["items"] if item["student_no"] == profile.student_no), None)
    return ApiResponse(
        message="测验已提交",
        data={
            "summary": {
                "attempt_id": attempt.id,
                "quiz_id": attempt.quiz_id,
                "quiz_title": attempt.quiz.title,
                "score": attempt.score,
                "correct_count": attempt.correct_count,
                "total_count": attempt.total_count,
                "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                "today_rank": my_rank,
            },
            "answers": detailed_answers,
        },
    )


@router.get("/rankings/daily", response_model=ApiResponse)
def quiz_daily_rankings(
    class_id: int | None = None,
    student_user: User | None = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    profile = load_student_profile(student_user, db)
    target_class_id = class_id or profile.class_id
    if target_class_id != profile.class_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="学生只能查看本班排行榜")
    return ApiResponse(data=build_class_daily_ranking(target_class_id, db))


@router.get("/staff/bootstrap", response_model=ApiResponse)
def quiz_staff_bootstrap(
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    accessible_class_ids = get_accessible_class_ids(user, db)
    classes = list(
        db.scalars(
            select(SchoolClass)
            .where(SchoolClass.id.in_(accessible_class_ids))
            .order_by(SchoolClass.grade_no.asc(), SchoolClass.class_no.asc())
        ).all()
    )
    banks = list(
        db.scalars(
            select(QuestionBank)
            .options(
                selectinload(QuestionBank.owner_staff),
                selectinload(QuestionBank.questions).selectinload(QuizQuestion.options),
            )
            .order_by(QuestionBank.updated_at.desc(), QuestionBank.id.desc())
        ).all()
    )
    quizzes = list(
        db.scalars(
            select(Quiz)
            .where(Quiz.class_id.in_(accessible_class_ids))
            .options(selectinload(Quiz.school_class), selectinload(Quiz.question_links), selectinload(Quiz.attempts))
            .order_by(Quiz.updated_at.desc(), Quiz.id.desc())
        ).all()
    )
    return ApiResponse(
        data={
            "classes": [
                {
                    "id": item.id,
                    "class_name": item.class_name,
                    "grade_no": item.grade_no,
                    "class_no": item.class_no,
                    "student_count": len(item.students),
                }
                for item in classes
            ],
            "banks": [serialize_bank(item) for item in banks],
            "quizzes": [serialize_quiz_for_staff(item) for item in quizzes],
        }
    )


@router.post("/staff/banks", response_model=ApiResponse)
def create_question_bank(
    payload: StaffBankCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    bank = QuestionBank(
        owner_staff_user_id=user.id,
        title=payload.title,
        description=payload.description,
        scope_type="staff",
    )
    db.add(bank)
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.put("/staff/banks/{bank_id}", response_model=ApiResponse)
def update_question_bank(
    bank_id: int,
    payload: StaffBankUpdatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    bank = db.get(QuestionBank, bank_id)
    if bank is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题库不存在")
    assert_can_manage_bank(user, bank)

    bank.title = payload.title
    bank.description = payload.description
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.delete("/staff/banks/{bank_id}", response_model=ApiResponse)
def delete_question_bank(
    bank_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    bank = db.scalar(
        select(QuestionBank)
        .where(QuestionBank.id == bank_id)
        .options(selectinload(QuestionBank.questions))
    )
    if bank is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题库不存在")
    assert_can_manage_bank(user, bank)

    if bank.questions:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="题库下仍有题目，暂不能删除")

    db.delete(bank)
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.post("/staff/questions", response_model=ApiResponse)
def create_question(
    payload: StaffQuestionCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    bank = db.get(QuestionBank, payload.bank_id)
    if bank is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题库不存在")
    assert_can_manage_bank(user, bank)

    question = QuizQuestion(
        bank_id=bank.id,
        question_type="single_choice",
        content=payload.content,
        difficulty=payload.difficulty,
        explanation=payload.explanation,
    )
    db.add(question)
    db.flush()
    for item in payload.options:
        db.add(
            QuizQuestionOption(
                question_id=question.id,
                option_key=item.option_key,
                option_text=item.option_text,
                is_correct=item.is_correct,
            )
        )
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.put("/staff/questions/{question_id}", response_model=ApiResponse)
def update_question(
    question_id: int,
    payload: StaffQuestionUpdatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    question = db.scalar(
        select(QuizQuestion)
        .where(QuizQuestion.id == question_id)
        .options(selectinload(QuizQuestion.bank), selectinload(QuizQuestion.options))
    )
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题目不存在")
    assert_can_manage_bank(user, question.bank)

    answered_attempt_id = db.scalar(select(QuizAttemptAnswer.id).where(QuizAttemptAnswer.question_id == question.id))
    if answered_attempt_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="题目已有学生作答记录，暂不能编辑")

    question.content = payload.content
    question.difficulty = payload.difficulty
    question.explanation = payload.explanation

    question.options.clear()
    db.flush()
    for item in payload.options:
        question.options.append(
            QuizQuestionOption(
                option_key=item.option_key,
                option_text=item.option_text,
                is_correct=item.is_correct,
            )
        )

    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.delete("/staff/questions/{question_id}", response_model=ApiResponse)
def delete_question(
    question_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    question = db.scalar(
        select(QuizQuestion)
        .where(QuizQuestion.id == question_id)
        .options(selectinload(QuizQuestion.bank))
    )
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题目不存在")
    assert_can_manage_bank(user, question.bank)

    linked_quiz_id = db.scalar(select(QuizQuestionLink.id).where(QuizQuestionLink.question_id == question.id))
    if linked_quiz_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="题目已被测验引用，暂不能删除")

    answered_attempt_id = db.scalar(select(QuizAttemptAnswer.id).where(QuizAttemptAnswer.question_id == question.id))
    if answered_attempt_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="题目已有学生作答记录，暂不能删除")

    db.delete(question)
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.put("/staff/quizzes/{quiz_id}/status", response_model=ApiResponse)
def update_quiz_status(
    quiz_id: int,
    payload: StaffQuizStatusUpdatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测验不存在")
    assert_can_manage_quiz(user, quiz)

    quiz.status = payload.status
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.put("/staff/quizzes/{quiz_id}", response_model=ApiResponse)
def update_quiz(
    quiz_id: int,
    payload: StaffQuizUpdatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    quiz = db.scalar(
        select(Quiz)
        .where(Quiz.id == quiz_id)
        .options(selectinload(Quiz.question_links), selectinload(Quiz.attempts))
    )
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测验不存在")
    assert_can_manage_quiz(user, quiz)

    if quiz.attempts:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="测验已有学生作答记录，暂不能编辑")

    accessible_class_ids = get_accessible_class_ids(user, db)
    if payload.class_id not in accessible_class_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能给无权限班级编辑测验")

    school_class = db.get(SchoolClass, payload.class_id)
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    questions = list(
        db.scalars(
            select(QuizQuestion)
            .where(QuizQuestion.id.in_(payload.question_ids))
            .options(selectinload(QuizQuestion.options))
        ).all()
    )
    if len(questions) != len(payload.question_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="存在未找到的题目")

    quiz.title = payload.title
    quiz.description = payload.description
    quiz.class_id = payload.class_id

    quiz.question_links.clear()
    db.flush()
    for index, question_id in enumerate(payload.question_ids, start=1):
        quiz.question_links.append(QuizQuestionLink(question_id=question_id, sort_order=index))

    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.delete("/staff/quizzes/{quiz_id}", response_model=ApiResponse)
def delete_quiz(
    quiz_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    quiz = db.scalar(
        select(Quiz)
        .where(Quiz.id == quiz_id)
        .options(selectinload(Quiz.attempts))
    )
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测验不存在")
    assert_can_manage_quiz(user, quiz)

    if quiz.attempts:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="测验已有学生作答记录，暂不能删除")

    db.delete(quiz)
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)


@router.post("/staff/quizzes", response_model=ApiResponse)
def create_quiz(
    payload: StaffQuizCreatePayload,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> ApiResponse:
    accessible_class_ids = get_accessible_class_ids(user, db)
    if payload.class_id not in accessible_class_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能给无权限班级创建测验")

    school_class = db.get(SchoolClass, payload.class_id)
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="班级不存在")

    questions = list(
        db.scalars(
            select(QuizQuestion)
            .where(QuizQuestion.id.in_(payload.question_ids))
            .options(selectinload(QuizQuestion.options))
        ).all()
    )
    if len(questions) != len(payload.question_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="存在未找到的题目")

    quiz = Quiz(
        owner_staff_user_id=user.id,
        class_id=payload.class_id,
        title=payload.title,
        description=payload.description,
        status="active",
    )
    db.add(quiz)
    db.flush()
    for index, question_id in enumerate(payload.question_ids, start=1):
        db.add(QuizQuestionLink(quiz_id=quiz.id, question_id=question_id, sort_order=index))
    db.commit()
    return quiz_staff_bootstrap(user=user, db=db)
