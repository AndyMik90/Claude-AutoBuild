#!/usr/bin/env python3
"""
Workspace Management Package
=============================

Handles workspace isolation through Git worktrees, where each spec
gets its own isolated worktree in .worktrees/{spec-name}/.

This package provides:
- Workspace setup and configuration
- Git operations and utilities
- Display and UI functions
- Finalization and user interaction
- Merge operations (imported from workspace.py via importlib)

Public API exported from sub-modules.
"""
import importlib.util
import sys
from pathlib import Path

# Import merge functions from workspace.py (which coexists with this package)
# We use importlib to explicitly load workspace.py since Python prefers the package
_workspace_file = Path(__file__).parent.parent / "workspace.py"
_spec = importlib.util.spec_from_file_location("workspace_module", _workspace_file)
_workspace_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_workspace_module)
merge_existing_build = _workspace_module.merge_existing_build
_run_parallel_merges = _workspace_module._run_parallel_merges

# Models and Enums
from .models import (
    WorkspaceMode,
    WorkspaceChoice,
    ParallelMergeTask,
    ParallelMergeResult,
    MergeLock,
    MergeLockError,
)

# Git Utilities
from .git_utils import (
    has_uncommitted_changes,
    get_current_branch,
    get_existing_build_worktree,
    get_file_content_from_ref,
    get_changed_files_from_branch,
    is_process_running,
    is_binary_file,
    is_lock_file,
    validate_merged_syntax,
    create_conflict_file_with_git,
    # Export private names for backward compatibility
    _is_process_running,
    _is_binary_file,
    _is_lock_file,
    _validate_merged_syntax,
    _get_file_content_from_ref,
    _get_changed_files_from_branch,
    _create_conflict_file_with_git,
    # Constants
    MAX_FILE_LINES_FOR_AI,
    MAX_PARALLEL_AI_MERGES,
    MAX_SYNTAX_FIX_RETRIES,
    BINARY_EXTENSIONS,
    LOCK_FILES,
    MERGE_LOCK_TIMEOUT,
)

# Setup Functions
from .setup import (
    choose_workspace,
    copy_spec_to_worktree,
    setup_workspace,
    ensure_timeline_hook_installed,
    initialize_timeline_tracking,
    # Export private names for backward compatibility
    _ensure_timeline_hook_installed,
    _initialize_timeline_tracking,
)

# Display Functions
from .display import (
    show_build_summary,
    show_changed_files,
    print_merge_success,
    print_conflict_info,
    # Export private names for backward compatibility
    _print_merge_success,
    _print_conflict_info,
)

# Finalization Functions
from .finalization import (
    finalize_workspace,
    handle_workspace_choice,
    review_existing_build,
    discard_existing_build,
    check_existing_build,
    list_all_worktrees,
    cleanup_all_worktrees,
)

__all__ = [
    # Merge Operations (from workspace.py)
    'merge_existing_build',
    '_run_parallel_merges',  # Private but used by tests
    # Models
    'WorkspaceMode',
    'WorkspaceChoice',
    'ParallelMergeTask',
    'ParallelMergeResult',
    'MergeLock',
    'MergeLockError',
    # Git Utils
    'has_uncommitted_changes',
    'get_current_branch',
    'get_existing_build_worktree',
    'get_file_content_from_ref',
    'get_changed_files_from_branch',
    'is_process_running',
    'is_binary_file',
    'validate_merged_syntax',
    'create_conflict_file_with_git',
    # Setup
    'choose_workspace',
    'copy_spec_to_worktree',
    'setup_workspace',
    'ensure_timeline_hook_installed',
    'initialize_timeline_tracking',
    # Display
    'show_build_summary',
    'show_changed_files',
    'print_merge_success',
    'print_conflict_info',
    # Finalization
    'finalize_workspace',
    'handle_workspace_choice',
    'review_existing_build',
    'discard_existing_build',
    'check_existing_build',
    'list_all_worktrees',
    'cleanup_all_worktrees',
]
