"""
UI Utilities for Auto-Build
===========================

Provides:
- Icons and symbols with fallback support
- Color output using ANSI codes
- Interactive selection menus
- Progress indicators (bars, spinners)
- Status file management for ccstatusline
"""

import json
import os
import sys
import tty
import termios
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Callable


# =============================================================================
# Capability Detection
# =============================================================================

def _is_fancy_ui_enabled() -> bool:
    """Check if fancy UI is enabled via environment variable."""
    value = os.environ.get('ENABLE_FANCY_UI', 'true').lower()
    return value in ('true', '1', 'yes', 'on')


def supports_unicode() -> bool:
    """Check if terminal supports Unicode."""
    if not _is_fancy_ui_enabled():
        return False
    encoding = getattr(sys.stdout, 'encoding', '') or ''
    return encoding.lower() in ('utf-8', 'utf8')


def supports_color() -> bool:
    """Check if terminal supports ANSI colors."""
    if not _is_fancy_ui_enabled():
        return False
    # Check for explicit disable
    if os.environ.get('NO_COLOR'):
        return False
    if os.environ.get('FORCE_COLOR'):
        return True
    # Check if stdout is a TTY
    if not hasattr(sys.stdout, 'isatty') or not sys.stdout.isatty():
        return False
    # Check TERM
    term = os.environ.get('TERM', '')
    if term == 'dumb':
        return False
    return True


def supports_interactive() -> bool:
    """Check if terminal supports interactive input."""
    if not _is_fancy_ui_enabled():
        return False
    return hasattr(sys.stdin, 'isatty') and sys.stdin.isatty()


# Cache capability checks
_FANCY_UI = _is_fancy_ui_enabled()
_UNICODE = supports_unicode()
_COLOR = supports_color()
_INTERACTIVE = supports_interactive()


# =============================================================================
# Icons
# =============================================================================

class Icons:
    """Icon definitions with Unicode and ASCII fallbacks."""

    # Status icons
    SUCCESS = ("✓", "[OK]")
    ERROR = ("✗", "[X]")
    WARNING = ("⚠", "[!]")
    INFO = ("ℹ", "[i]")
    PENDING = ("○", "[ ]")
    IN_PROGRESS = ("◐", "[.]")
    COMPLETE = ("●", "[*]")
    BLOCKED = ("⊘", "[B]")

    # Action icons
    PLAY = ("▶", ">")
    PAUSE = ("⏸", "||")
    STOP = ("⏹", "[]")
    SKIP = ("⏭", ">>")

    # Navigation
    ARROW_RIGHT = ("→", "->")
    ARROW_DOWN = ("↓", "v")
    ARROW_UP = ("↑", "^")
    POINTER = ("❯", ">")
    BULLET = ("•", "*")

    # Objects
    FOLDER = ("📁", "[D]")
    FILE = ("📄", "[F]")
    GEAR = ("⚙", "[*]")
    SEARCH = ("🔍", "[?]")
    BRANCH = ("", "[B]")
    COMMIT = ("◉", "(@)")
    LIGHTNING = ("⚡", "!")

    # Progress
    SUBTASK = ("▣", "#")
    PHASE = ("◆", "*")
    WORKER = ("⚡", "W")
    SESSION = ("▸", ">")

    # Menu
    EDIT = ("✏️", "[E]")
    CLIPBOARD = ("📋", "[C]")
    DOCUMENT = ("📄", "[D]")
    DOOR = ("🚪", "[Q]")
    SHIELD = ("🛡️", "[S]")

    # Box drawing (always ASCII fallback for compatibility)
    BOX_TL = ("╔", "+")
    BOX_TR = ("╗", "+")
    BOX_BL = ("╚", "+")
    BOX_BR = ("╝", "+")
    BOX_H = ("═", "-")
    BOX_V = ("║", "|")
    BOX_ML = ("╠", "+")
    BOX_MR = ("╣", "+")
    BOX_TL_LIGHT = ("┌", "+")
    BOX_TR_LIGHT = ("┐", "+")
    BOX_BL_LIGHT = ("└", "+")
    BOX_BR_LIGHT = ("┘", "+")
    BOX_H_LIGHT = ("─", "-")
    BOX_V_LIGHT = ("│", "|")
    BOX_ML_LIGHT = ("├", "+")
    BOX_MR_LIGHT = ("┤", "+")

    # Progress bar
    BAR_FULL = ("█", "=")
    BAR_EMPTY = ("░", "-")
    BAR_HALF = ("▌", "=")


def icon(icon_tuple: tuple[str, str]) -> str:
    """Get the appropriate icon based on terminal capabilities."""
    return icon_tuple[0] if _UNICODE else icon_tuple[1]


# =============================================================================
# Colors
# =============================================================================

class Color:
    """ANSI color codes."""

    # Basic colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    # Bright colors
    BRIGHT_BLACK = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

    # Styles
    BOLD = "\033[1m"
    DIM = "\033[2m"
    ITALIC = "\033[3m"
    UNDERLINE = "\033[4m"
    RESET = "\033[0m"

    # Semantic colors
    SUCCESS = BRIGHT_GREEN
    ERROR = BRIGHT_RED
    WARNING = BRIGHT_YELLOW
    INFO = BRIGHT_BLUE
    MUTED = BRIGHT_BLACK
    HIGHLIGHT = BRIGHT_CYAN
    ACCENT = BRIGHT_MAGENTA


def color(text: str, *styles: str) -> str:
    """Apply color/style to text if supported."""
    if not _COLOR or not styles:
        return text
    return "".join(styles) + text + Color.RESET


def success(text: str) -> str:
    """Green success text."""
    return color(text, Color.SUCCESS)


def error(text: str) -> str:
    """Red error text."""
    return color(text, Color.ERROR)


def warning(text: str) -> str:
    """Yellow warning text."""
    return color(text, Color.WARNING)


def info(text: str) -> str:
    """Blue info text."""
    return color(text, Color.INFO)


def muted(text: str) -> str:
    """Gray muted text."""
    return color(text, Color.MUTED)


def highlight(text: str) -> str:
    """Cyan highlighted text."""
    return color(text, Color.HIGHLIGHT)


def bold(text: str) -> str:
    """Bold text."""
    return color(text, Color.BOLD)


# =============================================================================
# Box Drawing
# =============================================================================

def box(
    content: str | list[str],
    title: str = "",
    width: int = 70,
    style: str = "heavy",
    title_align: str = "left",
) -> str:
    """
    Draw a box around content.

    Args:
        content: Text or lines of text to put in the box (string or list)
        title: Optional title for the top of the box
        width: Total width of the box
        style: "heavy" (double lines) or "light" (single lines)
        title_align: "left", "center", or "right"

    Returns:
        Formatted box as string
    """
    import re

    # Normalize content to list of strings
    if isinstance(content, str):
        content = content.split('\n')

    # Plain text fallback when fancy UI is disabled
    if not _FANCY_UI:
        lines = []
        separator = "=" * width if style == "heavy" else "-" * width
        lines.append(separator)
        if title:
            lines.append(f"  {title}")
            lines.append(separator)
        for line in content:
            # Strip ANSI codes for plain output
            plain_line = re.sub(r'\033\[[0-9;]*m', '', line)
            lines.append(f"  {plain_line}")
        lines.append(separator)
        return "\n".join(lines)

    if style == "heavy":
        tl, tr, bl, br = Icons.BOX_TL, Icons.BOX_TR, Icons.BOX_BL, Icons.BOX_BR
        h, v = Icons.BOX_H, Icons.BOX_V
        ml, mr = Icons.BOX_ML, Icons.BOX_MR
    else:
        tl, tr, bl, br = Icons.BOX_TL_LIGHT, Icons.BOX_TR_LIGHT, Icons.BOX_BL_LIGHT, Icons.BOX_BR_LIGHT
        h, v = Icons.BOX_H_LIGHT, Icons.BOX_V_LIGHT
        ml, mr = Icons.BOX_ML_LIGHT, Icons.BOX_MR_LIGHT

    tl, tr, bl, br = icon(tl), icon(tr), icon(bl), icon(br)
    h, v = icon(h), icon(v)
    ml, mr = icon(ml), icon(mr)

    inner_width = width - 2  # Account for side borders
    lines = []

    # Top border with optional title
    if title:
        # Calculate visible length (strip ANSI codes for length calculation)
        visible_title = re.sub(r'\033\[[0-9;]*m', '', title)
        title_len = len(visible_title)
        padding = inner_width - title_len - 2  # -2 for spaces around title

        if title_align == "center":
            left_pad = padding // 2
            right_pad = padding - left_pad
            top_line = tl + h * left_pad + " " + title + " " + h * right_pad + tr
        elif title_align == "right":
            top_line = tl + h * padding + " " + title + " " + tr
        else:  # left
            top_line = tl + " " + title + " " + h * padding + tr

        lines.append(top_line)
    else:
        lines.append(tl + h * inner_width + tr)

    # Content lines
    for line in content:
        # Strip ANSI for length calculation
        visible_line = re.sub(r'\033\[[0-9;]*m', '', line)
        padding = inner_width - len(visible_line) - 2  # -2 for padding spaces
        if padding < 0:
            # Truncate if too long
            line = line[:inner_width - 5] + "..."
            padding = 0
        lines.append(v + " " + line + " " * (padding + 1) + v)

    # Bottom border
    lines.append(bl + h * inner_width + br)

    return "\n".join(lines)


def divider(width: int = 70, style: str = "heavy", char: str = None) -> str:
    """Draw a horizontal divider line."""
    if char:
        return char * width
    if style == "heavy":
        return icon(Icons.BOX_H) * width
    return icon(Icons.BOX_H_LIGHT) * width


# =============================================================================
# Progress Bar
# =============================================================================

def progress_bar(
    current: int,
    total: int,
    width: int = 40,
    show_percent: bool = True,
    show_count: bool = True,
    color_gradient: bool = True,
) -> str:
    """
    Create a colored progress bar.

    Args:
        current: Current progress value
        total: Total/maximum value
        width: Width of the bar (not including labels)
        show_percent: Show percentage at end
        show_count: Show current/total count
        color_gradient: Color bar based on progress

    Returns:
        Formatted progress bar string
    """
    if total == 0:
        percent = 0
        filled = 0
    else:
        percent = current / total
        filled = int(width * percent)

    full = icon(Icons.BAR_FULL)
    empty = icon(Icons.BAR_EMPTY)

    bar = full * filled + empty * (width - filled)

    # Apply color based on progress
    if color_gradient and _COLOR:
        if percent >= 1.0:
            bar = success(bar)
        elif percent >= 0.5:
            bar = info(bar)
        elif percent > 0:
            bar = warning(bar)
        else:
            bar = muted(bar)

    parts = [f"[{bar}]"]

    if show_count:
        parts.append(f"{current}/{total}")

    if show_percent:
        parts.append(f"({percent:.0%})")

    return " ".join(parts)


# =============================================================================
# Interactive Menu
# =============================================================================

@dataclass
class MenuOption:
    """A menu option."""
    key: str
    label: str
    icon: tuple[str, str] = None
    description: str = ""
    disabled: bool = False


def _getch() -> str:
    """Read a single character from stdin without echo."""
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
        # Handle escape sequences (arrow keys)
        if ch == '\x1b':
            ch2 = sys.stdin.read(1)
            if ch2 == '[':
                ch3 = sys.stdin.read(1)
                if ch3 == 'A':
                    return 'UP'
                elif ch3 == 'B':
                    return 'DOWN'
                elif ch3 == 'C':
                    return 'RIGHT'
                elif ch3 == 'D':
                    return 'LEFT'
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def select_menu(
    title: str,
    options: list[MenuOption],
    subtitle: str = "",
    allow_quit: bool = True,
) -> Optional[str]:
    """
    Display an interactive selection menu.

    Args:
        title: Menu title
        options: List of MenuOption objects
        subtitle: Optional subtitle text
        allow_quit: Whether 'q' quits the menu

    Returns:
        Selected option key, or None if quit
    """
    if not _INTERACTIVE:
        # Fallback to simple numbered input
        return _fallback_menu(title, options, subtitle, allow_quit)

    selected = 0
    valid_options = [i for i, o in enumerate(options) if not o.disabled]
    if not valid_options:
        print("No valid options available")
        return None

    # Find first non-disabled option
    selected = valid_options[0]

    def render():
        # Clear screen area (move up and clear)
        # Account for: options + description for selected + title block (2) + nav block (2) + box borders (2) + subtitle block (2 if present)
        lines_to_clear = len(options) + 7 + (2 if subtitle else 0)
        sys.stdout.write(f"\033[{lines_to_clear}A\033[J")

        # Build content
        content = []
        if subtitle:
            content.append(muted(subtitle))
            content.append("")

        content.append(bold(title))
        content.append("")

        for i, opt in enumerate(options):
            prefix = icon(Icons.POINTER) + " " if i == selected else "  "
            opt_icon = icon(opt.icon) + " " if opt.icon else ""

            if opt.disabled:
                line = muted(f"{prefix}{opt_icon}{opt.label}")
            elif i == selected:
                line = highlight(f"{prefix}{opt_icon}{opt.label}")
            else:
                line = f"{prefix}{opt_icon}{opt.label}"

            content.append(line)

            if opt.description and i == selected:
                content.append(muted(f"      {opt.description}"))

        content.append("")
        nav_hint = muted(f"{icon(Icons.ARROW_UP)}{icon(Icons.ARROW_DOWN)} Navigate  Enter Select")
        if allow_quit:
            nav_hint += muted("  q Quit")
        content.append(nav_hint)

        print(box(content, style="light", width=70))

    # Initial render (add blank lines first)
    lines_needed = len(options) + 7 + (2 if subtitle else 0)
    print("\n" * lines_needed)
    render()

    while True:
        try:
            key = _getch()
        except Exception:
            # Fallback if getch fails
            return _fallback_menu(title, options, subtitle, allow_quit)

        if key == 'UP' or key == 'k':
            # Find previous valid option
            current_idx = valid_options.index(selected) if selected in valid_options else 0
            if current_idx > 0:
                selected = valid_options[current_idx - 1]
                render()

        elif key == 'DOWN' or key == 'j':
            # Find next valid option
            current_idx = valid_options.index(selected) if selected in valid_options else 0
            if current_idx < len(valid_options) - 1:
                selected = valid_options[current_idx + 1]
                render()

        elif key == '\r' or key == '\n':
            # Enter - select current option
            return options[selected].key

        elif key == 'q' and allow_quit:
            return None

        elif key in '123456789':
            # Number key - direct selection
            idx = int(key) - 1
            if idx < len(options) and not options[idx].disabled:
                return options[idx].key


def _fallback_menu(
    title: str,
    options: list[MenuOption],
    subtitle: str = "",
    allow_quit: bool = True,
) -> Optional[str]:
    """Fallback menu using simple numbered input."""
    print()
    print(divider())
    print(f"  {title}")
    if subtitle:
        print(f"  {subtitle}")
    print(divider())
    print()

    for i, opt in enumerate(options, 1):
        opt_icon = icon(opt.icon) + " " if opt.icon else ""
        status = " (disabled)" if opt.disabled else ""
        print(f"  [{i}] {opt_icon}{opt.label}{status}")
        if opt.description:
            print(f"      {opt.description}")

    if allow_quit:
        print(f"  [q] Quit")

    print()

    while True:
        try:
            choice = input("Your choice: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return None

        if choice == 'q' and allow_quit:
            return None

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options) and not options[idx].disabled:
                return options[idx].key
        except ValueError:
            pass

        print("Invalid choice, please try again.")


# =============================================================================
# Status File Management (for ccstatusline)
# =============================================================================

class BuildState(Enum):
    """Build state enumeration."""
    IDLE = "idle"
    PLANNING = "planning"
    BUILDING = "building"
    QA = "qa"
    COMPLETE = "complete"
    PAUSED = "paused"
    ERROR = "error"


@dataclass
class BuildStatus:
    """Current build status for status line display."""
    active: bool = False
    spec: str = ""
    state: BuildState = BuildState.IDLE
    subtasks_completed: int = 0
    subtasks_total: int = 0
    subtasks_in_progress: int = 0
    subtasks_failed: int = 0
    phase_current: str = ""
    phase_id: int = 0
    phase_total: int = 0
    workers_active: int = 0
    workers_max: int = 1
    session_number: int = 0
    session_started: str = ""
    last_update: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "active": self.active,
            "spec": self.spec,
            "state": self.state.value,
            "subtasks": {
                "completed": self.subtasks_completed,
                "total": self.subtasks_total,
                "in_progress": self.subtasks_in_progress,
                "failed": self.subtasks_failed,
            },
            "phase": {
                "current": self.phase_current,
                "id": self.phase_id,
                "total": self.phase_total,
            },
            "workers": {
                "active": self.workers_active,
                "max": self.workers_max,
            },
            "session": {
                "number": self.session_number,
                "started_at": self.session_started,
            },
            "last_update": self.last_update or datetime.now().isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BuildStatus":
        """Create from dictionary."""
        subtasks = data.get("subtasks", {})
        phase = data.get("phase", {})
        workers = data.get("workers", {})
        session = data.get("session", {})

        return cls(
            active=data.get("active", False),
            spec=data.get("spec", ""),
            state=BuildState(data.get("state", "idle")),
            subtasks_completed=subtasks.get("completed", 0),
            subtasks_total=subtasks.get("total", 0),
            subtasks_in_progress=subtasks.get("in_progress", 0),
            subtasks_failed=subtasks.get("failed", 0),
            phase_current=phase.get("current", ""),
            phase_id=phase.get("id", 0),
            phase_total=phase.get("total", 0),
            workers_active=workers.get("active", 0),
            workers_max=workers.get("max", 1),
            session_number=session.get("number", 0),
            session_started=session.get("started_at", ""),
            last_update=data.get("last_update", ""),
        )


class StatusManager:
    """Manages the .auto-claude-status file for ccstatusline integration."""

    def __init__(self, project_dir: Path):
        self.project_dir = Path(project_dir)
        self.status_file = self.project_dir / ".auto-claude-status"
        self._status = BuildStatus()

    def read(self) -> BuildStatus:
        """Read current status from file."""
        if not self.status_file.exists():
            return BuildStatus()

        try:
            with open(self.status_file) as f:
                data = json.load(f)
            self._status = BuildStatus.from_dict(data)
            return self._status
        except (json.JSONDecodeError, IOError):
            return BuildStatus()

    def write(self, status: BuildStatus = None) -> None:
        """Write status to file."""
        if status:
            self._status = status
        self._status.last_update = datetime.now().isoformat()

        try:
            with open(self.status_file, "w") as f:
                json.dump(self._status.to_dict(), f, indent=2)
        except IOError as e:
            print(warning(f"Could not write status file: {e}"))

    def update(self, **kwargs) -> None:
        """Update specific status fields."""
        for key, value in kwargs.items():
            if hasattr(self._status, key):
                setattr(self._status, key, value)
        self.write()

    def set_active(self, spec: str, state: BuildState) -> None:
        """Mark build as active."""
        self._status.active = True
        self._status.spec = spec
        self._status.state = state
        self._status.session_started = datetime.now().isoformat()
        self.write()

    def set_inactive(self) -> None:
        """Mark build as inactive."""
        self._status.active = False
        self._status.state = BuildState.IDLE
        self.write()

    def update_subtasks(
        self,
        completed: int = None,
        total: int = None,
        in_progress: int = None,
        failed: int = None,
    ) -> None:
        """Update subtask progress."""
        if completed is not None:
            self._status.subtasks_completed = completed
        if total is not None:
            self._status.subtasks_total = total
        if in_progress is not None:
            self._status.subtasks_in_progress = in_progress
        if failed is not None:
            self._status.subtasks_failed = failed
        self.write()

    def update_phase(self, current: str, phase_id: int = 0, total: int = 0) -> None:
        """Update current phase."""
        self._status.phase_current = current
        self._status.phase_id = phase_id
        self._status.phase_total = total
        self.write()

    def update_workers(self, active: int, max_workers: int = None) -> None:
        """Update worker count."""
        self._status.workers_active = active
        if max_workers is not None:
            self._status.workers_max = max_workers
        self.write()

    def update_session(self, number: int) -> None:
        """Update session number."""
        self._status.session_number = number
        self.write()

    def clear(self) -> None:
        """Remove status file."""
        if self.status_file.exists():
            try:
                self.status_file.unlink()
            except IOError:
                pass


# =============================================================================
# Formatted Output Helpers
# =============================================================================

def print_header(
    title: str,
    subtitle: str = "",
    icon_tuple: tuple[str, str] = None,
    width: int = 70,
) -> None:
    """Print a formatted header."""
    icon_str = icon(icon_tuple) + " " if icon_tuple else ""

    content = [bold(f"{icon_str}{title}")]
    if subtitle:
        content.append(muted(subtitle))

    print(box(content, width=width, style="heavy"))


def print_section(
    title: str,
    icon_tuple: tuple[str, str] = None,
    width: int = 70,
) -> None:
    """Print a section header."""
    icon_str = icon(icon_tuple) + " " if icon_tuple else ""
    print()
    print(box([bold(f"{icon_str}{title}")], width=width, style="light"))


def print_status(
    message: str,
    status: str = "info",
    icon_tuple: tuple[str, str] = None,
) -> None:
    """Print a status message with icon."""
    if icon_tuple is None:
        icon_tuple = {
            "success": Icons.SUCCESS,
            "error": Icons.ERROR,
            "warning": Icons.WARNING,
            "info": Icons.INFO,
            "pending": Icons.PENDING,
            "progress": Icons.IN_PROGRESS,
        }.get(status, Icons.INFO)

    color_fn = {
        "success": success,
        "error": error,
        "warning": warning,
        "info": info,
        "pending": muted,
        "progress": highlight,
    }.get(status, lambda x: x)

    print(f"{icon(icon_tuple)} {color_fn(message)}")


def print_key_value(key: str, value: str, indent: int = 2) -> None:
    """Print a key-value pair."""
    spaces = " " * indent
    print(f"{spaces}{muted(key + ':')} {value}")


def print_phase_status(
    name: str,
    completed: int,
    total: int,
    status: str = "pending",
) -> None:
    """Print a phase status line."""
    icon_tuple = {
        "complete": Icons.SUCCESS,
        "in_progress": Icons.IN_PROGRESS,
        "pending": Icons.PENDING,
        "blocked": Icons.BLOCKED,
    }.get(status, Icons.PENDING)

    color_fn = {
        "complete": success,
        "in_progress": highlight,
        "pending": lambda x: x,
        "blocked": muted,
    }.get(status, lambda x: x)

    print(f"  {icon(icon_tuple)} {color_fn(name)}: {completed}/{total}")


# =============================================================================
# Spinner (for long operations)
# =============================================================================

class Spinner:
    """Simple spinner for long operations."""

    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] if _UNICODE else ["|", "/", "-", "\\"]

    def __init__(self, message: str = ""):
        self.message = message
        self.frame = 0
        self._running = False

    def start(self) -> None:
        """Start the spinner."""
        self._running = True
        self._render()

    def stop(self, final_message: str = "", status: str = "success") -> None:
        """Stop the spinner with optional final message."""
        self._running = False
        # Clear the line
        sys.stdout.write("\r\033[K")
        if final_message:
            print_status(final_message, status)

    def update(self, message: str = None) -> None:
        """Update spinner message and advance frame."""
        if message:
            self.message = message
        self.frame = (self.frame + 1) % len(self.FRAMES)
        self._render()

    def _render(self) -> None:
        """Render current spinner state."""
        frame_char = self.FRAMES[self.frame]
        if _COLOR:
            frame_char = highlight(frame_char)
        sys.stdout.write(f"\r{frame_char} {self.message}")
        sys.stdout.flush()
