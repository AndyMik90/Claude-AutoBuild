"""
Development Workflow Flow for CrewAI.

Main orchestration flow that coordinates all crews through the complete
development lifecycle: intake → analysis → development → QA → release.
"""

from crewai.flow.flow import Flow, start, listen, router
from pydantic import BaseModel
from typing import Optional, List, Literal
from enum import Enum
import logging

from ..crews import (
    create_product_management_crew,
    create_development_crew,
    create_qa_release_crew,
)
from ..config import is_crewai_enabled

logger = logging.getLogger(__name__)


class TaskType(str, Enum):
    """Types of development tasks."""
    FEATURE = "feature"
    BUG = "bug"
    REFACTOR = "refactor"
    DOCS = "docs"
    MAINTENANCE = "maintenance"


class WorkflowStatus(str, Enum):
    """Status of the workflow."""
    PENDING = "pending"
    ANALYZING = "analyzing"
    DEVELOPING = "developing"
    QA_VALIDATION = "qa_validation"
    RELEASE_PREP = "release_prep"
    COMPLETED = "completed"
    FAILED = "failed"
    ESCALATED = "escalated"


class WorkflowState(BaseModel):
    """State model for the development workflow."""
    # Input
    user_request: str = ""
    project_dir: str = ""
    spec_dir: str = ""

    # Task metadata
    task_type: Optional[TaskType] = None
    priority: str = "medium"
    complexity: str = "standard"

    # Context gathered
    project_context: Optional[str] = None
    codebase_context: Optional[str] = None

    # Crew outputs
    requirements: Optional[str] = None
    validated_requirements: Optional[str] = None
    prioritized_plan: Optional[str] = None
    architecture: Optional[str] = None
    implementation_report: Optional[str] = None
    code_review_report: Optional[str] = None
    qa_report: Optional[str] = None
    security_report: Optional[str] = None
    release_document: Optional[str] = None

    # Status tracking
    status: WorkflowStatus = WorkflowStatus.PENDING
    qa_iterations: int = 0
    max_qa_iterations: int = 10
    consecutive_failures: int = 0
    max_consecutive_failures: int = 3

    # Error handling
    error_message: Optional[str] = None
    escalation_reason: Optional[str] = None

    # Audit trail
    events: List[str] = []


class DevelopmentWorkflowFlow(Flow[WorkflowState]):
    """
    Main development workflow flow.

    Orchestrates the complete development lifecycle:
    1. Intake - Receive and validate user request
    2. Analysis - Product Management Crew analyzes and prioritizes
    3. Development - Development Crew implements the feature
    4. QA - QA & Release Crew validates and prepares release
    5. Complete or Escalate - Finalize or escalate to human
    """

    def __init__(self, verbose: bool = False):
        super().__init__()
        self.verbose = verbose

    def _log_event(self, message: str):
        """Log an event to the state's event trail."""
        self.state.events.append(message)
        if self.verbose:
            logger.info(message)

    @start()
    def intake_request(self) -> WorkflowState:
        """Initial intake of the user request."""
        self._log_event(f"Workflow started: {self.state.user_request[:100]}...")
        self.state.status = WorkflowStatus.PENDING

        # Validate inputs
        if not self.state.user_request:
            self.state.error_message = "No user request provided"
            self.state.status = WorkflowStatus.FAILED
            return self.state

        if not self.state.project_dir:
            self.state.error_message = "No project directory provided"
            self.state.status = WorkflowStatus.FAILED
            return self.state

        self._log_event("Request validated, proceeding to analysis")
        return self.state

    @listen(intake_request)
    def analyze_and_prioritize(self) -> WorkflowState:
        """Run the Product Management Crew to analyze the request."""
        if self.state.status == WorkflowStatus.FAILED:
            return self.state

        self._log_event("Starting Product Management Crew analysis")
        self.state.status = WorkflowStatus.ANALYZING

        try:
            crew = create_product_management_crew(
                user_request=self.state.user_request,
                project_context=self.state.project_context,
                codebase_context=self.state.codebase_context,
                verbose=self.verbose,
            )

            result = crew.kickoff()

            # Parse the result to extract structured output
            output = str(result)
            self.state.prioritized_plan = output

            # Detect task type from analysis
            output_lower = output.lower()
            if "bug" in output_lower or "fix" in output_lower:
                self.state.task_type = TaskType.BUG
            elif "refactor" in output_lower:
                self.state.task_type = TaskType.REFACTOR
            elif "document" in output_lower or "docs" in output_lower:
                self.state.task_type = TaskType.DOCS
            else:
                self.state.task_type = TaskType.FEATURE

            self._log_event(f"Analysis complete. Task type: {self.state.task_type}")
            return self.state

        except Exception as e:
            self._log_event(f"Analysis failed: {str(e)}")
            self.state.consecutive_failures += 1
            self.state.error_message = str(e)

            if self.state.consecutive_failures >= self.state.max_consecutive_failures:
                self.state.status = WorkflowStatus.ESCALATED
                self.state.escalation_reason = "Consecutive failures in analysis"
            else:
                self.state.status = WorkflowStatus.FAILED

            return self.state

    @router(analyze_and_prioritize)
    def route_by_task_type(self) -> Literal["development", "human_escalation", "failed"]:
        """Route based on task type and analysis results."""
        if self.state.status == WorkflowStatus.ESCALATED:
            return "human_escalation"

        if self.state.status == WorkflowStatus.FAILED:
            return "failed"

        # All task types go to development for now
        # Could add special handling for docs, maintenance, etc.
        return "development"

    @listen("development")
    def run_development(self) -> WorkflowState:
        """Run the Development Crew to implement the feature."""
        self._log_event("Starting Development Crew implementation")
        self.state.status = WorkflowStatus.DEVELOPING

        try:
            crew = create_development_crew(
                requirements=self.state.prioritized_plan or "",
                project_dir=self.state.project_dir,
                spec_dir=self.state.spec_dir,
                project_context=self.state.project_context,
                verbose=self.verbose,
            )

            result = crew.kickoff()

            self.state.implementation_report = str(result)
            self._log_event("Development complete, proceeding to QA")
            return self.state

        except Exception as e:
            self._log_event(f"Development failed: {str(e)}")
            self.state.consecutive_failures += 1
            self.state.error_message = str(e)

            if self.state.consecutive_failures >= self.state.max_consecutive_failures:
                self.state.status = WorkflowStatus.ESCALATED
                self.state.escalation_reason = "Consecutive failures in development"
            else:
                self.state.status = WorkflowStatus.FAILED

            return self.state

    @listen(run_development)
    def qa_validation(self) -> WorkflowState:
        """Run the QA & Release Crew to validate the implementation."""
        if self.state.status in [WorkflowStatus.FAILED, WorkflowStatus.ESCALATED]:
            return self.state

        self._log_event(f"Starting QA validation (iteration {self.state.qa_iterations + 1})")
        self.state.status = WorkflowStatus.QA_VALIDATION
        self.state.qa_iterations += 1

        try:
            # Extract acceptance criteria from prioritized plan
            acceptance_criteria = self._extract_acceptance_criteria()

            crew = create_qa_release_crew(
                implementation_report=self.state.implementation_report or "",
                acceptance_criteria=acceptance_criteria,
                feature_description=self.state.user_request,
                project_dir=self.state.project_dir,
                spec_dir=self.state.spec_dir,
                verbose=self.verbose,
            )

            result = crew.kickoff()

            output = str(result)
            self.state.release_document = output

            # Check if QA passed
            if "PASSED" in output.upper() or "READY" in output.upper():
                self._log_event("QA validation passed")
                self.state.status = WorkflowStatus.RELEASE_PREP
            else:
                self._log_event("QA validation found issues")
                # Will be routed back for fixes if needed

            return self.state

        except Exception as e:
            self._log_event(f"QA validation failed: {str(e)}")
            self.state.consecutive_failures += 1
            self.state.error_message = str(e)

            if self.state.consecutive_failures >= self.state.max_consecutive_failures:
                self.state.status = WorkflowStatus.ESCALATED
                self.state.escalation_reason = "Consecutive failures in QA"

            return self.state

    @router(qa_validation)
    def route_after_qa(self) -> Literal["release", "qa_fix", "human_escalation"]:
        """Route based on QA results."""
        if self.state.status == WorkflowStatus.ESCALATED:
            return "human_escalation"

        if self.state.status == WorkflowStatus.RELEASE_PREP:
            return "release"

        # Check if we've exceeded max QA iterations
        if self.state.qa_iterations >= self.state.max_qa_iterations:
            self.state.status = WorkflowStatus.ESCALATED
            self.state.escalation_reason = f"Exceeded {self.state.max_qa_iterations} QA iterations"
            return "human_escalation"

        return "qa_fix"

    @listen("qa_fix")
    def fix_qa_issues(self) -> WorkflowState:
        """Fix issues found during QA validation."""
        self._log_event(f"Fixing QA issues (iteration {self.state.qa_iterations})")

        # This would trigger QA Fixer agent through the bridge
        # For now, we loop back to development
        # In a full implementation, we'd parse the QA report and create fix tasks

        return self.state

    @listen(fix_qa_issues)
    def rerun_qa(self) -> WorkflowState:
        """Re-run QA after fixes."""
        return self.qa_validation()

    @listen("release")
    def prepare_release(self) -> WorkflowState:
        """Finalize the release."""
        self._log_event("Preparing release")
        self.state.status = WorkflowStatus.COMPLETED
        self._log_event("Workflow completed successfully")
        return self.state

    @listen("human_escalation")
    def escalate_to_human(self) -> WorkflowState:
        """Escalate to human intervention."""
        self._log_event(f"Escalating to human: {self.state.escalation_reason}")
        self.state.status = WorkflowStatus.ESCALATED
        return self.state

    @listen("failed")
    def handle_failure(self) -> WorkflowState:
        """Handle workflow failure."""
        self._log_event(f"Workflow failed: {self.state.error_message}")
        return self.state

    def _extract_acceptance_criteria(self) -> str:
        """Extract acceptance criteria from the prioritized plan."""
        if not self.state.prioritized_plan:
            return "Implement the feature as described"

        # Simple extraction - in production, this would be more sophisticated
        plan = self.state.prioritized_plan
        if "acceptance criteria" in plan.lower():
            # Find the section
            start = plan.lower().find("acceptance criteria")
            end = plan.find("\n\n", start)
            if end == -1:
                end = len(plan)
            return plan[start:end]

        return "Verify the implementation meets the requirements specified in the plan"


def run_development_workflow(
    user_request: str,
    project_dir: str,
    spec_dir: str,
    project_context: Optional[str] = None,
    codebase_context: Optional[str] = None,
    verbose: bool = False,
) -> WorkflowState:
    """
    Run the complete development workflow.

    Args:
        user_request: The user's feature request or task description
        project_dir: Path to the project directory
        spec_dir: Path to the spec directory
        project_context: Optional context about the project
        codebase_context: Optional context about the codebase
        verbose: Enable verbose output

    Returns:
        The final workflow state
    """
    if not is_crewai_enabled():
        raise RuntimeError("CrewAI is not enabled. Enable it in settings first.")

    flow = DevelopmentWorkflowFlow(verbose=verbose)

    # Initialize state
    initial_state = WorkflowState(
        user_request=user_request,
        project_dir=project_dir,
        spec_dir=spec_dir,
        project_context=project_context,
        codebase_context=codebase_context,
    )

    # Run the flow
    result = flow.kickoff(initial_state)

    return result
