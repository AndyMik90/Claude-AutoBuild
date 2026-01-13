#!/usr/bin/env python3
"""
Tests for Implementation Plan Validation Status
================================================

Tests the validation_complete flag functionality in ImplementationPlan:
- update_status_from_subtasks() with validation_complete flag
- Status transitions based on QA signoff and validation completion
- Backward compatibility with missing validation_complete field
- Edge cases and race conditions
"""

import pytest
from pathlib import Path

from implementation_plan import (
    ImplementationPlan,
    Phase,
    Subtask,
    SubtaskStatus,
    WorkflowType,
    PhaseType,
)


class TestUpdateStatusFromSubtasksValidation:
    """Tests for update_status_from_subtasks() with validation_complete flag."""

    def test_all_subtasks_complete_no_qa_signoff(self):
        """When all subtasks complete but no QA signoff, status is ai_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                        Subtask(
                            id="subtask-2",
                            description="Task 2",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
        )

        plan.update_status_from_subtasks()

        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_all_subtasks_complete_qa_approved_no_validation_complete(self):
        """When QA approved but validation_complete is False, status is ai_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                        Subtask(
                            id="subtask-2",
                            description="Task 2",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": False,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_all_subtasks_complete_qa_approved_validation_complete_true(self):
        """When all conditions met (including validation_complete=True), status is human_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                        Subtask(
                            id="subtask-2",
                            description="Task 2",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        assert plan.status == "human_review"
        assert plan.planStatus == "review"

    def test_backward_compatibility_missing_validation_complete_field(self):
        """When validation_complete field is missing, defaults to False (backward compatibility)."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "timestamp": "2024-01-01T00:00:00",
                # validation_complete field missing (old format)
            },
        )

        plan.update_status_from_subtasks()

        # Should remain in ai_review when validation_complete is missing
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_qa_rejected_validation_complete_ignored(self):
        """When QA is rejected, validation_complete flag is ignored."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "rejected",
                "validation_complete": True,  # This should be ignored
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # Should be ai_review because status is rejected (not approved)
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_partial_subtasks_complete_with_validation_complete(self):
        """When subtasks are partially complete, status is in_progress regardless of validation_complete."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                        Subtask(
                            id="subtask-2",
                            description="Task 2",
                            status=SubtaskStatus.PENDING,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # Should be in_progress because not all subtasks are complete
        assert plan.status == "in_progress"
        assert plan.planStatus == "in_progress"

    def test_no_subtasks_no_qa_signoff(self):
        """When no subtasks exist, status remains backlog/pending."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[],
        )

        plan.update_status_from_subtasks()

        assert plan.status == "backlog"
        assert plan.planStatus == "pending"

    def test_validation_complete_with_null_value(self):
        """When validation_complete is explicitly None, treated as False."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": None,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # None should be treated as False
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_validation_complete_with_truthy_non_boolean(self):
        """When validation_complete is truthy but not True, should not transition to human_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": "yes",  # Truthy string, not boolean True
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # Should use explicit == True check, so "yes" string should not match
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_multiple_phases_all_complete_with_validation_complete(self):
        """When multiple phases all complete and validation complete, status is human_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Backend",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1-1",
                            description="Backend Task",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                ),
                Phase(
                    phase=2,
                    name="Frontend",
                    type=PhaseType.IMPLEMENTATION,
                    depends_on=[1],
                    subtasks=[
                        Subtask(
                            id="subtask-2-1",
                            description="Frontend Task",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                ),
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        assert plan.status == "human_review"
        assert plan.planStatus == "review"

    def test_failed_subtasks_with_validation_complete(self):
        """When some subtasks failed, status is in_progress regardless of validation_complete."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                        Subtask(
                            id="subtask-2",
                            description="Task 2",
                            status=SubtaskStatus.FAILED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # Should be in_progress because a subtask failed
        assert plan.status == "in_progress"
        assert plan.planStatus == "in_progress"

    def test_qa_signoff_none_with_all_subtasks_complete(self):
        """When qa_signoff is None but all subtasks complete, status is ai_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff=None,
        )

        plan.update_status_from_subtasks()

        assert plan.status == "ai_review"
        assert plan.planStatus == "review"


class TestValidationCompleteSerializationAndPersistence:
    """Tests for validation_complete flag serialization and persistence."""

    def test_validation_complete_serializes_to_dict(self):
        """Validation_complete flag is included in serialized qa_signoff."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        data = plan.to_dict()

        assert "qa_signoff" in data
        assert data["qa_signoff"]["validation_complete"] is True

    def test_validation_complete_deserializes_from_dict(self):
        """Validation_complete flag is restored from serialized data."""
        data = {
            "feature": "Test Feature",
            "workflow_type": "feature",
            "services_involved": [],
            "phases": [],
            "final_acceptance": [],
            "qa_signoff": {
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        }

        plan = ImplementationPlan.from_dict(data)

        assert plan.qa_signoff is not None
        assert plan.qa_signoff["validation_complete"] is True

    def test_save_and_load_preserves_validation_complete(self, temp_dir: Path):
        """Validation_complete flag is preserved through save/load cycle."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan_path = temp_dir / "test_plan.json"
        plan.save(plan_path)
        loaded = ImplementationPlan.load(plan_path)

        assert loaded.qa_signoff is not None
        assert loaded.qa_signoff["validation_complete"] is True
        assert loaded.status == "human_review"
        assert loaded.planStatus == "review"

    def test_save_and_load_missing_validation_complete(self, temp_dir: Path):
        """Plan without validation_complete field loads correctly (backward compatibility)."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "timestamp": "2024-01-01T00:00:00",
                # validation_complete missing
            },
        )

        plan_path = temp_dir / "test_plan.json"
        plan.save(plan_path)
        loaded = ImplementationPlan.load(plan_path)

        assert loaded.qa_signoff is not None
        assert loaded.qa_signoff.get("validation_complete") is None
        # Should default to ai_review when validation_complete is missing
        assert loaded.status == "ai_review"
        assert loaded.planStatus == "review"


class TestValidationCompleteEdgeCases:
    """Tests for edge cases and race conditions with validation_complete flag."""

    def test_update_status_called_multiple_times_idempotent(self):
        """Calling update_status_from_subtasks multiple times produces consistent results."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": True,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        # Call multiple times
        plan.update_status_from_subtasks()
        first_status = plan.status
        first_plan_status = plan.planStatus

        plan.update_status_from_subtasks()
        second_status = plan.status
        second_plan_status = plan.planStatus

        plan.update_status_from_subtasks()
        third_status = plan.status
        third_plan_status = plan.planStatus

        # Should be consistent
        assert first_status == second_status == third_status == "human_review"
        assert first_plan_status == second_plan_status == third_plan_status == "review"

    def test_transition_from_ai_review_to_human_review(self):
        """Status transitions from ai_review to human_review when validation_complete becomes True."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": False,
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        # Initially should be ai_review
        plan.update_status_from_subtasks()
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

        # Update validation_complete to True
        plan.qa_signoff["validation_complete"] = True
        plan.update_status_from_subtasks()

        # Should transition to human_review
        assert plan.status == "human_review"
        assert plan.planStatus == "review"

    def test_validation_complete_false_explicitly_set(self):
        """When validation_complete is explicitly set to False, status is ai_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": False,  # Explicitly False
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_empty_qa_signoff_dict(self):
        """When qa_signoff is an empty dict, status is ai_review."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={},  # Empty dict
        )

        plan.update_status_from_subtasks()

        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_validation_complete_with_integer_zero(self):
        """When validation_complete is 0 (falsy integer), should not match True."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": 0,  # Integer zero
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # 0 != True, so should stay in ai_review
        assert plan.status == "ai_review"
        assert plan.planStatus == "review"

    def test_validation_complete_with_integer_one(self):
        """When validation_complete is 1 (truthy integer), Python treats it equal to True."""
        plan = ImplementationPlan(
            feature="Test Feature",
            workflow_type=WorkflowType.FEATURE,
            phases=[
                Phase(
                    phase=1,
                    name="Implementation",
                    type=PhaseType.IMPLEMENTATION,
                    subtasks=[
                        Subtask(
                            id="subtask-1",
                            description="Task 1",
                            status=SubtaskStatus.COMPLETED,
                        ),
                    ],
                )
            ],
            qa_signoff={
                "status": "approved",
                "validation_complete": 1,  # Integer one (Python: 1 == True)
                "timestamp": "2024-01-01T00:00:00",
            },
        )

        plan.update_status_from_subtasks()

        # In Python, 1 == True evaluates to True, so this transitions to human_review
        assert plan.status == "human_review"
        assert plan.planStatus == "review"
