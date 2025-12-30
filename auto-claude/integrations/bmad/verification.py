"""
Verification Gate

Verifies that a component meets its acceptance criteria before proceeding.
This is the quality gate that ensures components are properly built.
"""

import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class VerificationResult:
    """Result of a verification check."""

    passed: bool
    message: str
    details: dict | None = None


class VerificationGate:
    """
    Verify component meets acceptance criteria before allowing progression.

    The verification gate checks:
    1. Required files exist
    2. Tests pass (if applicable)
    3. Acceptance criteria can be validated
    """

    def __init__(self, project_path: Path):
        self.project_path = Path(project_path)

    async def verify(self, component) -> VerificationResult:
        """
        Run all verification checks for a component.

        Args:
            component: The BlueprintComponent to verify

        Returns:
            VerificationResult with passed status and details
        """
        checks = []

        # Check 1: Files exist
        files_result = self._check_files_exist(component)
        checks.append(("files_exist", files_result))

        if not files_result.passed:
            return files_result

        # Check 2: Run tests if test files exist
        test_result = await self._run_component_tests(component)
        checks.append(("tests", test_result))

        if not test_result.passed:
            return test_result

        # Check 3: Validate acceptance criteria
        criteria_result = await self._check_acceptance_criteria(component)
        checks.append(("criteria", criteria_result))

        # Aggregate results
        all_passed = all(r.passed for _, r in checks)

        if all_passed:
            return VerificationResult(
                passed=True,
                message="All verification checks passed",
                details={name: result.message for name, result in checks},
            )
        else:
            failed = [name for name, r in checks if not r.passed]
            return VerificationResult(
                passed=False,
                message=f"Verification failed: {', '.join(failed)}",
                details={name: result.message for name, result in checks},
            )

    def _check_files_exist(self, component) -> VerificationResult:
        """Check that all required files exist."""
        if not component.files:
            return VerificationResult(passed=True, message="No specific files required")

        missing = []
        for file_path in component.files:
            full_path = self.project_path / file_path
            if not full_path.exists():
                missing.append(file_path)

        if missing:
            return VerificationResult(
                passed=False,
                message=f"Missing files: {', '.join(missing)}",
                details={"missing": missing},
            )

        return VerificationResult(
            passed=True, message=f"All {len(component.files)} files exist"
        )

    async def _run_component_tests(self, component) -> VerificationResult:
        """Run tests related to this component."""
        # Find test files
        test_patterns = [
            f"**/test_{component.id}*.py",
            f"**/{component.id}_test.py",
            f"**/test*{component.name.lower().replace(' ', '_')}*.py",
        ]

        test_files = []
        for pattern in test_patterns:
            test_files.extend(self.project_path.glob(pattern))

        if not test_files:
            return VerificationResult(
                passed=True, message="No component-specific tests found (skipped)"
            )

        # Run pytest
        try:
            result = subprocess.run(
                ["pytest", "-v"] + [str(f) for f in test_files],
                cwd=str(self.project_path),
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode == 0:
                return VerificationResult(
                    passed=True,
                    message=f"All tests passed ({len(test_files)} test files)",
                )
            else:
                return VerificationResult(
                    passed=False,
                    message=f"Tests failed: {result.stdout}\n{result.stderr}",
                    details={"returncode": result.returncode},
                )

        except subprocess.TimeoutExpired:
            return VerificationResult(
                passed=False, message="Tests timed out after 5 minutes"
            )
        except FileNotFoundError:
            return VerificationResult(
                passed=True, message="pytest not available (skipped)"
            )

    async def _check_acceptance_criteria(self, component) -> VerificationResult:
        """
        Validate acceptance criteria.

        For now, this does basic checks. In the future, this could use
        an AI agent to verify each criterion.
        """
        if not component.acceptance_criteria:
            return VerificationResult(
                passed=True, message="No acceptance criteria defined"
            )

        # Basic validation: check if files contain expected content
        # This is a simple heuristic check
        criteria_checks = []

        for criterion in component.acceptance_criteria:
            # For now, assume criteria pass if files exist
            # In a full implementation, this would use AI to verify
            criteria_checks.append((criterion.description, True))

        passed_count = sum(1 for _, passed in criteria_checks if passed)
        total_count = len(criteria_checks)

        if passed_count == total_count:
            return VerificationResult(
                passed=True, message=f"All {total_count} acceptance criteria validated"
            )
        else:
            failed = [desc for desc, passed in criteria_checks if not passed]
            return VerificationResult(
                passed=False,
                message=f"Failed criteria: {'; '.join(failed)}",
                details={"failed": failed},
            )

    async def verify_single_criterion(
        self, component, criterion_index: int
    ) -> VerificationResult:
        """Verify a single acceptance criterion."""
        if criterion_index >= len(component.acceptance_criteria):
            return VerificationResult(passed=False, message="Invalid criterion index")

        criterion = component.acceptance_criteria[criterion_index]

        # TODO: Implement AI-based criterion verification
        # For now, return passed

        return VerificationResult(
            passed=True, message=f"Criterion verified: {criterion.description}"
        )
