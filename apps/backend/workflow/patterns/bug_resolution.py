"""
Bug Resolution Workflow Pattern
================================

Workflow for fixing bugs and resolving issues.
"""

from typing import Any, Dict, List
from workflow.base import WorkflowPattern, WorkflowStep, register_pattern


@register_pattern
class BugResolutionWorkflow(WorkflowPattern):
    """
    Workflow for resolving bugs and issues.

    Triggers: bug, fix, error, issue, crash, broken, etc.

    Sequence:
    1. Research agent investigates the issue
    2. Maker agent implements the fix
    3. Test agent verifies the fix works
    """

    @property
    def name(self) -> str:
        return "bug-resolution"

    @property
    def description(self) -> str:
        return "Fixes bugs through investigation, patch implementation, and validation"

    @property
    def triggers(self) -> List[str]:
        return [
            "bug",
            "fix",
            "error",
            "issue",
            "crash",
            "broken",
            "not working",
            "doesn't work",
            "failing",
            "fail",
            "incorrect",
            "wrong",
        ]

    def estimate_complexity(self, task: str) -> str:
        """
        Estimate complexity based on bug type.

        Simple bugs: UI fixes, typos, config changes
        Complex bugs: Logic errors, data issues, integration problems
        """
        task_lower = task.lower()

        # Simple bug indicators
        simple_keywords = [
            "button",
            "color",
            "text",
            "typo",
            "spacing",
            "css",
            "style",
            "label",
            "message",
            "placeholder",
            "alignment",
            "padding",
            "margin",
        ]

        # If any simple keyword is present, mark as simple
        if any(kw in task_lower for kw in simple_keywords):
            return "simple"

        return "complex"

    def get_steps(self, task_context: Dict[str, Any]) -> List[WorkflowStep]:
        """
        Get workflow steps for bug resolution.

        Args:
            task_context: Contains 'task', 'complexity', and other context

        Returns:
            List of workflow steps
        """
        return [
            # Step 1: Investigate the bug
            WorkflowStep(
                agent_type="spec_researcher",
                prompt_key="investigate_issue",
                output_file="artifacts/investigation.md",
                depends_on=[],
            ),
            # Step 2: Implement the fix
            WorkflowStep(
                agent_type="coder",
                prompt_key="implement_fix",
                output_file=None,  # No specific output - modifies code directly
                depends_on=["investigate_issue"],
            ),
            # Step 3: Verify the fix
            WorkflowStep(
                agent_type="qa_reviewer",
                prompt_key="verify_fix",
                output_file="artifacts/test_results.md",
                depends_on=["implement_fix"],
                optional=True,  # Can skip if testing environment not available
            ),
        ]
