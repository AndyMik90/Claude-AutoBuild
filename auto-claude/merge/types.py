"""
Merge System Types
==================

Core data structures for the intent-aware merge system.

These types represent the semantic understanding of code changes,
enabling intelligent conflict detection and resolution.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class ChangeType(Enum):
    """
    Semantic classification of code changes.

    These represent WHAT changed at a semantic level, not line-level diffs.
    The merge system uses these to determine compatibility between changes.
    """

    # Import changes
    ADD_IMPORT = "add_import"
    REMOVE_IMPORT = "remove_import"
    MODIFY_IMPORT = "modify_import"

    # Function/method changes
    ADD_FUNCTION = "add_function"
    REMOVE_FUNCTION = "remove_function"
    MODIFY_FUNCTION = "modify_function"
    RENAME_FUNCTION = "rename_function"

    # React/JSX specific
    ADD_HOOK_CALL = "add_hook_call"
    REMOVE_HOOK_CALL = "remove_hook_call"
    WRAP_JSX = "wrap_jsx"
    UNWRAP_JSX = "unwrap_jsx"
    ADD_JSX_ELEMENT = "add_jsx_element"
    MODIFY_JSX_PROPS = "modify_jsx_props"

    # Variable/constant changes
    ADD_VARIABLE = "add_variable"
    REMOVE_VARIABLE = "remove_variable"
    MODIFY_VARIABLE = "modify_variable"
    ADD_CONSTANT = "add_constant"

    # Class changes
    ADD_CLASS = "add_class"
    REMOVE_CLASS = "remove_class"
    MODIFY_CLASS = "modify_class"
    ADD_METHOD = "add_method"
    REMOVE_METHOD = "remove_method"
    MODIFY_METHOD = "modify_method"
    ADD_PROPERTY = "add_property"

    # Type changes (TypeScript)
    ADD_TYPE = "add_type"
    MODIFY_TYPE = "modify_type"
    ADD_INTERFACE = "add_interface"
    MODIFY_INTERFACE = "modify_interface"

    # Python specific
    ADD_DECORATOR = "add_decorator"
    REMOVE_DECORATOR = "remove_decorator"

    # Generic
    ADD_COMMENT = "add_comment"
    MODIFY_COMMENT = "modify_comment"
    FORMATTING_ONLY = "formatting_only"
    UNKNOWN = "unknown"


class ConflictSeverity(Enum):
    """
    Severity levels for detected conflicts.

    Determines how the conflict should be handled:
    - NONE: No conflict, can auto-merge
    - LOW: Minor overlap, likely auto-mergeable with rules
    - MEDIUM: Significant overlap, may need AI assistance
    - HIGH: Major conflict, likely needs human review
    - CRITICAL: Incompatible changes, definitely needs human review
    """

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MergeStrategy(Enum):
    """
    Strategies for merging compatible changes.

    Each strategy is implemented in AutoMerger as a deterministic algorithm.
    """

    # Import strategies
    COMBINE_IMPORTS = "combine_imports"

    # Function body strategies
    HOOKS_FIRST = "hooks_first"  # Add hooks at function start, then other changes
    HOOKS_THEN_WRAP = "hooks_then_wrap"  # Hooks first, then JSX wrapping
    APPEND_STATEMENTS = "append_statements"  # Add statements in order

    # Structural strategies
    APPEND_FUNCTIONS = "append_functions"  # Add new functions after existing
    APPEND_METHODS = "append_methods"  # Add new methods to class
    COMBINE_PROPS = "combine_props"  # Merge JSX/object props

    # Ordering strategies
    ORDER_BY_DEPENDENCY = "order_by_dependency"  # Analyze deps and order
    ORDER_BY_TIME = "order_by_time"  # Apply in chronological order

    # Fallback
    AI_REQUIRED = "ai_required"  # Cannot auto-merge, need AI
    HUMAN_REQUIRED = "human_required"  # Cannot auto-merge, need human


class MergeDecision(Enum):
    """
    Decision outcomes from the merge system.
    """

    AUTO_MERGED = "auto_merged"  # Python handled it, no AI
    AI_MERGED = "ai_merged"  # AI resolved the conflict
    NEEDS_HUMAN_REVIEW = "needs_human_review"  # Flagged for human
    FAILED = "failed"  # Could not merge


@dataclass
class SemanticChange:
    """
    A single semantic change within a file.

    This represents one logical modification (e.g., "added useAuth hook")
    rather than a line-level diff.

    Attributes:
        change_type: The semantic classification of the change
        target: What was changed (function name, import path, etc.)
        location: Where in the file (file_top, function:App, class:User)
        line_start: Starting line number (1-indexed)
        line_end: Ending line number (1-indexed)
        content_before: The code before the change (for modifications)
        content_after: The code after the change
        metadata: Additional context (dependency info, etc.)
    """

    change_type: ChangeType
    target: str
    location: str
    line_start: int
    line_end: int
    content_before: str | None = None
    content_after: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "change_type": self.change_type.value,
            "target": self.target,
            "location": self.location,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "content_before": self.content_before,
            "content_after": self.content_after,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SemanticChange:
        """Create from dictionary."""
        return cls(
            change_type=ChangeType(data["change_type"]),
            target=data["target"],
            location=data["location"],
            line_start=data["line_start"],
            line_end=data["line_end"],
            content_before=data.get("content_before"),
            content_after=data.get("content_after"),
            metadata=data.get("metadata", {}),
        )

    def overlaps_with(self, other: SemanticChange) -> bool:
        """Check if this change overlaps with another in location."""
        # Same location means potential conflict
        if self.location == other.location:
            return True

        # Check line overlap
        if self.line_end >= other.line_start and other.line_end >= self.line_start:
            return True

        return False

    @property
    def is_additive(self) -> bool:
        """Check if this is a purely additive change."""
        additive_types = {
            ChangeType.ADD_IMPORT,
            ChangeType.ADD_FUNCTION,
            ChangeType.ADD_HOOK_CALL,
            ChangeType.ADD_VARIABLE,
            ChangeType.ADD_CONSTANT,
            ChangeType.ADD_CLASS,
            ChangeType.ADD_METHOD,
            ChangeType.ADD_PROPERTY,
            ChangeType.ADD_TYPE,
            ChangeType.ADD_INTERFACE,
            ChangeType.ADD_DECORATOR,
            ChangeType.ADD_JSX_ELEMENT,
            ChangeType.ADD_COMMENT,
        }
        return self.change_type in additive_types


@dataclass
class FileAnalysis:
    """
    Complete semantic analysis of changes to a single file.

    This aggregates all semantic changes and provides summary statistics
    useful for conflict detection.

    Attributes:
        file_path: Path to the analyzed file (relative to project root)
        changes: List of semantic changes detected
        functions_modified: Set of function/method names that were changed
        functions_added: Set of new functions/methods
        imports_added: Set of new imports
        imports_removed: Set of removed imports
        classes_modified: Set of modified class names
        total_lines_changed: Approximate lines affected
    """

    file_path: str
    changes: list[SemanticChange] = field(default_factory=list)
    functions_modified: set[str] = field(default_factory=set)
    functions_added: set[str] = field(default_factory=set)
    imports_added: set[str] = field(default_factory=set)
    imports_removed: set[str] = field(default_factory=set)
    classes_modified: set[str] = field(default_factory=set)
    total_lines_changed: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "file_path": self.file_path,
            "changes": [c.to_dict() for c in self.changes],
            "functions_modified": list(self.functions_modified),
            "functions_added": list(self.functions_added),
            "imports_added": list(self.imports_added),
            "imports_removed": list(self.imports_removed),
            "classes_modified": list(self.classes_modified),
            "total_lines_changed": self.total_lines_changed,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FileAnalysis:
        """Create from dictionary."""
        return cls(
            file_path=data["file_path"],
            changes=[SemanticChange.from_dict(c) for c in data.get("changes", [])],
            functions_modified=set(data.get("functions_modified", [])),
            functions_added=set(data.get("functions_added", [])),
            imports_added=set(data.get("imports_added", [])),
            imports_removed=set(data.get("imports_removed", [])),
            classes_modified=set(data.get("classes_modified", [])),
            total_lines_changed=data.get("total_lines_changed", 0),
        )

    def get_changes_at_location(self, location: str) -> list[SemanticChange]:
        """Get all changes at a specific location."""
        return [c for c in self.changes if c.location == location]

    @property
    def is_additive_only(self) -> bool:
        """Check if all changes are purely additive."""
        return all(c.is_additive for c in self.changes)

    @property
    def locations_changed(self) -> set[str]:
        """Get all unique locations that were changed."""
        return {c.location for c in self.changes}


@dataclass
class ConflictRegion:
    """
    A detected conflict between multiple task changes.

    This represents a region where two or more tasks made changes
    that may not be automatically compatible.

    Attributes:
        file_path: The file containing the conflict
        location: The specific location (e.g., "function:App")
        tasks_involved: List of task IDs that modified this location
        change_types: The types of changes from each task
        severity: How serious the conflict is
        can_auto_merge: Whether Python rules can handle this
        merge_strategy: If auto-mergeable, which strategy to use
        reason: Human-readable explanation of the conflict
    """

    file_path: str
    location: str
    tasks_involved: list[str]
    change_types: list[ChangeType]
    severity: ConflictSeverity
    can_auto_merge: bool
    merge_strategy: MergeStrategy | None = None
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "file_path": self.file_path,
            "location": self.location,
            "tasks_involved": self.tasks_involved,
            "change_types": [ct.value for ct in self.change_types],
            "severity": self.severity.value,
            "can_auto_merge": self.can_auto_merge,
            "merge_strategy": self.merge_strategy.value
            if self.merge_strategy
            else None,
            "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConflictRegion:
        """Create from dictionary."""
        return cls(
            file_path=data["file_path"],
            location=data["location"],
            tasks_involved=data["tasks_involved"],
            change_types=[ChangeType(ct) for ct in data["change_types"]],
            severity=ConflictSeverity(data["severity"]),
            can_auto_merge=data["can_auto_merge"],
            merge_strategy=MergeStrategy(data["merge_strategy"])
            if data.get("merge_strategy")
            else None,
            reason=data.get("reason", ""),
        )


@dataclass
class TaskSnapshot:
    """
    A snapshot of a task's changes to a file.

    This captures what a single task did to a file, including
    the semantic understanding of its changes and intent.

    Attributes:
        task_id: The task identifier
        task_intent: One-sentence description of what the task intended
        started_at: When the task started working on this file
        completed_at: When the task finished
        content_hash_before: Hash of file content when task started
        content_hash_after: Hash of file content when task finished
        semantic_changes: List of semantic changes made
        raw_diff: Optional raw unified diff for reference
    """

    task_id: str
    task_intent: str
    started_at: datetime
    completed_at: datetime | None = None
    content_hash_before: str = ""
    content_hash_after: str = ""
    semantic_changes: list[SemanticChange] = field(default_factory=list)
    raw_diff: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "task_id": self.task_id,
            "task_intent": self.task_intent,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat()
            if self.completed_at
            else None,
            "content_hash_before": self.content_hash_before,
            "content_hash_after": self.content_hash_after,
            "semantic_changes": [c.to_dict() for c in self.semantic_changes],
            "raw_diff": self.raw_diff,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TaskSnapshot:
        """Create from dictionary."""
        return cls(
            task_id=data["task_id"],
            task_intent=data["task_intent"],
            started_at=datetime.fromisoformat(data["started_at"]),
            completed_at=datetime.fromisoformat(data["completed_at"])
            if data.get("completed_at")
            else None,
            content_hash_before=data.get("content_hash_before", ""),
            content_hash_after=data.get("content_hash_after", ""),
            semantic_changes=[
                SemanticChange.from_dict(c) for c in data.get("semantic_changes", [])
            ],
            raw_diff=data.get("raw_diff"),
        )


@dataclass
class FileEvolution:
    """
    Complete evolution history of a single file.

    Tracks the baseline state and all task modifications,
    enabling intelligent merge decisions with full context.

    Attributes:
        file_path: Path to the file (relative to project root)
        baseline_commit: Git commit hash of the baseline
        baseline_captured_at: When the baseline was captured
        baseline_content_hash: Hash of baseline content
        baseline_snapshot_path: Path to stored baseline content
        task_snapshots: Ordered list of task modifications
    """

    file_path: str
    baseline_commit: str
    baseline_captured_at: datetime
    baseline_content_hash: str
    baseline_snapshot_path: str
    task_snapshots: list[TaskSnapshot] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "file_path": self.file_path,
            "baseline_commit": self.baseline_commit,
            "baseline_captured_at": self.baseline_captured_at.isoformat(),
            "baseline_content_hash": self.baseline_content_hash,
            "baseline_snapshot_path": self.baseline_snapshot_path,
            "task_snapshots": [ts.to_dict() for ts in self.task_snapshots],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FileEvolution:
        """Create from dictionary."""
        return cls(
            file_path=data["file_path"],
            baseline_commit=data["baseline_commit"],
            baseline_captured_at=datetime.fromisoformat(data["baseline_captured_at"]),
            baseline_content_hash=data["baseline_content_hash"],
            baseline_snapshot_path=data["baseline_snapshot_path"],
            task_snapshots=[
                TaskSnapshot.from_dict(ts) for ts in data.get("task_snapshots", [])
            ],
        )

    def get_task_snapshot(self, task_id: str) -> TaskSnapshot | None:
        """Get a specific task's snapshot."""
        for snapshot in self.task_snapshots:
            if snapshot.task_id == task_id:
                return snapshot
        return None

    def add_task_snapshot(self, snapshot: TaskSnapshot) -> None:
        """Add or update a task snapshot."""
        # Remove existing snapshot for this task if present
        self.task_snapshots = [
            ts for ts in self.task_snapshots if ts.task_id != snapshot.task_id
        ]
        self.task_snapshots.append(snapshot)
        # Keep sorted by start time
        self.task_snapshots.sort(key=lambda ts: ts.started_at)

    @property
    def tasks_involved(self) -> list[str]:
        """Get list of task IDs that modified this file."""
        return [ts.task_id for ts in self.task_snapshots]


@dataclass
class MergeResult:
    """
    Result of a merge operation.

    Contains the outcome, merged content, and detailed information
    about how the merge was performed.

    Attributes:
        decision: The merge decision outcome
        file_path: Path to the merged file
        merged_content: The final merged content (if successful)
        conflicts_resolved: List of conflicts that were resolved
        conflicts_remaining: List of conflicts needing human review
        ai_calls_made: Number of AI calls required
        tokens_used: Approximate tokens used for AI calls
        explanation: Human-readable explanation of what was done
        error: Error message if merge failed
    """

    decision: MergeDecision
    file_path: str
    merged_content: str | None = None
    conflicts_resolved: list[ConflictRegion] = field(default_factory=list)
    conflicts_remaining: list[ConflictRegion] = field(default_factory=list)
    ai_calls_made: int = 0
    tokens_used: int = 0
    explanation: str = ""
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "decision": self.decision.value,
            "file_path": self.file_path,
            "merged_content": self.merged_content,
            "conflicts_resolved": [c.to_dict() for c in self.conflicts_resolved],
            "conflicts_remaining": [c.to_dict() for c in self.conflicts_remaining],
            "ai_calls_made": self.ai_calls_made,
            "tokens_used": self.tokens_used,
            "explanation": self.explanation,
            "error": self.error,
        }

    @property
    def success(self) -> bool:
        """Check if merge was successful."""
        return self.decision in {MergeDecision.AUTO_MERGED, MergeDecision.AI_MERGED}

    @property
    def needs_human_review(self) -> bool:
        """Check if human review is needed."""
        return (
            len(self.conflicts_remaining) > 0
            or self.decision == MergeDecision.NEEDS_HUMAN_REVIEW
        )


def compute_content_hash(content: str) -> str:
    """Compute a hash of file content for comparison."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def sanitize_path_for_storage(file_path: str) -> str:
    """Convert a file path to a safe storage name."""
    # Replace path separators and special chars
    safe = file_path.replace("/", "_").replace("\\", "_").replace(".", "_")
    return safe
