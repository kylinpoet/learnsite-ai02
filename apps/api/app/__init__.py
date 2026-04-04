"""LearnSite API package."""

from __future__ import annotations

import os
import platform
import sys


if sys.platform.startswith("win"):
    _fallback_machine = (
        os.environ.get("PROCESSOR_ARCHITEW6432")
        or os.environ.get("PROCESSOR_ARCHITECTURE")
        or "AMD64"
    )

    def _fast_machine() -> str:
        return _fallback_machine

    # Some Windows Python environments block for a very long time inside
    # platform.machine() -> platform.uname() -> WMI. SQLAlchemy imports this
    # during module initialization, so we short-circuit to environment values
    # to keep local startup and tests responsive.
    platform.machine = _fast_machine
