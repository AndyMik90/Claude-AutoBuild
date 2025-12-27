"""
Plan generation logic for different workflow types.
"""

from pathlib import Path

from implementation_plan import (
    ImplementationPlan,
    Phase,
    PhaseType,
    Subtask,
    SubtaskStatus,
    Verification,
    VerificationType,
    WorkflowType,
)

from .models import PlannerContext
from .utils import (
    create_verification,
    determine_service_order,
    extract_acceptance_criteria,
    extract_feature_name,
    get_patterns_for_service,
    group_files_by_service,
    infer_subtask_type,
)


class PlanGenerator:
    """Base class for plan generators."""

    def __init__(self, context: PlannerContext, spec_dir: Path):
        self.context = context
        self.spec_dir = spec_dir

    def generate(self) -> ImplementationPlan:
        """Generate implementation plan. Override in subclasses."""
        raise NotImplementedError


class FeaturePlanGenerator(PlanGenerator):
    """Generates feature implementation plans."""

    def generate(self) -> ImplementationPlan:
        """Generate a feature implementation plan."""
        feature_name = extract_feature_name(self.context)
        files_by_service = group_files_by_service(self.context)

        phases = []
        phase_num = 0

        # Determine service order (backend first, then workers, then frontend)
        service_order = determine_service_order(files_by_service)

        backend_phase = None
        worker_phase = None

        for service in service_order:
            files = files_by_service[service]
            if not files:
                continue

            phase_num += 1
            patterns = get_patterns_for_service(self.context, service)

            # Create subtasks for each file
            subtasks = []
            for file_info in files:
                path = file_info.get("path", "")
                reason = file_info.get("reason", "")

                # Determine subtask type from path
                subtask_type = infer_subtask_type(path)
                subtask_id = Path(path).stem.replace(".", "-").lower()

                subtasks.append(
                    Subtask(
                        id=f"{service}-{subtask_id}",
                        description=f"Modify {path}: {reason}"
                        if reason
                        else f"Update {path}",
                        service=service,
                        files_to_modify=[path],
                        patterns_from=patterns,
                        verification=create_verification(
                            self.context, service, subtask_type
                        ),
                    )
                )

            # Determine dependencies
            depends_on = []
            service_type = (
                self.context.project_index.get("services", {})
                .get(service, {})
                .get("type", "")
            )

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

            phases.append(
                Phase(
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
                )
            )

        # Extract final acceptance from spec
        final_acceptance = extract_acceptance_criteria(self.context)

        return ImplementationPlan(
            feature=feature_name,
            workflow_type=WorkflowType.FEATURE,
            services_involved=self.context.services_involved,
            phases=phases,
            final_acceptance=final_acceptance,
            spec_file=str(self.spec_dir / "spec.md"),
        )


class InvestigationPlanGenerator(PlanGenerator):
    """Generates investigation plans for debugging."""

    def generate(self) -> ImplementationPlan:
        """Generate an investigation plan for debugging."""
        feature_name = extract_feature_name(self.context)

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
                        files_to_modify=[
                            f.get("path", "") for f in self.context.files_to_modify[:3]
                        ],
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


class RefactorPlanGenerator(PlanGenerator):
    """Generates refactor plans with stage-based phases."""

    def generate(self) -> ImplementationPlan:
        """Generate a refactor plan with stage-based phases."""
        feature_name = extract_feature_name(self.context)

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
                        files_to_modify=[
                            f.get("path", "") for f in self.context.files_to_modify
                        ],
                        patterns_from=[
                            f.get("path", "")
                            for f in self.context.files_to_reference[:3]
                        ],
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


def get_plan_generator(context: PlannerContext, spec_dir: Path) -> PlanGenerator:
    """Factory function to get the appropriate plan generator."""
    if context.workflow_type == WorkflowType.INVESTIGATION:
        return InvestigationPlanGenerator(context, spec_dir)
    elif context.workflow_type == WorkflowType.REFACTOR:
        return RefactorPlanGenerator(context, spec_dir)
    else:
        return FeaturePlanGenerator(context, spec_dir)
