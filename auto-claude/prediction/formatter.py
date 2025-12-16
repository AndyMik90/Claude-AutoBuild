"""
Markdown formatting for pre-implementation checklists.
"""

from .models import PreImplementationChecklist


class ChecklistFormatter:
    """Formats checklists as markdown for agent consumption."""

    @staticmethod
    def format_markdown(checklist: PreImplementationChecklist) -> str:
        """
        Format checklist as markdown for agent consumption.

        Args:
            checklist: PreImplementationChecklist to format

        Returns:
            Markdown-formatted checklist string
        """
        lines = []

        lines.append(
            f"## Pre-Implementation Checklist: {checklist.subtask_description}"
        )
        lines.append("")

        # Predicted issues
        if checklist.predicted_issues:
            lines.extend(ChecklistFormatter._format_predicted_issues(checklist))

        # Patterns to follow
        if checklist.patterns_to_follow:
            lines.extend(ChecklistFormatter._format_patterns(checklist))

        # Known gotchas
        if checklist.common_mistakes:
            lines.extend(ChecklistFormatter._format_gotchas(checklist))

        # Files to reference
        if checklist.files_to_reference:
            lines.extend(ChecklistFormatter._format_files_to_reference(checklist))

        # Verification reminders
        if checklist.verification_reminders:
            lines.extend(ChecklistFormatter._format_verification_reminders(checklist))

        # Pre-implementation checklist
        lines.extend(ChecklistFormatter._format_pre_start_checklist())

        return "\n".join(lines)

    @staticmethod
    def _format_predicted_issues(checklist: PreImplementationChecklist) -> list[str]:
        """Format predicted issues section."""
        lines = []
        lines.append("### Predicted Issues (based on similar work)")
        lines.append("")
        lines.append("| Issue | Likelihood | Prevention |")
        lines.append("|-------|------------|------------|")

        for issue in checklist.predicted_issues:
            # Escape pipe characters in content
            desc = issue.description.replace("|", "\\|")
            prev = issue.prevention.replace("|", "\\|")
            lines.append(f"| {desc} | {issue.likelihood.capitalize()} | {prev} |")

        lines.append("")
        return lines

    @staticmethod
    def _format_patterns(checklist: PreImplementationChecklist) -> list[str]:
        """Format patterns to follow section."""
        lines = []
        lines.append("### Patterns to Follow")
        lines.append("")
        lines.append("From previous sessions and codebase analysis:")
        for pattern in checklist.patterns_to_follow:
            lines.append(f"- {pattern}")
        lines.append("")
        return lines

    @staticmethod
    def _format_gotchas(checklist: PreImplementationChecklist) -> list[str]:
        """Format known gotchas section."""
        lines = []
        lines.append("### Known Gotchas in This Codebase")
        lines.append("")
        lines.append("From memory/gotchas.md:")
        for gotcha in checklist.common_mistakes:
            lines.append(f"- [ ] {gotcha}")
        lines.append("")
        return lines

    @staticmethod
    def _format_files_to_reference(
        checklist: PreImplementationChecklist,
    ) -> list[str]:
        """Format files to reference section."""
        lines = []
        lines.append("### Files to Reference")
        lines.append("")
        for file_path in checklist.files_to_reference:
            lines.append(f"- `{file_path}` - Check for similar patterns and code style")
        lines.append("")
        return lines

    @staticmethod
    def _format_verification_reminders(
        checklist: PreImplementationChecklist,
    ) -> list[str]:
        """Format verification reminders section."""
        lines = []
        lines.append("### Verification Reminders")
        lines.append("")
        for reminder in checklist.verification_reminders:
            lines.append(f"- [ ] {reminder}")
        lines.append("")
        return lines

    @staticmethod
    def _format_pre_start_checklist() -> list[str]:
        """Format the pre-start checklist section."""
        lines = []
        lines.append("### Before You Start Implementing")
        lines.append("")
        lines.append("- [ ] I have read and understood all predicted issues above")
        lines.append(
            "- [ ] I have reviewed the reference files to understand existing patterns"
        )
        lines.append("- [ ] I know how to prevent the high-likelihood issues")
        lines.append("- [ ] I understand the verification requirements")
        lines.append("")
        return lines
