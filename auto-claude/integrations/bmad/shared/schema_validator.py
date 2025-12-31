"""
YAML Schema Validator - Validates BMAD agent and workflow YAML files.

Provides lightweight schema validation to catch malformed or malicious files
before they're processed by the loader pipeline.

Based on BMAD Full Integration Product Brief security requirements.
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class SchemaType(Enum):
    """Supported schema types."""

    AGENT = "agent"
    WORKFLOW = "workflow"
    TEAM = "team"


@dataclass
class ValidationResult:
    """Result of schema validation."""

    valid: bool
    errors: list[str]
    warnings: list[str]

    @classmethod
    def success(cls) -> "ValidationResult":
        return cls(valid=True, errors=[], warnings=[])

    @classmethod
    def failure(cls, errors: list[str]) -> "ValidationResult":
        return cls(valid=False, errors=errors, warnings=[])


# Required fields for each schema type
AGENT_REQUIRED_FIELDS = {
    "agent": {
        "metadata": ["id", "name"],
        "persona": ["identity"],
    }
}

WORKFLOW_REQUIRED_FIELDS = {
    "workflow": {
        "metadata": ["name"],
    }
}

TEAM_REQUIRED_FIELDS = {
    "team": {
        "name": None,  # Direct field, not nested
        "roles": None,
    }
}

# Maximum field lengths to prevent resource exhaustion
MAX_FIELD_LENGTHS = {
    "id": 100,
    "name": 200,
    "title": 500,
    "identity": 10000,
    "communication_style": 5000,
    "principles": 20000,
    "description": 10000,
}

# Maximum list sizes
MAX_LIST_SIZES = {
    "principles": 100,
    "critical_actions": 100,
    "menu": 50,
    "roles": 50,
    "steps": 200,
}


def validate_agent(data: dict[str, Any]) -> ValidationResult:
    """
    Validate an agent YAML structure.

    Args:
        data: Parsed YAML data

    Returns:
        ValidationResult with any errors or warnings
    """
    errors = []
    warnings = []

    # Check for required top-level key
    if "agent" not in data:
        errors.append("Missing required 'agent' top-level key")
        return ValidationResult.failure(errors)

    agent = data["agent"]
    if not isinstance(agent, dict):
        errors.append("'agent' must be a dictionary")
        return ValidationResult.failure(errors)

    # Check metadata
    metadata = agent.get("metadata", {})
    if not isinstance(metadata, dict):
        errors.append("'metadata' must be a dictionary")
    else:
        for required_field in AGENT_REQUIRED_FIELDS["agent"]["metadata"]:
            if required_field not in metadata:
                errors.append(f"Missing required field: metadata.{required_field}")
            elif not isinstance(metadata.get(required_field), str):
                errors.append(f"Field metadata.{required_field} must be a string")
            elif len(metadata.get(required_field, "")) > MAX_FIELD_LENGTHS.get(required_field, 1000):
                errors.append(
                    f"Field metadata.{required_field} exceeds maximum length of "
                    f"{MAX_FIELD_LENGTHS.get(required_field, 1000)}"
                )

    # Check persona
    persona = agent.get("persona", {})
    if not isinstance(persona, dict):
        errors.append("'persona' must be a dictionary")
    else:
        for required_field in AGENT_REQUIRED_FIELDS["agent"]["persona"]:
            if required_field not in persona:
                warnings.append(f"Missing recommended field: persona.{required_field}")

        # Validate field lengths
        for field, max_len in MAX_FIELD_LENGTHS.items():
            if field in persona:
                value = persona[field]
                if isinstance(value, str) and len(value) > max_len:
                    errors.append(f"Field persona.{field} exceeds maximum length of {max_len}")

    # Check list sizes
    if "menu" in agent:
        if not isinstance(agent["menu"], list):
            errors.append("'menu' must be a list")
        elif len(agent["menu"]) > MAX_LIST_SIZES["menu"]:
            errors.append(f"'menu' exceeds maximum size of {MAX_LIST_SIZES['menu']}")

    if "critical_actions" in agent:
        if not isinstance(agent["critical_actions"], list):
            errors.append("'critical_actions' must be a list")
        elif len(agent["critical_actions"]) > MAX_LIST_SIZES["critical_actions"]:
            errors.append(
                f"'critical_actions' exceeds maximum size of {MAX_LIST_SIZES['critical_actions']}"
            )

    if errors:
        return ValidationResult(valid=False, errors=errors, warnings=warnings)
    return ValidationResult(valid=True, errors=[], warnings=warnings)


def validate_workflow(data: dict[str, Any]) -> ValidationResult:
    """
    Validate a workflow YAML structure.

    Args:
        data: Parsed YAML data

    Returns:
        ValidationResult with any errors or warnings
    """
    errors = []
    warnings = []

    # Check for required top-level key
    if "workflow" not in data:
        errors.append("Missing required 'workflow' top-level key")
        return ValidationResult.failure(errors)

    workflow = data["workflow"]
    if not isinstance(workflow, dict):
        errors.append("'workflow' must be a dictionary")
        return ValidationResult.failure(errors)

    # Check metadata
    metadata = workflow.get("metadata", {})
    if not isinstance(metadata, dict):
        errors.append("'metadata' must be a dictionary")
    else:
        for required_field in WORKFLOW_REQUIRED_FIELDS["workflow"]["metadata"]:
            if required_field not in metadata:
                errors.append(f"Missing required field: metadata.{required_field}")

    # Check steps if present
    steps = workflow.get("steps", [])
    if steps:
        if not isinstance(steps, list):
            errors.append("'steps' must be a list")
        elif len(steps) > MAX_LIST_SIZES["steps"]:
            errors.append(f"'steps' exceeds maximum size of {MAX_LIST_SIZES['steps']}")

    if errors:
        return ValidationResult(valid=False, errors=errors, warnings=warnings)
    return ValidationResult(valid=True, errors=[], warnings=warnings)


def validate_team(data: dict[str, Any]) -> ValidationResult:
    """
    Validate a team YAML structure.

    Args:
        data: Parsed YAML data

    Returns:
        ValidationResult with any errors or warnings
    """
    errors = []

    # Check for required fields
    if "name" not in data:
        errors.append("Missing required field: name")
    elif not isinstance(data["name"], str):
        errors.append("Field 'name' must be a string")

    if "roles" not in data:
        errors.append("Missing required field: roles")
    elif not isinstance(data["roles"], list):
        errors.append("Field 'roles' must be a list")
    elif len(data["roles"]) > MAX_LIST_SIZES["roles"]:
        errors.append(f"'roles' exceeds maximum size of {MAX_LIST_SIZES['roles']}")

    if errors:
        return ValidationResult.failure(errors)
    return ValidationResult.success()


def validate_yaml(data: dict[str, Any], schema_type: SchemaType) -> ValidationResult:
    """
    Validate YAML data against a schema.

    Args:
        data: Parsed YAML data
        schema_type: Type of schema to validate against

    Returns:
        ValidationResult with any errors or warnings
    """
    if not isinstance(data, dict):
        return ValidationResult.failure(["YAML must be a dictionary at top level"])

    if schema_type == SchemaType.AGENT:
        return validate_agent(data)
    elif schema_type == SchemaType.WORKFLOW:
        return validate_workflow(data)
    elif schema_type == SchemaType.TEAM:
        return validate_team(data)
    else:
        return ValidationResult.failure([f"Unknown schema type: {schema_type}"])
