"""
Tests for CrewAI Integration.

Tests the CrewAI config, notifications, and workflow components.
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))


# =============================================================================
# CONFIG TESTS
# =============================================================================

class TestCrewAIConfig:
    """Tests for CrewAI configuration loading."""

    def test_default_config_when_no_settings_file(self, temp_dir):
        """Test that default config is used when no settings file exists."""
        from orchestration.config import get_crewai_config

        with patch('orchestration.config.Path.home', return_value=temp_dir):
            config = get_crewai_config()

        assert config["enabled"] is False
        assert config["profile"] == "balanced"
        assert "agent_models" in config

    def test_config_loaded_from_settings_file(self, temp_dir):
        """Test that config is loaded from settings file."""
        from orchestration.config import get_crewai_config

        # Create settings directory and file
        config_dir = temp_dir / ".config" / "Auto-Claude"
        config_dir.mkdir(parents=True)
        settings_file = config_dir / "settings.json"
        settings_file.write_text(json.dumps({
            "crewaiEnabled": True,
            "crewaiProfile": "performance",
            "crewaiAgentModels": {
                "productManager": {"model": "opus", "thinkingLevel": "high"},
            }
        }))

        with patch('orchestration.config.Path.home', return_value=temp_dir):
            config = get_crewai_config()

        assert config["enabled"] is True
        assert config["profile"] == "performance"

    def test_is_crewai_enabled(self, temp_dir):
        """Test the is_crewai_enabled function."""
        from orchestration.config import is_crewai_enabled

        # Create settings with crewai disabled
        config_dir = temp_dir / ".config" / "Auto-Claude"
        config_dir.mkdir(parents=True)
        settings_file = config_dir / "settings.json"
        settings_file.write_text(json.dumps({"crewaiEnabled": False}))

        with patch('orchestration.config.Path.home', return_value=temp_dir):
            assert is_crewai_enabled() is False

        # Enable crewai
        settings_file.write_text(json.dumps({"crewaiEnabled": True}))

        with patch('orchestration.config.Path.home', return_value=temp_dir):
            assert is_crewai_enabled() is True

    def test_get_agent_model_returns_defaults(self, temp_dir):
        """Test get_agent_model returns correct defaults."""
        from orchestration.config import get_agent_model

        with patch('orchestration.config.Path.home', return_value=temp_dir):
            # Product Manager default is sonnet with medium thinking
            model_id, thinking_budget = get_agent_model("productManager")
            assert "sonnet" in model_id.lower()
            assert thinking_budget > 0

            # Tech Lead default is opus with high thinking
            model_id, thinking_budget = get_agent_model("techLead")
            assert "opus" in model_id.lower()
            assert thinking_budget > 5000  # High thinking

            # Priority Analyst default is haiku with low thinking
            model_id, thinking_budget = get_agent_model("priorityAnalyst")
            assert "haiku" in model_id.lower()


# =============================================================================
# NOTIFICATION TESTS
# =============================================================================

class TestNotificationService:
    """Tests for NotificationService."""

    def test_console_channel_always_configured(self):
        """Test that console channel is always available."""
        from orchestration.notifications import NotificationService, ConsoleChannel

        service = NotificationService(
            enable_console=True,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )

        assert len(service.channels) == 1
        assert isinstance(service.channels[0], ConsoleChannel)

    def test_notify_returns_success_count(self, capsys):
        """Test that notify returns the number of successful channels."""
        from orchestration.notifications import NotificationService, NotificationType

        service = NotificationService(
            enable_console=True,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )

        count = service.notify(
            title="Test Notification",
            message="This is a test",
            type=NotificationType.INFO,
        )

        assert count == 1

        # Check console output
        captured = capsys.readouterr()
        assert "Test Notification" in captured.out

    def test_notify_success_helper(self, capsys):
        """Test notify_success helper method."""
        from orchestration.notifications import NotificationService

        service = NotificationService(
            enable_console=True,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )

        service.notify_success(
            title="Build Completed",
            message="All tests passed",
        )

        captured = capsys.readouterr()
        assert "Build Completed" in captured.out
        assert "SUCCESS" in captured.out

    def test_notify_error_helper(self, capsys):
        """Test notify_error helper method."""
        from orchestration.notifications import NotificationService

        service = NotificationService(
            enable_console=True,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )

        service.notify_error(
            title="Build Failed",
            message="Tests failed",
        )

        captured = capsys.readouterr()
        assert "Build Failed" in captured.out
        assert "ERROR" in captured.out

    def test_slack_channel_not_configured_without_webhook(self):
        """Test that Slack channel is not configured without webhook URL."""
        from orchestration.notifications import SlackChannel

        channel = SlackChannel()
        assert channel.is_configured() is False

    def test_slack_channel_configured_with_webhook(self):
        """Test that Slack channel is configured with webhook URL."""
        from orchestration.notifications import SlackChannel

        channel = SlackChannel(webhook_url="https://hooks.slack.com/test")
        assert channel.is_configured() is True

    def test_email_channel_not_configured_without_smtp(self):
        """Test that email channel is not configured without SMTP settings."""
        from orchestration.notifications import EmailChannel

        channel = EmailChannel()
        assert channel.is_configured() is False

    def test_webhook_channel_not_configured_without_url(self):
        """Test that webhook channel is not configured without URL."""
        from orchestration.notifications import WebhookChannel

        channel = WebhookChannel()
        assert channel.is_configured() is False

    def test_linear_channel_not_configured_without_api_key(self):
        """Test that Linear channel is not configured without API key."""
        from orchestration.notifications import LinearChannel

        channel = LinearChannel()
        assert channel.is_configured() is False


class TestNotification:
    """Tests for Notification dataclass."""

    def test_notification_to_dict(self):
        """Test Notification.to_dict() method."""
        from orchestration.notifications import (
            Notification,
            NotificationType,
            NotificationPriority,
        )

        notification = Notification(
            title="Test",
            message="Test message",
            type=NotificationType.SUCCESS,
            priority=NotificationPriority.HIGH,
            workflow_id="wf-123",
            spec_name="001-test",
            metadata={"key": "value"},
        )

        data = notification.to_dict()

        assert data["title"] == "Test"
        assert data["message"] == "Test message"
        assert data["type"] == "success"
        assert data["priority"] == "high"
        assert data["workflow_id"] == "wf-123"
        assert data["spec_name"] == "001-test"
        assert data["metadata"] == {"key": "value"}
        assert "timestamp" in data


class TestEscalationManager:
    """Tests for EscalationManager."""

    def test_check_qa_iterations_no_escalation(self):
        """Test that no escalation occurs below threshold."""
        from orchestration.notifications import EscalationManager, NotificationService

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(
            notification_service=service,
            max_qa_iterations=10,
        )

        event = manager.check_qa_iterations(5)
        assert event is None

    def test_check_qa_iterations_escalation(self):
        """Test that escalation occurs when threshold exceeded."""
        from orchestration.notifications import (
            EscalationManager,
            EscalationReason,
            NotificationService,
        )

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(
            notification_service=service,
            max_qa_iterations=10,
        )

        event = manager.check_qa_iterations(11, workflow_id="wf-123")

        assert event is not None
        assert event.reason == EscalationReason.QA_ITERATIONS_EXCEEDED
        assert event.qa_iterations == 11
        assert event.workflow_id == "wf-123"

    def test_check_consecutive_failures_no_escalation(self):
        """Test that no escalation occurs below failure threshold."""
        from orchestration.notifications import EscalationManager, NotificationService

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(
            notification_service=service,
            max_consecutive_failures=3,
        )

        event = manager.check_consecutive_failures(2)
        assert event is None

    def test_check_consecutive_failures_escalation(self):
        """Test that escalation occurs when failure threshold reached."""
        from orchestration.notifications import (
            EscalationManager,
            EscalationReason,
            NotificationService,
        )

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(
            notification_service=service,
            max_consecutive_failures=3,
        )

        event = manager.check_consecutive_failures(3, last_error="Connection failed")

        assert event is not None
        assert event.reason == EscalationReason.CONSECUTIVE_FAILURES
        assert event.failure_count == 3
        assert "Connection failed" in event.description

    def test_check_security_vulnerabilities_no_escalation(self):
        """Test that no escalation for low severity vulnerabilities."""
        from orchestration.notifications import EscalationManager, NotificationService

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(notification_service=service)

        vulns = [
            {"severity": "LOW", "type": "info-leak", "description": "Minor issue"},
            {"severity": "MEDIUM", "type": "xss", "description": "Reflected XSS"},
        ]

        event = manager.check_security_vulnerabilities(vulns)
        assert event is None

    def test_check_security_vulnerabilities_escalation(self):
        """Test that escalation occurs for critical vulnerabilities."""
        from orchestration.notifications import (
            EscalationManager,
            EscalationReason,
            NotificationService,
        )

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(notification_service=service)

        vulns = [
            {"severity": "CRITICAL", "type": "sql-injection", "description": "SQL injection in login"},
            {"severity": "HIGH", "type": "auth-bypass", "description": "Authentication bypass"},
        ]

        event = manager.check_security_vulnerabilities(vulns)

        assert event is not None
        assert event.reason == EscalationReason.SECURITY_VULNERABILITY
        assert len(event.security_issues) == 2
        assert "sql-injection" in event.security_issues

    def test_manual_escalation(self):
        """Test manual escalation trigger."""
        from orchestration.notifications import (
            EscalationManager,
            EscalationReason,
            NotificationService,
        )

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(notification_service=service)

        event = manager.trigger_manual_escalation(
            reason="Need human review for complex logic",
            spec_name="001-complex-feature",
        )

        assert event is not None
        assert event.reason == EscalationReason.MANUAL_REQUEST
        assert "Need human review" in event.description
        assert event.spec_name == "001-complex-feature"

    def test_escalation_history(self):
        """Test that escalation events are recorded in history."""
        from orchestration.notifications import EscalationManager, NotificationService

        service = NotificationService(
            enable_console=False,
            enable_slack=False,
            enable_email=False,
            enable_webhook=False,
            enable_linear=False,
        )
        manager = EscalationManager(
            notification_service=service,
            max_qa_iterations=5,
        )

        # Trigger some escalations
        manager.check_qa_iterations(6)
        manager.trigger_manual_escalation("Test escalation")

        history = manager.get_escalation_history()
        assert len(history) == 2

        # Clear and verify
        manager.clear_history()
        assert len(manager.get_escalation_history()) == 0


# =============================================================================
# WORKFLOW STATE TESTS
# =============================================================================

class TestWorkflowState:
    """Tests for WorkflowState model."""

    def test_workflow_state_defaults(self):
        """Test WorkflowState default values."""
        from orchestration.flows import WorkflowState, WorkflowStatus

        state = WorkflowState()

        assert state.user_request == ""
        assert state.project_dir == ""
        assert state.status == WorkflowStatus.PENDING
        assert state.qa_iterations == 0
        assert state.max_qa_iterations == 10
        assert state.consecutive_failures == 0
        assert state.events == []

    def test_workflow_state_initialization(self):
        """Test WorkflowState with custom values."""
        from orchestration.flows import WorkflowState, WorkflowStatus, TaskType

        state = WorkflowState(
            user_request="Add user authentication",
            project_dir="/path/to/project",
            spec_dir="/path/to/spec",
            task_type=TaskType.FEATURE,
            priority="high",
        )

        assert state.user_request == "Add user authentication"
        assert state.project_dir == "/path/to/project"
        assert state.task_type == TaskType.FEATURE
        assert state.priority == "high"


class TestTaskType:
    """Tests for TaskType enum."""

    def test_task_type_values(self):
        """Test TaskType enum values."""
        from orchestration.flows import TaskType

        assert TaskType.FEATURE.value == "feature"
        assert TaskType.BUG.value == "bug"
        assert TaskType.REFACTOR.value == "refactor"
        assert TaskType.DOCS.value == "docs"
        assert TaskType.MAINTENANCE.value == "maintenance"


class TestWorkflowStatus:
    """Tests for WorkflowStatus enum."""

    def test_workflow_status_values(self):
        """Test WorkflowStatus enum values."""
        from orchestration.flows import WorkflowStatus

        assert WorkflowStatus.PENDING.value == "pending"
        assert WorkflowStatus.ANALYZING.value == "analyzing"
        assert WorkflowStatus.DEVELOPING.value == "developing"
        assert WorkflowStatus.QA_VALIDATION.value == "qa_validation"
        assert WorkflowStatus.RELEASE_PREP.value == "release_prep"
        assert WorkflowStatus.COMPLETED.value == "completed"
        assert WorkflowStatus.FAILED.value == "failed"
        assert WorkflowStatus.ESCALATED.value == "escalated"


# =============================================================================
# INTEGRATION TESTS (require CrewAI SDK)
# =============================================================================

@pytest.mark.skipif(
    "crewai" not in sys.modules,
    reason="CrewAI SDK not installed",
)
class TestCrewAIIntegration:
    """Integration tests that require CrewAI SDK."""

    def test_run_development_workflow_disabled(self, temp_dir):
        """Test that run_development_workflow raises when CrewAI is disabled."""
        from orchestration.flows import run_development_workflow

        with patch('orchestration.config.is_crewai_enabled', return_value=False):
            with pytest.raises(RuntimeError, match="CrewAI is not enabled"):
                run_development_workflow(
                    user_request="Test",
                    project_dir="/test",
                    spec_dir="/spec",
                )
