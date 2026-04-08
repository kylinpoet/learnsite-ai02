from __future__ import annotations

from typing import Final

DEFAULT_REMOTE_ACCEPT: Final[str] = "application/json, text/plain, */*"
DEFAULT_REMOTE_ACCEPT_LANGUAGE: Final[str] = "zh-CN,zh;q=0.9,en;q=0.8"
DEFAULT_REMOTE_USER_AGENT: Final[str] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36 LearnSiteAI/0.1"
)


def build_remote_request_headers(
    api_key: str | None = None,
    *,
    accept: str = DEFAULT_REMOTE_ACCEPT,
    content_type: str | None = None,
) -> dict[str, str]:
    headers = {
        "Accept": accept,
        "Accept-Language": DEFAULT_REMOTE_ACCEPT_LANGUAGE,
        "User-Agent": DEFAULT_REMOTE_USER_AGENT,
    }
    if content_type:
        headers["Content-Type"] = content_type
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers
