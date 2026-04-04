from fastapi import APIRouter

from app.core.config import settings
from app.schemas.common import ApiResponse, HealthPayload

router = APIRouter()


@router.get("", response_model=ApiResponse)
def healthcheck() -> ApiResponse:
    payload = HealthPayload(
        status="healthy",
        environment=settings.environment,
        version=settings.version,
    )
    return ApiResponse(data=payload)
