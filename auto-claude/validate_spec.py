#!/usr/bin/env python3
"""
Spec Validation System
======================

Validates spec outputs at each checkpoint to ensure reliability.
This is the enforcement layer that catches errors before they propagate.

The spec creation process has mandatory checkpoints:
1. Prerequisites (project_index.json exists)
2. Context (context.json created with required fields)
3. Spec document (spec.md with required sections)
4. Implementation plan (implementation_plan.json with valid schema)

Usage:
    python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature/ --checkpoint prereqs
    python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature/ --checkpoint context
    python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature/ --checkpoint spec
    python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature/ --checkpoint plan
    python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature/ --checkpoint all
"""

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# JSON Schemas for validation
IMPLEMENTATION_PLAN_SCHEMA = {
    "required_fields": ["feature", "workflow_type", "phases"],
    "optional_fields": ["services_involved", "final_acceptance", "created_at", "updated_at", "spec_file", "qa_acceptance", "qa_signoff", "summary", "description", "workflow_rationale", "status"],
    "workflow_types": ["feature", "refactor", "investigation", "migration", "simple"],
    "phase_schema": {
        # Support both old format ("phase" number) and new format ("id" string)
        "required_fields_either": [["phase", "id"]],  # At least one of these
        "required_fields": ["name", "subtasks"],
        "optional_fields": ["type", "depends_on", "parallel_safe", "description", "phase", "id"],
        "phase_types": ["setup", "implementation", "investigation", "integration", "cleanup"],
    },
    "subtask_schema": {
        "required_fields": ["id", "description", "status"],
        "optional_fields": [
            "service", "all_services", "files_to_modify", "files_to_create",
            "patterns_from", "verification", "expected_output", "actual_output",
            "started_at", "completed_at", "session_id", "critique_result"
        ],
        "status_values": ["pending", "in_progress", "completed", "blocked", "failed"],
    },
    "verification_schema": {
        "required_fields": ["type"],
        "optional_fields": ["run", "url", "method", "expect_status", "expect_contains", "scenario", "steps"],
        "verification_types": ["command", "api", "browser", "component", "manual", "none", "e2e"],
    },
}

CONTEXT_SCHEMA = {
    "required_fields": ["task_description"],
    "optional_fields": [
        "scoped_services", "files_to_modify", "files_to_reference",
        "patterns", "service_contexts", "created_at"
    ],
}

PROJECT_INDEX_SCHEMA = {
    "required_fields": ["project_type"],
    "optional_fields": [
        "services", "infrastructure", "conventions", "root_path",
        "created_at", "git_info"
    ],
    "project_types": ["single", "monorepo"],
}

SPEC_REQUIRED_SECTIONS = [
    "Overview",
    "Workflow Type",
    "Task Scope",
    "Success Criteria",
]

SPEC_RECOMMENDED_SECTIONS = [
    "Files to Modify",
    "Files to Reference",
    "Requirements",
    "QA Acceptance Criteria",
]


@dataclass
class ValidationResult:
    """Result of a validation check."""
    valid: bool
    checkpoint: str
    errors: list[str]
    warnings: list[str]
    fixes: list[str]  # Suggested fixes

    def __str__(self) -> str:
        lines = [f"Checkpoint: {self.checkpoint}"]
        lines.append(f"Status: {'PASS' if self.valid else 'FAIL'}")

        if self.errors:
            lines.append("\nErrors:")
            for err in self.errors:
                lines.append(f"  ✗ {err}")

        if self.warnings:
            lines.append("\nWarnings:")
            for warn in self.warnings:
                lines.append(f"  ⚠ {warn}")

        if self.fixes and not self.valid:
            lines.append("\nSuggested Fixes:")
            for fix in self.fixes:
                lines.append(f"  → {fix}")

        return "\n".join(lines)


class SpecValidator:
    """Validates spec outputs at each checkpoint."""

    def __init__(self, spec_dir: Path):
        self.spec_dir = Path(spec_dir)

    def validate_all(self) -> list[ValidationResult]:
        """Run all validations."""
        results = [
            self.validate_prereqs(),
            self.validate_context(),
            self.validate_spec_document(),
            self.validate_implementation_plan(),
        ]
        return results

    def validate_prereqs(self) -> ValidationResult:
        """Validate prerequisites exist."""
        errors = []
        warnings = []
        fixes = []

        # Check spec directory exists
        if not self.spec_dir.exists():
            errors.append(f"Spec directory does not exist: {self.spec_dir}")
            fixes.append(f"Create directory: mkdir -p {self.spec_dir}")
            return ValidationResult(False, "prereqs", errors, warnings, fixes)

        # Check project_index.json
        project_index = self.spec_dir / "project_index.json"
        if not project_index.exists():
            # Check if it exists at auto-claude level
            auto_build_index = self.spec_dir.parent.parent / "project_index.json"
            if auto_build_index.exists():
                warnings.append("project_index.json exists at auto-claude/ but not in spec folder")
                fixes.append(f"Copy: cp {auto_build_index} {project_index}")
            else:
                errors.append("project_index.json not found")
                fixes.append("Run: python auto-claude/analyzer.py --output auto-claude/project_index.json")

        return ValidationResult(
            valid=len(errors) == 0,
            checkpoint="prereqs",
            errors=errors,
            warnings=warnings,
            fixes=fixes,
        )

    def validate_context(self) -> ValidationResult:
        """Validate context.json exists and has required structure."""
        errors = []
        warnings = []
        fixes = []

        context_file = self.spec_dir / "context.json"

        if not context_file.exists():
            errors.append("context.json not found")
            fixes.append("Run: python auto-claude/context.py --task '[task]' --services '[services]' --output context.json")
            return ValidationResult(False, "context", errors, warnings, fixes)

        try:
            with open(context_file) as f:
                context = json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"context.json is invalid JSON: {e}")
            fixes.append("Regenerate context.json or fix JSON syntax")
            return ValidationResult(False, "context", errors, warnings, fixes)

        # Check required fields
        for field in CONTEXT_SCHEMA["required_fields"]:
            if field not in context:
                errors.append(f"Missing required field: {field}")
                fixes.append(f"Add '{field}' to context.json")

        # Check optional but recommended fields
        recommended = ["files_to_modify", "files_to_reference", "scoped_services"]
        for field in recommended:
            if field not in context or not context[field]:
                warnings.append(f"Missing recommended field: {field}")

        return ValidationResult(
            valid=len(errors) == 0,
            checkpoint="context",
            errors=errors,
            warnings=warnings,
            fixes=fixes,
        )

    def validate_spec_document(self) -> ValidationResult:
        """Validate spec.md exists and has required sections."""
        errors = []
        warnings = []
        fixes = []

        spec_file = self.spec_dir / "spec.md"

        if not spec_file.exists():
            errors.append("spec.md not found")
            fixes.append("Create spec.md with required sections")
            return ValidationResult(False, "spec", errors, warnings, fixes)

        content = spec_file.read_text()

        # Check for required sections
        for section in SPEC_REQUIRED_SECTIONS:
            # Look for ## Section or # Section
            pattern = rf"^##?\s+{re.escape(section)}"
            if not re.search(pattern, content, re.MULTILINE | re.IGNORECASE):
                errors.append(f"Missing required section: '{section}'")
                fixes.append(f"Add '## {section}' section to spec.md")

        # Check for recommended sections
        for section in SPEC_RECOMMENDED_SECTIONS:
            pattern = rf"^##?\s+{re.escape(section)}"
            if not re.search(pattern, content, re.MULTILINE | re.IGNORECASE):
                warnings.append(f"Missing recommended section: '{section}'")

        # Check minimum content length
        if len(content) < 500:
            warnings.append("spec.md seems too short (< 500 chars)")

        return ValidationResult(
            valid=len(errors) == 0,
            checkpoint="spec",
            errors=errors,
            warnings=warnings,
            fixes=fixes,
        )

    def validate_implementation_plan(self) -> ValidationResult:
        """Validate implementation_plan.json exists and has valid schema."""
        errors = []
        warnings = []
        fixes = []

        plan_file = self.spec_dir / "implementation_plan.json"

        if not plan_file.exists():
            errors.append("implementation_plan.json not found")
            fixes.append(f"Run: python auto-claude/planner.py --spec-dir {self.spec_dir}")
            return ValidationResult(False, "plan", errors, warnings, fixes)

        try:
            with open(plan_file) as f:
                plan = json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"implementation_plan.json is invalid JSON: {e}")
            fixes.append("Regenerate with: python auto-claude/planner.py --spec-dir " + str(self.spec_dir))
            return ValidationResult(False, "plan", errors, warnings, fixes)

        # Validate top-level required fields
        schema = IMPLEMENTATION_PLAN_SCHEMA
        for field in schema["required_fields"]:
            if field not in plan:
                errors.append(f"Missing required field: {field}")
                fixes.append(f"Add '{field}' to implementation_plan.json")

        # Validate workflow_type
        if "workflow_type" in plan:
            if plan["workflow_type"] not in schema["workflow_types"]:
                errors.append(f"Invalid workflow_type: {plan['workflow_type']}")
                fixes.append(f"Use one of: {schema['workflow_types']}")

        # Validate phases
        phases = plan.get("phases", [])
        if not phases:
            errors.append("No phases defined")
            fixes.append("Add at least one phase with subtasks")
        else:
            for i, phase in enumerate(phases):
                phase_errors = self._validate_phase(phase, i)
                errors.extend(phase_errors)

        # Check for at least one subtask
        total_subtasks = sum(len(p.get("subtasks", [])) for p in phases)
        if total_subtasks == 0:
            errors.append("No subtasks defined in any phase")
            fixes.append("Add subtasks to phases")

        # Validate dependencies don't create cycles
        dep_errors = self._validate_dependencies(phases)
        errors.extend(dep_errors)

        return ValidationResult(
            valid=len(errors) == 0,
            checkpoint="plan",
            errors=errors,
            warnings=warnings,
            fixes=fixes,
        )

    def _validate_phase(self, phase: dict, index: int) -> list[str]:
        """Validate a single phase.

        Supports both legacy format (using 'phase' number) and new format (using 'id' string).
        """
        errors = []
        schema = IMPLEMENTATION_PLAN_SCHEMA["phase_schema"]

        # Check required fields
        for field in schema["required_fields"]:
            if field not in phase:
                errors.append(f"Phase {index + 1}: missing required field '{field}'")

        # Check either-or required fields (must have at least one from each group)
        for field_group in schema.get("required_fields_either", []):
            if not any(f in phase for f in field_group):
                errors.append(f"Phase {index + 1}: missing required field (need one of: {', '.join(field_group)})")

        if "type" in phase and phase["type"] not in schema["phase_types"]:
            errors.append(f"Phase {index + 1}: invalid type '{phase['type']}'")

        # Validate subtasks
        subtasks = phase.get("subtasks", [])
        for j, subtask in enumerate(subtasks):
            subtask_errors = self._validate_subtask(subtask, index, j)
            errors.extend(subtask_errors)

        return errors

    def _validate_subtask(self, subtask: dict, phase_idx: int, subtask_idx: int) -> list[str]:
        """Validate a single subtask."""
        errors = []
        schema = IMPLEMENTATION_PLAN_SCHEMA["subtask_schema"]

        for field in schema["required_fields"]:
            if field not in subtask:
                errors.append(f"Phase {phase_idx + 1}, Subtask {subtask_idx + 1}: missing required field '{field}'")

        if "status" in subtask and subtask["status"] not in schema["status_values"]:
            errors.append(f"Phase {phase_idx + 1}, Subtask {subtask_idx + 1}: invalid status '{subtask['status']}'")

        # Validate verification if present
        if "verification" in subtask:
            ver = subtask["verification"]
            ver_schema = IMPLEMENTATION_PLAN_SCHEMA["verification_schema"]

            if "type" not in ver:
                errors.append(f"Phase {phase_idx + 1}, Subtask {subtask_idx + 1}: verification missing 'type'")
            elif ver["type"] not in ver_schema["verification_types"]:
                errors.append(f"Phase {phase_idx + 1}, Subtask {subtask_idx + 1}: invalid verification type '{ver['type']}'")

        return errors

    def _validate_dependencies(self, phases: list[dict]) -> list[str]:
        """Check for circular dependencies.

        Supports both legacy numeric phase IDs and new string-based phase IDs.
        """
        errors = []

        # Build a map of phase identifiers (supports both "id" and "phase" fields)
        # and track their position/order for cycle detection
        phase_ids = set()
        phase_order = {}  # Maps phase id -> position index

        for i, p in enumerate(phases):
            # Support both "id" field (new format) and "phase" field (legacy format)
            phase_id = p.get("id") or p.get("phase", i + 1)
            phase_ids.add(phase_id)
            phase_order[phase_id] = i

        for i, phase in enumerate(phases):
            phase_id = phase.get("id") or phase.get("phase", i + 1)
            depends_on = phase.get("depends_on", [])

            for dep in depends_on:
                if dep not in phase_ids:
                    errors.append(f"Phase {phase_id}: depends on non-existent phase {dep}")
                # Check for forward references (cycles) by comparing positions
                elif phase_order.get(dep, -1) >= i:
                    errors.append(f"Phase {phase_id}: cannot depend on phase {dep} (would create cycle)")

        return errors


def auto_fix_plan(spec_dir: Path) -> bool:
    """Attempt to auto-fix common implementation_plan.json issues."""
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return False

    try:
        with open(plan_file) as f:
            plan = json.load(f)
    except json.JSONDecodeError:
        return False

    fixed = False

    # Fix missing top-level fields
    if "feature" not in plan:
        plan["feature"] = "Unnamed Feature"
        fixed = True

    if "workflow_type" not in plan:
        plan["workflow_type"] = "feature"
        fixed = True

    if "phases" not in plan:
        plan["phases"] = []
        fixed = True

    # Fix phases
    for i, phase in enumerate(plan.get("phases", [])):
        if "phase" not in phase:
            phase["phase"] = i + 1
            fixed = True

        if "name" not in phase:
            phase["name"] = f"Phase {i + 1}"
            fixed = True

        if "subtasks" not in phase:
            phase["subtasks"] = []
            fixed = True

        # Fix subtasks
        for j, subtask in enumerate(phase.get("subtasks", [])):
            if "id" not in subtask:
                subtask["id"] = f"subtask-{i + 1}-{j + 1}"
                fixed = True

            if "description" not in subtask:
                subtask["description"] = "No description"
                fixed = True

            if "status" not in subtask:
                subtask["status"] = "pending"
                fixed = True

    if fixed:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        print(f"Auto-fixed: {plan_file}")

    return fixed


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Validate spec outputs at checkpoints"
    )
    parser.add_argument(
        "--spec-dir",
        type=Path,
        required=True,
        help="Directory containing spec files",
    )
    parser.add_argument(
        "--checkpoint",
        choices=["prereqs", "context", "spec", "plan", "all"],
        default="all",
        help="Which checkpoint to validate",
    )
    parser.add_argument(
        "--auto-fix",
        action="store_true",
        help="Attempt to auto-fix common issues",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON",
    )

    args = parser.parse_args()

    validator = SpecValidator(args.spec_dir)

    if args.auto_fix:
        auto_fix_plan(args.spec_dir)

    # Run validations
    if args.checkpoint == "all":
        results = validator.validate_all()
    elif args.checkpoint == "prereqs":
        results = [validator.validate_prereqs()]
    elif args.checkpoint == "context":
        results = [validator.validate_context()]
    elif args.checkpoint == "spec":
        results = [validator.validate_spec_document()]
    elif args.checkpoint == "plan":
        results = [validator.validate_implementation_plan()]

    # Output
    all_valid = all(r.valid for r in results)

    if args.json:
        output = {
            "valid": all_valid,
            "results": [
                {
                    "checkpoint": r.checkpoint,
                    "valid": r.valid,
                    "errors": r.errors,
                    "warnings": r.warnings,
                    "fixes": r.fixes,
                }
                for r in results
            ],
        }
        print(json.dumps(output, indent=2))
    else:
        print("=" * 60)
        print("  SPEC VALIDATION REPORT")
        print("=" * 60)
        print()

        for result in results:
            print(result)
            print()

        print("=" * 60)
        if all_valid:
            print("  ✓ ALL CHECKPOINTS PASSED")
        else:
            print("  ✗ VALIDATION FAILED - See errors above")
        print("=" * 60)

    sys.exit(0 if all_valid else 1)


if __name__ == "__main__":
    main()
