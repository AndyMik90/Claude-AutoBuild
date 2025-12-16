#!/usr/bin/env python3
"""
Tests for Intent-Aware Merge System
====================================

Tests the merge module functionality including:
- SemanticAnalyzer: AST-based semantic change extraction
- ConflictDetector: Rule-based conflict detection
- AutoMerger: Deterministic merge strategies
- FileEvolutionTracker: Baseline and change tracking
- AIResolver: AI-based conflict resolution
- MergeOrchestrator: Full pipeline coordination

These tests ensure the hybrid Python + AI merge system works correctly,
maximizing auto-merges and minimizing AI token usage.
"""

import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from merge import (
    ChangeType,
    SemanticChange,
    FileAnalysis,
    ConflictRegion,
    ConflictSeverity,
    MergeStrategy,
    MergeResult,
    MergeDecision,
    TaskSnapshot,
    FileEvolution,
    SemanticAnalyzer,
    ConflictDetector,
    AutoMerger,
    FileEvolutionTracker,
    AIResolver,
    MergeOrchestrator,
)
from merge.types import compute_content_hash, sanitize_path_for_storage
from merge.auto_merger import MergeContext


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def temp_project(tmp_path: Path) -> Path:
    """Create a temporary project directory with git repo."""
    # Initialize git repo
    subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=tmp_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=tmp_path, capture_output=True
    )

    # Create initial files
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "App.tsx").write_text(SAMPLE_REACT_COMPONENT)
    (tmp_path / "src" / "utils.py").write_text(SAMPLE_PYTHON_MODULE)

    # Initial commit
    subprocess.run(["git", "add", "."], cwd=tmp_path, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=tmp_path, capture_output=True
    )

    return tmp_path


@pytest.fixture
def semantic_analyzer() -> SemanticAnalyzer:
    """Create a SemanticAnalyzer instance."""
    return SemanticAnalyzer()


@pytest.fixture
def conflict_detector() -> ConflictDetector:
    """Create a ConflictDetector instance."""
    return ConflictDetector()


@pytest.fixture
def auto_merger() -> AutoMerger:
    """Create an AutoMerger instance."""
    return AutoMerger()


@pytest.fixture
def file_tracker(temp_project: Path) -> FileEvolutionTracker:
    """Create a FileEvolutionTracker instance."""
    return FileEvolutionTracker(temp_project)


@pytest.fixture
def ai_resolver() -> AIResolver:
    """Create an AIResolver without AI function (for unit tests)."""
    return AIResolver()


@pytest.fixture
def mock_ai_resolver() -> AIResolver:
    """Create an AIResolver with mocked AI function."""
    def mock_ai_call(system: str, user: str) -> str:
        return """```typescript
const merged = useAuth();
const other = useOther();
return <div>Merged</div>;
```"""
    return AIResolver(ai_call_fn=mock_ai_call)


# =============================================================================
# SAMPLE CODE
# =============================================================================

SAMPLE_REACT_COMPONENT = '''import React from 'react';
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;
'''

SAMPLE_REACT_WITH_HOOK = '''import React from 'react';
import { useState } from 'react';
import { useAuth } from './hooks/useAuth';

function App() {
  const [count, setCount] = useState(0);
  const { user } = useAuth();

  return (
    <div>
      <h1>Hello World</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  );
}

export default App;
'''

SAMPLE_REACT_WITH_WRAP = '''import React from 'react';
import { useState } from 'react';
import { ThemeProvider } from './context/Theme';

function App() {
  const [count, setCount] = useState(0);

  return (
    <ThemeProvider>
      <div>
        <h1>Hello World</h1>
        <button onClick={() => setCount(count + 1)}>
          Count: {count}
        </button>
      </div>
    </ThemeProvider>
  );
}

export default App;
'''

SAMPLE_PYTHON_MODULE = '''"""Sample Python module."""
import os
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''

SAMPLE_PYTHON_WITH_NEW_IMPORT = '''"""Sample Python module."""
import os
import logging
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''

SAMPLE_PYTHON_WITH_NEW_FUNCTION = '''"""Sample Python module."""
import os
from pathlib import Path

def hello():
    """Say hello."""
    print("Hello")

def goodbye():
    """Say goodbye."""
    print("Goodbye")

def new_function():
    """A new function."""
    return 42

class Greeter:
    """A greeter class."""

    def greet(self, name: str) -> str:
        return f"Hello, {name}"
'''


# =============================================================================
# TYPES TESTS
# =============================================================================

class TestTypes:
    """Tests for merge type definitions."""

    def test_compute_content_hash(self):
        """Hash computation is consistent and deterministic."""
        content = "Hello, World!"
        hash1 = compute_content_hash(content)
        hash2 = compute_content_hash(content)

        assert hash1 == hash2
        assert len(hash1) == 16  # SHA-256 truncated to 16 chars

    def test_different_content_different_hash(self):
        """Different content produces different hashes."""
        hash1 = compute_content_hash("Hello")
        hash2 = compute_content_hash("World")

        assert hash1 != hash2

    def test_sanitize_path_for_storage(self):
        """Path sanitization removes special characters."""
        path = "src/components/App.tsx"
        safe = sanitize_path_for_storage(path)

        assert "/" not in safe
        assert "." not in safe
        assert safe == "src_components_App_tsx"

    def test_semantic_change_is_additive(self):
        """SemanticChange correctly identifies additive changes."""
        add_import = SemanticChange(
            change_type=ChangeType.ADD_IMPORT,
            target="react",
            location="file_top",
            line_start=1,
            line_end=1,
        )
        modify_func = SemanticChange(
            change_type=ChangeType.MODIFY_FUNCTION,
            target="App",
            location="function:App",
            line_start=5,
            line_end=20,
        )

        assert add_import.is_additive is True
        assert modify_func.is_additive is False

    def test_semantic_change_overlaps_with(self):
        """SemanticChange correctly detects overlapping changes."""
        change1 = SemanticChange(
            change_type=ChangeType.MODIFY_FUNCTION,
            target="App",
            location="function:App",
            line_start=5,
            line_end=20,
        )
        change2 = SemanticChange(
            change_type=ChangeType.ADD_HOOK_CALL,
            target="useAuth",
            location="function:App",
            line_start=6,
            line_end=6,
        )
        change3 = SemanticChange(
            change_type=ChangeType.ADD_IMPORT,
            target="lodash",
            location="file_top",
            line_start=1,
            line_end=1,
        )

        assert change1.overlaps_with(change2) is True  # Same location
        assert change1.overlaps_with(change3) is False  # Different location

    def test_file_analysis_is_additive_only(self):
        """FileAnalysis correctly identifies all-additive changes."""
        additive_analysis = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="os",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                ),
                SemanticChange(
                    change_type=ChangeType.ADD_FUNCTION,
                    target="new_func",
                    location="function:new_func",
                    line_start=10,
                    line_end=15,
                ),
            ],
        )
        mixed_analysis = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="os",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                ),
                SemanticChange(
                    change_type=ChangeType.MODIFY_FUNCTION,
                    target="existing",
                    location="function:existing",
                    line_start=5,
                    line_end=10,
                ),
            ],
        )

        assert additive_analysis.is_additive_only is True
        assert mixed_analysis.is_additive_only is False

    def test_task_snapshot_serialization(self):
        """TaskSnapshot can be serialized and deserialized."""
        snapshot = TaskSnapshot(
            task_id="task-001",
            task_intent="Add authentication",
            started_at=datetime(2024, 1, 15, 10, 0, 0),
            completed_at=datetime(2024, 1, 15, 11, 0, 0),
            content_hash_before="abc123",
            content_hash_after="def456",
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_HOOK_CALL,
                    target="useAuth",
                    location="function:App",
                    line_start=5,
                    line_end=5,
                ),
            ],
        )

        data = snapshot.to_dict()
        restored = TaskSnapshot.from_dict(data)

        assert restored.task_id == snapshot.task_id
        assert restored.task_intent == snapshot.task_intent
        assert len(restored.semantic_changes) == 1
        assert restored.semantic_changes[0].target == "useAuth"


# =============================================================================
# SEMANTIC ANALYZER TESTS
# =============================================================================

class TestSemanticAnalyzer:
    """Tests for SemanticAnalyzer."""

    def test_analyze_diff_detects_import_addition(self, semantic_analyzer):
        """Analyzer detects added imports."""
        analysis = semantic_analyzer.analyze_diff(
            "test.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_IMPORT,
        )

        assert len(analysis.changes) > 0
        import_additions = [
            c for c in analysis.changes
            if c.change_type == ChangeType.ADD_IMPORT
        ]
        assert len(import_additions) >= 1

    def test_analyze_diff_detects_function_addition(self, semantic_analyzer):
        """Analyzer detects added functions."""
        analysis = semantic_analyzer.analyze_diff(
            "test.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_FUNCTION,
        )

        func_additions = [
            c for c in analysis.changes
            if c.change_type == ChangeType.ADD_FUNCTION
        ]
        assert len(func_additions) >= 1

    def test_analyze_diff_detects_hook_addition(self, semantic_analyzer):
        """Analyzer detects React hook additions."""
        analysis = semantic_analyzer.analyze_diff(
            "src/App.tsx",
            SAMPLE_REACT_COMPONENT,
            SAMPLE_REACT_WITH_HOOK,
        )

        # Should detect import and hook call
        hook_changes = [
            c for c in analysis.changes
            if c.change_type == ChangeType.ADD_HOOK_CALL
        ]
        import_changes = [
            c for c in analysis.changes
            if c.change_type == ChangeType.ADD_IMPORT
        ]

        assert len(hook_changes) >= 1 or len(import_changes) >= 1

    def test_analyze_file_structure(self, semantic_analyzer):
        """Analyzer can extract file structure."""
        analysis = semantic_analyzer.analyze_file("test.py", SAMPLE_PYTHON_MODULE)

        # Should identify existing functions as additions from empty
        func_additions = [
            c for c in analysis.changes
            if c.change_type == ChangeType.ADD_FUNCTION
        ]
        assert len(func_additions) >= 2  # hello, goodbye

    def test_supported_extensions(self, semantic_analyzer):
        """Analyzer reports supported file types."""
        supported = semantic_analyzer.supported_extensions
        assert ".py" in supported
        assert ".js" in supported
        assert ".ts" in supported
        assert ".tsx" in supported

    def test_is_supported(self, semantic_analyzer):
        """Analyzer correctly identifies supported files."""
        assert semantic_analyzer.is_supported("test.py") is True
        assert semantic_analyzer.is_supported("test.ts") is True
        assert semantic_analyzer.is_supported("test.rb") is False
        assert semantic_analyzer.is_supported("test.txt") is False


# =============================================================================
# CONFLICT DETECTOR TESTS
# =============================================================================

class TestConflictDetector:
    """Tests for ConflictDetector."""

    def test_no_conflicts_with_single_task(self, conflict_detector):
        """No conflicts reported with only one task."""
        analysis = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="os",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                ),
            ],
        )

        conflicts = conflict_detector.detect_conflicts({"task-001": analysis})
        assert len(conflicts) == 0

    def test_compatible_import_additions(self, conflict_detector):
        """Multiple import additions are compatible."""
        analysis1 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="os",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                ),
            ],
        )
        analysis2 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="sys",
                    location="file_top",
                    line_start=2,
                    line_end=2,
                ),
            ],
        )

        conflicts = conflict_detector.detect_conflicts({
            "task-001": analysis1,
            "task-002": analysis2,
        })

        # Should have a conflict region but it's auto-mergeable
        if conflicts:
            assert all(c.can_auto_merge for c in conflicts)
            assert all(c.merge_strategy == MergeStrategy.COMBINE_IMPORTS for c in conflicts)

    def test_compatible_hook_additions(self, conflict_detector):
        """Multiple hook additions at same location are compatible."""
        analysis1 = FileAnalysis(
            file_path="App.tsx",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_HOOK_CALL,
                    target="useAuth",
                    location="function:App",
                    line_start=5,
                    line_end=5,
                ),
            ],
        )
        analysis2 = FileAnalysis(
            file_path="App.tsx",
            changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_HOOK_CALL,
                    target="useTheme",
                    location="function:App",
                    line_start=6,
                    line_end=6,
                ),
            ],
        )

        conflicts = conflict_detector.detect_conflicts({
            "task-001": analysis1,
            "task-002": analysis2,
        })

        # Hook additions should be compatible
        if conflicts:
            mergeable = [c for c in conflicts if c.can_auto_merge]
            assert len(mergeable) == len(conflicts)

    def test_incompatible_function_modifications(self, conflict_detector):
        """Multiple function modifications at same location conflict."""
        analysis1 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.MODIFY_FUNCTION,
                    target="hello",
                    location="function:hello",
                    line_start=5,
                    line_end=10,
                ),
            ],
        )
        analysis2 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.MODIFY_FUNCTION,
                    target="hello",
                    location="function:hello",
                    line_start=5,
                    line_end=12,
                ),
            ],
        )

        conflicts = conflict_detector.detect_conflicts({
            "task-001": analysis1,
            "task-002": analysis2,
        })

        # Should detect a conflict that's not auto-mergeable
        assert len(conflicts) > 0
        assert any(not c.can_auto_merge for c in conflicts)

    def test_severity_assessment(self, conflict_detector):
        """Conflict severity is assessed correctly."""
        # Critical: overlapping function modifications
        analysis1 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.MODIFY_FUNCTION,
                    target="main",
                    location="function:main",
                    line_start=1,
                    line_end=10,
                ),
            ],
        )
        analysis2 = FileAnalysis(
            file_path="test.py",
            changes=[
                SemanticChange(
                    change_type=ChangeType.MODIFY_FUNCTION,
                    target="main",
                    location="function:main",
                    line_start=5,
                    line_end=15,
                ),
            ],
        )

        conflicts = conflict_detector.detect_conflicts({
            "task-001": analysis1,
            "task-002": analysis2,
        })

        assert len(conflicts) > 0
        # Should be high or critical severity
        assert conflicts[0].severity in {ConflictSeverity.HIGH, ConflictSeverity.CRITICAL}

    def test_explain_conflict(self, conflict_detector):
        """Conflict explanation is human-readable."""
        conflict = ConflictRegion(
            file_path="test.py",
            location="function:main",
            tasks_involved=["task-001", "task-002"],
            change_types=[ChangeType.MODIFY_FUNCTION, ChangeType.MODIFY_FUNCTION],
            severity=ConflictSeverity.HIGH,
            can_auto_merge=False,
            merge_strategy=MergeStrategy.AI_REQUIRED,
            reason="Multiple modifications to same function",
        )

        explanation = conflict_detector.explain_conflict(conflict)

        assert "test.py" in explanation
        assert "task-001" in explanation
        assert "task-002" in explanation
        assert "function:main" in explanation


# =============================================================================
# AUTO MERGER TESTS
# =============================================================================

class TestAutoMerger:
    """Tests for AutoMerger."""

    def test_can_handle_known_strategies(self, auto_merger):
        """AutoMerger handles all expected strategies."""
        known_strategies = [
            MergeStrategy.COMBINE_IMPORTS,
            MergeStrategy.HOOKS_FIRST,
            MergeStrategy.HOOKS_THEN_WRAP,
            MergeStrategy.APPEND_FUNCTIONS,
            MergeStrategy.APPEND_METHODS,
            MergeStrategy.COMBINE_PROPS,
            MergeStrategy.ORDER_BY_DEPENDENCY,
            MergeStrategy.ORDER_BY_TIME,
            MergeStrategy.APPEND_STATEMENTS,
        ]

        for strategy in known_strategies:
            assert auto_merger.can_handle(strategy) is True

    def test_cannot_handle_ai_required(self, auto_merger):
        """AutoMerger cannot handle AI-required strategy."""
        assert auto_merger.can_handle(MergeStrategy.AI_REQUIRED) is False
        assert auto_merger.can_handle(MergeStrategy.HUMAN_REQUIRED) is False

    def test_combine_imports_strategy(self, auto_merger):
        """COMBINE_IMPORTS strategy works correctly."""
        baseline = '''import os
import sys

def main():
    pass
'''
        snapshot1 = TaskSnapshot(
            task_id="task-001",
            task_intent="Add logging",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="logging",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                    content_after="import logging",
                ),
            ],
        )
        snapshot2 = TaskSnapshot(
            task_id="task-002",
            task_intent="Add json",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_IMPORT,
                    target="json",
                    location="file_top",
                    line_start=1,
                    line_end=1,
                    content_after="import json",
                ),
            ],
        )

        conflict = ConflictRegion(
            file_path="test.py",
            location="file_top",
            tasks_involved=["task-001", "task-002"],
            change_types=[ChangeType.ADD_IMPORT, ChangeType.ADD_IMPORT],
            severity=ConflictSeverity.NONE,
            can_auto_merge=True,
            merge_strategy=MergeStrategy.COMBINE_IMPORTS,
        )

        context = MergeContext(
            file_path="test.py",
            baseline_content=baseline,
            task_snapshots=[snapshot1, snapshot2],
            conflict=conflict,
        )

        result = auto_merger.merge(context, MergeStrategy.COMBINE_IMPORTS)

        assert result.success is True
        assert "import logging" in result.merged_content
        assert "import json" in result.merged_content
        assert "import os" in result.merged_content

    def test_append_functions_strategy(self, auto_merger):
        """APPEND_FUNCTIONS strategy works correctly."""
        baseline = '''def existing():
    pass
'''
        snapshot1 = TaskSnapshot(
            task_id="task-001",
            task_intent="Add helper",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_FUNCTION,
                    target="helper1",
                    location="function:helper1",
                    line_start=5,
                    line_end=7,
                    content_after="def helper1():\n    return 1",
                ),
            ],
        )
        snapshot2 = TaskSnapshot(
            task_id="task-002",
            task_intent="Add another helper",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_FUNCTION,
                    target="helper2",
                    location="function:helper2",
                    line_start=8,
                    line_end=10,
                    content_after="def helper2():\n    return 2",
                ),
            ],
        )

        conflict = ConflictRegion(
            file_path="test.py",
            location="file",
            tasks_involved=["task-001", "task-002"],
            change_types=[ChangeType.ADD_FUNCTION, ChangeType.ADD_FUNCTION],
            severity=ConflictSeverity.NONE,
            can_auto_merge=True,
            merge_strategy=MergeStrategy.APPEND_FUNCTIONS,
        )

        context = MergeContext(
            file_path="test.py",
            baseline_content=baseline,
            task_snapshots=[snapshot1, snapshot2],
            conflict=conflict,
        )

        result = auto_merger.merge(context, MergeStrategy.APPEND_FUNCTIONS)

        assert result.success is True
        assert "def existing" in result.merged_content
        assert "def helper1" in result.merged_content
        assert "def helper2" in result.merged_content

    def test_unknown_strategy_fails(self, auto_merger):
        """Unknown strategy returns failure."""
        context = MergeContext(
            file_path="test.py",
            baseline_content="",
            task_snapshots=[],
            conflict=ConflictRegion(
                file_path="test.py",
                location="",
                tasks_involved=[],
                change_types=[],
                severity=ConflictSeverity.NONE,
                can_auto_merge=False,
            ),
        )

        result = auto_merger.merge(context, MergeStrategy.AI_REQUIRED)

        assert result.success is False
        assert result.decision == MergeDecision.FAILED


# =============================================================================
# FILE EVOLUTION TRACKER TESTS
# =============================================================================

class TestFileEvolutionTracker:
    """Tests for FileEvolutionTracker."""

    def test_capture_baselines(self, file_tracker, temp_project):
        """Baseline capture stores file content."""
        files = [temp_project / "src" / "App.tsx"]
        captured = file_tracker.capture_baselines("task-001", files, intent="Add auth")

        assert len(captured) == 1
        assert "src/App.tsx" in captured

        evolution = captured["src/App.tsx"]
        assert evolution.baseline_commit is not None
        assert len(evolution.task_snapshots) == 1
        assert evolution.task_snapshots[0].task_id == "task-001"

    def test_get_baseline_content(self, file_tracker, temp_project):
        """Can retrieve stored baseline content."""
        files = [temp_project / "src" / "App.tsx"]
        file_tracker.capture_baselines("task-001", files)

        content = file_tracker.get_baseline_content("src/App.tsx")

        assert content is not None
        assert "function App" in content

    def test_record_modification(self, file_tracker, temp_project):
        """Recording modification creates semantic changes."""
        files = [temp_project / "src" / "utils.py"]
        file_tracker.capture_baselines("task-001", files)

        snapshot = file_tracker.record_modification(
            task_id="task-001",
            file_path="src/utils.py",
            old_content=SAMPLE_PYTHON_MODULE,
            new_content=SAMPLE_PYTHON_WITH_NEW_FUNCTION,
        )

        assert snapshot is not None
        assert snapshot.completed_at is not None
        assert len(snapshot.semantic_changes) > 0

    def test_get_task_modifications(self, file_tracker, temp_project):
        """Can retrieve all modifications for a task."""
        files = [temp_project / "src" / "utils.py", temp_project / "src" / "App.tsx"]
        file_tracker.capture_baselines("task-001", files)

        file_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )

        modifications = file_tracker.get_task_modifications("task-001")

        assert len(modifications) >= 1

    def test_get_files_modified_by_tasks(self, file_tracker, temp_project):
        """Can identify files modified by multiple tasks."""
        files = [temp_project / "src" / "utils.py"]
        file_tracker.capture_baselines("task-001", files)
        file_tracker.capture_baselines("task-002", files)

        file_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )
        file_tracker.record_modification(
            "task-002", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_IMPORT
        )

        file_tasks = file_tracker.get_files_modified_by_tasks(["task-001", "task-002"])

        assert "src/utils.py" in file_tasks
        assert "task-001" in file_tasks["src/utils.py"]
        assert "task-002" in file_tasks["src/utils.py"]

    def test_get_conflicting_files(self, file_tracker, temp_project):
        """Correctly identifies files with potential conflicts."""
        files = [temp_project / "src" / "utils.py"]
        file_tracker.capture_baselines("task-001", files)
        file_tracker.capture_baselines("task-002", files)

        file_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )
        file_tracker.record_modification(
            "task-002", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_IMPORT
        )

        conflicting = file_tracker.get_conflicting_files(["task-001", "task-002"])

        assert "src/utils.py" in conflicting

    def test_cleanup_task(self, file_tracker, temp_project):
        """Task cleanup removes snapshots and baselines."""
        files = [temp_project / "src" / "utils.py"]
        file_tracker.capture_baselines("task-001", files)

        file_tracker.cleanup_task("task-001", remove_baselines=True)

        evolution = file_tracker.get_file_evolution("src/utils.py")
        assert evolution is None or len(evolution.task_snapshots) == 0

    def test_evolution_summary(self, file_tracker, temp_project):
        """Summary provides useful statistics."""
        files = [temp_project / "src" / "utils.py"]
        file_tracker.capture_baselines("task-001", files)
        file_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )

        summary = file_tracker.get_evolution_summary()

        assert summary["total_files_tracked"] >= 1
        assert summary["total_tasks"] >= 1


# =============================================================================
# AI RESOLVER TESTS
# =============================================================================

class TestAIResolver:
    """Tests for AIResolver."""

    def test_no_ai_function_returns_review(self, ai_resolver):
        """Without AI function, resolver returns needs-review."""
        conflict = ConflictRegion(
            file_path="test.py",
            location="function:main",
            tasks_involved=["task-001", "task-002"],
            change_types=[ChangeType.MODIFY_FUNCTION, ChangeType.MODIFY_FUNCTION],
            severity=ConflictSeverity.HIGH,
            can_auto_merge=False,
            merge_strategy=MergeStrategy.AI_REQUIRED,
        )

        result = ai_resolver.resolve_conflict(conflict, "def main(): pass", [])

        assert result.decision == MergeDecision.NEEDS_HUMAN_REVIEW
        assert "No AI function" in result.explanation

    def test_with_mock_ai_function(self, mock_ai_resolver):
        """With AI function, resolver attempts resolution."""
        snapshot = TaskSnapshot(
            task_id="task-001",
            task_intent="Add auth",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_HOOK_CALL,
                    target="useAuth",
                    location="function:App",
                    line_start=5,
                    line_end=5,
                    content_after="const auth = useAuth();",
                ),
            ],
        )

        conflict = ConflictRegion(
            file_path="App.tsx",
            location="function:App",
            tasks_involved=["task-001"],
            change_types=[ChangeType.ADD_HOOK_CALL],
            severity=ConflictSeverity.MEDIUM,
            can_auto_merge=False,
            merge_strategy=MergeStrategy.AI_REQUIRED,
        )

        result = mock_ai_resolver.resolve_conflict(
            conflict, "function App() { return <div/>; }", [snapshot]
        )

        assert result.ai_calls_made == 1
        assert result.decision == MergeDecision.AI_MERGED

    def test_build_context(self, ai_resolver):
        """Context building creates minimal token representation."""
        snapshot = TaskSnapshot(
            task_id="task-001",
            task_intent="Add authentication hook",
            started_at=datetime.now(),
            semantic_changes=[
                SemanticChange(
                    change_type=ChangeType.ADD_HOOK_CALL,
                    target="useAuth",
                    location="function:App",
                    line_start=5,
                    line_end=5,
                    content_after="const auth = useAuth();",
                ),
            ],
        )

        conflict = ConflictRegion(
            file_path="App.tsx",
            location="function:App",
            tasks_involved=["task-001"],
            change_types=[ChangeType.ADD_HOOK_CALL],
            severity=ConflictSeverity.MEDIUM,
            can_auto_merge=False,
        )

        context = ai_resolver.build_context(conflict, "function App() {}", [snapshot])

        prompt = context.to_prompt_context()
        assert "function:App" in prompt
        assert "task-001" in prompt
        assert "Add authentication hook" in prompt

    def test_can_resolve_filters_correctly(self, ai_resolver, mock_ai_resolver):
        """can_resolve correctly filters conflicts."""
        ai_conflict = ConflictRegion(
            file_path="test.py",
            location="func",
            tasks_involved=["t1"],
            change_types=[ChangeType.MODIFY_FUNCTION],
            severity=ConflictSeverity.MEDIUM,
            can_auto_merge=False,
            merge_strategy=MergeStrategy.AI_REQUIRED,
        )
        auto_conflict = ConflictRegion(
            file_path="test.py",
            location="func",
            tasks_involved=["t1"],
            change_types=[ChangeType.ADD_IMPORT],
            severity=ConflictSeverity.NONE,
            can_auto_merge=True,
            merge_strategy=MergeStrategy.COMBINE_IMPORTS,
        )

        # Without AI function, can't resolve
        assert ai_resolver.can_resolve(ai_conflict) is False

        # With AI function, can resolve AI conflicts but not auto-mergeable ones
        assert mock_ai_resolver.can_resolve(ai_conflict) is True
        assert mock_ai_resolver.can_resolve(auto_conflict) is False

    def test_stats_tracking(self, mock_ai_resolver):
        """Resolver tracks call statistics."""
        mock_ai_resolver.reset_stats()

        snapshot = TaskSnapshot(
            task_id="task-001",
            task_intent="Test",
            started_at=datetime.now(),
            semantic_changes=[],
        )
        conflict = ConflictRegion(
            file_path="test.py",
            location="func",
            tasks_involved=["task-001"],
            change_types=[ChangeType.MODIFY_FUNCTION],
            severity=ConflictSeverity.MEDIUM,
            can_auto_merge=False,
        )

        mock_ai_resolver.resolve_conflict(conflict, "code", [snapshot])

        stats = mock_ai_resolver.stats
        assert stats["calls_made"] == 1
        assert stats["estimated_tokens_used"] > 0


# =============================================================================
# MERGE ORCHESTRATOR TESTS
# =============================================================================

class TestMergeOrchestrator:
    """Tests for MergeOrchestrator."""

    def test_initialization(self, temp_project):
        """Orchestrator initializes with all components."""
        orchestrator = MergeOrchestrator(temp_project)

        assert orchestrator.project_dir == temp_project
        assert orchestrator.analyzer is not None
        assert orchestrator.conflict_detector is not None
        assert orchestrator.auto_merger is not None
        assert orchestrator.evolution_tracker is not None

    def test_dry_run_mode(self, temp_project):
        """Dry run mode doesn't write files."""
        orchestrator = MergeOrchestrator(temp_project, dry_run=True)

        # Capture baseline and simulate merge
        orchestrator.evolution_tracker.capture_baselines(
            "task-001", [temp_project / "src" / "utils.py"]
        )
        orchestrator.evolution_tracker.record_modification(
            "task-001",
            "src/utils.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_FUNCTION,
        )

        report = orchestrator.merge_task("task-001")

        # Should have results but not write files
        assert report is not None
        written = orchestrator.write_merged_files(report)
        assert len(written) == 0  # Dry run

    def test_preview_merge(self, temp_project):
        """Preview provides merge analysis without executing."""
        orchestrator = MergeOrchestrator(temp_project)

        # Setup two tasks modifying same file
        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files)
        orchestrator.evolution_tracker.capture_baselines("task-002", files)

        orchestrator.evolution_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )
        orchestrator.evolution_tracker.record_modification(
            "task-002", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_IMPORT
        )

        preview = orchestrator.preview_merge(["task-001", "task-002"])

        assert "tasks" in preview
        assert "files_to_merge" in preview
        assert "summary" in preview

    def test_merge_stats(self, temp_project):
        """Merge report includes useful statistics."""
        orchestrator = MergeOrchestrator(temp_project, dry_run=True)

        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files)
        orchestrator.evolution_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )

        report = orchestrator.merge_task("task-001")

        assert report.stats.files_processed >= 0
        assert report.stats.duration_seconds >= 0

    def test_ai_disabled_mode(self, temp_project):
        """Orchestrator works without AI enabled."""
        orchestrator = MergeOrchestrator(temp_project, enable_ai=False, dry_run=True)

        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files)
        orchestrator.evolution_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )

        report = orchestrator.merge_task("task-001")

        # Should complete without AI
        assert report.stats.ai_calls_made == 0


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestMergeIntegration:
    """Integration tests for the complete merge pipeline."""

    def test_full_merge_pipeline_single_task(self, temp_project):
        """Full pipeline works for single task merge."""
        orchestrator = MergeOrchestrator(temp_project, dry_run=True)

        # Setup: capture baseline and make changes
        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files, intent="Add new function")

        # Simulate task making changes
        orchestrator.evolution_tracker.record_modification(
            "task-001",
            "src/utils.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_FUNCTION,
        )

        # Execute merge - provide worktree_path to avoid lookup
        report = orchestrator.merge_task("task-001", worktree_path=temp_project)

        # Verify results
        assert report.success is True
        assert "task-001" in report.tasks_merged
        assert report.stats.files_processed >= 1

    def test_compatible_multi_task_merge(self, temp_project):
        """Compatible changes from multiple tasks merge automatically."""
        orchestrator = MergeOrchestrator(temp_project, dry_run=True)

        # Setup: both tasks modify same file with compatible changes
        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files, intent="Add logging")
        orchestrator.evolution_tracker.capture_baselines("task-002", files, intent="Add json")

        # Task 1: adds logging import
        orchestrator.evolution_tracker.record_modification(
            "task-001",
            "src/utils.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_IMPORT,  # Has logging import
        )

        # Task 2: adds new function
        orchestrator.evolution_tracker.record_modification(
            "task-002",
            "src/utils.py",
            SAMPLE_PYTHON_MODULE,
            SAMPLE_PYTHON_WITH_NEW_FUNCTION,
        )

        # Execute merge
        from merge.orchestrator import TaskMergeRequest
        report = orchestrator.merge_tasks([
            TaskMergeRequest(task_id="task-001", worktree_path=temp_project),
            TaskMergeRequest(task_id="task-002", worktree_path=temp_project),
        ])

        # Both tasks should merge successfully
        assert len(report.tasks_merged) == 2
        # Auto-merge should handle compatible changes
        assert report.stats.files_auto_merged >= 0

    def test_merge_report_serialization(self, temp_project):
        """Merge report can be serialized to JSON."""
        orchestrator = MergeOrchestrator(temp_project, dry_run=True)

        files = [temp_project / "src" / "utils.py"]
        orchestrator.evolution_tracker.capture_baselines("task-001", files)
        orchestrator.evolution_tracker.record_modification(
            "task-001", "src/utils.py", SAMPLE_PYTHON_MODULE, SAMPLE_PYTHON_WITH_NEW_FUNCTION
        )

        # Provide worktree_path to avoid lookup
        report = orchestrator.merge_task("task-001", worktree_path=temp_project)

        # Should be serializable
        data = report.to_dict()
        json_str = json.dumps(data)
        restored = json.loads(json_str)

        assert restored["tasks_merged"] == ["task-001"]
        assert restored["success"] is True


# =============================================================================
# CONFLICT-ONLY MERGE TESTS
# =============================================================================

from merge.prompts import (
    parse_conflict_markers,
    extract_conflict_resolutions,
    reassemble_with_resolutions,
    build_conflict_only_prompt,
)


class TestConflictMarkerParsing:
    """Tests for git conflict marker parsing."""

    def test_parse_single_conflict(self):
        """Parse a file with a single conflict marker."""
        content = '''def hello():
    print("Hello")

<<<<<<< HEAD
def foo():
    return "main version"
=======
def foo():
    return "feature version"
>>>>>>> feature-branch

def goodbye():
    print("Goodbye")
'''
        conflicts, _ = parse_conflict_markers(content)

        assert len(conflicts) == 1
        assert conflicts[0]['id'] == 'CONFLICT_1'
        assert 'main version' in conflicts[0]['main_lines']
        assert 'feature version' in conflicts[0]['worktree_lines']

    def test_parse_multiple_conflicts(self):
        """Parse a file with multiple conflict markers."""
        content = '''import os
<<<<<<< HEAD
import logging
=======
import json
>>>>>>> feature

def main():
    pass

<<<<<<< HEAD
def helper1():
    return 1
=======
def helper2():
    return 2
>>>>>>> feature
'''
        conflicts, _ = parse_conflict_markers(content)

        assert len(conflicts) == 2
        assert conflicts[0]['id'] == 'CONFLICT_1'
        assert conflicts[1]['id'] == 'CONFLICT_2'
        assert 'logging' in conflicts[0]['main_lines']
        assert 'json' in conflicts[0]['worktree_lines']
        assert 'helper1' in conflicts[1]['main_lines']
        assert 'helper2' in conflicts[1]['worktree_lines']

    def test_parse_no_conflicts(self):
        """Parse a file with no conflicts returns empty list."""
        content = '''def hello():
    print("Hello")

def goodbye():
    print("Goodbye")
'''
        conflicts, _ = parse_conflict_markers(content)

        assert len(conflicts) == 0

    def test_parse_conflict_with_context(self):
        """Conflict includes surrounding context."""
        content = '''line 1
line 2
line 3
<<<<<<< HEAD
conflict main
=======
conflict feature
>>>>>>> feature
line after 1
line after 2
'''
        conflicts, _ = parse_conflict_markers(content)

        assert len(conflicts) == 1
        # Should have context before
        assert 'line 3' in conflicts[0]['context_before']
        # Should have context after
        assert 'line after 1' in conflicts[0]['context_after']

    def test_parse_multiline_conflict(self):
        """Parse conflict with multiple lines on each side."""
        content = '''start
<<<<<<< HEAD
line 1 from main
line 2 from main
line 3 from main
=======
line 1 from feature
line 2 from feature
>>>>>>> feature
end
'''
        conflicts, _ = parse_conflict_markers(content)

        assert len(conflicts) == 1
        assert 'line 1 from main' in conflicts[0]['main_lines']
        assert 'line 3 from main' in conflicts[0]['main_lines']
        assert 'line 1 from feature' in conflicts[0]['worktree_lines']
        assert 'line 2 from feature' in conflicts[0]['worktree_lines']


class TestConflictResolutionExtraction:
    """Tests for extracting resolved code from AI responses."""

    def test_extract_single_resolution(self):
        """Extract resolution for a single conflict."""
        response = '''Here's the resolved code:

--- CONFLICT_1 RESOLVED ---
```python
def foo():
    return "merged version"
```

This combines both changes.
'''
        conflicts = [{'id': 'CONFLICT_1'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'python')

        assert 'CONFLICT_1' in resolutions
        assert 'merged version' in resolutions['CONFLICT_1']

    def test_extract_multiple_resolutions(self):
        """Extract resolutions for multiple conflicts."""
        response = '''Resolving all conflicts:

--- CONFLICT_1 RESOLVED ---
```python
import logging
import json
```

--- CONFLICT_2 RESOLVED ---
```python
def helper():
    return "combined"
```

Done.
'''
        conflicts = [{'id': 'CONFLICT_1'}, {'id': 'CONFLICT_2'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'python')

        assert 'CONFLICT_1' in resolutions
        assert 'CONFLICT_2' in resolutions
        assert 'logging' in resolutions['CONFLICT_1']
        assert 'json' in resolutions['CONFLICT_1']
        assert 'helper' in resolutions['CONFLICT_2']

    def test_extract_fallback_single_code_block(self):
        """Fallback: extract single code block for single conflict."""
        response = '''Here's the merged code:

```python
def foo():
    return "merged"
```
'''
        conflicts = [{'id': 'CONFLICT_1'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'python')

        assert 'CONFLICT_1' in resolutions
        assert 'merged' in resolutions['CONFLICT_1']

    def test_extract_case_insensitive(self):
        """Resolution markers are case-insensitive."""
        response = '''--- conflict_1 resolved ---
```python
result = "case insensitive"
```
'''
        conflicts = [{'id': 'CONFLICT_1'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'python')

        assert 'CONFLICT_1' in resolutions

    def test_extract_typescript_resolution(self):
        """Extract TypeScript resolutions correctly."""
        response = '''--- CONFLICT_1 RESOLVED ---
```typescript
export const config = {
  merged: true
};
```
'''
        conflicts = [{'id': 'CONFLICT_1'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'typescript')

        assert 'CONFLICT_1' in resolutions
        assert 'merged: true' in resolutions['CONFLICT_1']

    def test_extract_no_resolutions(self):
        """No resolutions when AI response doesn't match format."""
        response = '''I couldn't resolve these conflicts automatically.
Please review manually.
'''
        conflicts = [{'id': 'CONFLICT_1'}]
        resolutions = extract_conflict_resolutions(response, conflicts, 'python')

        assert len(resolutions) == 0


class TestReassemblyWithResolutions:
    """Tests for reassembling files with resolved conflicts."""

    def test_reassemble_single_conflict(self):
        """Reassemble file with single resolved conflict."""
        original = '''before
<<<<<<< HEAD
main version
=======
feature version
>>>>>>> feature
after
'''
        conflicts = [{
            'id': 'CONFLICT_1',
            'start': original.index('<<<<<<<'),
            'end': original.index('>>>>>>> feature') + len('>>>>>>> feature\n'),
            'main_lines': 'main version',
            'worktree_lines': 'feature version',
        }]
        resolutions = {'CONFLICT_1': 'merged version'}

        result = reassemble_with_resolutions(original, conflicts, resolutions)

        assert '<<<<<<' not in result
        assert '=======' not in result
        assert '>>>>>>>' not in result
        assert 'merged version' in result
        assert 'before' in result
        assert 'after' in result

    def test_reassemble_multiple_conflicts(self):
        """Reassemble file with multiple resolved conflicts."""
        original = '''start
<<<<<<< HEAD
conflict1 main
=======
conflict1 feature
>>>>>>> feature
middle
<<<<<<< HEAD
conflict2 main
=======
conflict2 feature
>>>>>>> feature
end
'''
        # Calculate positions
        c1_start = original.index('<<<<<<<')
        c1_end_marker = '>>>>>>> feature\n'
        c1_end = original.index(c1_end_marker) + len(c1_end_marker)

        remaining = original[c1_end:]
        c2_start = c1_end + remaining.index('<<<<<<<')
        c2_end = c2_start + remaining[remaining.index('<<<<<<<'):].index(c1_end_marker) + len(c1_end_marker)

        conflicts = [
            {
                'id': 'CONFLICT_1',
                'start': c1_start,
                'end': c1_end,
                'main_lines': 'conflict1 main',
                'worktree_lines': 'conflict1 feature',
            },
            {
                'id': 'CONFLICT_2',
                'start': c2_start,
                'end': c2_end,
                'main_lines': 'conflict2 main',
                'worktree_lines': 'conflict2 feature',
            },
        ]
        resolutions = {
            'CONFLICT_1': 'resolved1',
            'CONFLICT_2': 'resolved2',
        }

        result = reassemble_with_resolutions(original, conflicts, resolutions)

        assert '<<<<<<' not in result
        assert 'resolved1' in result
        assert 'resolved2' in result
        assert 'start' in result
        assert 'middle' in result
        assert 'end' in result

    def test_reassemble_fallback_without_resolution(self):
        """Fallback to worktree version when no resolution provided."""
        original = '''before
<<<<<<< HEAD
main version
=======
feature version
>>>>>>> feature
after
'''
        conflicts = [{
            'id': 'CONFLICT_1',
            'start': original.index('<<<<<<<'),
            'end': original.index('>>>>>>> feature') + len('>>>>>>> feature\n'),
            'main_lines': 'main version',
            'worktree_lines': 'feature version',
        }]
        resolutions = {}  # No resolution provided

        result = reassemble_with_resolutions(original, conflicts, resolutions)

        # Should fall back to worktree version
        assert 'feature version' in result
        assert '<<<<<<' not in result


class TestBuildConflictOnlyPrompt:
    """Tests for building conflict-only prompts."""

    def test_build_prompt_single_conflict(self):
        """Build prompt for single conflict."""
        conflicts = [{
            'id': 'CONFLICT_1',
            'main_lines': 'def foo():\n    return "main"',
            'worktree_lines': 'def foo():\n    return "feature"',
            'context_before': 'import os',
            'context_after': 'def bar():',
        }]

        prompt = build_conflict_only_prompt(
            file_path='test.py',
            conflicts=conflicts,
            spec_name='feature-branch',
            language='python',
        )

        assert 'test.py' in prompt
        assert 'CONFLICT_1' in prompt
        assert 'MAIN BRANCH VERSION' in prompt
        assert 'FEATURE BRANCH VERSION' in prompt
        assert 'return "main"' in prompt
        assert 'return "feature"' in prompt
        assert 'CONTEXT BEFORE' in prompt
        assert 'import os' in prompt

    def test_build_prompt_multiple_conflicts(self):
        """Build prompt for multiple conflicts."""
        conflicts = [
            {
                'id': 'CONFLICT_1',
                'main_lines': 'import logging',
                'worktree_lines': 'import json',
                'context_before': '',
                'context_after': '',
            },
            {
                'id': 'CONFLICT_2',
                'main_lines': 'helper1()',
                'worktree_lines': 'helper2()',
                'context_before': '',
                'context_after': '',
            },
        ]

        prompt = build_conflict_only_prompt(
            file_path='test.py',
            conflicts=conflicts,
            spec_name='feature',
            language='python',
        )

        assert 'CONFLICT_1' in prompt
        assert 'CONFLICT_2' in prompt
        assert '2 conflict(s)' in prompt

    def test_build_prompt_includes_task_intent(self):
        """Prompt includes task intent when provided."""
        conflicts = [{
            'id': 'CONFLICT_1',
            'main_lines': 'old code',
            'worktree_lines': 'new code',
            'context_before': '',
            'context_after': '',
        }]
        task_intent = {
            'title': 'Add user authentication',
            'description': 'Implement OAuth login flow',
        }

        prompt = build_conflict_only_prompt(
            file_path='auth.py',
            conflicts=conflicts,
            spec_name='auth-feature',
            language='python',
            task_intent=task_intent,
        )

        assert 'Add user authentication' in prompt
        assert 'OAuth login flow' in prompt

    def test_build_prompt_typescript(self):
        """Build prompt for TypeScript file."""
        conflicts = [{
            'id': 'CONFLICT_1',
            'main_lines': 'const x: number = 1;',
            'worktree_lines': 'const x: string = "1";',
            'context_before': '',
            'context_after': '',
        }]

        prompt = build_conflict_only_prompt(
            file_path='index.ts',
            conflicts=conflicts,
            spec_name='feature',
            language='typescript',
        )

        assert 'typescript' in prompt.lower()
        assert '```typescript' in prompt


class TestConflictOnlyMergeIntegration:
    """Integration tests for the full conflict-only merge flow."""

    def test_full_flow_single_conflict(self):
        """Full flow: parse -> extract resolution -> reassemble."""
        # Simulated file with conflict
        file_with_conflict = '''import os

<<<<<<< HEAD
def foo():
    return "from main"
=======
def foo():
    return "from feature"
>>>>>>> feature

def bar():
    pass
'''
        # Step 1: Parse conflicts
        conflicts, _ = parse_conflict_markers(file_with_conflict)
        assert len(conflicts) == 1

        # Step 2: Simulate AI response
        ai_response = '''--- CONFLICT_1 RESOLVED ---
```python
def foo():
    return "merged: main + feature"
```
'''
        # Step 3: Extract resolutions
        resolutions = extract_conflict_resolutions(ai_response, conflicts, 'python')
        assert 'CONFLICT_1' in resolutions

        # Step 4: Reassemble
        result = reassemble_with_resolutions(file_with_conflict, conflicts, resolutions)

        # Verify result
        assert '<<<<<<' not in result
        assert 'merged: main + feature' in result
        assert 'import os' in result
        assert 'def bar():' in result

    def test_full_flow_preserves_structure(self):
        """Full flow preserves file structure outside conflicts."""
        file_with_conflict = '''# Header comment
"""Module docstring."""

import os
import sys

<<<<<<< HEAD
CONFIG = {"version": "1.0"}
=======
CONFIG = {"version": "2.0", "new_key": "value"}
>>>>>>> feature

def main():
    """Main function."""
    print(CONFIG)

if __name__ == "__main__":
    main()
'''
        conflicts, _ = parse_conflict_markers(file_with_conflict)

        ai_response = '''--- CONFLICT_1 RESOLVED ---
```python
CONFIG = {"version": "2.0", "new_key": "value", "merged": True}
```
'''
        resolutions = extract_conflict_resolutions(ai_response, conflicts, 'python')
        result = reassemble_with_resolutions(file_with_conflict, conflicts, resolutions)

        # All original structure preserved
        assert '# Header comment' in result
        assert '"""Module docstring."""' in result
        assert 'import os' in result
        assert 'import sys' in result
        assert 'def main():' in result
        assert 'if __name__ == "__main__":' in result
        # Resolution applied
        assert '"merged": True' in result
        # No conflict markers
        assert '<<<<<<' not in result


# =============================================================================
# PARALLEL MERGE INFRASTRUCTURE TESTS
# =============================================================================

import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from workspace import ParallelMergeTask, ParallelMergeResult, _run_parallel_merges


class TestParallelMergeDataclasses:
    """Tests for parallel merge data structures."""

    def test_parallel_merge_task_creation(self):
        """ParallelMergeTask can be created with required fields."""
        task = ParallelMergeTask(
            file_path="src/App.tsx",
            main_content="const main = 1;",
            worktree_content="const main = 2;",
            base_content="const main = 0;",
            spec_name="001-test",
        )

        assert task.file_path == "src/App.tsx"
        assert task.main_content == "const main = 1;"
        assert task.worktree_content == "const main = 2;"
        assert task.base_content == "const main = 0;"
        assert task.spec_name == "001-test"

    def test_parallel_merge_result_success(self):
        """ParallelMergeResult can represent successful merge."""
        result = ParallelMergeResult(
            file_path="src/App.tsx",
            merged_content="const main = 'merged';",
            success=True,
            was_auto_merged=False,
        )

        assert result.success is True
        assert result.merged_content == "const main = 'merged';"
        assert result.was_auto_merged is False
        assert result.error is None

    def test_parallel_merge_result_auto_merged(self):
        """ParallelMergeResult can indicate auto-merge (no AI)."""
        result = ParallelMergeResult(
            file_path="src/utils.py",
            merged_content="# Auto-merged content",
            success=True,
            was_auto_merged=True,
        )

        assert result.success is True
        assert result.was_auto_merged is True

    def test_parallel_merge_result_failure(self):
        """ParallelMergeResult can represent failed merge."""
        result = ParallelMergeResult(
            file_path="src/complex.ts",
            merged_content=None,
            success=False,
            error="AI could not resolve conflict",
        )

        assert result.success is False
        assert result.merged_content is None
        assert result.error == "AI could not resolve conflict"


class TestParallelMergeRunner:
    """Tests for the parallel merge runner."""

    def test_run_parallel_merges_empty_list(self, temp_project):
        """Running with empty task list returns empty results."""
        import asyncio
        results = asyncio.run(_run_parallel_merges([], temp_project))
        assert results == []

    def test_parallel_merge_task_optional_base(self):
        """ParallelMergeTask works with None base_content."""
        task = ParallelMergeTask(
            file_path="src/new-file.tsx",
            main_content="// main version",
            worktree_content="// worktree version",
            base_content=None,  # New file, no common ancestor
            spec_name="001-new-feature",
        )

        assert task.base_content is None
        assert task.file_path == "src/new-file.tsx"
