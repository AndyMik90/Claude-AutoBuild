"""
Interactive Menu
=================

Interactive selection menus with keyboard navigation.
"""

import sys
from dataclasses import dataclass

# Platform-specific imports for raw character input
try:
    import termios
    import tty

    _HAS_TERMIOS = True
except ImportError:
    _HAS_TERMIOS = False

try:
    import msvcrt

    _HAS_MSVCRT = True
except ImportError:
    _HAS_MSVCRT = False

from .boxes import box, divider
from .capabilities import INTERACTIVE
from .colors import bold, highlight, muted
from .icons import Icons, icon


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
    if _HAS_MSVCRT:
        # Windows implementation
        ch = msvcrt.getch()
        # Handle special keys (arrow keys return two bytes)
        if ch in (b"\x00", b"\xe0"):
            ch2 = msvcrt.getch()
            if ch2 == b"H":
                return "UP"
            elif ch2 == b"P":
                return "DOWN"
            elif ch2 == b"M":
                return "RIGHT"
            elif ch2 == b"K":
                return "LEFT"
            return ""
        return ch.decode("utf-8", errors="replace")
    elif _HAS_TERMIOS:
        # Unix implementation
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(sys.stdin.fileno())
            ch = sys.stdin.read(1)
            # Handle escape sequences (arrow keys)
            if ch == "\x1b":
                ch2 = sys.stdin.read(1)
                if ch2 == "[":
                    ch3 = sys.stdin.read(1)
                    if ch3 == "A":
                        return "UP"
                    elif ch3 == "B":
                        return "DOWN"
                    elif ch3 == "C":
                        return "RIGHT"
                    elif ch3 == "D":
                        return "LEFT"
            return ch
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    else:
        # No raw input available, raise to trigger fallback
        raise RuntimeError("No raw input method available")


def select_menu(
    title: str,
    options: list[MenuOption],
    subtitle: str = "",
    allow_quit: bool = True,
) -> str | None:
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
    if not INTERACTIVE:
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
        nav_hint = muted(
            f"{icon(Icons.ARROW_UP)}{icon(Icons.ARROW_DOWN)} Navigate  Enter Select"
        )
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

        if key == "UP" or key == "k":
            # Find previous valid option
            current_idx = (
                valid_options.index(selected) if selected in valid_options else 0
            )
            if current_idx > 0:
                selected = valid_options[current_idx - 1]
                render()

        elif key == "DOWN" or key == "j":
            # Find next valid option
            current_idx = (
                valid_options.index(selected) if selected in valid_options else 0
            )
            if current_idx < len(valid_options) - 1:
                selected = valid_options[current_idx + 1]
                render()

        elif key == "\r" or key == "\n":
            # Enter - select current option
            return options[selected].key

        elif key == "q" and allow_quit:
            return None

        elif key in "123456789":
            # Number key - direct selection
            idx = int(key) - 1
            if idx < len(options) and not options[idx].disabled:
                return options[idx].key


def _fallback_menu(
    title: str,
    options: list[MenuOption],
    subtitle: str = "",
    allow_quit: bool = True,
) -> str | None:
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
        print("  [q] Quit")

    print()

    while True:
        try:
            choice = input("Your choice: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return None

        if choice == "q" and allow_quit:
            return None

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(options) and not options[idx].disabled:
                return options[idx].key
        except ValueError:
            pass

        print("Invalid choice, please try again.")
