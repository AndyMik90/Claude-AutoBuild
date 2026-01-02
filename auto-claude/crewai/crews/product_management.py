"""
Product Management Crew for CrewAI.

Transforms user requests into actionable specifications.
Agents: Product Manager, Requirements Analyst, Priority Analyst
"""

from crewai import Agent, Task, Crew, Process
from typing import Optional

from ..config import get_agent_model


def create_product_manager(verbose: bool = False) -> Agent:
    """Create the Product Manager agent."""
    model_id, thinking_budget = get_agent_model("productManager")

    return Agent(
        role="Product Manager",
        goal="Analyze user requests and transform them into clear, actionable requirements",
        backstory="""You are an experienced Product Manager with deep expertise in
        software development lifecycle. You excel at understanding user needs,
        breaking down complex requests into manageable features, and creating
        clear product specifications. You work closely with stakeholders to
        ensure requirements are complete and aligned with business goals.""",
        verbose=verbose,
        llm=model_id,
        max_iter=10,
        memory=True,
        allow_delegation=True,
    )


def create_requirements_analyst(verbose: bool = False) -> Agent:
    """Create the Requirements Analyst agent."""
    model_id, thinking_budget = get_agent_model("requirementsAnalyst")

    return Agent(
        role="Requirements Analyst",
        goal="Validate requirements against the existing codebase and technical constraints",
        backstory="""You are a meticulous Requirements Analyst with strong technical
        background. You specialize in analyzing how new requirements fit within
        existing system architecture, identifying potential conflicts, dependencies,
        and technical challenges. You ensure requirements are technically feasible
        and well-integrated with the current codebase.""",
        verbose=verbose,
        llm=model_id,
        max_iter=8,
        memory=True,
        allow_delegation=False,
    )


def create_priority_analyst(verbose: bool = False) -> Agent:
    """Create the Priority Analyst agent."""
    model_id, thinking_budget = get_agent_model("priorityAnalyst")

    return Agent(
        role="Priority Analyst",
        goal="Evaluate task complexity and prioritize work effectively",
        backstory="""You are a skilled Priority Analyst with expertise in agile
        methodologies and project estimation. You excel at breaking down features
        into sized tasks, assessing complexity levels, identifying dependencies,
        and creating optimal implementation orders. You balance business value
        with technical effort to maximize delivery efficiency.""",
        verbose=verbose,
        llm=model_id,
        max_iter=5,
        memory=True,
        allow_delegation=False,
    )


def create_analyze_request_task(
    agent: Agent,
    user_request: str,
    project_context: Optional[str] = None,
) -> Task:
    """Create task for analyzing user request."""
    context_info = f"\n\nProject Context:\n{project_context}" if project_context else ""

    return Task(
        description=f"""Analyze the following user request and create a structured
        product requirement document:

        User Request: {user_request}
        {context_info}

        Your output should include:
        1. Executive Summary - Brief overview of what the user wants
        2. User Stories - List of user stories in standard format
        3. Acceptance Criteria - Clear, testable criteria for each story
        4. Technical Considerations - Any technical aspects to be aware of
        5. Open Questions - Any clarifications needed from stakeholders
        """,
        expected_output="""A structured product requirement document containing:
        - Executive summary of the request
        - User stories with acceptance criteria
        - Technical considerations
        - Open questions for clarification""",
        agent=agent,
    )


def create_validate_requirements_task(
    agent: Agent,
    requirements: str,
    codebase_context: str,
) -> Task:
    """Create task for validating requirements against codebase."""
    return Task(
        description=f"""Validate the following requirements against the existing
        codebase and identify any technical concerns:

        Requirements:
        {requirements}

        Codebase Context:
        {codebase_context}

        Your analysis should include:
        1. Feasibility Assessment - Can this be implemented with current architecture?
        2. Impact Analysis - Which parts of the codebase will be affected?
        3. Dependencies - What existing features/modules are dependencies?
        4. Conflicts - Any potential conflicts with existing functionality?
        5. Technical Risks - What could go wrong technically?
        6. Recommendations - Suggestions for implementation approach
        """,
        expected_output="""A technical validation report containing:
        - Feasibility assessment (YES/PARTIAL/NO with reasoning)
        - Impact analysis with affected files/modules
        - Dependencies and conflicts identified
        - Technical risks and mitigation strategies
        - Implementation recommendations""",
        agent=agent,
    )


def create_prioritize_tasks_task(
    agent: Agent,
    validated_requirements: str,
) -> Task:
    """Create task for prioritizing and sizing tasks."""
    return Task(
        description=f"""Analyze the validated requirements and create a prioritized
        implementation plan:

        Validated Requirements:
        {validated_requirements}

        Your output should include:
        1. Task Breakdown - Break features into implementable tasks
        2. Complexity Assessment - Rate each task (simple/standard/complex)
        3. Dependencies - Identify task dependencies and order
        4. Priority Ranking - Order tasks by implementation priority
        5. Estimated Effort - Rough effort estimates
        6. Implementation Phases - Group tasks into logical phases
        """,
        expected_output="""A prioritized implementation plan containing:
        - Detailed task breakdown with complexity ratings
        - Dependency graph between tasks
        - Priority-ordered task list
        - Implementation phases with milestones""",
        agent=agent,
    )


def create_product_management_crew(
    user_request: str,
    project_context: Optional[str] = None,
    codebase_context: Optional[str] = None,
    verbose: bool = False,
) -> Crew:
    """
    Create the Product Management Crew.

    Args:
        user_request: The user's feature request or task description
        project_context: Optional context about the project
        codebase_context: Optional context about the codebase structure
        verbose: Enable verbose output

    Returns:
        Configured Crew ready to execute
    """
    # Create agents
    product_manager = create_product_manager(verbose)
    requirements_analyst = create_requirements_analyst(verbose)
    priority_analyst = create_priority_analyst(verbose)

    # Create tasks
    analyze_task = create_analyze_request_task(
        product_manager, user_request, project_context
    )

    # Validation task uses output from analysis
    validate_task = create_validate_requirements_task(
        requirements_analyst,
        "{{analyze_task.output}}",  # Reference to previous task output
        codebase_context or "No codebase context provided",
    )
    validate_task.context = [analyze_task]

    # Priority task uses validated output
    prioritize_task = create_prioritize_tasks_task(
        priority_analyst,
        "{{validate_task.output}}",
    )
    prioritize_task.context = [validate_task]

    return Crew(
        agents=[product_manager, requirements_analyst, priority_analyst],
        tasks=[analyze_task, validate_task, prioritize_task],
        process=Process.sequential,
        verbose=verbose,
        memory=True,
        respect_context_window=True,
        max_rpm=10,  # Rate limiting for API calls
    )
