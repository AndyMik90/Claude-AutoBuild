"""
Development Crew for CrewAI.

Executes technical implementation via Auto-Claude bridge.
Agents: Tech Lead, Senior Developer, Code Reviewer
"""

from crewai import Agent, Task, Crew, Process
from typing import Optional, List

from ..config import get_agent_model
from ..bridge import AutoClaudeBridge


def create_tech_lead(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the Tech Lead agent."""
    model_id, thinking_budget = get_agent_model("techLead")

    return Agent(
        role="Tech Lead",
        goal="Design robust technical architecture and create detailed implementation plans",
        backstory="""You are a seasoned Tech Lead with extensive experience in
        software architecture and system design. You excel at translating product
        requirements into technical specifications, identifying the best patterns
        and approaches, and creating clear implementation plans that developers
        can follow. You consider scalability, maintainability, and code quality
        in all your decisions.""",
        verbose=verbose,
        llm=model_id,
        max_iter=10,
        memory=True,
        allow_delegation=True,
        tools=[
            bridge.get_tool("get_project_context"),
            bridge.get_tool("assess_complexity"),
        ],
    )


def create_senior_developer(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the Senior Developer agent."""
    model_id, thinking_budget = get_agent_model("seniorDeveloper")

    return Agent(
        role="Senior Developer",
        goal="Implement features with high-quality, maintainable code using Auto-Claude",
        backstory="""You are a skilled Senior Developer with deep expertise in
        multiple programming languages and frameworks. You write clean, efficient,
        and well-tested code. You leverage the Auto-Claude system to implement
        features autonomously, following best practices and coding standards.
        You handle complex implementations with care and attention to detail.""",
        verbose=verbose,
        llm=model_id,
        max_iter=15,
        memory=True,
        allow_delegation=False,
        tools=[
            bridge.get_tool("run_spec_creation"),
            bridge.get_tool("run_coder_session"),
            bridge.get_tool("get_project_context"),
        ],
    )


def create_code_reviewer(
    bridge: AutoClaudeBridge,
    verbose: bool = False,
) -> Agent:
    """Create the Code Reviewer agent."""
    model_id, thinking_budget = get_agent_model("codeReviewer")

    return Agent(
        role="Code Reviewer",
        goal="Ensure code quality, standards compliance, and best practices",
        backstory="""You are an experienced Code Reviewer with a keen eye for
        detail and deep knowledge of coding best practices. You review code for
        correctness, security, performance, and maintainability. You provide
        constructive feedback and ensure all code meets the team's quality
        standards before it moves to QA.""",
        verbose=verbose,
        llm=model_id,
        max_iter=8,
        memory=True,
        allow_delegation=False,
        tools=[
            bridge.get_tool("get_project_context"),
        ],
    )


def create_architecture_task(
    agent: Agent,
    requirements: str,
    project_context: str,
) -> Task:
    """Create task for designing technical architecture."""
    return Task(
        description=f"""Design the technical architecture for implementing the
        following requirements:

        Requirements:
        {requirements}

        Project Context:
        {project_context}

        Your architecture design should include:
        1. High-Level Design - Overall approach and components involved
        2. File Structure - New files to create and existing files to modify
        3. Data Flow - How data moves through the system
        4. API Design - Any new endpoints or modifications needed
        5. Database Changes - Schema modifications if applicable
        6. Dependencies - External libraries or services needed
        7. Implementation Order - Recommended sequence of implementation
        """,
        expected_output="""A comprehensive technical architecture document containing:
        - High-level design with component diagram
        - Detailed file structure changes
        - Data flow description
        - API specifications
        - Database schema changes
        - Dependency list
        - Step-by-step implementation plan""",
        agent=agent,
    )


def create_implementation_task(
    agent: Agent,
    architecture: str,
    spec_dir: str,
) -> Task:
    """Create task for implementing the feature."""
    return Task(
        description=f"""Implement the feature according to the technical architecture:

        Architecture Plan:
        {architecture}

        Spec Directory: {spec_dir}

        Implementation steps:
        1. Use the spec creation tool to generate a detailed spec if not exists
        2. Use the coder session tool to implement each component
        3. Follow the architecture plan's implementation order
        4. Ensure all acceptance criteria are met
        5. Write appropriate tests for the implementation

        Important:
        - Follow existing code patterns and conventions
        - Handle errors appropriately
        - Add necessary documentation
        - Create atomic, focused commits
        """,
        expected_output="""Implementation report containing:
        - List of files created/modified
        - Summary of changes made
        - Any deviations from the architecture plan (with justification)
        - Test coverage summary
        - Known limitations or technical debt""",
        agent=agent,
    )


def create_code_review_task(
    agent: Agent,
    implementation_report: str,
) -> Task:
    """Create task for reviewing the implementation."""
    return Task(
        description=f"""Review the implementation and ensure it meets quality standards:

        Implementation Report:
        {implementation_report}

        Review the code for:
        1. Correctness - Does it correctly implement the requirements?
        2. Code Quality - Is it clean, readable, and maintainable?
        3. Best Practices - Does it follow coding best practices?
        4. Security - Are there any security vulnerabilities?
        5. Performance - Are there any performance concerns?
        6. Testing - Is there adequate test coverage?
        7. Documentation - Is the code properly documented?

        Provide specific feedback for any issues found, with:
        - File and line number references
        - Description of the issue
        - Suggested fix or improvement
        """,
        expected_output="""Code review report containing:
        - Overall assessment (APPROVED / NEEDS_CHANGES / REJECTED)
        - List of issues found (categorized by severity)
        - Specific recommendations for each issue
        - Positive highlights (good practices observed)
        - Final summary and next steps""",
        agent=agent,
    )


def create_development_crew(
    requirements: str,
    project_dir: str,
    spec_dir: str,
    project_context: Optional[str] = None,
    verbose: bool = False,
) -> Crew:
    """
    Create the Development Crew.

    Args:
        requirements: The validated requirements to implement
        project_dir: Path to the project directory
        spec_dir: Path to the spec directory
        project_context: Optional context about the project
        verbose: Enable verbose output

    Returns:
        Configured Crew ready to execute
    """
    # Create bridge for Auto-Claude tools
    bridge = AutoClaudeBridge(project_dir=project_dir, spec_dir=spec_dir)

    # Create agents
    tech_lead = create_tech_lead(bridge, verbose)
    senior_developer = create_senior_developer(bridge, verbose)
    code_reviewer = create_code_reviewer(bridge, verbose)

    # Create tasks
    architecture_task = create_architecture_task(
        tech_lead,
        requirements,
        project_context or "No additional context provided",
    )

    implementation_task = create_implementation_task(
        senior_developer,
        "{{architecture_task.output}}",
        spec_dir,
    )
    implementation_task.context = [architecture_task]

    review_task = create_code_review_task(
        code_reviewer,
        "{{implementation_task.output}}",
    )
    review_task.context = [implementation_task]

    return Crew(
        agents=[tech_lead, senior_developer, code_reviewer],
        tasks=[architecture_task, implementation_task, review_task],
        process=Process.sequential,
        verbose=verbose,
        memory=True,
        respect_context_window=True,
        max_rpm=10,
    )
