"""ai_provider_client（openai SDK 调用层）单元测试。

不触网：通过 monkeypatch 替换 OpenAI 客户端的 chat.completions.create /
models.list，验证服务层的错误映射与生成器契约。
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.services import ai_provider_client

MESSAGES = [{"role": "user", "content": "你好"}]
PARAMS = {"temperature": 0.4, "thinking": {"type": "disabled"}}


class _FakeResponse:
    def __init__(self, text: str = "", status_code: int = 500):
        self.text = text
        self.status_code = status_code
        self.request = None  # openai 3.x 异常构造会读 response.request
        self.headers = {}


def _make_status_error(status_code: int, body: str) -> APIStatusError:
    response = _FakeResponse(text=body, status_code=status_code)
    exc = APIStatusError(
        f"Error code: {status_code}",
        response=response,
        body=body,
    )
    exc.status_code = status_code
    return exc


def _make_connection_error() -> APIConnectionError:
    return APIConnectionError(request=None)  # type: ignore[arg-type]


class _FakeCompletionMessage:
    def __init__(self, content, model_extra=None):
        self.content = content
        self.model_extra = model_extra or {}


class _FakeCompletionChoice:
    def __init__(self, message):
        self.message = message


class _FakeCompletion:
    def __init__(self, content, reasoning=None):
        extra = {"reasoning_content": reasoning} if reasoning else {}
        self.choices = [_FakeCompletionChoice(_FakeCompletionMessage(content, extra))]


class _FakeStreamChunkDelta:
    def __init__(self, content="", reasoning=""):
        self.content = content or None
        self.model_extra = {"reasoning_content": reasoning} if reasoning else {}


class _FakeStreamChunkChoice:
    def __init__(self, delta):
        self.delta = delta


class _FakeStreamChunk:
    def __init__(self, content="", reasoning=""):
        self.choices = [_FakeStreamChunkChoice(_FakeStreamChunkDelta(content, reasoning))]


class _FakeModel:
    def __init__(self, model_id):
        self.id = model_id


class _FakeModelPage:
    def __init__(self, ids):
        self.data = [_FakeModel(i) for i in ids]


def _patch_create(monkeypatch, result_or_exc):
    calls = {}

    def fake_create(**kwargs):
        calls["kwargs"] = kwargs
        if isinstance(result_or_exc, Exception):
            raise result_or_exc
        return result_or_exc

    def fake_client_factory(*args, **kwargs):
        client = object.__new__(ai_provider_client.OpenAI)
        client.chat = type("Chat", (), {})()
        client.chat.completions = type("Completions", (), {})()
        client.chat.completions.create = staticmethod(fake_create)
        client.models = type("Models", (), {})()
        client.models.list = staticmethod(lambda: (_ for _ in ()).throw(result_or_exc) if isinstance(result_or_exc, Exception) else _FakeModelPage([]))
        client.close = lambda: None
        return client

    monkeypatch.setattr(ai_provider_client, "build_ai_provider_client", fake_client_factory)
    return calls


def test_chat_completion_success_with_reasoning(monkeypatch):
    calls = _patch_create(monkeypatch, _FakeCompletion("你好，同学", reasoning="先想一想"))
    content, error, reasoning = ai_provider_client.chat_completion(
        "https://api.example.com/v1",
        "sk-test",
        MESSAGES,
        PARAMS,
        model="gpt-4o-mini",
    )
    assert content == "你好，同学"
    assert error is None
    assert reasoning == "先想一想"
    kwargs = calls["kwargs"]
    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["stream"] is False
    assert kwargs["temperature"] == 0.4
    # 非标准 thinking 参数走 extra_body 透传
    assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}


def test_chat_completion_maps_status_error(monkeypatch):
    exc = _make_status_error(401, '{"error": {"message": "bad key"}}')
    _patch_create(monkeypatch, exc)
    content, error, reasoning = ai_provider_client.chat_completion(
        "https://api.example.com/v1",
        "sk-bad",
        MESSAGES,
        PARAMS,
        model="m",
    )
    assert content is None
    assert error == "bad key"
    assert reasoning is None


def test_chat_completion_maps_connection_error(monkeypatch):
    _patch_create(monkeypatch, _make_connection_error())
    content, error, reasoning = ai_provider_client.chat_completion(
        "https://api.example.com/v1",
        None,
        MESSAGES,
        PARAMS,
        model="m",
    )
    assert content is None
    assert error
    assert reasoning is None


def test_chat_completion_empty_choices(monkeypatch):
    completion = _FakeCompletion("x")
    completion.choices = []
    _patch_create(monkeypatch, completion)
    content, error, reasoning = ai_provider_client.chat_completion(
        "https://api.example.com/v1", None, MESSAGES, PARAMS, model="m"
    )
    assert content is None
    assert "empty completion" in error


def test_stream_generator_yields_and_returns(monkeypatch):
    chunks = [_FakeStreamChunk("你好"), _FakeStreamChunk("", reasoning="思考"), _FakeStreamChunk("，世界")]
    _patch_create(monkeypatch, iter(chunks))
    stream = ai_provider_client.chat_completion_stream(
        "https://api.example.com/v1",
        "sk-test",
        MESSAGES,
        PARAMS,
        model="m",
    )
    events = []
    while True:
        try:
            events.append(next(stream))
        except StopIteration as stop:
            final = stop.value
            break
    assert ("chunk", "你好") in events
    assert ("reasoning", "思考") in events
    assert ("chunk", "，世界") in events
    full_text, error, full_reasoning = final
    assert full_text == "你好，世界"
    assert error is None
    assert full_reasoning == "思考"


def test_stream_generator_returns_error_without_yielding(monkeypatch):
    exc = _make_status_error(429, '{"error": {"message": "rate limited"}}')
    _patch_create(monkeypatch, exc)
    stream = ai_provider_client.chat_completion_stream(
        "https://api.example.com/v1", None, MESSAGES, PARAMS, model="m"
    )
    with pytest.raises(StopIteration) as stop_info:
        next(stream)
    full_text, error, full_reasoning = stop_info.value.value
    assert full_text is None
    assert error == "rate limited"
    assert full_reasoning is None


def test_list_models_success(monkeypatch):
    def fake_client_factory(*args, **kwargs):
        client = object.__new__(ai_provider_client.OpenAI)
        client.models = type("Models", (), {})()
        client.models.list = staticmethod(lambda: _FakeModelPage(["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o-mini"]))
        client.close = lambda: None
        return client

    monkeypatch.setattr(ai_provider_client, "build_ai_provider_client", fake_client_factory)
    models, error, status_code, resolved = ai_provider_client.list_models(
        "https://api.example.com/v1/models", "sk-test"
    )
    assert models == ["gpt-4.1-mini", "gpt-4o-mini"]  # 去重
    assert error is None
    assert status_code is None
    assert resolved == "https://api.example.com/v1"


def test_list_models_http_error(monkeypatch):
    exc = _make_status_error(404, "not found")

    def fake_client_factory(*args, **kwargs):
        client = object.__new__(ai_provider_client.OpenAI)
        client.models = type("Models", (), {})()

        def raise_it():
            raise exc

        client.models.list = staticmethod(raise_it)
        client.close = lambda: None
        return client

    monkeypatch.setattr(ai_provider_client, "build_ai_provider_client", fake_client_factory)
    models, error, status_code, resolved = ai_provider_client.list_models(
        "https://api.example.com/v1", "sk-test"
    )
    assert models is None
    assert status_code == 404
    assert error


def test_normalize_provider_base_url_variants():
    assert ai_provider_client.normalize_provider_base_url("https://x.com/v1/") == "https://x.com/v1"
    assert (
        ai_provider_client.normalize_provider_base_url("https://x.com/v1/chat/completions")
        == "https://x.com/v1"
    )
    assert ai_provider_client.normalize_provider_base_url("https://x.com/v1/models") == "https://x.com/v1"
    assert ai_provider_client.normalize_provider_base_url("") == ""
