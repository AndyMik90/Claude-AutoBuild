"""
Terminal Capability Detection
==============================

Detects terminal capabilities for:
- Unicode support
- ANSI color support
- Interactive input support
"""

import io
import os
import sys


def configure_safe_encoding() -> None:
    """
    Configure stdout/stderr to handle Unicode safely on Windows.

    On Windows, the default console encoding (cp1252) can't display many
    Unicode characters. This function forces UTF-8 encoding with 'replace'
    error handling, so unrenderable characters are replaced with '?' instead
    of raising exceptions.

    This handles both:
    1. Regular console output (reconfigure method)
    2. Piped output from subprocess (TextIOWrapper replacement)
    """
    if sys.platform != "win32":
        return

    # Method 1: Try reconfigure (works for TTY)
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
                continue
            except (AttributeError, io.UnsupportedOperation, OSError):
                pass

        # Method 2: Wrap with TextIOWrapper for piped output
        # This is needed when stdout/stderr are pipes (e.g., from Electron)
        try:
            if hasattr(stream, "buffer"):
                new_stream = io.TextIOWrapper(
                    stream.buffer,
                    encoding="utf-8",
                    errors="replace",
                    line_buffering=True,
                )
                setattr(sys, stream_name, new_stream)
        except (AttributeError, io.UnsupportedOperation, OSError):
            pass


# Configure safe encoding on module import
configure_safe_encoding()


def _is_fancy_ui_enabled() -> bool:
    """Check if fancy UI is enabled via environment variable."""
    value = os.environ.get("ENABLE_FANCY_UI", "true").lower()
    return value in ("true", "1", "yes", "on")


def supports_unicode() -> bool:
    """Check if terminal supports Unicode."""
    if not _is_fancy_ui_enabled():
        return False
    encoding = getattr(sys.stdout, "encoding", "") or ""
    return encoding.lower() in ("utf-8", "utf8")


def supports_color() -> bool:
    """Check if terminal supports ANSI colors."""
    if not _is_fancy_ui_enabled():
        return False
    # Check for explicit disable
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    # Check if stdout is a TTY
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    # Check TERM
    term = os.environ.get("TERM", "")
    if term == "dumb":
        return False
    return True


def supports_interactive() -> bool:
    """Check if terminal supports interactive input."""
    if not _is_fancy_ui_enabled():
        return False
    return hasattr(sys.stdin, "isatty") and sys.stdin.isatty()


# Cache capability checks
FANCY_UI = _is_fancy_ui_enabled()
UNICODE = supports_unicode()
COLOR = supports_color()
INTERACTIVE = supports_interactive()
