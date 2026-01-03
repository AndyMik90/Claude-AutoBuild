"""
Tests for Task Logger Utilities
================================

Tests for task_logger/utils.py - global logger management functions.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))


class TestGetTaskLogger:
    """Tests for get_task_logger function."""

    def test_returns_none_without_spec_dir(self):
        """Returns None when no spec_dir provided and no current logger."""
        from task_logger.utils import clear_task_logger, get_task_logger

        clear_task_logger()
        result = get_task_logger()
        assert result is None

    def test_creates_logger_with_spec_dir(self, temp_dir: Path):
        """Creates new logger when spec_dir provided."""
        from task_logger.utils import clear_task_logger, get_task_logger

        clear_task_logger()
        logger = get_task_logger(temp_dir, emit_markers=False)

        assert logger is not None
        assert logger.spec_dir == temp_dir

    def test_returns_existing_logger_for_same_dir(self, temp_dir: Path):
        """Returns same logger instance for same directory."""
        from task_logger.utils import clear_task_logger, get_task_logger

        clear_task_logger()
        logger1 = get_task_logger(temp_dir, emit_markers=False)
        logger2 = get_task_logger(temp_dir, emit_markers=False)

        assert logger1 is logger2

    def test_creates_new_logger_for_different_dir(self, temp_dir: Path):
        """Creates new logger when directory changes."""
        from task_logger.utils import clear_task_logger, get_task_logger

        clear_task_logger()
        dir1 = temp_dir / "spec1"
        dir2 = temp_dir / "spec2"
        dir1.mkdir()
        dir2.mkdir()

        logger1 = get_task_logger(dir1, emit_markers=False)
        logger2 = get_task_logger(dir2, emit_markers=False)

        assert logger1 is not logger2
        assert logger2.spec_dir == dir2

    def test_returns_current_logger_without_spec_dir(self, temp_dir: Path):
        """Returns current logger when called without spec_dir."""
        from task_logger.utils import clear_task_logger, get_task_logger

        clear_task_logger()
        logger1 = get_task_logger(temp_dir, emit_markers=False)
        logger2 = get_task_logger()  # No spec_dir

        assert logger1 is logger2


class TestClearTaskLogger:
    """Tests for clear_task_logger function."""

    def test_clears_global_logger(self, temp_dir: Path):
        """Clears the global logger instance."""
        from task_logger.utils import clear_task_logger, get_task_logger

        get_task_logger(temp_dir, emit_markers=False)
        clear_task_logger()

        assert get_task_logger() is None

    def test_clear_when_no_logger(self):
        """Clearing when no logger exists does not error."""
        from task_logger.utils import clear_task_logger

        clear_task_logger()
        clear_task_logger()  # Should not raise


class TestUpdateTaskLoggerPath:
    """Tests for update_task_logger_path function."""

    def test_updates_logger_path(self, temp_dir: Path):
        """Updates the logger's spec_dir after rename."""
        from task_logger.utils import (
            clear_task_logger,
            get_task_logger,
            update_task_logger_path,
        )

        clear_task_logger()
        old_dir = temp_dir / "001-pending"
        new_dir = temp_dir / "001-feature"
        old_dir.mkdir()
        new_dir.mkdir()

        logger = get_task_logger(old_dir, emit_markers=False)
        update_task_logger_path(new_dir)

        assert logger.spec_dir == new_dir

    def test_update_when_no_logger(self, temp_dir: Path):
        """Updating when no logger exists does not error."""
        from task_logger.utils import clear_task_logger, update_task_logger_path

        clear_task_logger()
        update_task_logger_path(temp_dir)  # Should not raise
