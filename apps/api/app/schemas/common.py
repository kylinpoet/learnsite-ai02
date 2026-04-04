from typing import Any

from pydantic import BaseModel, Field


class ApiResponse(BaseModel):
    code: str = "OK"
    message: str = "success"
    data: Any = None


class HealthPayload(BaseModel):
    status: str = "healthy"
    environment: str
    version: str


class OptionItem(BaseModel):
    title: str
    text: str


class PlaceholderPayload(BaseModel):
    title: str
    description: str
    highlights: list[OptionItem] = Field(default_factory=list)
