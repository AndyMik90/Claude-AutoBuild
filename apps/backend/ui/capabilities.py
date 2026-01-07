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


def enable_windows_ansi_support() -> bool:
    """
    Enable ANSI escape sequence support on Windows.

    Windows 10 (build 10586+) supports ANSI escape sequences natively,
    but they must be explicitly enabled via the Windows API.

    Returns:
        True if ANSI support was enabled, False otherwise
    """
    if sys.platform != "win32":
        return True  # Non-Windows always has ANSI support

    try:
        import ctypes
        from ctypes import wintypes

        # Windows constants
        STD_OUTPUT_HANDLE = -11
        STD_ERROR_HANDLE = -12
        ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004

        kernel32 = ctypes.windll.kernel32

        # Get handles
        for handle_id in (STD_OUTPUT_HANDLE, STD_ERROR_HANDLE):
            handle = kernel32.GetStdHandle(handle_id)
            if handle == -1:
                continue

            # Get current console mode
            mode = wintypes.DWORD()
            if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                continue

            # Enable ANSI support if not already enabled
            if not (mode.value & ENABLE_VIRTUAL_TERMINAL_PROCESSING):
                kernel32.SetConsoleMode(
                    handle, mode.value | ENABLE_VIRTUAL_TERMINAL_PROCESSING
                )

        return True
    except (ImportError, AttributeError, OSError):
        # Fall back to colorama if available
        try:
            import colorama

            colorama.init()
            return True
        except ImportError:
            pass

        return False


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


# Configure safe encoding and ANSI support on module import
configure_safe_encoding()
WINDOWS_ANSI_ENABLED = enable_windows_ansi_support()


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
