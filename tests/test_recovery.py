#!/usr/bin/env python3
"""
Test Suite for Smart Rollback and Recovery System
==================================================

Tests the recovery system functionality including:
- Attempt tracking
- Circular fix detection
- Recovery action determination
- Rollback functionality
"""

import json
import sys
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from recovery import RecoveryManager, FailureType, RecoveryAction


def setup_test_environment():
    """Create temporary directories for testing."""
    temp_dir = Path(tempfile.mkdtemp())
    spec_dir = temp_dir / "spec"
    project_dir = temp_dir / "project"

    spec_dir.mkdir(parents=True)
    project_dir.mkdir(parents=True)

    # Initialize git repo in project dir
    import subprocess
    subprocess.run(["git", "init"], cwd=project_dir, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=project_dir, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=project_dir, capture_output=True)

    # Create initial commit
    test_file = project_dir / "test.txt"
    test_file.write_text("Initial content")
    subprocess.run(["git", "add", "."], cwd=project_dir, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=project_dir, capture_output=True)

    return temp_dir, spec_dir, project_dir


def cleanup_test_environment(temp_dir):
    """Remove temporary directories."""
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_initialization():
    """Test RecoveryManager initialization."""
    print("TEST: Initialization")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Check that memory directory was created
        assert (spec_dir / "memory").exists(), "Memory directory not created"

        # Check that attempt history file was created
        assert (spec_dir / "memory" / "attempt_history.json").exists(), "attempt_history.json not created"

        # Check that build commits file was created
        assert (spec_dir / "memory" / "build_commits.json").exists(), "build_commits.json not created"

        # Verify initial structure
        with open(spec_dir / "memory" / "attempt_history.json") as f:
            history = json.load(f)
            assert "subtasks" in history, "subtasks key missing"
            assert "stuck_subtasks" in history, "stuck_subtasks key missing"
            assert "metadata" in history, "metadata key missing"

        print("  ✓ Initialization successful")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_record_attempt():
    """Test recording chunk attempts."""
    print("TEST: Recording Attempts")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Record failed attempt
        manager.record_attempt(
            subtask_id="subtask-1",
            session=1,
            success=False,
            approach="First approach using async/await",
            error="Import error - asyncio not found"
        )

        # Verify recorded
        assert manager.get_attempt_count("subtask-1") == 1, "Attempt not recorded"

        history = manager.get_subtask_history("subtask-1")
        assert len(history["attempts"]) == 1, "Wrong number of attempts"
        assert history["attempts"][0]["success"] is False, "Success flag wrong"
        assert history["status"] == "failed", "Status not updated"

        # Record successful attempt
        manager.record_attempt(
            subtask_id="subtask-1",
            session=2,
            success=True,
            approach="Second approach using callbacks",
            error=None
        )

        assert manager.get_attempt_count("subtask-1") == 2, "Second attempt not recorded"

        history = manager.get_subtask_history("subtask-1")
        assert len(history["attempts"]) == 2, "Wrong number of attempts"
        assert history["attempts"][1]["success"] is True, "Success flag wrong"
        assert history["status"] == "completed", "Status not updated to completed"

        print("  ✓ Attempt recording works")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_circular_fix_detection():
    """Test circular fix detection."""
    print("TEST: Circular Fix Detection")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Record similar attempts
        manager.record_attempt("subtask-1", 1, False, "Using async await pattern", "Error 1")
        manager.record_attempt("subtask-1", 2, False, "Using async await with different import", "Error 2")
        manager.record_attempt("subtask-1", 3, False, "Trying async await again", "Error 3")

        # Check if circular fix is detected
        is_circular = manager.is_circular_fix("subtask-1", "Using async await pattern once more")

        assert is_circular, "Circular fix not detected"
        print("  ✓ Circular fix detected correctly")

        # Test with different approach
        is_circular = manager.is_circular_fix("subtask-1", "Using completely different callback-based approach")

        # This might be detected as circular if word overlap is high
        # But "callback-based" is sufficiently different from "async await"
        print(f"  ✓ Different approach circular check: {is_circular}")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_failure_classification():
    """Test failure type classification."""
    print("TEST: Failure Classification")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Test broken build detection
        failure = manager.classify_failure("SyntaxError: unexpected token", "subtask-1")
        assert failure == FailureType.BROKEN_BUILD, "Broken build not detected"
        print("  ✓ Broken build classified correctly")

        # Test verification failed detection
        failure = manager.classify_failure("Verification failed: expected 200 got 500", "subtask-2")
        assert failure == FailureType.VERIFICATION_FAILED, "Verification failure not detected"
        print("  ✓ Verification failure classified correctly")

        # Test context exhaustion
        failure = manager.classify_failure("Context length exceeded", "subtask-3")
        assert failure == FailureType.CONTEXT_EXHAUSTED, "Context exhaustion not detected"
        print("  ✓ Context exhaustion classified correctly")

        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_recovery_action_determination():
    """Test recovery action determination."""
    print("TEST: Recovery Action Determination")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Test verification failed with < 3 attempts
        manager.record_attempt("subtask-1", 1, False, "First try", "Error")

        action = manager.determine_recovery_action(FailureType.VERIFICATION_FAILED, "subtask-1")
        assert action.action == "retry", "Should retry for first verification failure"
        print("  ✓ Retry action for first failure")

        # Test verification failed with >= 3 attempts
        manager.record_attempt("subtask-1", 2, False, "Second try", "Error")
        manager.record_attempt("subtask-1", 3, False, "Third try", "Error")

        action = manager.determine_recovery_action(FailureType.VERIFICATION_FAILED, "subtask-1")
        assert action.action == "skip", "Should skip after 3 attempts"
        print("  ✓ Skip action after 3 attempts")

        # Test circular fix
        action = manager.determine_recovery_action(FailureType.CIRCULAR_FIX, "subtask-1")
        assert action.action == "skip", "Should skip for circular fix"
        print("  ✓ Skip action for circular fix")

        # Test context exhausted
        action = manager.determine_recovery_action(FailureType.CONTEXT_EXHAUSTED, "subtask-2")
        assert action.action == "continue", "Should continue for context exhaustion"
        print("  ✓ Continue action for context exhaustion")

        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_good_commit_tracking():
    """Test tracking of good commits."""
    print("TEST: Good Commit Tracking")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Get current commit hash
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True
        )
        commit_hash = result.stdout.strip()

        # Record good commit
        manager.record_good_commit(commit_hash, "subtask-1")

        # Verify recorded
        last_good = manager.get_last_good_commit()
        assert last_good == commit_hash, "Good commit not recorded correctly"
        print(f"  ✓ Good commit tracked: {commit_hash[:8]}")

        # Record another commit
        test_file = project_dir / "test2.txt"
        test_file.write_text("Second content")
        subprocess.run(["git", "add", "."], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "commit", "-m", "Second commit"], cwd=project_dir, capture_output=True)

        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True
        )
        commit_hash2 = result.stdout.strip()

        manager.record_good_commit(commit_hash2, "subtask-2")

        # Last good should be updated
        last_good = manager.get_last_good_commit()
        assert last_good == commit_hash2, "Last good commit not updated"
        print(f"  ✓ Last good commit updated: {commit_hash2[:8]}")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_mark_subtask_stuck():
    """Test marking chunks as stuck."""
    print("TEST: Mark Chunk Stuck")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Record some attempts
        manager.record_attempt("subtask-1", 1, False, "Try 1", "Error 1")
        manager.record_attempt("subtask-1", 2, False, "Try 2", "Error 2")
        manager.record_attempt("subtask-1", 3, False, "Try 3", "Error 3")

        # Mark as stuck
        manager.mark_subtask_stuck("subtask-1", "Circular fix after 3 attempts")

        # Verify stuck
        stuck_subtasks = manager.get_stuck_subtasks()
        assert len(stuck_subtasks) == 1, "Stuck subtask not recorded"
        assert stuck_subtasks[0]["subtask_id"] == "subtask-1", "Wrong subtask marked as stuck"
        assert "Circular fix" in stuck_subtasks[0]["reason"], "Reason not recorded"

        # Check subtask status
        history = manager.get_subtask_history("subtask-1")
        assert history["status"] == "stuck", "Chunk status not updated to stuck"

        print("  ✓ Chunk marked as stuck correctly")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def test_recovery_hints():
    """Test recovery hints generation."""
    print("TEST: Recovery Hints")

    temp_dir, spec_dir, project_dir = setup_test_environment()

    try:
        manager = RecoveryManager(spec_dir, project_dir)

        # Record some attempts
        manager.record_attempt("subtask-1", 1, False, "Async/await approach", "Import error")
        manager.record_attempt("subtask-1", 2, False, "Threading approach", "Thread safety error")

        # Get hints
        hints = manager.get_recovery_hints("subtask-1")

        assert len(hints) > 0, "No hints generated"
        assert "Previous attempts: 2" in hints[0], "Attempt count not in hints"

        # Check for warning about different approach
        hint_text = " ".join(hints)
        assert "DIFFERENT" in hint_text or "different" in hint_text, "Warning about different approach missing"

        print("  ✓ Recovery hints generated correctly")
        for hint in hints[:3]:  # Show first 3 hints
            print(f"    - {hint}")
        print()

    finally:
        cleanup_test_environment(temp_dir)


def run_all_tests():
    """Run all tests."""
    print("=" * 70)
    print("SMART ROLLBACK AND RECOVERY - TEST SUITE")
    print("=" * 70)
    print()

    tests = [
        test_initialization,
        test_record_attempt,
        test_circular_fix_detection,
        test_failure_classification,
        test_recovery_action_determination,
        test_good_commit_tracking,
        test_mark_subtask_stuck,
        test_recovery_hints,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  ✗ FAILED: {e}")
            print()
            failed += 1
        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            print()
            failed += 1

    print("=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 70)

    return failed == 0


if __name__ == "__main__":
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)
