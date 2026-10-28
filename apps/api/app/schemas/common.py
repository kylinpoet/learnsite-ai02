from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """统一响应 envelope。

    保持向后兼容：不参数化时（``ApiResponse`` / ``ApiResponse(data=...)``）
    ``data`` 退化为 ``Any``，行为与泛型化之前完全一致。
    参数化后（``ApiResponse[LoginPayload]``）OpenAPI 会内联 data 的具体结构，
    前端 openapi-typescript 即可生成响应体类型。
    """

    code: str = "OK"
    message: str = "success"
    data: T | None = None


class HealthPayload(BaseModel):
    status: str = "healthy"
    environment: str
    version: str
