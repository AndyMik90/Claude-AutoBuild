"""
Auto-Fix Processor
==================

Handles automatic issue fixing workflow including permissions and state management.
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    from ..models import AutoFixState, AutoFixStatus, GitHubRunnerConfig
    from ..permissions import GitHubPermissionChecker
except (ImportError, ValueError, SystemError):
    from models import AutoFixState, AutoFixStatus, GitHubRunnerConfig
    from permissions import GitHubPermissionChecker


class AutoFixProcessor:
    """Handles auto-fix workflow for issues."""

    def __init__(
        self,
        github_dir: Path,
        config: GitHubRunnerConfig,
        permission_checker: GitHubPermissionChecker,
        progress_callback=None,
    ):
        self.github_dir = Path(github_dir)
        self.config = config
        self.permission_checker = permission_checker
        self.progress_callback = progress_callback

    def _report_progress(self, phase: str, progress: int, message: str, **kwargs):
        """Report progress if callback is set."""
        if self.progress_callback:
            # Import at module level to avoid circular import issues
            import sys

            if "orchestrator" in sys.modules:
                ProgressCallback = sys.modules["orchestrator"].ProgressCallback
            else:
                # Fallback: try relative import
                try:
                    from ..orchestrator import ProgressCallback
                except ImportError:
                    from orchestrator import ProgressCallback

            self.progress_callback(
                ProgressCallback(
                    phase=phase, progress=progress, message=message, **kwargs
                )
            )

    async def process_issue(
        self,
        issue_number: int,
        issue: dict,
        trigger_label: str | None = None,
    ) -> AutoFixState:
        """
        Process an issue for auto-fix.

        Args:
            issue_number: The issue number to fix
            issue: The issue data from GitHub
            trigger_label: Label that triggered this auto-fix (for permission checks)

        Returns:
            AutoFixState tracking the fix progress

        Raises:
            PermissionError: If the user who added the trigger label isn't authorized
        """
        self._report_progress(
            "fetching",
            10,
            f"Fetching issue #{issue_number}...",
            issue_number=issue_number,
        )

        # Load or create state
        state = AutoFixState.load(self.github_dir, issue_number)
        if state and state.status not in [
            AutoFixStatus.FAILED,
            AutoFixStatus.COMPLETED,
        ]:
            # Already in progress
            return state

        try:
            # PERMISSION CHECK: Verify who triggered the auto-fix
            if trigger_label:
                self._report_progress(
                    "verifying",
                    15,
                    f"Verifying permissions for issue #{issue_number}...",
                    issue_number=issue_number,
                )
                permission_result = (
                    await self.permission_checker.verify_automation_trigger(
                        issue_number=issue_number,
                        trigger_label=trigger_label,
                    )
                )
                if not permission_result.allowed:
                    print(
                        f"[PERMISSION] Auto-fix denied for #{issue_number}: {permission_result.reason}",
                        flush=True,
                    )
                    raise PermissionError(
                        f"Auto-fix not authorized: {permission_result.reason}"
                    )
                print(
                    f"[PERMISSION] Auto-fix authorized for #{issue_number} "
                    f"(triggered by {permission_result.username}, role: {permission_result.role})",
                    flush=True,
                )

            state = AutoFixState(
                issue_number=issue_number,
                issue_url=f"https://github.com/{self.config.repo}/issues/{issue_number}",
                repo=self.config.repo,
                status=AutoFixStatus.ANALYZING,
            )
            await state.save(self.github_dir)

            self._report_progress(
                "analyzing", 30, "Analyzing issue...", issue_number=issue_number
            )

            # This would normally call the spec creation process
            # For now, we just create the state and let the frontend handle spec creation
            # via the existing investigation flow

            state.update_status(AutoFixStatus.CREATING_SPEC)
            await state.save(self.github_dir)

            self._report_progress(
                "complete", 100, "Ready for spec creation", issue_number=issue_number
            )
            return state

        except Exception as e:
            if state:
                state.status = AutoFixStatus.FAILED
                state.error = str(e)
                await state.save(self.github_dir)
            raise

    async def get_queue(self) -> list[AutoFixState]:
        """Get all issues in the auto-fix queue."""
        issues_dir = self.github_dir / "issues"
        if not issues_dir.exists():
            return []

        queue = []
        for f in issues_dir.glob("autofix_*.json"):
            try:
                issue_number = int(f.stem.replace("autofix_", ""))
                state = AutoFixState.load(self.github_dir, issue_number)
                if state:
                    queue.append(state)
            except (ValueError, json.JSONDecodeError):
                continue

        return sorted(queue, key=lambda s: s.created_at, reverse=True)

    async def check_labeled_issues(
        self, all_issues: list[dict], verify_permissions: bool = True
    ) -> list[dict]:
        """
        Check for issues with auto-fix labels and return their details.

        This is used by the frontend to detect new issues that should be auto-fixed.
        When verify_permissions is True, only returns issues where the label was
        added by an authorized user.

        Args:
            all_issues: All open issues from GitHub
            verify_permissions: Whether to verify who added the trigger label

        Returns:
            List of dicts with issue_number, trigger_label, and authorized status
        """
        if not self.config.auto_fix_enabled:
            return []

        auto_fix_issues = []

        for issue in all_issues:
            labels = [label["name"] for label in issue.get("labels", [])]
            matching_labels = [
                lbl
                for lbl in self.config.auto_fix_labels
                if lbl.lower() in [label.lower() for label in labels]
            ]

            if not matching_labels:
                continue

            # Check if not already in queue
            state = AutoFixState.load(self.github_dir, issue["number"])
            if state and state.status not in [
                AutoFixStatus.FAILED,
                AutoFixStatus.COMPLETED,
            ]:
                continue

            trigger_label = matching_labels[0]  # Use first matching label

            # Optionally verify permissions
            if verify_permissions:
                try:
                    permission_result = (
                        await self.permission_checker.verify_automation_trigger(
                            issue_number=issue["number"],
                            trigger_label=trigger_label,
                        )
                    )
                    if not permission_result.allowed:
                        print(
                            f"[PERMISSION] Skipping #{issue['number']}: {permission_result.reason}",
                            flush=True,
                        )
                        continue
                    print(
                        f"[PERMISSION] #{issue['number']} authorized "
                        f"(by {permission_result.username}, role: {permission_result.role})",
                        flush=True,
                    )
                except Exception as e:
                    print(
                        f"[PERMISSION] Error checking #{issue['number']}: {e}",
                        flush=True,
                    )
                    continue

            auto_fix_issues.append(
                {
                    "issue_number": issue["number"],
                    "trigger_label": trigger_label,
                    "title": issue.get("title", ""),
                }
            )

        return auto_fix_issues
