"""
AutoClaudeBridge - Bridge between CrewAI and Auto-Claude.

This bridge exposes Auto-Claude functionality as CrewAI-compatible tools,
maintaining security boundaries and handling async/sync conversion.
"""

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any, Callable

from ..config import get_agent_model, get_crewai_config


class AutoClaudeBridge:
    """
    Bridge between CrewAI orchestration and Auto-Claude execution layer.

    This bridge:
    1. Exposes Auto-Claude functionality as CrewAI-compatible tools
    2. Maintains security boundaries (Claude SDK sandbox)
    3. Handles async/sync conversion
    4. Provides progress callbacks for notifications
    """

    def __init__(
        self,
        project_dir: Path | str,
        on_progress: Callable[[str, dict], None] | None = None,
        on_error: Callable[[str, Exception], None] | None = None,
    ):
        """
        Initialize the bridge.

        Args:
            project_dir: Root directory of the project
            on_progress: Callback for progress notifications
            on_error: Callback for error notifications
        """
        self.project_dir = Path(project_dir)
        self.on_progress = on_progress
        self.on_error = on_error

        # Lazy imports to avoid circular dependencies
        self._spec_orchestrator = None
        self._run_agent = None
        self._run_qa = None

    def _lazy_import(self):
        """Lazy import Auto-Claude modules to avoid circular dependencies."""
        if self._spec_orchestrator is None:
            try:
                from spec.pipeline.orchestrator import SpecOrchestrator

                self._spec_orchestrator = SpecOrchestrator
            except ImportError:
                pass

        if self._run_agent is None:
            try:
                from core.agent import run_autonomous_agent

                self._run_agent = run_autonomous_agent
            except ImportError:
                pass

        if self._run_qa is None:
            try:
                from qa.loop import run_qa_validation_loop

                self._run_qa = run_qa_validation_loop
            except ImportError:
                pass

    # =========================================================================
    # TOOL REGISTRY
    # =========================================================================

    def get_tool(self, tool_name: str) -> Callable:
        """
        Get a tool function by name for use in CrewAI agents.

        Args:
            tool_name: Name of the tool to retrieve

        Returns:
            Callable tool function

        Raises:
            ValueError: If tool_name is not recognized
        """
        tools = {
            # Spec creation tools
            "run_spec_creation": self.run_spec_creation,
            "list_specs": self.list_specs,
            "get_spec_status": self.get_spec_status,
            # Development tools
            "create_implementation_plan": self.create_implementation_plan,
            "run_coder_session": self.run_coder_session,
            "run_tests": self.run_tests,
            "commit_changes": self.commit_changes,
            # QA tools
            "run_qa_validation": self.run_qa_validation,
            "run_qa_fixer": self.run_qa_fixer,
            "check_acceptance_criteria": self.check_acceptance_criteria,
            # Project context tools
            "get_project_context": self.get_project_context,
            "analyze_codebase": self.analyze_codebase,
            "get_existing_patterns": self.get_existing_patterns,
            "search_codebase": self.search_codebase,
            # Analysis tools
            "assess_complexity": self.assess_complexity,
            "get_dependencies": self.get_dependencies,
            # Review tools
            "review_changes": self.review_changes,
            "run_linters": self.run_linters,
            "check_security": self.check_security,
            "scan_secrets": self.scan_secrets,
            # Release tools
            "update_changelog": self.update_changelog,
            "prepare_release": self.prepare_release,
            # E2E testing
            "run_e2e_tests": self.run_e2e_tests,
        }

        if tool_name not in tools:
            raise ValueError(f"Unknown tool: {tool_name}")

        return tools[tool_name]

    def get_all_tools(self) -> dict[str, Callable]:
        """Get all available tools as a dictionary."""
        tool_names = [
            "run_spec_creation",
            "list_specs",
            "get_spec_status",
            "create_implementation_plan",
            "run_coder_session",
            "run_tests",
            "commit_changes",
            "run_qa_validation",
            "run_qa_fixer",
            "check_acceptance_criteria",
            "get_project_context",
            "analyze_codebase",
            "get_existing_patterns",
            "search_codebase",
            "assess_complexity",
            "get_dependencies",
            "review_changes",
            "run_linters",
            "check_security",
            "scan_secrets",
            "update_changelog",
            "prepare_release",
            "run_e2e_tests",
        ]
        return {name: self.get_tool(name) for name in tool_names}

    # =========================================================================
    # SPEC CREATION
    # =========================================================================

    def run_spec_creation(
        self,
        task_description: str,
        workflow_type: str = "feature",
        complexity: str | None = None,
    ) -> str:
        """
        Create a spec using Auto-Claude's spec orchestrator.

        Args:
            task_description: Description of the task to implement
            workflow_type: Type of workflow (feature, bug, refactor)
            complexity: Optional complexity override (simple, standard, complex)

        Returns:
            Result message with spec directory path
        """
        self._lazy_import()

        if self._spec_orchestrator is None:
            return "Error: Spec orchestrator not available"

        try:
            orchestrator = self._spec_orchestrator(
                project_dir=self.project_dir,
                task_description=task_description,
                complexity_override=complexity,
            )

            # Run synchronously (CrewAI tools are sync)
            success = asyncio.run(
                orchestrator.run(
                    interactive=False,
                    auto_approve=True,
                )
            )

            if success:
                self._notify_progress(
                    "spec_created",
                    {
                        "spec_dir": str(orchestrator.spec_dir),
                        "complexity": complexity or "auto",
                    },
                )
                return f"Spec created successfully at: {orchestrator.spec_dir}"
            else:
                return "Spec creation failed"

        except Exception as e:
            self._notify_error("spec_creation", e)
            return f"Spec creation failed: {e}"

    def list_specs(self) -> str:
        """List all specs in the project."""
        specs_dir = self.project_dir / ".auto-claude" / "specs"
        if not specs_dir.exists():
            return "No specs found"

        specs = [d.name for d in specs_dir.iterdir() if d.is_dir()]
        if not specs:
            return "No specs found"

        return f"Found {len(specs)} specs: {', '.join(sorted(specs))}"

    def get_spec_status(self, spec_name: str) -> str:
        """Get status of a specific spec."""
        spec_dir = self.project_dir / ".auto-claude" / "specs" / spec_name
        if not spec_dir.exists():
            return f"Spec not found: {spec_name}"

        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return f"Spec {spec_name}: No implementation plan yet"

        try:
            with open(plan_file, encoding="utf-8") as f:
                plan = json.load(f)

            # Count subtask statuses
            completed = sum(
                1
                for phase in plan.get("phases", [])
                for st in phase.get("subtasks", [])
                if st.get("status") == "completed"
            )
            total = sum(len(phase.get("subtasks", [])) for phase in plan.get("phases", []))

            qa_signoff = plan.get("qa_signoff", {})
            qa_status = qa_signoff.get("status", "pending")

            return f"Spec {spec_name}: {completed}/{total} subtasks complete, QA: {qa_status}"

        except (json.JSONDecodeError, OSError) as e:
            return f"Error reading spec status: {e}"

    # =========================================================================
    # DEVELOPMENT EXECUTION
    # =========================================================================

    def create_implementation_plan(self, spec_dir: str) -> str:
        """Create implementation plan for a spec."""
        return f"Plan creation delegated to Auto-Claude planner for {spec_dir}"

    def run_coder_session(self, spec_dir: str) -> str:
        """Run a coder session for implementing subtasks."""
        self._lazy_import()

        if self._run_agent is None:
            return "Error: Agent runner not available"

        try:
            spec_path = Path(spec_dir)

            success = asyncio.run(
                self._run_agent(
                    project_dir=self.project_dir,
                    spec_dir=spec_path,
                    model="claude-sonnet-4-5-20250929",
                )
            )

            if success:
                self._notify_progress("coder_session_complete", {"spec_dir": spec_dir})
                return f"Coder session completed for {spec_dir}"
            else:
                return f"Coder session incomplete for {spec_dir}"

        except Exception as e:
            self._notify_error("coder_session", e)
            return f"Coder session failed: {e}"

    def run_tests(self, test_command: str | None = None) -> str:
        """Run tests for the project."""
        # Detect test command from project_index if not provided
        if test_command is None:
            project_index = self.project_dir / ".auto-claude" / "project_index.json"
            if project_index.exists():
                try:
                    with open(project_index, encoding="utf-8") as f:
                        index = json.load(f)
                    test_command = index.get("conventions", {}).get("test_command", "pytest")
                except (json.JSONDecodeError, OSError):
                    test_command = "pytest"
            else:
                test_command = "pytest"

        try:
            result = subprocess.run(
                test_command.split(),
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=300,
            )
            status = "passed" if result.returncode == 0 else "failed"
            output = result.stdout[:500] if result.stdout else result.stderr[:500]
            return f"Tests {status}: {output}"

        except subprocess.TimeoutExpired:
            return "Tests timed out after 5 minutes"
        except Exception as e:
            return f"Test execution failed: {e}"

    def commit_changes(self, message: str) -> str:
        """Commit changes with message."""
        return "Commits are handled by Auto-Claude coder agent automatically"

    # =========================================================================
    # QA EXECUTION
    # =========================================================================

    def run_qa_validation(self, spec_dir: str) -> dict[str, Any]:
        """Run QA validation loop."""
        self._lazy_import()

        if self._run_qa is None:
            return {"status": "error", "success": False, "error": "QA runner not available"}

        try:
            spec_path = Path(spec_dir)

            success = asyncio.run(
                self._run_qa(
                    project_dir=self.project_dir,
                    spec_dir=spec_path,
                    model="claude-sonnet-4-5-20250929",
                )
            )

            # Read QA status from implementation plan
            plan_file = spec_path / "implementation_plan.json"
            if plan_file.exists():
                with open(plan_file, encoding="utf-8") as f:
                    plan = json.load(f)
                qa_signoff = plan.get("qa_signoff", {})
                return {
                    "status": qa_signoff.get("status", "unknown"),
                    "success": success,
                }

            return {"status": "unknown", "success": success}

        except Exception as e:
            self._notify_error("qa_validation", e)
            return {"status": "error", "success": False, "error": str(e)}

    def run_qa_fixer(self, spec_dir: str, iteration: int) -> str:
        """Run QA fixer for a specific iteration."""
        return f"QA fixer runs as part of validation loop, iteration {iteration}"

    def check_acceptance_criteria(self, spec_dir: str) -> str:
        """Check acceptance criteria from spec."""
        spec_path = Path(spec_dir) / "spec.md"
        if not spec_path.exists():
            return "Spec file not found"

        try:
            content = spec_path.read_text(encoding="utf-8")
            if "## Acceptance Criteria" in content:
                start = content.find("## Acceptance Criteria")
                end = content.find("##", start + 1)
                criteria = content[start : end if end > 0 else None]
                return criteria.strip()
            return "No acceptance criteria section found in spec"

        except OSError as e:
            return f"Error reading spec: {e}"

    # =========================================================================
    # PROJECT CONTEXT
    # =========================================================================

    def get_project_context(self) -> dict[str, Any]:
        """Get project context from project_index.json."""
        index_file = self.project_dir / ".auto-claude" / "project_index.json"
        if not index_file.exists():
            return {}

        try:
            with open(index_file, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}

    def analyze_codebase(self) -> str:
        """Analyze codebase structure."""
        return "Codebase analysis delegated to Auto-Claude discovery phase"

    def get_existing_patterns(self) -> str:
        """Get existing code patterns from memory."""
        patterns_file = self.project_dir / ".auto-claude" / "memory" / "patterns.md"
        if patterns_file.exists():
            try:
                return patterns_file.read_text(encoding="utf-8")
            except OSError:
                pass
        return "No patterns documented yet"

    def search_codebase(self, query: str) -> str:
        """Search codebase for relevant code."""
        try:
            result = subprocess.run(
                ["grep", "-r", "-l", query, "."],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode == 0 and result.stdout:
                files = result.stdout.strip().split("\n")[:10]
                return f"Found in files: {', '.join(files)}"
            return f"No matches found for: {query}"

        except subprocess.TimeoutExpired:
            return "Search timed out"
        except Exception as e:
            return f"Search failed: {e}"

    # =========================================================================
    # ANALYSIS TOOLS
    # =========================================================================

    def assess_complexity(self, task_description: str) -> str:
        """Assess task complexity."""
        return "Complexity assessment delegated to Auto-Claude spec creation"

    def get_dependencies(self, spec_dir: str) -> str:
        """Get dependencies for a spec."""
        plan_file = Path(spec_dir) / "implementation_plan.json"
        if not plan_file.exists():
            return "No implementation plan found"

        try:
            with open(plan_file, encoding="utf-8") as f:
                plan = json.load(f)

            deps = []
            for phase in plan.get("phases", []):
                phase_deps = phase.get("depends_on", [])
                if phase_deps:
                    deps.append(f"{phase.get('id', 'unknown')}: depends on {', '.join(phase_deps)}")

            return "\n".join(deps) if deps else "No phase dependencies"

        except (json.JSONDecodeError, OSError) as e:
            return f"Error reading dependencies: {e}"

    # =========================================================================
    # REVIEW TOOLS
    # =========================================================================

    def review_changes(self, spec_dir: str | None = None) -> str:
        """Review changes in worktree."""
        work_dir = self.project_dir
        if spec_dir:
            worktree_path = self.project_dir / ".worktrees" / Path(spec_dir).name
            if worktree_path.exists():
                work_dir = worktree_path

        try:
            result = subprocess.run(
                ["git", "diff", "--stat", "HEAD~10"],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return result.stdout if result.stdout else "No recent changes"

        except Exception as e:
            return f"Review failed: {e}"

    def run_linters(self) -> str:
        """Run linters on the project."""
        linter_commands = [
            ("ruff", ["ruff", "check", "."]),
            ("biome", ["biome", "check", "."]),
            ("eslint", ["eslint", "."]),
        ]

        for name, cmd in linter_commands:
            try:
                result = subprocess.run(
                    cmd,
                    cwd=self.project_dir,
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if result.returncode == 0:
                    return f"Linting passed with {name}"
                return f"Linting issues ({name}): {result.stdout[:500]}"
            except FileNotFoundError:
                continue
            except subprocess.TimeoutExpired:
                return f"Linting with {name} timed out"

        return "No linter found (tried ruff, biome, eslint)"

    def check_security(self) -> str:
        """Run security checks."""
        return self.scan_secrets()

    def scan_secrets(self) -> str:
        """Scan for exposed secrets."""
        # Simple pattern-based secret detection
        patterns = [
            "password",
            "secret",
            "api_key",
            "apikey",
            "token",
            "private_key",
        ]

        findings = []
        for pattern in patterns:
            try:
                result = subprocess.run(
                    ["grep", "-r", "-i", "-l", pattern, "."],
                    cwd=self.project_dir,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if result.returncode == 0 and result.stdout:
                    files = result.stdout.strip().split("\n")
                    # Filter out common false positives
                    files = [
                        f
                        for f in files
                        if not any(
                            x in f
                            for x in [".env.example", "requirements", "package.json", ".md", ".txt"]
                        )
                    ]
                    if files:
                        findings.append(f"{pattern}: {len(files)} potential files")
            except Exception:
                pass

        if findings:
            return f"Potential secrets found:\n" + "\n".join(findings)
        return "No obvious secrets detected"

    # =========================================================================
    # RELEASE TOOLS
    # =========================================================================

    def update_changelog(self, spec_dir: str) -> str:
        """Update changelog for release."""
        changelog = self.project_dir / "CHANGELOG.md"
        if not changelog.exists():
            return "No CHANGELOG.md found in project"

        spec_path = Path(spec_dir) / "spec.md"
        if spec_path.exists():
            return f"Changelog update needed based on: {spec_path.name}"

        return "No spec found for changelog update"

    def prepare_release(self, spec_dir: str) -> dict[str, Any]:
        """Prepare release artifacts."""
        return {
            "status": "pending",
            "message": "Release preparation delegated to Release Manager agent",
            "spec_dir": spec_dir,
        }

    # =========================================================================
    # E2E TESTING
    # =========================================================================

    def run_e2e_tests(self) -> str:
        """Run end-to-end tests."""
        e2e_commands = [
            ("playwright", ["npx", "playwright", "test"]),
            ("cypress", ["npx", "cypress", "run"]),
        ]

        for name, cmd in e2e_commands:
            try:
                result = subprocess.run(
                    cmd,
                    cwd=self.project_dir,
                    capture_output=True,
                    text=True,
                    timeout=600,
                )
                status = "passed" if result.returncode == 0 else "failed"
                return f"E2E tests ({name}): {status}"
            except FileNotFoundError:
                continue
            except subprocess.TimeoutExpired:
                return f"E2E tests ({name}) timed out after 10 minutes"

        return "No E2E test framework found (tried playwright, cypress)"

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _notify_progress(self, event: str, data: dict):
        """Send progress notification."""
        if self.on_progress:
            self.on_progress(event, data)

    def _notify_error(self, context: str, error: Exception):
        """Send error notification."""
        if self.on_error:
            self.on_error(context, error)
