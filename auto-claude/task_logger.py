"""
Task Logger
============

Persistent logging system for Auto Claude tasks.
Logs are organized by phase (planning, coding, validation) and stored in the spec directory.

Key features:
- Phase-based log organization (collapsible in UI)
- Streaming markers for real-time UI updates (similar to insights_runner.py)
- Persistent storage in JSON format for easy frontend consumption
- Tool usage tracking with start/end markers
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Literal
from dataclasses import dataclass, asdict
from enum import Enum


class LogPhase(str, Enum):
    """Log phases matching the execution flow."""
    PLANNING = "planning"
    CODING = "coding"
    VALIDATION = "validation"


class LogEntryType(str, Enum):
    """Types of log entries."""
    TEXT = "text"
    TOOL_START = "tool_start"
    TOOL_END = "tool_end"
    PHASE_START = "phase_start"
    PHASE_END = "phase_end"
    ERROR = "error"
    SUCCESS = "success"
    INFO = "info"


@dataclass
class LogEntry:
    """A single log entry."""
    timestamp: str
    type: str
    content: str
    phase: str
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None
    subtask_id: Optional[str] = None
    session: Optional[int] = None
    # New fields for expandable detail view
    detail: Optional[str] = None  # Full content that can be expanded (e.g., file contents, command output)
    subphase: Optional[str] = None  # Subphase grouping (e.g., "PROJECT DISCOVERY", "CONTEXT GATHERING")
    collapsed: Optional[bool] = None  # Whether to show collapsed by default in UI

    def to_dict(self) -> dict:
        """Convert to dictionary, excluding None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class PhaseLog:
    """Logs for a single phase."""
    phase: str
    status: str  # "pending", "active", "completed", "failed"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    entries: list = None

    def __post_init__(self):
        if self.entries is None:
            self.entries = []

    def to_dict(self) -> dict:
        return {
            "phase": self.phase,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "entries": self.entries
        }


class TaskLogger:
    """
    Logger for a specific task/spec.

    Handles persistent storage of logs and emits streaming markers
    for real-time UI updates.

    Usage:
        logger = TaskLogger(spec_dir)
        logger.start_phase(LogPhase.CODING)
        logger.log("Starting implementation...")
        logger.tool_start("Read", "/path/to/file.py")
        logger.tool_end("Read")
        logger.log("File read complete")
        logger.end_phase(LogPhase.CODING, success=True)
    """

    LOG_FILE = "task_logs.json"

    def __init__(self, spec_dir: Path, emit_markers: bool = True):
        """
        Initialize the task logger.

        Args:
            spec_dir: Path to the spec directory
            emit_markers: Whether to emit streaming markers to stdout
        """
        self.spec_dir = Path(spec_dir)
        self.log_file = self.spec_dir / self.LOG_FILE
        self.emit_markers = emit_markers
        self.current_phase: Optional[LogPhase] = None
        self.current_session: Optional[int] = None
        self.current_subtask: Optional[str] = None
        self._data: dict = self._load_or_create()

    def _load_or_create(self) -> dict:
        """Load existing logs or create new structure."""
        if self.log_file.exists():
            try:
                with open(self.log_file) as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass

        return {
            "spec_id": self.spec_dir.name,
            "created_at": self._timestamp(),
            "updated_at": self._timestamp(),
            "phases": {
                LogPhase.PLANNING.value: {
                    "phase": LogPhase.PLANNING.value,
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "entries": []
                },
                LogPhase.CODING.value: {
                    "phase": LogPhase.CODING.value,
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "entries": []
                },
                LogPhase.VALIDATION.value: {
                    "phase": LogPhase.VALIDATION.value,
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "entries": []
                }
            }
        }

    def _save(self):
        """Save logs to file."""
        self._data["updated_at"] = self._timestamp()
        try:
            self.spec_dir.mkdir(parents=True, exist_ok=True)
            with open(self.log_file, "w") as f:
                json.dump(self._data, f, indent=2)
        except IOError as e:
            print(f"Warning: Failed to save task logs: {e}", file=sys.stderr)

    def _timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    def _emit(self, marker_type: str, data: dict):
        """Emit a streaming marker to stdout for UI consumption."""
        if not self.emit_markers:
            return
        try:
            marker = f"__TASK_LOG_{marker_type.upper()}__:{json.dumps(data)}"
            print(marker, flush=True)
        except Exception:
            pass  # Don't let marker emission break logging

    def _add_entry(self, entry: LogEntry):
        """Add an entry to the current phase."""
        phase_key = entry.phase
        if phase_key not in self._data["phases"]:
            # Create phase if it doesn't exist
            self._data["phases"][phase_key] = {
                "phase": phase_key,
                "status": "active",
                "started_at": self._timestamp(),
                "completed_at": None,
                "entries": []
            }

        self._data["phases"][phase_key]["entries"].append(entry.to_dict())
        self._save()

    def set_session(self, session: int):
        """Set the current session number."""
        self.current_session = session

    def set_subtask(self, subtask_id: Optional[str]):
        """Set the current subtask being processed."""
        self.current_subtask = subtask_id

    def start_phase(self, phase: LogPhase, message: Optional[str] = None):
        """
        Start a new phase, auto-closing any stale active phases.

        This handles restart/recovery scenarios where a previous run was interrupted
        before properly closing a phase. When starting a new phase, any other phases
        that are still marked as "active" will be auto-closed.

        Args:
            phase: The phase to start
            message: Optional message to log at phase start
        """
        self.current_phase = phase
        phase_key = phase.value

        # Auto-close any other active phases (handles restart/recovery scenarios)
        for other_phase_key, phase_data in self._data["phases"].items():
            if other_phase_key != phase_key and phase_data.get("status") == "active":
                # Auto-close stale phase from previous interrupted run
                phase_data["status"] = "completed"
                phase_data["completed_at"] = self._timestamp()
                # Add a log entry noting the auto-close
                auto_close_entry = LogEntry(
                    timestamp=self._timestamp(),
                    type=LogEntryType.PHASE_END.value,
                    content=f"{other_phase_key} phase auto-closed on resume",
                    phase=other_phase_key,
                    session=self.current_session
                )
                self._data["phases"][other_phase_key]["entries"].append(auto_close_entry.to_dict())

        # Update phase status
        if phase_key in self._data["phases"]:
            self._data["phases"][phase_key]["status"] = "active"
            self._data["phases"][phase_key]["started_at"] = self._timestamp()

        # Emit marker for UI
        self._emit("PHASE_START", {
            "phase": phase_key,
            "timestamp": self._timestamp()
        })

        # Add phase start entry
        entry = LogEntry(
            timestamp=self._timestamp(),
            type=LogEntryType.PHASE_START.value,
            content=message or f"Starting {phase_key} phase",
            phase=phase_key,
            session=self.current_session
        )
        self._add_entry(entry)

        # Also print the message
        if message:
            print(message, flush=True)

    def end_phase(self, phase: LogPhase, success: bool = True, message: Optional[str] = None):
        """
        End a phase.

        Args:
            phase: The phase to end
            success: Whether the phase completed successfully
            message: Optional message to log at phase end
        """
        phase_key = phase.value

        # Update phase status
        if phase_key in self._data["phases"]:
            self._data["phases"][phase_key]["status"] = "completed" if success else "failed"
            self._data["phases"][phase_key]["completed_at"] = self._timestamp()

        # Emit marker for UI
        self._emit("PHASE_END", {
            "phase": phase_key,
            "success": success,
            "timestamp": self._timestamp()
        })

        # Add phase end entry
        entry = LogEntry(
            timestamp=self._timestamp(),
            type=LogEntryType.PHASE_END.value,
            content=message or f"{'Completed' if success else 'Failed'} {phase_key} phase",
            phase=phase_key,
            session=self.current_session
        )
        self._add_entry(entry)

        if message:
            print(message, flush=True)

        if phase == self.current_phase:
            self.current_phase = None

        self._save()

    def log(self, content: str, entry_type: LogEntryType = LogEntryType.TEXT, phase: Optional[LogPhase] = None, print_to_console: bool = True):
        """
        Log a message.

        Args:
            content: The message to log
            entry_type: Type of entry (text, error, success, info)
            phase: Optional phase override (uses current_phase if not specified)
            print_to_console: Whether to also print to stdout (default True)
        """
        phase_key = (phase or self.current_phase or LogPhase.CODING).value

        entry = LogEntry(
            timestamp=self._timestamp(),
            type=entry_type.value,
            content=content,
            phase=phase_key,
            subtask_id=self.current_subtask,
            session=self.current_session
        )
        self._add_entry(entry)

        # Emit streaming marker
        self._emit("TEXT", {
            "content": content,
            "phase": phase_key,
            "type": entry_type.value,
            "subtask_id": self.current_subtask,
            "timestamp": self._timestamp()
        })

        # Also print to console (unless caller handles printing)
        if print_to_console:
            print(content, flush=True)

    def log_error(self, content: str, phase: Optional[LogPhase] = None):
        """Log an error message."""
        self.log(content, LogEntryType.ERROR, phase)

    def log_success(self, content: str, phase: Optional[LogPhase] = None):
        """Log a success message."""
        self.log(content, LogEntryType.SUCCESS, phase)

    def log_info(self, content: str, phase: Optional[LogPhase] = None):
        """Log an info message."""
        self.log(content, LogEntryType.INFO, phase)

    def log_with_detail(
        self,
        content: str,
        detail: str,
        entry_type: LogEntryType = LogEntryType.TEXT,
        phase: Optional[LogPhase] = None,
        subphase: Optional[str] = None,
        collapsed: bool = True,
        print_to_console: bool = True
    ):
        """
        Log a message with expandable detail content.

        Args:
            content: Brief summary shown by default
            detail: Full content shown when expanded (e.g., file contents, command output)
            entry_type: Type of entry (text, error, success, info)
            phase: Optional phase override
            subphase: Optional subphase grouping (e.g., "PROJECT DISCOVERY")
            collapsed: Whether detail should be collapsed by default (default True)
            print_to_console: Whether to print summary to stdout (default True)
        """
        phase_key = (phase or self.current_phase or LogPhase.CODING).value

        entry = LogEntry(
            timestamp=self._timestamp(),
            type=entry_type.value,
            content=content,
            phase=phase_key,
            subtask_id=self.current_subtask,
            session=self.current_session,
            detail=detail,
            subphase=subphase,
            collapsed=collapsed
        )
        self._add_entry(entry)

        # Emit streaming marker with detail indicator
        self._emit("TEXT", {
            "content": content,
            "phase": phase_key,
            "type": entry_type.value,
            "subtask_id": self.current_subtask,
            "timestamp": self._timestamp(),
            "has_detail": True,
            "subphase": subphase
        })

        if print_to_console:
            print(content, flush=True)

    def start_subphase(self, subphase: str, phase: Optional[LogPhase] = None, print_to_console: bool = True):
        """
        Mark the start of a subphase within the current phase.

        Args:
            subphase: Name of the subphase (e.g., "PROJECT DISCOVERY", "CONTEXT GATHERING")
            phase: Optional phase override
            print_to_console: Whether to print to stdout
        """
        phase_key = (phase or self.current_phase or LogPhase.CODING).value

        entry = LogEntry(
            timestamp=self._timestamp(),
            type=LogEntryType.INFO.value,
            content=f"Starting {subphase}",
            phase=phase_key,
            subtask_id=self.current_subtask,
            session=self.current_session,
            subphase=subphase
        )
        self._add_entry(entry)

        # Emit streaming marker
        self._emit("SUBPHASE_START", {
            "subphase": subphase,
            "phase": phase_key,
            "timestamp": self._timestamp()
        })

        if print_to_console:
            print(f"\n--- {subphase} ---", flush=True)

    def tool_start(self, tool_name: str, tool_input: Optional[str] = None, phase: Optional[LogPhase] = None, print_to_console: bool = True):
        """
        Log the start of a tool execution.

        Args:
            tool_name: Name of the tool (e.g., "Read", "Write", "Bash")
            tool_input: Brief description of tool input
            phase: Optional phase override
            print_to_console: Whether to also print to stdout (default True)
        """
        phase_key = (phase or self.current_phase or LogPhase.CODING).value

        # Truncate long inputs for display
        display_input = tool_input
        if display_input and len(display_input) > 100:
            display_input = display_input[:97] + "..."

        entry = LogEntry(
            timestamp=self._timestamp(),
            type=LogEntryType.TOOL_START.value,
            content=f"[{tool_name}] {display_input or ''}".strip(),
            phase=phase_key,
            tool_name=tool_name,
            tool_input=display_input,
            subtask_id=self.current_subtask,
            session=self.current_session
        )
        self._add_entry(entry)

        # Emit streaming marker (same format as insights_runner.py)
        self._emit("TOOL_START", {
            "name": tool_name,
            "input": display_input,
            "phase": phase_key
        })

        if print_to_console:
            print(f"\n[Tool: {tool_name}]", flush=True)

    def tool_end(
        self,
        tool_name: str,
        success: bool = True,
        result: Optional[str] = None,
        detail: Optional[str] = None,
        phase: Optional[LogPhase] = None,
        print_to_console: bool = False
    ):
        """
        Log the end of a tool execution.

        Args:
            tool_name: Name of the tool
            success: Whether the tool succeeded
            result: Optional brief result description (shown in summary)
            detail: Optional full result content (expandable in UI, e.g., file contents, command output)
            phase: Optional phase override
            print_to_console: Whether to also print to stdout (default False for tool_end)
        """
        phase_key = (phase or self.current_phase or LogPhase.CODING).value

        # Truncate long results for display
        display_result = result
        if display_result and len(display_result) > 100:
            display_result = display_result[:97] + "..."

        status = "Done" if success else "Error"
        content = f"[{tool_name}] {status}"
        if display_result:
            content += f": {display_result}"

        # Truncate detail for storage (max 10KB to avoid bloating JSON)
        stored_detail = detail
        if stored_detail and len(stored_detail) > 10240:
            stored_detail = stored_detail[:10240] + "\n\n... [truncated - full output was {} chars]".format(len(detail))

        entry = LogEntry(
            timestamp=self._timestamp(),
            type=LogEntryType.TOOL_END.value,
            content=content,
            phase=phase_key,
            tool_name=tool_name,
            subtask_id=self.current_subtask,
            session=self.current_session,
            detail=stored_detail,
            collapsed=True
        )
        self._add_entry(entry)

        # Emit streaming marker
        self._emit("TOOL_END", {
            "name": tool_name,
            "success": success,
            "phase": phase_key,
            "has_detail": detail is not None
        })

        if print_to_console:
            if result:
                print(f"   [{status}] {display_result}", flush=True)
            else:
                print(f"   [{status}]", flush=True)

    def get_logs(self) -> dict:
        """Get all logs."""
        return self._data

    def get_phase_logs(self, phase: LogPhase) -> dict:
        """Get logs for a specific phase."""
        return self._data["phases"].get(phase.value, {})

    def clear(self):
        """Clear all logs (useful for testing)."""
        self._data = self._load_or_create()
        self._save()


def load_task_logs(spec_dir: Path) -> Optional[dict]:
    """
    Load task logs from a spec directory.

    Args:
        spec_dir: Path to the spec directory

    Returns:
        Logs dictionary or None if not found
    """
    log_file = spec_dir / TaskLogger.LOG_FILE
    if not log_file.exists():
        return None

    try:
        with open(log_file) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def get_active_phase(spec_dir: Path) -> Optional[str]:
    """
    Get the currently active phase for a spec.

    Args:
        spec_dir: Path to the spec directory

    Returns:
        Phase name or None if no active phase
    """
    logs = load_task_logs(spec_dir)
    if not logs:
        return None

    for phase_name, phase_data in logs.get("phases", {}).items():
        if phase_data.get("status") == "active":
            return phase_name

    return None


# Global logger instance for easy access
_current_logger: Optional[TaskLogger] = None


def get_task_logger(spec_dir: Optional[Path] = None, emit_markers: bool = True) -> Optional[TaskLogger]:
    """
    Get or create a task logger for the given spec directory.

    Args:
        spec_dir: Path to the spec directory (creates new logger if different from current)
        emit_markers: Whether to emit streaming markers

    Returns:
        TaskLogger instance or None if no spec_dir
    """
    global _current_logger

    if spec_dir is None:
        return _current_logger

    if _current_logger is None or _current_logger.spec_dir != spec_dir:
        _current_logger = TaskLogger(spec_dir, emit_markers)

    return _current_logger


def clear_task_logger():
    """Clear the global task logger."""
    global _current_logger
    _current_logger = None


def update_task_logger_path(new_spec_dir: Path):
    """
    Update the global task logger's spec directory after a rename.

    This should be called after renaming a spec directory to ensure
    the logger continues writing to the correct location.

    Args:
        new_spec_dir: The new path to the spec directory
    """
    global _current_logger

    if _current_logger is None:
        return

    # Update the logger's internal paths
    _current_logger.spec_dir = Path(new_spec_dir)
    _current_logger.log_file = _current_logger.spec_dir / TaskLogger.LOG_FILE

    # Update spec_id in the data
    _current_logger._data["spec_id"] = new_spec_dir.name

    # Save to the new location
    _current_logger._save()


class StreamingLogCapture:
    """
    Context manager to capture streaming output and log it.

    Usage:
        with StreamingLogCapture(logger, phase) as capture:
            # Run agent session
            async for msg in client.receive_response():
                capture.process_message(msg)
    """

    def __init__(self, logger: TaskLogger, phase: Optional[LogPhase] = None):
        self.logger = logger
        self.phase = phase
        self.current_tool: Optional[str] = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # End any active tool
        if self.current_tool:
            self.logger.tool_end(self.current_tool, success=exc_type is None, phase=self.phase)
            self.current_tool = None
        return False

    def process_text(self, text: str):
        """Process text output from the agent."""
        if text.strip():
            self.logger.log(text, phase=self.phase)

    def process_tool_start(self, tool_name: str, tool_input: Optional[str] = None):
        """Process tool start."""
        # End previous tool if any
        if self.current_tool:
            self.logger.tool_end(self.current_tool, success=True, phase=self.phase)

        self.current_tool = tool_name
        self.logger.tool_start(tool_name, tool_input, phase=self.phase)

    def process_tool_end(self, tool_name: str, success: bool = True, result: Optional[str] = None, detail: Optional[str] = None):
        """Process tool end."""
        self.logger.tool_end(tool_name, success, result, detail=detail, phase=self.phase)
        if self.current_tool == tool_name:
            self.current_tool = None

    def process_message(self, msg, verbose: bool = False, capture_detail: bool = True):
        """
        Process a message from the Claude SDK stream.

        Args:
            msg: Message from client.receive_response()
            verbose: Whether to show detailed tool results
            capture_detail: Whether to capture full tool output for expandable detail view
        """
        msg_type = type(msg).__name__

        if msg_type == "AssistantMessage" and hasattr(msg, "content"):
            for block in msg.content:
                block_type = type(block).__name__

                if block_type == "TextBlock" and hasattr(block, "text"):
                    # Text is already logged by the agent session
                    pass
                elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                    tool_input = None
                    if hasattr(block, "input") and block.input:
                        inp = block.input
                        if isinstance(inp, dict):
                            # Extract meaningful input description
                            if "pattern" in inp:
                                tool_input = f"pattern: {inp['pattern']}"
                            elif "file_path" in inp:
                                fp = inp["file_path"]
                                if len(fp) > 50:
                                    fp = "..." + fp[-47:]
                                tool_input = fp
                            elif "command" in inp:
                                cmd = inp["command"]
                                if len(cmd) > 50:
                                    cmd = cmd[:47] + "..."
                                tool_input = cmd
                            elif "path" in inp:
                                tool_input = inp["path"]
                    self.process_tool_start(block.name, tool_input)

        elif msg_type == "UserMessage" and hasattr(msg, "content"):
            for block in msg.content:
                block_type = type(block).__name__

                if block_type == "ToolResultBlock":
                    is_error = getattr(block, "is_error", False)
                    result_content = getattr(block, "content", "")

                    if self.current_tool:
                        result_str = None
                        if verbose and result_content:
                            result_str = str(result_content)[:100]

                        # Capture full detail for expandable view
                        detail_content = None
                        if capture_detail and self.current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                            full_result = str(result_content)
                            if len(full_result) < 50000:  # 50KB max
                                detail_content = full_result

                        self.process_tool_end(self.current_tool, success=not is_error, result=result_str, detail=detail_content)
