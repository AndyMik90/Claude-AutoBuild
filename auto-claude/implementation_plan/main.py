#!/usr/bin/env python3
"""
Implementation Plan Manager
============================

DEPRECATED: This module is now a compatibility shim. The implementation has been
refactored into the implementation_plan/ package for better modularity.

Please import from the package directly:
    from implementation_plan import ImplementationPlan, Subtask, Phase, etc.

This file re-exports all public APIs for backwards compatibility.

Core data structures and utilities for subtask-based implementation plans.
Replaces the test-centric feature_list.json with implementation_plan.json.

The key insight: Tests verify outcomes, but SUBTASKS define implementation steps.
For complex multi-service features, implementation order matters.

Workflow Types:
- feature: Standard multi-service feature (phases = services)
- refactor: Migration/refactor work (phases = stages: add, migrate, remove)
- investigation: Bug hunting (phases = investigate, hypothesize, fix)
- migration: Data migration (phases = prepare, test, execute, cleanup)
- simple: Single-service enhancement (minimal overhead)
"""

# Re-export everything from the implementation_plan package
from implementation_plan import (
    Chunk,
    ChunkStatus,
    ImplementationPlan,
    Phase,
    PhaseType,
    Subtask,
    SubtaskStatus,
    Verification,
    VerificationType,
    WorkflowType,
    create_feature_plan,
    create_investigation_plan,
    create_refactor_plan,
)

__all__ = [
    # Enums
    "WorkflowType",
    "PhaseType",
    "SubtaskStatus",
    "VerificationType",
    # Models
    "Verification",
    "Subtask",
    "Phase",
    "ImplementationPlan",
    # Factories
    "create_feature_plan",
    "create_investigation_plan",
    "create_refactor_plan",
    # Backwards compatibility
    "Chunk",
    "ChunkStatus",
]


# CLI for testing
if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    if len(sys.argv) < 2:
        print("Usage: python implementation_plan.py <plan.json>")
        print("       python implementation_plan.py --demo")
        sys.exit(1)

    if sys.argv[1] == "--demo":
        # Create a demo plan
        plan = create_feature_plan(
            feature="Avatar Upload with Processing",
            services=["backend", "worker", "frontend"],
            phases_config=[
                {
                    "name": "Backend Foundation",
                    "parallel_safe": True,
                    "subtasks": [
                        {
                            "id": "avatar-model",
                            "service": "backend",
                            "description": "Add avatar fields to User model",
                            "files_to_modify": ["app/models/user.py"],
                            "files_to_create": ["migrations/add_avatar.py"],
                            "verification": {
                                "type": "command",
                                "run": "flask db upgrade",
                            },
                        },
                        {
                            "id": "avatar-endpoint",
                            "service": "backend",
                            "description": "POST /api/users/avatar endpoint",
                            "files_to_modify": ["app/routes/users.py"],
                            "patterns_from": ["app/routes/profile.py"],
                            "verification": {
                                "type": "api",
                                "method": "POST",
                                "url": "/api/users/avatar",
                            },
                        },
                    ],
                },
                {
                    "name": "Worker Pipeline",
                    "depends_on": [1],
                    "subtasks": [
                        {
                            "id": "image-task",
                            "service": "worker",
                            "description": "Celery task for image processing",
                            "files_to_create": ["app/tasks/images.py"],
                            "patterns_from": ["app/tasks/reports.py"],
                        },
                    ],
                },
                {
                    "name": "Frontend",
                    "depends_on": [1],
                    "subtasks": [
                        {
                            "id": "avatar-component",
                            "service": "frontend",
                            "description": "AvatarUpload React component",
                            "files_to_create": ["src/components/AvatarUpload.tsx"],
                            "patterns_from": ["src/components/FileUpload.tsx"],
                        },
                    ],
                },
                {
                    "name": "Integration",
                    "depends_on": [2, 3],
                    "type": "integration",
                    "subtasks": [
                        {
                            "id": "e2e-wiring",
                            "all_services": True,
                            "description": "Connect frontend → backend → worker",
                            "verification": {
                                "type": "browser",
                                "scenario": "Upload → Process → Display",
                            },
                        },
                    ],
                },
            ],
        )
        plan.final_acceptance = [
            "User can upload avatar from profile page",
            "Avatar is automatically resized",
            "Large/invalid files show error",
        ]

        print(json.dumps(plan.to_dict(), indent=2))
        print("\n---\n")
        print(plan.get_status_summary())
    else:
        # Load and display existing plan
        plan = ImplementationPlan.load(Path(sys.argv[1]))
        print(plan.get_status_summary())
