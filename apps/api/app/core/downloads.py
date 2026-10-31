"""下载相关的通用工具。

`build_content_disposition` 原先在 drives / staff / profiles / peer_reviews / submissions
五个 endpoint 里各有一份实现，行为略有差异（fallback 名称不同）。这里合并为一份，
通过 `fallback` 参数保留各处原有的 fallback 语义。
"""

from urllib.parse import quote


def build_content_disposition(
    filename: str,
    disposition: str = "attachment",
    fallback: str | None = None,
) -> str:
    """构造 Content-Disposition 头。

    - `fallback` 为 None 时：ASCII 化后为空则保留原扩展名，回退为 `attachment<ext>`。
    - `fallback` 给定字符串时：ASCII 化后为空则回退为该字符串（与原各处实现一致）。
    """
    encoded_name = quote(filename)
    fallback_name = filename.encode("ascii", "ignore").decode("ascii").strip()

    if not fallback_name:
        if fallback is None:
            suffix = ""
            if "." in filename:
                suffix = f".{filename.rsplit('.', 1)[1]}"
            fallback_name = f"attachment{suffix}"
        else:
            fallback_name = fallback

    return f'{disposition}; filename="{fallback_name}"; filename*=UTF-8\'\'{encoded_name}'
