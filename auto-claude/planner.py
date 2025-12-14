#!/usr/bin/env python3
"""
Implementation Planner
======================

Generates implementation plans from specs by analyzing the task and codebase.
This replaces the initializer's test-generation with subtask-based planning.

The planner:
1. Reads the spec.md to understand what needs to be built
2. Reads project_index.json to understand the codebase structure
3. Reads context.json to know which files are relevant
4. Determines the workflow type (feature, refactor, investigation, etc.)
5. Generates phases and subtasks with proper dependencies
6. Outputs implementation_plan.json

Usage:
    python auto-claude/planner.py --spec-dir auto-claude/specs/001-feature/
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from implementation_plan import (
    ImplementationPlan,
    Phase,
    Subtask,
    Verification,
    WorkflowType,
    PhaseType,
    SubtaskStatus,
    VerificationType,
)


@dataclass
class PlannerContext:
    """Context gathered for planning."""
    spec_content: str
    project_index: dict
    task_context: dict
    services_involved: list[str]
    workflow_type: WorkflowType
    files_to_modify: list[dict]
    files_to_reference: list[dict]


class ImplementationPlanner:
    """Generates implementation plans from specs."""

    def __init__(self, spec_dir: Path):
        self.spec_dir = spec_dir
        self.context: Optional[PlannerContext] = None

    def load_context(self) -> PlannerContext:
        """Load all context files from spec directory."""
        # Read spec.md
        spec_file = self.spec_dir / "spec.md"
        spec_content = spec_file.read_text() if spec_file.exists() else ""

        # Read project_index.json
        index_file = self.spec_dir / "project_index.json"
        project_index = {}
        if index_file.exists():
            with open(index_file) as f:
                project_index = json.load(f)

        # Read context.json
        context_file = self.spec_dir / "context.json"
        task_context = {}
        if context_file.exists():
            with open(context_file) as f:
                task_context = json.load(f)

        # Determine services involved
        services = task_context.get("scoped_services", [])
        if not services:
            services = list(project_index.get("services", {}).keys())

        # Determine workflow type from multiple sources (priority order)
        workflow_type = self._determine_workflow_type(spec_content)

        self.context = PlannerContext(
            spec_content=spec_content,
            project_index=project_index,
            task_context=task_context,
            services_involved=services,
            workflow_type=workflow_type,
            files_to_modify=task_context.get("files_to_modify", []),
            files_to_reference=task_context.get("files_to_reference", []),
        )

        return self.context

    def _determine_workflow_type(self, spec_content: str) -> WorkflowType:
        """Determine workflow type from multiple sources.
        
        Priority order (highest to lowest):
        1. requirements.json - User's explicit intent
        2. complexity_assessment.json - AI's assessment
        3. spec.md explicit declaration - Spec writer's declaration
        4. Keyword-based detection - Last resort fallback
        """
        type_mapping = {
            'feature': WorkflowType.FEATURE,
            'refactor': WorkflowType.REFACTOR,
            'investigation': WorkflowType.INVESTIGATION,
            'migration': WorkflowType.MIGRATION,
            'simple': WorkflowType.SIMPLE,
        }
        
        # 1. Check requirements.json (user's explicit intent)
        requirements_file = self.spec_dir / "requirements.json"
        if requirements_file.exists():
            try:
                with open(requirements_file) as f:
                    requirements = json.load(f)
                declared_type = requirements.get("workflow_type", "").lower()
                if declared_type in type_mapping:
                    return type_mapping[declared_type]
            except (json.JSONDecodeError, KeyError):
                pass
        
        # 2. Check complexity_assessment.json (AI's assessment)
        assessment_file = self.spec_dir / "complexity_assessment.json"
        if assessment_file.exists():
            try:
                with open(assessment_file) as f:
                    assessment = json.load(f)
                declared_type = assessment.get("workflow_type", "").lower()
                if declared_type in type_mapping:
                    return type_mapping[declared_type]
            except (json.JSONDecodeError, KeyError):
                pass
        
        # 3. & 4. Fall back to spec content detection
        return self._detect_workflow_type_from_spec(spec_content)
    
    def _detect_workflow_type_from_spec(self, spec_content: str) -> WorkflowType:
        """Detect workflow type from spec content (fallback method).
        
        Priority:
        1. Explicit Type: declaration in spec.md
        2. Keyword-based detection (last resort)
        """
        content_lower = spec_content.lower()
        
        type_mapping = {
            'feature': WorkflowType.FEATURE,
            'refactor': WorkflowType.REFACTOR,
            'investigation': WorkflowType.INVESTIGATION,
            'migration': WorkflowType.MIGRATION,
            'simple': WorkflowType.SIMPLE,
        }
        
        # Check for explicit workflow type declaration in spec
        # Look for patterns like "**Type**: feature" or "Type: refactor"
        explicit_type_patterns = [
            r'\*\*type\*\*:\s*(\w+)',      # **Type**: feature
            r'type:\s*(\w+)',               # Type: feature
            r'workflow\s*type:\s*(\w+)',    # Workflow Type: feature
        ]
        
        for pattern in explicit_type_patterns:
            match = re.search(pattern, content_lower)
            if match:
                declared_type = match.group(1).strip()
                if declared_type in type_mapping:
                    return type_mapping[declared_type]

        # FALLBACK: Keyword-based detection (only if no explicit type found)
        # Investigation indicators
        investigation_keywords = ["bug", "fix", "issue", "broken", "not working", "investigate", "debug"]
        if any(kw in content_lower for kw in investigation_keywords):
            # Check if it's clearly a bug investigation
            if "unknown" in content_lower or "intermittent" in content_lower or "random" in content_lower:
                return WorkflowType.INVESTIGATION

        # Refactor indicators - only match if the INTENT is to refactor, not incidental mentions
        # These should be in headings or task descriptions, not implementation notes
        refactor_keywords = ["migrate", "refactor", "convert", "upgrade", "replace", "move from", "transition"]
        # Check if refactor keyword appears in a heading or workflow type context
        for line in spec_content.split('\n'):
            line_lower = line.lower().strip()
            # Only trigger on headings or explicit task descriptions
            if line_lower.startswith(('#', '**', '- [ ]', '- [x]')):
                if any(kw in line_lower for kw in refactor_keywords):
                    return WorkflowType.REFACTOR

        # Migration indicators (data)
        migration_keywords = ["data migration", "migrate data", "import", "export", "batch"]
        if any(kw in content_lower for kw in migration_keywords):
            return WorkflowType.MIGRATION

        # Default to feature
        return WorkflowType.FEATURE

    def _extract_feature_name(self) -> str:
        """Extract feature name from spec."""
        # Try to find title in spec
        lines = self.context.spec_content.split("\n")
        for line in lines[:10]:
            if line.startswith("# "):
                title = line[2:].strip()
                # Remove common prefixes
                for prefix in ["Specification:", "Spec:", "Feature:"]:
                    if title.startswith(prefix):
                        title = title[len(prefix):].strip()
                return title

        return "Unnamed Feature"

    def _group_files_by_service(self) -> dict[str, list[dict]]:
        """Group files to modify by service."""
        groups: dict[str, list[dict]] = {}

        for file_info in self.context.files_to_modify:
            path = file_info.get("path", "")
            service = file_info.get("service", "unknown")

            # Try to infer service from path if not specified
            if service == "unknown":
                for svc_name, svc_info in self.context.project_index.get("services", {}).items():
                    svc_path = svc_info.get("path", svc_name)
                    if path.startswith(svc_path) or path.startswith(f"{svc_name}/"):
                        service = svc_name
                        break

            if service not in groups:
                groups[service] = []
            groups[service].append(file_info)

        return groups

    def _get_patterns_for_service(self, service: str) -> list[str]:
        """Get reference patterns for a service."""
        patterns = []
        for file_info in self.context.files_to_reference:
            file_service = file_info.get("service", "")
            if file_service == service or not file_service:
                patterns.append(file_info.get("path", ""))
        return patterns[:3]  # Limit to top 3

    def _create_verification(self, service: str, subtask_type: str) -> Verification:
        """Create appropriate verification for a subtask."""
        service_info = self.context.project_index.get("services", {}).get(service, {})
        port = service_info.get("port")

        if subtask_type == "model":
            return Verification(
                type=VerificationType.COMMAND,
                run="echo 'Model created - verify with migration'",
            )
        elif subtask_type == "endpoint":
            return Verification(
                type=VerificationType.API,
                method="GET",
                url=f"http://localhost:{port}/health" if port else "/health",
                expect_status=200,
            )
        elif subtask_type == "component":
            return Verification(
                type=VerificationType.BROWSER,
                scenario="Component renders without errors",
            )
        elif subtask_type == "task":
            return Verification(
                type=VerificationType.COMMAND,
                run="echo 'Task registered - verify with celery inspect'",
            )
        else:
            return Verification(type=VerificationType.MANUAL)

    def generate_feature_plan(self) -> ImplementationPlan:
        """Generate a feature implementation plan."""
        feature_name = self._extract_feature_name()
        files_by_service = self._group_files_by_service()

        phases = []
        phase_num = 0

        # Determine service order (backend first, then workers, then frontend)
        service_order = []
        for svc in ["backend", "api", "server"]:
            if svc in files_by_service:
                service_order.append(svc)
        for svc in ["worker", "celery", "jobs", "tasks"]:
            if svc in files_by_service:
                service_order.append(svc)
        for svc in ["frontend", "web", "client", "ui"]:
            if svc in files_by_service:
                service_order.append(svc)
        # Add any remaining services
        for svc in files_by_service:
            if svc not in service_order:
                service_order.append(svc)

        backend_phase = None
        worker_phase = None

        for service in service_order:
            files = files_by_service[service]
            if not files:
                continue

            phase_num += 1
            patterns = self._get_patterns_for_service(service)

            # Create subtasks for each file
            subtasks = []
            for file_info in files:
                path = file_info.get("path", "")
                reason = file_info.get("reason", "")

                # Determine subtask type from path
                subtask_type = "code"
                if "model" in path.lower() or "schema" in path.lower():
                    subtask_type = "model"
                elif "route" in path.lower() or "endpoint" in path.lower() or "api" in path.lower():
                    subtask_type = "endpoint"
                elif "component" in path.lower() or path.endswith(".tsx") or path.endswith(".jsx"):
                    subtask_type = "component"
                elif "task" in path.lower() or "worker" in path.lower() or "celery" in path.lower():
                    subtask_type = "task"

                subtask_id = Path(path).stem.replace(".", "-").lower()

                subtasks.append(Subtask(
                    id=f"{service}-{subtask_id}",
                    description=f"Modify {path}: {reason}" if reason else f"Update {path}",
                    service=service,
                    files_to_modify=[path],
                    patterns_from=patterns,
                    verification=self._create_verification(service, subtask_type),
                ))

            # Determine dependencies
            depends_on = []
            service_type = self.context.project_index.get("services", {}).get(service, {}).get("type", "")

            if service_type in ["worker", "celery", "jobs"] and backend_phase:
                depends_on = [backend_phase]
            elif service_type in ["frontend", "web", "client", "ui"] and backend_phase:
                depends_on = [backend_phase]

            phase = Phase(
                phase=phase_num,
                name=f"{service.title()} Implementation",
                type=PhaseType.IMPLEMENTATION,
                subtasks=subtasks,
                depends_on=depends_on,
                parallel_safe=len(subtasks) > 1,
            )
            phases.append(phase)

            # Track for dependencies
            if service_type in ["backend", "api", "server"]:
                backend_phase = phase_num
            elif service_type in ["worker", "celery"]:
                worker_phase = phase_num

        # Add integration phase if multiple services
        if len(service_order) > 1:
            phase_num += 1
            integration_depends = list(range(1, phase_num))

            phases.append(Phase(
                phase=phase_num,
                name="Integration",
                type=PhaseType.INTEGRATION,
                depends_on=integration_depends,
                subtasks=[
                    Subtask(
                        id="integration-wiring",
                        description="Wire all services together",
                        all_services=True,
                        verification=Verification(
                            type=VerificationType.BROWSER,
                            scenario="End-to-end flow works",
                        ),
                    ),
                    Subtask(
                        id="integration-testing",
                        description="Verify complete feature works",
                        all_services=True,
                        verification=Verification(
                            type=VerificationType.BROWSER,
                            scenario="All acceptance criteria met",
                        ),
                    ),
                ],
            ))

        # Extract final acceptance from spec
        final_acceptance = self._extract_acceptance_criteria()

        return ImplementationPlan(
            feature=feature_name,
            workflow_type=WorkflowType.FEATURE,
            services_involved=self.context.services_involved,
            phases=phases,
            final_acceptance=final_acceptance,
            spec_file=str(self.spec_dir / "spec.md"),
        )

    def generate_investigation_plan(self) -> ImplementationPlan:
        """Generate an investigation plan for debugging."""
        feature_name = self._extract_feature_name()

        phases = [
            Phase(
                phase=1,
                name="Reproduce & Instrument",
                type=PhaseType.INVESTIGATION,
                subtasks=[
                    Subtask(
                        id="add-logging",
                        description="Add detailed logging around suspected problem areas",
                        expected_output="Logs capture relevant state changes and events",
                        files_to_modify=[f.get("path", "") for f in self.context.files_to_modify[:3]],
                    ),
                    Subtask(
                        id="create-repro",
                        description="Create reliable reproduction steps",
                        expected_output="Can reproduce issue on demand with documented steps",
                    ),
                ],
            ),
            Phase(
                phase=2,
                name="Investigate & Analyze",
                type=PhaseType.INVESTIGATION,
                depends_on=[1],
                subtasks=[
                    Subtask(
                        id="analyze-logs",
                        description="Analyze logs from multiple reproductions",
                        expected_output="Pattern identified in when/how issue occurs",
                    ),
                    Subtask(
                        id="form-hypothesis",
                        description="Form and test hypotheses about root cause",
                        expected_output="Root cause identified with supporting evidence",
                    ),
                ],
            ),
            Phase(
                phase=3,
                name="Implement Fix",
                type=PhaseType.IMPLEMENTATION,
                depends_on=[2],
                subtasks=[
                    Subtask(
                        id="implement-fix",
                        description="[TO BE DETERMINED: Fix based on investigation findings]",
                        status=SubtaskStatus.BLOCKED,
                    ),
                    Subtask(
                        id="add-regression-test",
                        description="Add test to prevent issue from recurring",
                        status=SubtaskStatus.BLOCKED,
                    ),
                ],
            ),
            Phase(
                phase=4,
                name="Verify & Harden",
                type=PhaseType.INTEGRATION,
                depends_on=[3],
                subtasks=[
                    Subtask(
                        id="verify-fix",
                        description="Verify issue no longer occurs",
                        verification=Verification(
                            type=VerificationType.MANUAL,
                            scenario="Run reproduction steps - issue should not occur",
                        ),
                    ),
                    Subtask(
                        id="add-monitoring",
                        description="Add alerting/monitoring to catch if issue returns",
                    ),
                ],
            ),
        ]

        return ImplementationPlan(
            feature=feature_name,
            workflow_type=WorkflowType.INVESTIGATION,
            services_involved=self.context.services_involved,
            phases=phases,
            final_acceptance=[
                "Issue no longer reproducible",
                "Root cause documented",
                "Regression test in place",
            ],
            spec_file=str(self.spec_dir / "spec.md"),
        )

    def generate_refactor_plan(self) -> ImplementationPlan:
        """Generate a refactor plan with stage-based phases."""
        feature_name = self._extract_feature_name()

        # For refactors, stages are: Add new, Migrate, Remove old, Cleanup
        phases = [
            Phase(
                phase=1,
                name="Add New System",
                type=PhaseType.IMPLEMENTATION,
                subtasks=[
                    Subtask(
                        id="add-new-implementation",
                        description="Implement new system alongside existing",
                        files_to_modify=[f.get("path", "") for f in self.context.files_to_modify],
                        patterns_from=[f.get("path", "") for f in self.context.files_to_reference[:3]],
                        verification=Verification(
                            type=VerificationType.COMMAND,
                            run="echo 'New system added - both old and new should work'",
                        ),
                    ),
                ],
            ),
            Phase(
                phase=2,
                name="Migrate Consumers",
                type=PhaseType.IMPLEMENTATION,
                depends_on=[1],
                subtasks=[
                    Subtask(
                        id="migrate-to-new",
                        description="Update consumers to use new system",
                        verification=Verification(
                            type=VerificationType.BROWSER,
                            scenario="All functionality works with new system",
                        ),
                    ),
                ],
            ),
            Phase(
                phase=3,
                name="Remove Old System",
                type=PhaseType.CLEANUP,
                depends_on=[2],
                subtasks=[
                    Subtask(
                        id="remove-old",
                        description="Remove old system code",
                        verification=Verification(
                            type=VerificationType.COMMAND,
                            run="echo 'Old system removed - verify no references remain'",
                        ),
                    ),
                ],
            ),
            Phase(
                phase=4,
                name="Polish",
                type=PhaseType.CLEANUP,
                depends_on=[3],
                subtasks=[
                    Subtask(
                        id="cleanup",
                        description="Final cleanup and documentation",
                    ),
                    Subtask(
                        id="verify-complete",
                        description="Verify refactor is complete",
                        verification=Verification(
                            type=VerificationType.BROWSER,
                            scenario="All functionality works, no regressions",
                        ),
                    ),
                ],
            ),
        ]

        return ImplementationPlan(
            feature=feature_name,
            workflow_type=WorkflowType.REFACTOR,
            services_involved=self.context.services_involved,
            phases=phases,
            final_acceptance=[
                "All functionality migrated to new system",
                "Old system completely removed",
                "No regressions in existing features",
            ],
            spec_file=str(self.spec_dir / "spec.md"),
        )

    def _extract_acceptance_criteria(self) -> list[str]:
        """Extract acceptance criteria from spec."""
        criteria = []
        in_criteria_section = False

        for line in self.context.spec_content.split("\n"):
            # Look for success criteria or acceptance sections
            if any(header in line.lower() for header in ["success criteria", "acceptance", "done when", "complete when"]):
                in_criteria_section = True
                continue

            if in_criteria_section:
                # Stop at next section
                if line.startswith("##"):
                    break

                # Extract criteria (lines starting with -, *, or [])
                line = line.strip()
                if line.startswith(("- ", "* ", "- [ ]", "- [x]")):
                    # Clean up the line
                    criterion = line.lstrip("-*[] x").strip()
                    if criterion:
                        criteria.append(criterion)

        # If no criteria found, create generic ones
        if not criteria:
            criteria = [
                "Feature works as specified",
                "No console errors",
                "No regressions in existing functionality",
            ]

        return criteria

    def generate_plan(self) -> ImplementationPlan:
        """Generate the appropriate plan based on workflow type."""
        if not self.context:
            self.load_context()

        if self.context.workflow_type == WorkflowType.INVESTIGATION:
            return self.generate_investigation_plan()
        elif self.context.workflow_type == WorkflowType.REFACTOR:
            return self.generate_refactor_plan()
        else:
            return self.generate_feature_plan()

    def save_plan(self, plan: ImplementationPlan) -> Path:
        """Save plan to spec directory."""
        output_path = self.spec_dir / "implementation_plan.json"
        plan.save(output_path)
        print(f"Implementation plan saved to: {output_path}")
        return output_path


def generate_implementation_plan(spec_dir: Path) -> ImplementationPlan:
    """Main entry point for generating an implementation plan."""
    planner = ImplementationPlanner(spec_dir)
    planner.load_context()
    plan = planner.generate_plan()
    planner.save_plan(plan)
    return plan


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate implementation plan from spec"
    )
    parser.add_argument(
        "--spec-dir",
        type=Path,
        required=True,
        help="Directory containing spec.md, project_index.json, context.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output path for implementation_plan.json (default: spec-dir/implementation_plan.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print plan without saving",
    )

    args = parser.parse_args()

    planner = ImplementationPlanner(args.spec_dir)
    planner.load_context()
    plan = planner.generate_plan()

    if args.dry_run:
        print(json.dumps(plan.to_dict(), indent=2))
        print("\n---\n")
        print(plan.get_status_summary())
    else:
        output_path = args.output or (args.spec_dir / "implementation_plan.json")
        plan.save(output_path)
        print(f"Plan saved to: {output_path}")
        print("\n" + plan.get_status_summary())


if __name__ == "__main__":
    main()
