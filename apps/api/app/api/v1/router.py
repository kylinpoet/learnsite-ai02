from fastapi import APIRouter

from app.api.v1.endpoints import (
    assistants,
    auth,
    classroom,
    curriculum,
    drives,
    groups,
    health,
    lesson_plans,
    peer_reviews,
    profiles,
    quizzes,
    resources,
    settings,
    staff,
    submissions,
    tasks,
    typing,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(staff.router, prefix="/staff", tags=["staff"])
api_router.include_router(curriculum.router, prefix="/curriculum", tags=["curriculum"])
api_router.include_router(lesson_plans.router, prefix="/lesson-plans", tags=["lesson-plans"])
api_router.include_router(classroom.router, prefix="/classroom", tags=["classroom"])
api_router.include_router(drives.router, prefix="/drives", tags=["drives"])
api_router.include_router(groups.router, prefix="/groups", tags=["groups"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(submissions.router, prefix="/submissions", tags=["submissions"])
api_router.include_router(peer_reviews.router, prefix="/peer-reviews", tags=["peer-reviews"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["quizzes"])
api_router.include_router(typing.router, prefix="/typing", tags=["typing"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(assistants.router, prefix="/assistants", tags=["assistants"])
