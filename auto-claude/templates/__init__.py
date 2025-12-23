"""
Spec Template System
====================

Provides templates for common project types to accelerate spec creation.

Usage:
    from templates import load_template, list_templates, apply_template

    # List available templates
    templates = list_templates()

    # Load and apply a template
    spec = apply_template("rest-api", {"endpoint": "/users", "method": "POST"})
"""

from templates.loader import (
    Template,
    TemplateVariable,
    apply_template,
    get_template_path,
    list_templates,
    load_template,
    validate_template_vars,
)

__all__ = [
    "Template",
    "TemplateVariable",
    "load_template",
    "list_templates",
    "apply_template",
    "validate_template_vars",
    "get_template_path",
]
