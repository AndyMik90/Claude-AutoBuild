"""
Template Loader
===============

Loads and processes spec templates from JSON/YAML files.
Supports variable substitution and template validation.
"""

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class TemplateVariable:
    """
    A template variable definition.

    Attributes:
        name: Variable name (used in {{name}} placeholders)
        description: Human-readable description
        required: Whether the variable must be provided
        default: Default value if not provided
        example: Example value for documentation
    """

    name: str
    description: str
    required: bool = True
    default: str | None = None
    example: str | None = None


@dataclass
class Template:
    """
    A spec template.

    Attributes:
        name: Template identifier (e.g., "rest-api")
        title: Human-readable title
        description: What this template is for
        category: Template category (api, component, database, etc.)
        complexity: Suggested complexity level
        variables: List of template variables
        content: Template content with {{variable}} placeholders
        files: Optional list of additional template files
    """

    name: str
    title: str
    description: str
    category: str
    complexity: str
    variables: list[TemplateVariable]
    content: str
    files: dict[str, str] = field(default_factory=dict)

    def get_variable(self, name: str) -> TemplateVariable | None:
        """Get a variable by name."""
        for var in self.variables:
            if var.name == name:
                return var
        return None

    def get_required_variables(self) -> list[str]:
        """Get names of required variables."""
        return [v.name for v in self.variables if v.required]

    def get_optional_variables(self) -> list[str]:
        """Get names of optional variables."""
        return [v.name for v in self.variables if not v.required]


def get_template_dir() -> Path:
    """Get the built-in templates directory."""
    return Path(__file__).parent / "builtin"


def get_custom_template_dir() -> Path | None:
    """Get the custom templates directory from environment."""
    custom_dir = os.environ.get("AUTO_CLAUDE_TEMPLATES_DIR")
    if custom_dir:
        path = Path(custom_dir)
        if path.exists():
            return path
    return None


def list_templates() -> list[dict[str, Any]]:
    """
    List all available templates.

    Returns:
        List of template metadata (name, title, description, category)
    """
    templates = []

    # Load built-in templates
    builtin_dir = get_template_dir()
    if builtin_dir.exists():
        templates.extend(_list_templates_in_dir(builtin_dir, builtin=True))

    # Load custom templates
    custom_dir = get_custom_template_dir()
    if custom_dir:
        templates.extend(_list_templates_in_dir(custom_dir, builtin=False))

    return templates


def _list_templates_in_dir(directory: Path, builtin: bool) -> list[dict[str, Any]]:
    """List templates in a directory."""
    templates = []

    for file in directory.glob("*.json"):
        try:
            with open(file) as f:
                data = json.load(f)
                templates.append(
                    {
                        "name": data.get("name", file.stem),
                        "title": data.get("title", file.stem),
                        "description": data.get("description", ""),
                        "category": data.get("category", "general"),
                        "complexity": data.get("complexity", "standard"),
                        "builtin": builtin,
                        "path": str(file),
                    }
                )
        except (json.JSONDecodeError, KeyError):
            continue

    return templates


def load_template(name: str) -> Template:
    """
    Load a template by name.

    Args:
        name: Template name (e.g., "rest-api")

    Returns:
        Template object

    Raises:
        ValueError: If template not found
    """
    # Try custom templates first
    custom_dir = get_custom_template_dir()
    if custom_dir:
        template_file = custom_dir / f"{name}.json"
        if template_file.exists():
            return _load_template_file(template_file)

    # Try built-in templates
    builtin_dir = get_template_dir()
    template_file = builtin_dir / f"{name}.json"
    if template_file.exists():
        return _load_template_file(template_file)

    # List available templates in error message
    available = [t["name"] for t in list_templates()]
    raise ValueError(
        f"Template '{name}' not found. Available templates: {', '.join(available)}"
    )


def _load_template_file(path: Path) -> Template:
    """Load a template from a JSON file."""
    with open(path) as f:
        data = json.load(f)

    variables = []
    for var_data in data.get("variables", []):
        variables.append(
            TemplateVariable(
                name=var_data["name"],
                description=var_data.get("description", ""),
                required=var_data.get("required", True),
                default=var_data.get("default"),
                example=var_data.get("example"),
            )
        )

    return Template(
        name=data.get("name", path.stem),
        title=data.get("title", path.stem),
        description=data.get("description", ""),
        category=data.get("category", "general"),
        complexity=data.get("complexity", "standard"),
        variables=variables,
        content=data.get("content", ""),
        files=data.get("files", {}),
    )


def validate_template_vars(template: Template, variables: dict[str, str]) -> list[str]:
    """
    Validate provided variables against template requirements.

    Args:
        template: The template to validate against
        variables: Provided variable values

    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []

    # Check for missing required variables
    for var in template.variables:
        if var.required and var.name not in variables:
            if var.default is None:
                errors.append(
                    f"Missing required variable: {var.name} - {var.description}"
                )

    # Check for unknown variables
    known_vars = {v.name for v in template.variables}
    for var_name in variables:
        if var_name not in known_vars:
            errors.append(f"Unknown variable: {var_name}")

    return errors


def apply_template(
    template_name: str,
    variables: dict[str, str],
    validate: bool = True,
) -> str:
    """
    Apply a template with the given variables.

    Args:
        template_name: Name of the template to apply
        variables: Variable values to substitute
        validate: Whether to validate variables first

    Returns:
        Rendered template content

    Raises:
        ValueError: If validation fails or template not found
    """
    template = load_template(template_name)

    if validate:
        errors = validate_template_vars(template, variables)
        if errors:
            raise ValueError("Template validation failed:\n" + "\n".join(errors))

    return render_template(template, variables)


def render_template(template: Template, variables: dict[str, str]) -> str:
    """
    Render a template with variable substitution.

    Args:
        template: Template to render
        variables: Variable values

    Returns:
        Rendered content
    """
    content = template.content

    # Build complete variable set with defaults
    complete_vars = {}
    for var in template.variables:
        if var.name in variables:
            complete_vars[var.name] = variables[var.name]
        elif var.default is not None:
            complete_vars[var.name] = var.default

    # Substitute variables using {{variable}} syntax
    for var_name, var_value in complete_vars.items():
        pattern = r"\{\{\s*" + re.escape(var_name) + r"\s*\}\}"
        content = re.sub(pattern, str(var_value), content)

    return content


def get_template_path(name: str) -> Path | None:
    """
    Get the file path for a template.

    Args:
        name: Template name

    Returns:
        Path to template file, or None if not found
    """
    # Try custom templates first
    custom_dir = get_custom_template_dir()
    if custom_dir:
        template_file = custom_dir / f"{name}.json"
        if template_file.exists():
            return template_file

    # Try built-in templates
    builtin_dir = get_template_dir()
    template_file = builtin_dir / f"{name}.json"
    if template_file.exists():
        return template_file

    return None
