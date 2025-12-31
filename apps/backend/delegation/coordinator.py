"""
Delegation Coordinator
=======================

The meta-coordinator that analyzes tasks and routes them to specialist agents.
"""

import asyncio
import time
from pathlib import Path
from typing import Any

from core.client import create_client
from debug import debug, debug_error, debug_section, debug_success
from delegation.models import (
    DelegationContext,
    DelegationStatus,
    StepResult,
    create_delegation_id,
)
from ui import print_key_value, print_status

# Import workflow patterns to ensure they register themselves
import workflow.patterns  # noqa: F401
from workflow.base import select_best_pattern


class DelegationCoordinator:
    """
    Meta-coordinator for intelligent task delegation.

    Analyzes incoming tasks and routes them through predefined
    workflow patterns using specialist agents.
    """

    def __init__(
        self,
        project_dir: Path,
        delegation_dir: Path,
        model: str,
    ):
        """
        Initialize the delegation coordinator.

        Args:
            project_dir: Root project directory
            delegation_dir: Working directory for this delegation
            model: Claude model to use
        """
        self.project_dir = project_dir
        self.delegation_dir = delegation_dir
        self.model = model

    def analyze_and_delegate(
        self,
        task: str,
        verbose: bool = False,
    ) -> DelegationContext:
        """
        Analyze task and execute appropriate workflow.

        Args:
            task: The task description
            verbose: Enable verbose output

        Returns:
            Updated DelegationContext with results
        """
        debug_section("delegation", "Starting Task Delegation")
        debug("delegation", "Task", task=task[:100])

        # Step 1: Select workflow pattern
        print()
        print("=" * 70)
        print("TASK DELEGATION SYSTEM")
        print("=" * 70)
        print_key_value("Task", task)
        print()

        pattern = select_best_pattern(task)
        print_key_value("Pattern", pattern.name)
        print_key_value("Description", pattern.description)

        # Step 2: Estimate complexity
        complexity = pattern.estimate_complexity(task)
        print_key_value("Complexity", complexity)

        # Step 3: Create delegation context
        delegation_id = create_delegation_id(task, self.delegation_dir.parent)
        print_key_value("Delegation ID", delegation_id)
        print()

        context = DelegationContext(
            task=task,
            delegation_id=delegation_id,
            delegation_dir=self.delegation_dir,
            pattern_name=pattern.name,
            complexity=complexity,
            model=self.model,
        )

        # Step 4: Get workflow steps
        task_context = {"task": task, "complexity": complexity}
        steps = pattern.get_steps(task_context)
        context.total_steps = len(steps)
        print_key_value("Steps", str(context.total_steps))
        print()

        # Save initial context
        context.save()

        # Step 5: Execute workflow
        try:
            asyncio.run(self._execute_workflow(pattern, steps, context, verbose))
        except Exception as e:
            debug_error("delegation", "Workflow execution failed", error=str(e))
            context.status = DelegationStatus.FAILED
            context.completed_at = time.time()
            context.save()
            raise

        return context

    async def _execute_workflow(
        self,
        pattern,
        steps: list,
        context: DelegationContext,
        verbose: bool,
    ) -> None:
        """
        Execute all workflow steps sequentially.

        Args:
            pattern: The selected workflow pattern
            steps: List of WorkflowStep objects
            context: Delegation context
            verbose: Enable verbose output
        """
        context.status = DelegationStatus.IN_PROGRESS
        context.save()

        for i, step in enumerate(steps):
            context.current_step = i + 1
            context.save()

            print()
            print("-" * 70)
            print(f"Step {i + 1}/{context.total_steps}: {step.agent_type}")
            print("-" * 70)

            # Check if dependencies are satisfied
            if not self._check_dependencies(step, context):
                print_status(
                    f"Skipping step: dependencies not met ({step.depends_on})",
                    "warning",
                )
                continue

            # Execute the step
            result = await self._execute_step(step, context, verbose)
            context.step_results.append(result)

            # Store output for next steps
            if result.output:
                context.previous_outputs[step.prompt_key] = result.output

            # Save progress
            context.save()

            # Check if step failed
            if result.status == "failed" and not step.optional:
                print_status(f"Required step failed: {step.prompt_key}", "error")
                context.status = DelegationStatus.FAILED
                context.completed_at = time.time()
                context.save()
                raise RuntimeError(f"Step failed: {step.prompt_key}")

        # All steps completed
        context.status = DelegationStatus.COMPLETED
        context.completed_at = time.time()
        context.save()

        print()
        print("=" * 70)
        print_status("Delegation completed successfully", "success")
        print("=" * 70)

    def _check_dependencies(
        self,
        step,
        context: DelegationContext,
    ) -> bool:
        """
        Check if step dependencies are satisfied.

        Args:
            step: The workflow step to check
            context: Delegation context

        Returns:
            True if dependencies are satisfied
        """
        for dep in step.depends_on:
            if dep not in context.previous_outputs:
                return False
        return True

    async def _execute_step(
        self,
        step,
        context: DelegationContext,
        verbose: bool,
    ) -> StepResult:
        """
        Execute a single workflow step.

        Args:
            step: The workflow step to execute
            context: Delegation context
            verbose: Enable verbose output

        Returns:
            StepResult with execution outcome
        """
        result = StepResult(
            step_name=step.prompt_key,
            agent_type=step.agent_type,
            status="pending",
        )

        try:
            # Build prompt for this step
            prompt = self._build_step_prompt(step, context)

            # Create client for this agent type
            client = create_client(
                project_dir=self.project_dir,
                spec_dir=context.delegation_dir,
                model=context.model,
                agent_type=step.agent_type,
                max_thinking_tokens=None,  # No extended thinking for delegation
            )

            # Run agent session
            from agents.session import run_agent_session

            status, response = await run_agent_session(
                client,
                prompt,
                context.delegation_dir,
                verbose=verbose,
            )

            result.status = "completed" if status == "complete" else "in_progress"
            result.output = response
            result.completed_at = time.time()

            # Save output to file if specified
            if step.output_file:
                output_path = context.delegation_dir / step.output_file
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_text(response)

            print_status(f"Step completed: {step.prompt_key}", "success")

        except Exception as e:
            result.status = "failed"
            result.error = str(e)
            result.completed_at = time.time()

            if step.optional:
                print_status(
                    f"Optional step failed (skipping): {step.prompt_key}",
                    "warning",
                )
                result.status = "skipped"
            else:
                print_status(f"Step failed: {step.prompt_key}", "error")

        return result

    def _build_step_prompt(
        self,
        step,
        context: DelegationContext,
    ) -> str:
        """
        Build the prompt for a workflow step.

        Args:
            step: The workflow step
            context: Delegation context

        Returns:
            Complete prompt string
        """
        prompt = f"""# Task Delegation - {step.prompt_key}

## Original Task
{context.task}

## Workflow Pattern
{context.pattern_name}

## Your Role
You are executing the '{step.prompt_key}' step in this workflow.
"""

        # Add context from previous steps
        if context.previous_outputs:
            prompt += "\n## Context from Previous Steps\n\n"
            for dep_key, dep_output in context.previous_outputs.items():
                prompt += f"### {dep_key}\n\n{dep_output}\n\n"

        # Add specific instructions for the step
        prompt += f"""
## Your Task
{self._get_step_instructions(step.prompt_key)}

## Working Directory
- Project root: {self.project_dir}
- Delegation directory: {context.delegation_dir}

Focus on completing your specific step. Trust that other steps are handled by their respective agents.
"""
        return prompt

    def _get_step_instructions(self, prompt_key: str) -> str:
        """
        Get instructions for a specific step type.

        Args:
            prompt_key: The step's prompt key

        Returns:
            Step-specific instructions
        """
        instructions = {
            "investigate_issue": "Investigate the reported issue. Read relevant code files, identify the root cause, and document your findings.",
            "implement_fix": "Implement the fix based on the investigation. Modify code files, test the fix locally if possible, and ensure the issue is resolved.",
            "verify_fix": "Verify that the fix resolves the issue. Run tests, check for regressions, and confirm the original issue no longer occurs.",
        }
        return instructions.get(
            prompt_key,
            "Complete this step to the best of your ability, following existing code patterns and best practices.",
        )
