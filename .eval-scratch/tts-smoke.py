# -*- coding: utf-8 -*-
"""验证 edge-tts 可用性：合成一句中文并保存 mp3。"""
import asyncio
import sys
from pathlib import Path

import edge_tts

OUT = Path(__file__).resolve().parent / "tts-smoke-output.mp3"


async def main() -> int:
    communicate = edge_tts.Communicate("你好，同学，这是一句朗读测试。", "zh-CN-XiaoxiaoNeural")
    await communicate.save(str(OUT))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
