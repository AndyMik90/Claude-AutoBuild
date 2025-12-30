#!/usr/bin/env python3
"""
Blueprint Build Orchestrator

This script is called by the Electron UI to orchestrate blueprint builds.
It processes components sequentially with verification gates.
Integrates BMAD agents for enhanced AI-powered development.

Usage:
    python blueprint_build.py --project /path/to/project --blueprint /path/to/blueprint.yaml
    python blueprint_build.py --project /path/to/project --blueprint /path/to/blueprint.yaml --max-iterations 1
"""

import argparse
import sys
import asyncio
import os
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from integrations.bmad.blueprint import BlueprintManager, ComponentStatus
from integrations.bmad.verification import VerificationGate
from integrations.bmad.agent_loader import BMADAgentLoader
from integrations.bmad.workflow_loader import BMADWorkflowLoader


class BlueprintBuildOrchestrator:
    """Orchestrates the sequential build of blueprint components."""

    def __init__(
        self,
        project_path: Path,
        blueprint_path: Path,
        max_iterations: Optional[int] = None
    ):
        self.project_path = Path(project_path)
        self.blueprint_path = Path(blueprint_path)
        self.max_iterations = max_iterations
        self.manager = BlueprintManager(blueprint_path)
        self.verification = VerificationGate(project_path)

        # Initialize BMAD agent loader
        self.bmad_loader = BMADAgentLoader()
        if self.bmad_loader.is_available():
            print(f"[BMAD] Agents available: {', '.join(self.bmad_loader.list_agents())}")
        else:
            print("[BMAD] BMAD-METHOD not found, using default prompts")

        # Initialize BMAD workflow loader
        self.workflow_loader = BMADWorkflowLoader()
        if self.workflow_loader.is_available():
            print(f"[BMAD] Workflow phases: {', '.join(self.workflow_loader.list_workflow_phases())}")
        else:
            print("[BMAD] No workflows available")

    async def run(self) -> bool:
        """
        Run the blueprint build process.

        Returns True if all components completed successfully.
        """
        print(f"\n{'='*60}")
        print(f"Blueprint Build: {self.manager.blueprint.name}")
        print(f"{'='*60}")
        print(f"Project: {self.project_path}")
        print(f"Blueprint: {self.blueprint_path}")
        print(f"Progress: {self.manager.get_progress()}")
        print(f"{'='*60}\n")

        iterations = 0

        while True:
            # Check max iterations
            if self.max_iterations and iterations >= self.max_iterations:
                print(f"\nMax iterations ({self.max_iterations}) reached. Stopping.")
                break

            # Get next pending component
            component = self.manager.get_next_pending()

            if not component:
                if self.manager.is_complete():
                    print("\n" + "="*60)
                    print("All components completed successfully!")
                    print("="*60)
                    return True
                else:
                    # Check if there are failed components blocking progress
                    failed = self.manager.get_all_failed()
                    if failed:
                        print("\n" + "="*60)
                        print("BUILD BLOCKED: Failed components need attention")
                        for fc in failed:
                            print(f"  - {fc.id}: {fc.name} (attempts: {fc.attempts})")
                        print("="*60)
                    else:
                        print("\n" + "="*60)
                        print("No pending components available.")
                        print("="*60)
                    break

            iterations += 1

            print(f"\n{'='*60}")
            print(f"[{iterations}] Working on: {component.name} ({component.id})")
            print(f"{'='*60}")
            print(f"Description: {component.description}")
            print(f"Files: {', '.join(component.files) or 'Not specified'}")
            print(f"Dependencies: {', '.join(component.dependencies) or 'None'}")
            print()

            # Mark as in progress
            self.manager.update_status(
                component.id,
                ComponentStatus.IN_PROGRESS,
                "Started build"
            )

            try:
                # Build the component
                build_success = await self._build_component(component)

                if not build_success:
                    self.manager.update_status(
                        component.id,
                        ComponentStatus.FAILED,
                        "Build failed"
                    )
                    print(f"\n[FAILED] {component.name} build failed")
                    continue

                # Verification gate
                print(f"\n[VERIFYING] Running verification for {component.name}...")
                self.manager.update_status(
                    component.id,
                    ComponentStatus.VERIFYING,
                    "Running verification"
                )

                verification_result = await self.verification.verify(component)

                if verification_result.passed:
                    self.manager.update_status(
                        component.id,
                        ComponentStatus.VERIFIED,
                        f"Verification passed: {verification_result.message}"
                    )
                    print(f"\n[VERIFIED] {component.name} passed verification!")

                    # Mark individual criteria as verified
                    for i, criterion in enumerate(component.acceptance_criteria):
                        self.manager.mark_criterion_verified(
                            component.id, i,
                            f"Verified during build #{iterations}"
                        )
                else:
                    self.manager.update_status(
                        component.id,
                        ComponentStatus.FAILED,
                        f"Verification failed: {verification_result.message}"
                    )
                    print(f"\n[FAILED] {component.name} failed verification")
                    print(f"Reason: {verification_result.message}")

            except Exception as e:
                self.manager.update_status(
                    component.id,
                    ComponentStatus.FAILED,
                    f"Exception: {str(e)}"
                )
                print(f"\n[ERROR] Exception during {component.name}: {e}")
                import traceback
                traceback.print_exc()

        # Final summary
        progress = self.manager.get_progress()
        print(f"\n{'='*60}")
        print("BUILD SUMMARY")
        print(f"{'='*60}")
        print(f"Total: {progress['total']}")
        print(f"Completed: {progress['completed']}")
        print(f"In Progress: {progress['in_progress']}")
        print(f"Failed: {progress['failed']}")
        print(f"Pending: {progress['pending']}")
        print(f"Progress: {progress['percent']}%")
        print(f"{'='*60}\n")

        return self.manager.is_complete()

    async def _build_component(self, component) -> bool:
        """
        Build a single component.

        This method integrates with Auto-Claude's agent system and BMAD agents
        to implement the component based on its description and acceptance criteria.
        """
        try:
            # Import the Auto-Claude agent system
            from core.client import create_client
            from agents.session import run_agent_session
            from task_logger import LogPhase

            # Create a spec directory for this component build
            spec_dir = self.project_path / ".auto-claude" / "specs" / component.id
            spec_dir.mkdir(parents=True, exist_ok=True)

            # Prepare the build prompt with BMAD developer agent enhancement
            base_prompt = self._create_build_prompt(component)

            if self.bmad_loader.is_available():
                # Enhance with BMAD developer agent expertise
                prompt = self.bmad_loader.enhance_prompt(base_prompt, "developer")
                print("[BMAD] Using Developer agent for implementation")

                # Add workflow context if available
                if self.workflow_loader.is_available():
                    workflow_context = self.workflow_loader.get_phase_context("implementation")
                    if workflow_context:
                        prompt = f"{workflow_context}\n\n---\n\n{prompt}"
                        print("[BMAD] Added implementation workflow context")
            else:
                prompt = base_prompt

            # Create the Claude SDK client
            client = create_client(
                project_dir=self.project_path,
                spec_dir=spec_dir,
                model="sonnet",  # Using Claude Sonnet for coding
                agent_type="coder",
                max_thinking_tokens=None  # No extended thinking for coding
            )

            # Run the agent session
            status, response = await run_agent_session(
                client=client,
                message=prompt,
                spec_dir=spec_dir,
                verbose=True,
                phase=LogPhase.CODING
            )

            # Check if session completed successfully
            return status in ("complete", "continue")

        except ImportError as e:
            # Fallback if agent system not available
            print(f"[INFO] Agent system not fully configured: {e}")
            print("[INFO] Running in simulation mode...")

            # Simulate build for now
            await asyncio.sleep(1)
            return True

        except Exception as e:
            print(f"[ERROR] Build failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _create_build_prompt(self, component) -> str:
        """Create a prompt for the agent to build this component."""
        criteria_text = "\n".join(
            f"  - {ac.description}"
            for ac in component.acceptance_criteria
        )

        files_text = "\n".join(
            f"  - {f}" for f in component.files
        ) if component.files else "  (To be determined)"

        return f"""
# Component Build Task

## Component: {component.name}
**ID:** {component.id}

## Description
{component.description}

## Files to Create/Modify
{files_text}

## Acceptance Criteria
{criteria_text}

## Instructions
1. Implement this component according to the description
2. Ensure all acceptance criteria are met
3. Write clean, well-documented code
4. Add appropriate tests if applicable
5. Update any related configuration files

## Notes from Previous Attempts
{chr(10).join(component.notes) if component.notes else 'First attempt'}
"""


def main():
    parser = argparse.ArgumentParser(description='Build blueprint components')
    parser.add_argument('--project', required=True, help='Project path')
    parser.add_argument('--blueprint', required=True, help='Blueprint file path')
    parser.add_argument('--max-iterations', type=int, help='Maximum iterations')

    args = parser.parse_args()

    orchestrator = BlueprintBuildOrchestrator(
        project_path=Path(args.project),
        blueprint_path=Path(args.blueprint),
        max_iterations=args.max_iterations
    )

    success = asyncio.run(orchestrator.run())

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
