"""AI Provider 统一调用层（openai SDK 封装）。

供 assistants.py（学伴对话）与 settings.py（模型发现）共用：
- chat_completion：非流式对话，返回 (content, error, reasoning_content)；
- chat_completion_stream：流式对话生成器，yield ("chunk"|"reasoning", str)，
  并以 return (full_text, error, full_reasoning) 作为 StopIteration.value——
  与旧 urllib 实现的契约完全一致，端点层用 next()+StopIteration 消费；
- list_models：模型列表发现，返回 (models, error, status_code)。

设计约束：
- 端点函数均为同步 def（跑线程池），这里统一用同步 OpenAI 客户端；
- openai 3.x 内置 httpx2，代理必须通过 DefaultHttpxClient(proxy=...) 传入；
- Chrome User-Agent 等请求头（build_remote_request_headers）是有意伪装，
  用于绕过部分网关的 browser signature 拦截，需通过 default_headers 保留；
- thinking 等非标准生成参数通过 extra_body 透传（GLM 风格开关）。
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from openai import AuthenticationError
from openai._base_client import DefaultHttpxClient
from openai._exceptions import NotFoundError

from app.services.remote_request_headers import build_remote_request_headers

logger = logging.getLogger(__name__)

DEFAULT_COMPLETION_TIMEOUT_SECONDS = 20.0
DEFAULT_STREAM_TIMEOUT_SECONDS = 35.0
DEFAULT_LIST_MODELS_TIMEOUT_SECONDS = 15.0

PROVIDER_MODE_CONFIGURED_PROXY = "configured_proxy"
PROVIDER_MODE_NO_PROXY = "no_proxy"

DEFAULT_COMPLETION_ACCEPT = "application/json, text/plain, */*"
STREAM_COMPLETION_ACCEPT = "text/event-stream, application/json, text/plain, */*"


def normalize_provider_base_url(base_url: str) -> str:
    """归一化 Base URL：去尾斜杠、剥离已有的 /chat/completions 与 /models 后缀。"""
    normalized = (base_url or "").strip().rstrip("/")
    if not normalized:
        return ""
    if normalized.endswith("/chat/completions"):
        normalized = normalized[: -len("/chat/completions")]
    if normalized.endswith("/models"):
        normalized = normalized[: -len("/models")]
    return normalized


def build_provider_http_client(proxy_url: str | None) -> DefaultHttpxClient | None:
    """按需构造走代理的 httpx2 客户端；无代理时返回 None 让 SDK 自建。"""
    normalized_proxy = (proxy_url or "").strip()
    if not normalized_proxy:
        return None
    return DefaultHttpxClient(proxy=normalized_proxy)


def build_ai_provider_client(
    base_url: str,
    api_key: str | None,
    *,
    proxy_url: str | None = None,
    timeout: float = DEFAULT_COMPLETION_TIMEOUT_SECONDS,
    accept: str = DEFAULT_COMPLETION_ACCEPT,
) -> OpenAI:
    normalized_base_url = normalize_provider_base_url(base_url)
    request_headers = build_remote_request_headers(api_key, accept=accept)
    # SDK 要求非空 api_key；无密钥的服务用占位值（不会影响本地无鉴权网关）
    return OpenAI(
        api_key=api_key or "missing-api-key",
        base_url=normalized_base_url or None,
        timeout=timeout,
        max_retries=0,
        default_headers=request_headers,
        http_client=build_provider_http_client(proxy_url),
    )


def apply_provider_client_headers(client: OpenAI, request_headers: dict[str, str]) -> None:
    """把浏览器兼容请求头注入 SDK 客户端的 default_headers。

    openai SDK 的 default_headers 属性在每次请求时动态合并 _custom_headers，
    构造后覆写该属性即可生效；普通属性赋值同时兼容测试替身。
    调用层（chat_completion / chat_completion_stream / list_models）在构造
    客户端后统一调用本函数，保证 Chrome UA / 中文 Accept-Language 请求头
    不因客户端构造方式变化而丢失。
    """
    client._custom_headers = dict(request_headers)


def split_generation_params(params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """把生成参数拆成 SDK 标准参数与 extra_body（thinking 等非标准键）。"""
    known_keys = {"temperature", "top_p", "max_tokens", "presence_penalty", "frequency_penalty"}
    create_kwargs: dict[str, Any] = {key: value for key, value in params.items() if key in known_keys}
    extra_body: dict[str, Any] = {key: value for key, value in params.items() if key not in known_keys}
    return create_kwargs, extra_body


def _read_status_error_body(exc: APIStatusError) -> str:
    try:
        return exc.response.text or ""
    except Exception:  # noqa: BLE001 - body 读取失败时回退 str(exc)
        return ""


def extract_provider_error_message(body: str, *, status_code: int | None = None) -> str:
    """从错误响应体提取人类可读信息（兼容 error.message / message / 纯文本）。"""
    text = body.strip()
    if not text:
        return f"Provider request failed with status {status_code}" if status_code else "Provider request failed"
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(payload, dict):
        error_item = payload.get("error")
        if isinstance(error_item, dict):
            message = str(error_item.get("message") or "").strip()
            if message:
                return message
        if isinstance(error_item, str) and error_item.strip():
            return error_item.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    return text


def _status_error_message(exc: APIStatusError) -> str:
    body = _read_status_error_body(exc)
    reason = extract_provider_error_message(body, status_code=getattr(exc, "status_code", None))
    if reason and reason != body.strip():
        return reason
    if reason:
        return reason
    return str(exc) or f"Provider request failed with status {getattr(exc, 'status_code', None)}"


def _transport_error_message(exc: Exception) -> str:
    return str(exc) or "Provider transport error"


def _extract_message_text(content: Any) -> str:
    """兼容 content 为字符串或 [{type:text,text:...}] 数组的返回。"""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        texts = [
            item.get("text")
            for item in content
            if isinstance(item, dict) and isinstance(item.get("text"), str)
        ]
        return "\n".join(text for text in texts if text.strip()).strip()
    return ""


def _extract_reasoning_from_extra(model_extra: dict[str, Any] | None) -> str:
    if not model_extra:
        return ""
    for key in ("reasoning_content", "reasoning", "thinking", "reasoning_text"):
        value = model_extra.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _extract_stream_delta_text(delta: Any) -> tuple[str, str]:
    """返回 (content增量, reasoning增量)；兼容 SDK 类型化对象与原始 dict。"""
    content = ""
    reasoning = ""
    if isinstance(delta, dict):
        content = delta.get("content") if isinstance(delta.get("content"), str) else ""
        for key in ("reasoning_content", "reasoning", "thinking", "reasoning_text"):
            value = delta.get(key)
            if isinstance(value, str) and value:
                reasoning = value
                break
        return content, reasoning
    content = getattr(delta, "content", None)
    content = content if isinstance(content, str) else ""
    reasoning = _extract_reasoning_from_extra(getattr(delta, "model_extra", None))
    return content, reasoning


def chat_completion(
    base_url: str,
    api_key: str | None,
    messages: list[dict[str, Any]],
    params: dict[str, Any],
    *,
    model: str,
    proxy_url: str | None = None,
    timeout: float = DEFAULT_COMPLETION_TIMEOUT_SECONDS,
) -> tuple[str | None, str | None, str | None]:
    """非流式对话。返回 (content, error, reasoning_content)，成功时 error 为 None。"""
    request_headers = build_remote_request_headers(api_key, accept=DEFAULT_COMPLETION_ACCEPT)
    client = build_ai_provider_client(
        base_url,
        api_key,
        proxy_url=proxy_url,
        timeout=timeout,
        accept=DEFAULT_COMPLETION_ACCEPT,
    )
    apply_provider_client_headers(client, request_headers)
    create_kwargs, extra_body = split_generation_params(params)
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            stream=False,
            **create_kwargs,
            **({"extra_body": extra_body} if extra_body else {}),
        )
    except (APIConnectionError, APITimeoutError) as exc:
        return None, _transport_error_message(exc), None
    except APIStatusError as exc:
        return None, _status_error_message(exc), None
    finally:
        client.close()

    try:
        choices = completion.choices or []
        if not choices:
            return None, "Provider returned an empty completion result", None
        message = choices[0].message
        content = _extract_message_text(message.content)
        if not content:
            return None, "Provider returned an empty message", None
        reasoning = _extract_reasoning_from_extra(getattr(message, "model_extra", None))
        return content, None, reasoning or None
    except Exception as exc:  # noqa: BLE001 - 响应结构异常按错误处理
        return None, str(exc), None


def chat_completion_stream(
    base_url: str,
    api_key: str | None,
    messages: list[dict[str, Any]],
    params: dict[str, Any],
    *,
    model: str,
    proxy_url: str | None = None,
    timeout: float = DEFAULT_STREAM_TIMEOUT_SECONDS,
) -> Iterator[tuple[str, str]]:
    """流式对话生成器。

    yield ("chunk"|"reasoning", 增量文本)；return (full_text, error, full_reasoning)
    作为 StopIteration.value —— 与旧 urllib 实现契约一致。
    """
    request_headers = build_remote_request_headers(api_key, accept=STREAM_COMPLETION_ACCEPT)
    client = build_ai_provider_client(
        base_url,
        api_key,
        proxy_url=proxy_url,
        timeout=timeout,
        accept=STREAM_COMPLETION_ACCEPT,
    )
    apply_provider_client_headers(client, request_headers)
    create_kwargs, extra_body = split_generation_params(params)
    try:
        raw_stream = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            stream=True,
            **create_kwargs,
            **({"extra_body": extra_body} if extra_body else {}),
        )
    except (APIConnectionError, APITimeoutError) as exc:
        client.close()
        return (None, _transport_error_message(exc), None)  # type: ignore[return-value]
    except APIStatusError as exc:
        client.close()
        return (None, _status_error_message(exc), None)  # type: ignore[return-value]

    chunks: list[str] = []
    reasoning_chunks: list[str] = []
    try:
        for chunk in raw_stream:
            for choice in chunk.choices or []:
                delta = choice.delta
                content, reasoning = _extract_stream_delta_text(delta)
                if content:
                    chunks.append(content)
                    yield ("chunk", content)
                if reasoning:
                    reasoning_chunks.append(reasoning)
                    yield ("reasoning", reasoning)
    except (APIConnectionError, APITimeoutError) as exc:
        return (None, _transport_error_message(exc), None)  # type: ignore[return-value]
    except APIStatusError as exc:
        return (None, _status_error_message(exc), None)  # type: ignore[return-value]
    finally:
        client.close()

    full_text = "".join(chunks).strip()
    full_reasoning = "".join(reasoning_chunks).strip() or None
    if not full_text and not full_reasoning:
        return (None, "Provider returned an empty stream completion result", None)  # type: ignore[return-value]
    return (full_text, None, full_reasoning)  # type: ignore[return-value]


def list_models(
    base_url: str,
    api_key: str | None,
    *,
    proxy_url: str | None = None,
    timeout: float = DEFAULT_LIST_MODELS_TIMEOUT_SECONDS,
) -> tuple[list[str] | None, str | None, int | None, str | None]:
    """拉取模型列表。

    返回 (models, error, status_code, resolved_base_url)：
    - 成功：(去重排序后的模型 id 列表, None, None, 实际使用的 base_url)；
    - HTTP 错误：(None, 错误消息, HTTP 状态码, None)；
    - 网络错误：(None, 错误消息, None, None)。
    resolved_base_url 用于日志/回显「实际命中的地址」。
    """
    normalized = normalize_provider_base_url(base_url)
    request_headers = build_remote_request_headers(api_key, accept=DEFAULT_COMPLETION_ACCEPT)
    client = build_ai_provider_client(
        base_url,
        api_key,
        proxy_url=proxy_url,
        timeout=timeout,
        accept=DEFAULT_COMPLETION_ACCEPT,
    )
    apply_provider_client_headers(client, request_headers)
    try:
        page = client.models.list()
    except (APIConnectionError, APITimeoutError) as exc:
        return None, _transport_error_message(exc), None, None
    except APIStatusError as exc:
        status_code = getattr(exc, "status_code", None)
        if isinstance(exc, AuthenticationError):
            return None, "鉴权失败（HTTP 401）", status_code, None
        if isinstance(exc, NotFoundError):
            return None, "未找到模型列表接口（HTTP 404）", status_code, None
        return None, _status_error_message(exc), status_code, None
    finally:
        client.close()

    models: list[str] = []
    seen: set[str] = set()
    for item in page.data:
        model_id = str(getattr(item, "id", "") or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        models.append(model_id)
    return sorted(models, key=str.lower), None, None, normalized or None


__all__ = [
    "PROVIDER_MODE_CONFIGURED_PROXY",
    "PROVIDER_MODE_NO_PROXY",
    "apply_provider_client_headers",
    "chat_completion",
    "chat_completion_stream",
    "extract_provider_error_message",
    "list_models",
    "normalize_provider_base_url",
]
