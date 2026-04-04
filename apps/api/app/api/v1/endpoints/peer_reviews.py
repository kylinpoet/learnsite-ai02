from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import require_student
from app.api.deps.db import get_db
from app.models import (
    CurriculumLesson,
    LessonPlan,
    PeerReviewVote,
    StudentProfile,
    Submission,
    SubmissionFile,
    Task,
    User,
)
from app.schemas.common import ApiResponse
from app.services.submission_files import guess_media_type, is_previewable_file, stored_file_path

router = APIRouter()

DEFAULT_VOTE_LIMIT = 3


class PeerReviewVoteRequest(BaseModel):
    target_submission_id: int = Field(ge=1)
    score: int = Field(default=1, ge=1, le=1)


def latest_submission_time(submission: Submission) -> datetime | None:
    return submission.submitted_at or submission.updated_at


def serialize_submission_file(submission_file: SubmissionFile) -> dict:
    return {
        "id": submission_file.id,
        "name": submission_file.original_name,
        "ext": submission_file.file_ext,
        "size_kb": submission_file.size_kb,
        "role": submission_file.file_role,
        "mime_type": guess_media_type(submission_file),
        "previewable": is_previewable_file(submission_file),
    }


def build_content_disposition(filename: str, disposition: str) -> str:
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip()
    if not fallback_name:
        fallback_name = "attachment"
    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'


def load_task_bundle(task_id: int, db: Session) -> tuple[Task, list[Submission], list[PeerReviewVote]]:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.lesson_plan)
            .selectinload(LessonPlan.lesson)
            .selectinload(CurriculumLesson.unit)
        )
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    submissions = db.scalars(
        select(Submission)
        .where(Submission.task_id == task_id)
        .options(
            selectinload(Submission.student)
            .selectinload(User.student_profile)
            .selectinload(StudentProfile.school_class),
            selectinload(Submission.files),
        )
        .order_by(Submission.submitted_at.desc(), Submission.id.desc())
    ).all()
    votes = db.scalars(
        select(PeerReviewVote)
        .where(PeerReviewVote.task_id == task_id)
        .order_by(PeerReviewVote.created_at.asc(), PeerReviewVote.id.asc())
    ).all()
    return task, list(submissions), list(votes)


def load_submission_file(file_id: int, db: Session) -> SubmissionFile | None:
    return db.scalar(
        select(SubmissionFile)
        .where(SubmissionFile.id == file_id)
        .options(selectinload(SubmissionFile.submission))
    )


def recalculate_peer_review_scores(task_id: int, db: Session) -> None:
    submissions = db.scalars(select(Submission).where(Submission.task_id == task_id)).all()
    vote_totals = {submission.id: 0 for submission in submissions}
    votes = db.scalars(select(PeerReviewVote).where(PeerReviewVote.task_id == task_id)).all()
    for vote in votes:
        vote_totals[vote.target_submission_id] = vote_totals.get(vote.target_submission_id, 0) + vote.score

    for submission in submissions:
        submission.peer_review_score = vote_totals.get(submission.id, 0)


def build_vote_limit(total_submissions: int, has_own_submission: bool) -> int:
    if not has_own_submission:
        return 0
    return min(DEFAULT_VOTE_LIMIT, max(total_submissions - 1, 0))


def serialize_peer_review_item(
    submission: Submission,
    current_student_id: int,
    vote_counts: dict[int, int],
    voted_submission_ids: set[int],
) -> dict:
    student = submission.student
    profile = student.student_profile
    school_class = profile.school_class if profile else None
    latest_time = latest_submission_time(submission)
    is_mine = submission.student_id == current_student_id
    has_voted = submission.id in voted_submission_ids

    return {
        "submission_id": submission.id,
        "student_id": student.id,
        "student_name": student.display_name,
        "student_no": profile.student_no if profile else student.username,
        "class_name": school_class.class_name if school_class else "",
        "status": submission.submit_status,
        "teacher_score": submission.score,
        "peer_review_score": submission.peer_review_score or 0,
        "vote_count": vote_counts.get(submission.id, 0),
        "submission_note": submission.submission_note,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "updated_at": latest_time.isoformat() if latest_time else None,
        "is_mine": is_mine,
        "has_voted": has_voted,
        "can_vote": not is_mine and not has_voted,
        "is_teacher_recommended": submission.submit_status == "reviewed" and submission.is_recommended,
        "files": [serialize_submission_file(file) for file in submission.files],
    }


def build_peer_review_payload(task: Task, submissions: list[Submission], votes: list[PeerReviewVote], student: User) -> dict:
    my_submission = next((submission for submission in submissions if submission.student_id == student.id), None)
    has_own_submission = my_submission is not None
    vote_limit = build_vote_limit(len(submissions), has_own_submission)
    my_votes = [vote for vote in votes if vote.reviewer_student_id == student.id]
    voted_submission_ids = {vote.target_submission_id for vote in my_votes}

    vote_counts: dict[int, int] = {}
    for vote in votes:
        vote_counts[vote.target_submission_id] = vote_counts.get(vote.target_submission_id, 0) + vote.score

    items = (
        [
            serialize_peer_review_item(submission, student.id, vote_counts, voted_submission_ids)
            for submission in submissions
        ]
        if has_own_submission
        else []
    )

    lesson = task.lesson_plan.lesson
    my_received_votes = vote_counts.get(my_submission.id, 0) if my_submission else 0
    my_peer_review_score = my_submission.peer_review_score if my_submission else None

    return {
        "task": {
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "course": {
                "id": task.lesson_plan.id,
                "title": task.lesson_plan.title,
                "assigned_date": task.lesson_plan.assigned_date.isoformat(),
                "lesson_title": lesson.title,
                "unit_title": lesson.unit.title,
            },
        },
        "summary": {
            "total_works": len(submissions),
            "vote_limit": vote_limit,
            "votes_used": len(my_votes),
            "votes_remaining": max(vote_limit - len(my_votes), 0),
            "my_received_votes": my_received_votes,
            "my_peer_review_score": my_peer_review_score,
        },
        "gate": {
            "requires_submission": not has_own_submission,
            "can_view_wall": has_own_submission,
            "message": (
                ""
                if has_own_submission
                else "请先在当前任务页提交自己的作品，再查看同学作品并参与互评。"
            ),
        },
        "my_submission": (
            {
                "submission_id": my_submission.id,
                "status": my_submission.submit_status,
                "peer_review_score": my_submission.peer_review_score or 0,
                "vote_count": my_received_votes,
                "updated_at": latest_submission_time(my_submission).isoformat()
                if latest_submission_time(my_submission)
                else None,
            }
            if my_submission
            else None
        ),
        "items": items,
    }


def ensure_peer_review_file_access(submission_file: SubmissionFile, student: User, db: Session) -> None:
    submission = submission_file.submission
    if submission.student_id == student.id:
        return

    own_submission_exists = db.scalar(
        select(Submission.id).where(
            Submission.task_id == submission.task_id,
            Submission.student_id == student.id,
        )
    )
    if own_submission_exists is not None:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="请先提交自己的作品后再查看互评附件",
    )


@router.get("/task/{task_id}", response_model=ApiResponse)
def peer_review_wall(
    task_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task, submissions, votes = load_task_bundle(task_id, db)
    return ApiResponse(data=build_peer_review_payload(task, submissions, votes, student))


@router.get("/task/{task_id}/summary", response_model=ApiResponse)
def peer_review_summary(
    task_id: int,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task, submissions, votes = load_task_bundle(task_id, db)
    payload = build_peer_review_payload(task, submissions, votes, student)
    return ApiResponse(
        data={
            "task": payload["task"],
            "summary": payload["summary"],
            "gate": payload["gate"],
            "my_submission": payload["my_submission"],
        }
    )


@router.post("/task/{task_id}/vote", response_model=ApiResponse)
def vote_for_submission(
    task_id: int,
    payload: PeerReviewVoteRequest,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> ApiResponse:
    task, submissions, votes = load_task_bundle(task_id, db)
    my_submission = next((submission for submission in submissions if submission.student_id == student.id), None)
    if my_submission is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="请先提交自己的作品后再参与互评",
        )

    target_submission = next((submission for submission in submissions if submission.id == payload.target_submission_id), None)
    if target_submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标作品不存在")
    if target_submission.student_id == student.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能给自己的作品投票")

    existing_vote = next(
        (
            vote
            for vote in votes
            if vote.reviewer_student_id == student.id and vote.target_submission_id == target_submission.id
        ),
        None,
    )
    if existing_vote is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="你已经推荐过这份作品了")

    vote_limit = build_vote_limit(len(submissions), True)
    used_count = sum(1 for vote in votes if vote.reviewer_student_id == student.id)
    if used_count >= vote_limit:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前任务的推荐次数已经用完")

    db.add(
        PeerReviewVote(
            task_id=task_id,
            reviewer_student_id=student.id,
            target_submission_id=target_submission.id,
            score=payload.score,
        )
    )
    db.flush()
    recalculate_peer_review_scores(task_id, db)
    db.commit()

    refreshed_task, refreshed_submissions, refreshed_votes = load_task_bundle(task_id, db)
    return ApiResponse(
        message="推荐已保存",
        data=build_peer_review_payload(refreshed_task, refreshed_submissions, refreshed_votes, student),
    )


@router.get("/files/{file_id}")
def peer_review_file_content(
    file_id: int,
    disposition: str = Query(default="inline"),
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> FileResponse:
    if disposition not in {"inline", "attachment"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不支持的附件访问方式")

    submission_file = load_submission_file(file_id, db)
    if submission_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件不存在")

    ensure_peer_review_file_access(submission_file, student, db)
    file_path = stored_file_path(submission_file)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="附件文件不存在")

    response = FileResponse(
        path=file_path,
        media_type=guess_media_type(submission_file),
        filename=submission_file.original_name,
    )
    response.headers["Content-Disposition"] = build_content_disposition(
        submission_file.original_name,
        disposition,
    )
    return response
