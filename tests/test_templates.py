"""
Tests for Spec Template System
==============================

Tests for the template loading, validation, and rendering system.
"""

import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch

# Add auto-claude to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from templates.loader import (
    Template,
    TemplateVariable,
    load_template,
    list_templates,
    apply_template,
    validate_template_vars,
    render_template,
    get_template_dir,
)


class TestTemplateVariable:
    """Tests for TemplateVariable dataclass."""

    def test_required_variable(self):
        """Can create a required variable."""
        var = TemplateVariable(
            name="endpoint",
            description="API endpoint path",
            required=True,
        )
        assert var.name == "endpoint"
        assert var.required is True
        assert var.default is None

    def test_optional_variable_with_default(self):
        """Can create optional variable with default."""
        var = TemplateVariable(
            name="auth",
            description="Auth requirement",
            required=False,
            default="yes",
        )
        assert var.required is False
        assert var.default == "yes"


class TestTemplate:
    """Tests for Template dataclass."""

    def test_get_variable(self):
        """Can get variable by name."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="var1", description="Var 1"),
                TemplateVariable(name="var2", description="Var 2"),
            ],
            content="{{var1}} {{var2}}",
        )
        var = template.get_variable("var1")
        assert var is not None
        assert var.name == "var1"

    def test_get_variable_not_found(self):
        """Returns None for unknown variable."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[],
            content="",
        )
        assert template.get_variable("unknown") is None

    def test_get_required_variables(self):
        """Can get list of required variables."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="req1", description="", required=True),
                TemplateVariable(name="opt1", description="", required=False),
                TemplateVariable(name="req2", description="", required=True),
            ],
            content="",
        )
        required = template.get_required_variables()
        assert required == ["req1", "req2"]

    def test_get_optional_variables(self):
        """Can get list of optional variables."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="req1", description="", required=True),
                TemplateVariable(name="opt1", description="", required=False),
                TemplateVariable(name="opt2", description="", required=False),
            ],
            content="",
        )
        optional = template.get_optional_variables()
        assert optional == ["opt1", "opt2"]


class TestListTemplates:
    """Tests for list_templates function."""

    def test_list_builtin_templates(self):
        """Can list built-in templates."""
        templates = list_templates()
        assert len(templates) >= 5  # We created 5 built-in templates

        # Check that expected templates are present
        names = {t["name"] for t in templates}
        assert "rest-api" in names
        assert "react-component" in names
        assert "database-migration" in names
        assert "bug-fix" in names
        assert "feature-flag" in names

    def test_template_metadata(self):
        """Templates have required metadata."""
        templates = list_templates()
        for template in templates:
            assert "name" in template
            assert "title" in template
            assert "description" in template
            assert "category" in template
            assert "builtin" in template


class TestLoadTemplate:
    """Tests for load_template function."""

    def test_load_rest_api_template(self):
        """Can load the REST API template."""
        template = load_template("rest-api")
        assert template.name == "rest-api"
        assert template.category == "api"
        assert len(template.variables) > 0

    def test_load_react_component_template(self):
        """Can load the React component template."""
        template = load_template("react-component")
        assert template.name == "react-component"
        assert template.category == "component"

    def test_load_nonexistent_template(self):
        """Loading nonexistent template raises ValueError."""
        with pytest.raises(ValueError, match="Template .* not found"):
            load_template("nonexistent-template")

    def test_template_has_variables(self):
        """Loaded template has variable definitions."""
        template = load_template("rest-api")
        assert len(template.variables) > 0
        
        endpoint_var = template.get_variable("endpoint")
        assert endpoint_var is not None
        assert endpoint_var.required is True

    def test_template_has_content(self):
        """Loaded template has content."""
        template = load_template("rest-api")
        assert len(template.content) > 0
        assert "{{endpoint}}" in template.content


class TestValidateTemplateVars:
    """Tests for validate_template_vars function."""

    def test_valid_variables(self):
        """No errors for valid variables."""
        template = load_template("bug-fix")
        variables = {
            "bug_title": "Test bug",
            "bug_description": "Description",
            "expected_behavior": "Should work",
            "actual_behavior": "Doesn't work",
        }
        errors = validate_template_vars(template, variables)
        assert len(errors) == 0

    def test_missing_required_variable(self):
        """Error for missing required variable."""
        template = load_template("bug-fix")
        variables = {
            "bug_title": "Test bug",
            # Missing other required variables
        }
        errors = validate_template_vars(template, variables)
        assert len(errors) > 0
        assert any("Missing required variable" in e for e in errors)

    def test_unknown_variable(self):
        """Error for unknown variable."""
        template = load_template("bug-fix")
        variables = {
            "bug_title": "Test bug",
            "bug_description": "Description",
            "expected_behavior": "Should work",
            "actual_behavior": "Doesn't work",
            "unknown_var": "value",  # Unknown
        }
        errors = validate_template_vars(template, variables)
        assert len(errors) > 0
        assert any("Unknown variable" in e for e in errors)

    def test_optional_variable_not_required(self):
        """Optional variables can be omitted."""
        template = load_template("rest-api")
        variables = {
            "endpoint": "/users",
            "method": "GET",
            "resource": "user",
            "description": "Get users",
            # auth_required is optional
        }
        errors = validate_template_vars(template, variables)
        assert len(errors) == 0


class TestRenderTemplate:
    """Tests for render_template function."""

    def test_basic_rendering(self):
        """Can render template with variables."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="name", description="Name"),
                TemplateVariable(name="value", description="Value"),
            ],
            content="Hello {{name}}, your value is {{value}}!",
        )
        result = render_template(template, {"name": "World", "value": "42"})
        assert result == "Hello World, your value is 42!"

    def test_rendering_with_defaults(self):
        """Uses defaults for missing optional variables."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="name", description="Name", required=True),
                TemplateVariable(
                    name="greeting",
                    description="Greeting",
                    required=False,
                    default="Hello",
                ),
            ],
            content="{{greeting}}, {{name}}!",
        )
        result = render_template(template, {"name": "World"})
        assert result == "Hello, World!"

    def test_rendering_with_spaces_in_placeholders(self):
        """Handles spaces in placeholders."""
        template = Template(
            name="test",
            title="Test",
            description="Test template",
            category="test",
            complexity="simple",
            variables=[
                TemplateVariable(name="name", description="Name"),
            ],
            content="Hello {{ name }}!",
        )
        result = render_template(template, {"name": "World"})
        assert result == "Hello World!"


class TestApplyTemplate:
    """Tests for apply_template function."""

    def test_apply_template_success(self):
        """Can apply template with valid variables."""
        result = apply_template(
            "bug-fix",
            {
                "bug_title": "Test Bug",
                "bug_description": "A test bug description",
                "expected_behavior": "Should work",
                "actual_behavior": "Doesn't work",
            },
        )
        assert "Test Bug" in result
        assert "Should work" in result
        assert "Doesn't work" in result

    def test_apply_template_validation_error(self):
        """Raises error for invalid variables."""
        with pytest.raises(ValueError, match="Template validation failed"):
            apply_template(
                "bug-fix",
                {
                    "bug_title": "Test Bug",
                    # Missing required variables
                },
            )

    def test_apply_template_skip_validation(self):
        """Can skip validation."""
        # Should not raise even with missing variables
        result = apply_template(
            "bug-fix",
            {"bug_title": "Test Bug"},
            validate=False,
        )
        assert "Test Bug" in result


class TestCustomTemplateDirectory:
    """Tests for custom template directory support."""

    def test_custom_dir_from_env(self, tmp_path):
        """Can load templates from custom directory."""
        # Create a custom template
        custom_template = {
            "name": "custom-test",
            "title": "Custom Test",
            "description": "A custom template",
            "category": "custom",
            "complexity": "simple",
            "variables": [
                {"name": "var1", "description": "Variable 1", "required": True}
            ],
            "content": "Custom: {{var1}}",
        }
        template_file = tmp_path / "custom-test.json"
        template_file.write_text(json.dumps(custom_template))

        # Set environment variable
        with patch.dict(os.environ, {"AUTO_CLAUDE_TEMPLATES_DIR": str(tmp_path)}):
            templates = list_templates()
            names = {t["name"] for t in templates}
            assert "custom-test" in names

            # Load the custom template
            template = load_template("custom-test")
            assert template.name == "custom-test"

    def test_custom_overrides_builtin(self, tmp_path):
        """Custom templates override built-in with same name."""
        # Create a custom template with same name as built-in
        custom_template = {
            "name": "rest-api",
            "title": "Custom REST API",
            "description": "A custom REST API template",
            "category": "custom",
            "complexity": "simple",
            "variables": [],
            "content": "Custom REST API template",
        }
        template_file = tmp_path / "rest-api.json"
        template_file.write_text(json.dumps(custom_template))

        # Set environment variable
        with patch.dict(os.environ, {"AUTO_CLAUDE_TEMPLATES_DIR": str(tmp_path)}):
            template = load_template("rest-api")
            assert template.title == "Custom REST API"
            assert template.content == "Custom REST API template"
