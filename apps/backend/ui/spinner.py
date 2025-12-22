"""
Spinner
========

Simple spinner for long-running operations.
"""

import sys

from .capabilities import UNICODE
from .colors import highlight
from .formatters import print_status


class Spinner:
    """Simple spinner for long operations."""

    FRAMES = (
        ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        if UNICODE
        else ["|", "/", "-", "\\"]
    )

    def __init__(self, message: str = ""):
        """
        Initialize spinner.

        Args:
            message: Initial message to display
        """
        self.message = message
        self.frame = 0
        self._running = False

    def start(self) -> None:
        """Start the spinner."""
        self._running = True
        self._render()

    def stop(self, final_message: str = "", status: str = "success") -> None:
        """
        Stop the spinner with optional final message.

        Args:
            final_message: Message to display after stopping
            status: Status type for the final message
        """
        self._running = False
        # Clear the line
        sys.stdout.write("\r\033[K")
        if final_message:
            print_status(final_message, status)

    def update(self, message: str = None) -> None:
        """
        Update spinner message and advance frame.

        Args:
            message: Optional new message to display
        """
        if message:
            self.message = message
        self.frame = (self.frame + 1) % len(self.FRAMES)
        self._render()

    def _render(self) -> None:
        """Render current spinner state."""
        frame_char = self.FRAMES[self.frame]
        from .capabilities import COLOR

        if COLOR:
            frame_char = highlight(frame_char)
        sys.stdout.write(f"\r{frame_char} {self.message}")
        sys.stdout.flush()
