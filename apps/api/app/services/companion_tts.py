"""AI 学伴朗读（Edge TTS）服务。

用 edge-tts（微软 Edge 在线语音）把学伴回复文本合成为 MP3：
- 同步入口 synthesize_speech：内部用 asyncio.run 驱动 edge_tts（端点层是同步 def）；
- 进程内 LRU 缓存（文本+音色 -> mp3 bytes），避免同一段回复重复合成；
- 文本长度上限与音色白名单在此统一收口，端点层只做参数校验。

设计假设（无既有规格）：朗读面向学生/学伴场景，音色默认 zh-CN-XiaoxiaoNeural；
edge-tts 需要联网访问微软服务，离线或被墙时返回明确错误文案。
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from typing import Final

import edge_tts

logger = logging.getLogger(__name__)

DEFAULT_TTS_VOICE: Final[str] = "zh-CN-XiaoxiaoNeural"
ALLOWED_TTS_VOICES: Final[frozenset[str]] = frozenset(
    {
        "zh-CN-XiaoxiaoNeural",
        "zh-CN-YunxiNeural",
        "zh-CN-YunyangNeural",
        "zh-CN-XiaoyiNeural",
    }
)
MAX_TTS_TEXT_LENGTH: Final[int] = 600
TTS_CACHE_MAX_ENTRIES: Final[int] = 64

_TTS_CACHE: OrderedDict[tuple[str, str], bytes] = OrderedDict()


class CompanionTtsError(RuntimeError):
    """朗读合成失败（网络不可用 / 服务拒绝 / 文本为空等）。"""


def _cache_key(text: str, voice: str) -> tuple[str, str]:
    return (voice, text.strip())


def _cache_get(text: str, voice: str) -> bytes | None:
    key = _cache_key(text, voice)
    if key in _TTS_CACHE:
        _TTS_CACHE.move_to_end(key)
        return _TTS_CACHE[key]
    return None


def _cache_put(text: str, voice: str, audio: bytes) -> None:
    key = _cache_key(text, voice)
    _TTS_CACHE[key] = audio
    _TTS_CACHE.move_to_end(key)
    while len(_TTS_CACHE) > TTS_CACHE_MAX_ENTRIES:
        _TTS_CACHE.popitem(last=False)


async def _synthesize(text: str, voice: str) -> bytes:
    chunks: list[bytes] = []
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            data = chunk.get("data")
            if isinstance(data, bytes) and data:
                chunks.append(data)
    if not chunks:
        raise CompanionTtsError("朗读服务未返回音频，请稍后重试")
    return b"".join(chunks)


def synthesize_speech(text: str, *, voice: str | None = None) -> bytes:
    """把文本合成为 MP3 音频字节。

    - 空文本 / 超长文本 -> CompanionTtsError（端点层转 400）；
    - 网络失败 / 服务异常 -> CompanionTtsError（端点层转 502，附人类可读原因）。
    """
    normalized = (text or "").strip()
    if not normalized:
        raise CompanionTtsError("朗读内容为空")
    if len(normalized) > MAX_TTS_TEXT_LENGTH:
        raise CompanionTtsError(f"朗读内容过长（最多 {MAX_TTS_TEXT_LENGTH} 字）")

    actual_voice = voice or DEFAULT_TTS_VOICE
    if actual_voice not in ALLOWED_TTS_VOICES:
        raise CompanionTtsError("不支持的朗读音色")

    cached = _cache_get(normalized, actual_voice)
    if cached is not None:
        return cached

    try:
        audio = asyncio.run(_synthesize(normalized, actual_voice))
    except CompanionTtsError:
        raise
    except Exception as exc:  # noqa: BLE001 - edge-tts 各类网络/协议异常统一转译
        logger.warning("[COMPANION_TTS] synthesize_failed voice=%s error=%s", actual_voice, exc)
        raise CompanionTtsError("朗读服务暂不可用，请检查网络后重试") from exc

    _cache_put(normalized, actual_voice, audio)
    return audio


__all__ = [
    "ALLOWED_TTS_VOICES",
    "CompanionTtsError",
    "DEFAULT_TTS_VOICE",
    "MAX_TTS_TEXT_LENGTH",
    "synthesize_speech",
]
