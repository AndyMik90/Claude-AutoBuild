"""
QA & Release Crew for CrewAI.

Validates implementation and prepares releases.
Agents: QA Lead, Security Analyst, Release Manager
"""

from crewai import Agent, Task, Crew, Process
from typing import Optional

from ..config import get_agent_model
from ..bridge import AutoClaudeBridge


def create_qa_lead(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the QA Lead agent."""
    model_id, thinking_budget = get_agent_model("qaLead")

    return Agent(
        role="QA Lead",
        goal="Validate all acceptance criteria and ensure implementation quality",
        backstory="""You are a thorough QA Lead with extensive experience in
        software testing and quality assurance. You meticulously verify that
        implementations meet all acceptance criteria, test edge cases, and
        ensure the user experience is polished. You use the Auto-Claude QA
        validation system to systematically verify all requirements.""",
        verbose=verbose,
        llm=model_id,
        max_iter=12,
        memory=True,
        allow_delegation=True,
        tools=[
            bridge.get_tool("run_qa_validation"),
            bridge.get_tool("get_project_context"),
        ],
    )


def create_security_analyst(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the Security Analyst agent."""
    model_id, thinking_budget = get_agent_model("securityAnalyst")

    return Agent(
        role="Security Analyst",
        goal="Identify and report security vulnerabilities in the implementation",
        backstory="""You are a vigilant Security Analyst with deep expertise in
        application security. You specialize in identifying vulnerabilities like
        injection attacks, authentication issues, data exposure, and OWASP Top 10
        risks. You provide actionable recommendations for remediation and ensure
        the codebase maintains a strong security posture.""",
        verbose=verbose,
        llm=model_id,
        max_iter=8,
        memory=True,
        allow_delegation=False,
        tools=[
            bridge.get_tool("get_project_context"),
        ],
    )


def create_release_manager(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the Release Manager agent."""
    model_id, thinking_budget = get_agent_model("releaseManager")

    return Agent(
        role="Release Manager",
        goal="Manage changelog, versioning, and release preparation",
        backstory="""You are an organized Release Manager with expertise in
        semantic versioning and release management. You maintain clear changelogs,
        ensure proper version bumps, and prepare release documentation. You
        coordinate the final steps before code is ready for deployment.""",
        verbose=verbose,
        llm=model_id,
        max_iter=5,
        memory=True,
        allow_delegation=False,
        tools=[
            bridge.get_tool("get_project_context"),
        ],
    )


def create_qa_validation_task(
    agent: Agent,
    implementation_report: str,
    acceptance_criteria: str,
) -> Task:
    """Create task for QA validation."""
    return Task(
        description=f"""Validate the implementation against the acceptance criteria:

        Implementation Report:
        {implementation_report}

        Acceptance Criteria:
        {acceptance_criteria}

        Validation steps:
        1. Use the QA validation tool to run automated tests
        2. Verify each acceptance criterion is met
        3. Test edge cases and error scenarios
        4. Check user experience and usability
        5. Verify integration with existing features

        For any failures:
        - Document the specific criterion that failed
        - Provide steps to reproduce the issue
        - Suggest potential fixes if obvious
        """,
        expected_output="""QA validation report containing:
        - Overall status (PASSED / FAILED / NEEDS_REVIEW)
        - Checklist of acceptance criteria with status
        - List of issues found with severity
        - Edge case test results
        - Recommendations for fixes (if any failures)
        - Test evidence (logs, screenshots if applicable)""",
        agent=agent,
    )


def create_security_scan_task(
    agent: Agent,
    implementation_details: str,
) -> Task:
    """Create task for security scanning."""
    return Task(
        description=f"""Perform a security analysis of the implementation:

        Implementation Details:
        {implementation_details}

        Security review should cover:
        1. Input Validation - Are all inputs properly validated and sanitized?
        2. Authentication/Authorization - Are access controls properly implemented?
        3. Data Protection - Is sensitive data properly handled and encrypted?
        4. Injection Prevention - Are SQL, XSS, and other injection attacks prevented?
        5. Error Handling - Do error messages expose sensitive information?
        6. Dependencies - Are there known vulnerabilities in dependencies?
        7. OWASP Top 10 - Check for common web security vulnerabilities

        For each finding:
        - Classify severity (CRITICAL / HIGH / MEDIUM / LOW / INFO)
        - Provide specific file/line references
        - Recommend remediation steps
        """,
        expected_output="""Security analysis report containing:
        - Overall security posture (SECURE / AT_RISK / VULNERABLE)
        - List of vulnerabilities found with severity ratings
        - Specific file/line references for each issue
        - Remediation recommendations
        - Dependencies with known vulnerabilities (if any)
        - Security best practices compliance checklist""",
        agent=agent,
    )


def create_release_preparation_task(
    agent: Agent,
    qa_report: str,
    security_report: str,
    feature_description: str,
) -> Task:
    """Create task for release preparation."""
    return Task(
        description=f"""Prepare the release documentation based on the validation results:

        Feature Description:
        {feature_description}

        QA Report:
        {qa_report}

        Security Report:
        {security_report}

        Release preparation should include:
        1. Version Bump - Determine appropriate version bump (major/minor/patch)
        2. Changelog Entry - Write clear, user-friendly changelog entry
        3. Release Notes - Prepare detailed release notes
        4. Breaking Changes - Document any breaking changes
        5. Migration Guide - If needed, provide migration instructions
        6. Known Issues - Document any known limitations

        Only prepare for release if:
        - QA validation passed
        - No CRITICAL or HIGH security vulnerabilities remain
        """,
        expected_output="""Release preparation document containing:
        - Release readiness status (READY / NOT_READY with reasons)
        - Recommended version bump (major/minor/patch) with justification
        - Changelog entry in Keep a Changelog format
        - Detailed release notes
        - Breaking changes documentation (if any)
        - Migration guide (if needed)
        - Known issues and limitations""",
        agent=agent,
    )


def create_qa_release_crew(
    implementation_report: str,
    acceptance_criteria: str,
    feature_description: str,
    project_dir: str,
    spec_dir: str,
    verbose: bool = False,
) -> Crew:
    """
    Create the QA & Release Crew.

    Args:
        implementation_report: Report from the Development crew
        acceptance_criteria: The criteria to validate against
        feature_description: Description of the implemented feature
        project_dir: Path to the project directory
        spec_dir: Path to the spec directory
        verbose: Enable verbose output

    Returns:
        Configured Crew ready to execute
    """
    # Create bridge for Auto-Claude tools
    bridge = AutoClaudeBridge(project_dir=project_dir, spec_dir=spec_dir)

    # Create agents
    qa_lead = create_qa_lead(bridge, verbose)
    security_analyst = create_security_analyst(bridge, verbose)
    release_manager = create_release_manager(bridge, verbose)

    # Create tasks
    qa_task = create_qa_validation_task(
        qa_lead,
        implementation_report,
        acceptance_criteria,
    )

    security_task = create_security_scan_task(
        security_analyst,
        implementation_report,
    )
    # Security scan can run in parallel with QA, but for simplicity we run after
    security_task.context = [qa_task]

    release_task = create_release_preparation_task(
        release_manager,
        "{{qa_task.output}}",
        "{{security_task.output}}",
        feature_description,
    )
    release_task.context = [qa_task, security_task]

    return Crew(
        agents=[qa_lead, security_analyst, release_manager],
        tasks=[qa_task, security_task, release_task],
        process=Process.sequential,
        verbose=verbose,
        memory=True,
        respect_context_window=True,
        max_rpm=10,
    )
