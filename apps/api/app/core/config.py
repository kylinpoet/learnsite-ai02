import logging
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger("learnsite.config")

BASE_DIR = Path(__file__).resolve().parents[2]

# 仅用于本地开发/测试的回退密钥；生产必须通过 LEARNSITE_SECRET_KEY 覆盖。
DEV_SECRET_KEY = "learnsite-dev-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LEARNSITE_",
        env_file=".env",
        extra="ignore",
    )

    project_name: str = "OW³教学评AI平台 API"
    version: str = "0.1.0"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = f"sqlite:///{(BASE_DIR / 'learnsite.db').as_posix()}"
    storage_root: Path = BASE_DIR / "storage"
    web_dist_dir: Path = BASE_DIR.parent / "web" / "dist"
    serve_frontend: bool = True
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    cors_origin_regex: str = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
        r")(:\d+)?$"
    )
    secret_key: str = DEV_SECRET_KEY
    session_ttl_minutes: int = 120
    task_runtime_ttl_seconds: int = 300

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        # PyJWT HS256 对短密钥会报 InsecureKeyLengthWarning（要求 >= 32 字节）；
        # 这里在配置层提前提示，避免默认值被带上生产环境。
        if value == DEV_SECRET_KEY:
            logger.warning(
                "当前使用内置开发默认 secret_key（仅限本地开发/测试）。"
                "请设置环境变量 LEARNSITE_SECRET_KEY 为至少 32 字节的强随机值，"
                "生成方式示例：python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        elif len(value.encode("utf-8")) < 32:
            logger.warning(
                "secret_key 长度不足 32 字节（当前 %d 字节），PyJWT HS256 会触发 "
                "InsecureKeyLengthWarning；建议更换为更长的强随机密钥。",
                len(value.encode("utf-8")),
            )
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return []

    @property
    def session_ttl_seconds(self) -> int:
        return max(self.session_ttl_minutes, 1) * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
