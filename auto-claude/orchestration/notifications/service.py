"""
Notification and Escalation Services for CrewAI.

Multi-channel notification delivery and human escalation management.
"""

import os
import json
import logging
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from enum import Enum
from typing import Optional, List, Dict, Any
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)


class NotificationPriority(str, Enum):
    """Priority levels for notifications."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class NotificationType(str, Enum):
    """Types of notifications."""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    ESCALATION = "escalation"


class EscalationReason(str, Enum):
    """Reasons for escalation to human intervention."""
    QA_ITERATIONS_EXCEEDED = "qa_iterations_exceeded"
    CONSECUTIVE_FAILURES = "consecutive_failures"
    SECURITY_VULNERABILITY = "security_vulnerability"
    IDLE_TIMEOUT = "idle_timeout"
    MANUAL_REQUEST = "manual_request"
    UNKNOWN_ERROR = "unknown_error"


@dataclass
class Notification:
    """A notification to be sent."""
    title: str
    message: str
    type: NotificationType = NotificationType.INFO
    priority: NotificationPriority = NotificationPriority.MEDIUM
    workflow_id: Optional[str] = None
    spec_name: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "title": self.title,
            "message": self.message,
            "type": self.type.value,
            "priority": self.priority.value,
            "workflow_id": self.workflow_id,
            "spec_name": self.spec_name,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
        }


class NotificationChannel(ABC):
    """Base class for notification channels."""

    @abstractmethod
    def send(self, notification: Notification) -> bool:
        """Send a notification through this channel."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if this channel is properly configured."""
        pass


class ConsoleChannel(NotificationChannel):
    """Console notification channel (always available)."""

    def __init__(self, verbose: bool = True):
        self.verbose = verbose

    def is_configured(self) -> bool:
        return True

    def send(self, notification: Notification) -> bool:
        """Print notification to console."""
        if not self.verbose:
            return True

        icons = {
            NotificationType.INFO: "ℹ️",
            NotificationType.SUCCESS: "✅",
            NotificationType.WARNING: "⚠️",
            NotificationType.ERROR: "❌",
            NotificationType.ESCALATION: "🚨",
        }

        priority_colors = {
            NotificationPriority.LOW: "",
            NotificationPriority.MEDIUM: "",
            NotificationPriority.HIGH: "⚡",
            NotificationPriority.CRITICAL: "🔴",
        }

        icon = icons.get(notification.type, "📋")
        priority_icon = priority_colors.get(notification.priority, "")

        print(f"\n{icon} {priority_icon} [{notification.type.value.upper()}] {notification.title}")
        print(f"   {notification.message}")
        if notification.spec_name:
            print(f"   Spec: {notification.spec_name}")
        print()

        return True


class SlackChannel(NotificationChannel):
    """Slack notification channel via webhook."""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.getenv("SLACK_WEBHOOK_URL")

    def is_configured(self) -> bool:
        return bool(self.webhook_url)

    def send(self, notification: Notification) -> bool:
        """Send notification to Slack."""
        if not self.is_configured():
            logger.warning("Slack channel not configured, skipping")
            return False

        try:
            # Map notification type to Slack emoji
            emojis = {
                NotificationType.INFO: ":information_source:",
                NotificationType.SUCCESS: ":white_check_mark:",
                NotificationType.WARNING: ":warning:",
                NotificationType.ERROR: ":x:",
                NotificationType.ESCALATION: ":rotating_light:",
            }

            # Map priority to color
            colors = {
                NotificationPriority.LOW: "#36a64f",
                NotificationPriority.MEDIUM: "#2196F3",
                NotificationPriority.HIGH: "#ff9800",
                NotificationPriority.CRITICAL: "#f44336",
            }

            emoji = emojis.get(notification.type, ":bell:")
            color = colors.get(notification.priority, "#808080")

            payload = {
                "attachments": [
                    {
                        "color": color,
                        "title": f"{emoji} {notification.title}",
                        "text": notification.message,
                        "fields": [],
                        "footer": "Auto-Claude CrewAI",
                        "ts": int(notification.timestamp.timestamp()),
                    }
                ]
            }

            if notification.spec_name:
                payload["attachments"][0]["fields"].append({
                    "title": "Spec",
                    "value": notification.spec_name,
                    "short": True,
                })

            if notification.workflow_id:
                payload["attachments"][0]["fields"].append({
                    "title": "Workflow",
                    "value": notification.workflow_id[:8],
                    "short": True,
                })

            data = json.dumps(payload).encode("utf-8")
            request = Request(
                self.webhook_url,
                data=data,
                headers={"Content-Type": "application/json"},
            )

            with urlopen(request, timeout=10) as response:
                return response.status == 200

        except (URLError, HTTPError) as e:
            logger.error(f"Failed to send Slack notification: {e}")
            return False


class EmailChannel(NotificationChannel):
    """Email notification channel via SMTP."""

    def __init__(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_user: Optional[str] = None,
        smtp_password: Optional[str] = None,
        from_email: Optional[str] = None,
        to_email: Optional[str] = None,
    ):
        self.smtp_host = smtp_host or os.getenv("SMTP_HOST")
        self.smtp_port = smtp_port or int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = smtp_user or os.getenv("SMTP_USER")
        self.smtp_password = smtp_password or os.getenv("SMTP_PASSWORD")
        self.from_email = from_email or os.getenv("SMTP_FROM_EMAIL", self.smtp_user)
        self.to_email = to_email or os.getenv("NOTIFICATION_EMAIL")

    def is_configured(self) -> bool:
        return all([
            self.smtp_host,
            self.smtp_user,
            self.smtp_password,
            self.to_email,
        ])

    def send(self, notification: Notification) -> bool:
        """Send notification via email."""
        if not self.is_configured():
            logger.warning("Email channel not configured, skipping")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[{notification.type.value.upper()}] {notification.title}"
            msg["From"] = self.from_email
            msg["To"] = self.to_email

            # Plain text version
            text = f"""
Auto-Claude CrewAI Notification

{notification.title}

{notification.message}

Type: {notification.type.value}
Priority: {notification.priority.value}
Spec: {notification.spec_name or 'N/A'}
Time: {notification.timestamp.isoformat()}
"""

            # HTML version
            html = f"""
<html>
<body>
<h2>{notification.title}</h2>
<p>{notification.message}</p>
<hr>
<table>
<tr><td><strong>Type:</strong></td><td>{notification.type.value}</td></tr>
<tr><td><strong>Priority:</strong></td><td>{notification.priority.value}</td></tr>
<tr><td><strong>Spec:</strong></td><td>{notification.spec_name or 'N/A'}</td></tr>
<tr><td><strong>Time:</strong></td><td>{notification.timestamp.isoformat()}</td></tr>
</table>
<hr>
<p><small>Auto-Claude CrewAI</small></p>
</body>
</html>
"""

            msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, [self.to_email], msg.as_string())

            return True

        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False


class WebhookChannel(NotificationChannel):
    """Generic webhook notification channel."""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.getenv("NOTIFICATION_WEBHOOK_URL")

    def is_configured(self) -> bool:
        return bool(self.webhook_url)

    def send(self, notification: Notification) -> bool:
        """Send notification to custom webhook."""
        if not self.is_configured():
            logger.warning("Webhook channel not configured, skipping")
            return False

        try:
            payload = {
                "event": "crewai_notification",
                "notification": notification.to_dict(),
            }

            data = json.dumps(payload).encode("utf-8")
            request = Request(
                self.webhook_url,
                data=data,
                headers={"Content-Type": "application/json"},
            )

            with urlopen(request, timeout=10) as response:
                return response.status == 200

        except (URLError, HTTPError) as e:
            logger.error(f"Failed to send webhook notification: {e}")
            return False


class LinearChannel(NotificationChannel):
    """Linear notification channel for issue updates."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("LINEAR_API_KEY")
        self.api_url = "https://api.linear.app/graphql"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def send(self, notification: Notification) -> bool:
        """Create or update Linear issue/comment."""
        if not self.is_configured():
            logger.warning("Linear channel not configured, skipping")
            return False

        try:
            # For escalations, create a new issue
            if notification.type == NotificationType.ESCALATION:
                return self._create_escalation_issue(notification)

            # For other notifications with an issue ID, add a comment
            issue_id = notification.metadata.get("linear_issue_id")
            if issue_id:
                return self._add_comment(issue_id, notification)

            # Otherwise just log (Linear is for tracking, not general notifications)
            logger.debug(f"Linear notification skipped (no issue context): {notification.title}")
            return True

        except Exception as e:
            logger.error(f"Failed to send Linear notification: {e}")
            return False

    def _create_escalation_issue(self, notification: Notification) -> bool:
        """Create a Linear issue for escalation."""
        team_id = os.getenv("LINEAR_TEAM_ID")
        if not team_id:
            logger.warning("LINEAR_TEAM_ID not set, cannot create escalation issue")
            return False

        mutation = """
        mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    identifier
                }
            }
        }
        """

        variables = {
            "input": {
                "teamId": team_id,
                "title": f"[ESCALATION] {notification.title}",
                "description": notification.message,
                "priority": 1,  # Urgent
            }
        }

        return self._execute_graphql(mutation, variables)

    def _add_comment(self, issue_id: str, notification: Notification) -> bool:
        """Add a comment to an existing Linear issue."""
        mutation = """
        mutation CreateComment($input: CommentCreateInput!) {
            commentCreate(input: $input) {
                success
            }
        }
        """

        variables = {
            "input": {
                "issueId": issue_id,
                "body": f"**{notification.title}**\n\n{notification.message}",
            }
        }

        return self._execute_graphql(mutation, variables)

    def _execute_graphql(self, query: str, variables: Dict) -> bool:
        """Execute a GraphQL query against Linear API."""
        try:
            payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
            request = Request(
                self.api_url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": self.api_key,
                },
            )

            with urlopen(request, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))
                return "errors" not in result

        except (URLError, HTTPError) as e:
            logger.error(f"Linear API error: {e}")
            return False


class NotificationService:
    """
    Multi-channel notification service.

    Sends notifications through configured channels:
    - Console (always enabled)
    - Slack (via webhook)
    - Email (via SMTP)
    - Webhook (generic)
    - Linear (for issue tracking)
    """

    def __init__(
        self,
        enable_console: bool = True,
        enable_slack: bool = True,
        enable_email: bool = True,
        enable_webhook: bool = True,
        enable_linear: bool = True,
        verbose: bool = False,
    ):
        self.channels: List[NotificationChannel] = []
        self.verbose = verbose

        if enable_console:
            self.channels.append(ConsoleChannel(verbose=True))

        if enable_slack:
            channel = SlackChannel()
            if channel.is_configured():
                self.channels.append(channel)

        if enable_email:
            channel = EmailChannel()
            if channel.is_configured():
                self.channels.append(channel)

        if enable_webhook:
            channel = WebhookChannel()
            if channel.is_configured():
                self.channels.append(channel)

        if enable_linear:
            channel = LinearChannel()
            if channel.is_configured():
                self.channels.append(channel)

        if self.verbose:
            configured = [type(c).__name__ for c in self.channels]
            logger.info(f"NotificationService initialized with channels: {configured}")

    def notify(
        self,
        title: str,
        message: str,
        type: NotificationType = NotificationType.INFO,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
        workflow_id: Optional[str] = None,
        spec_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Send a notification through all configured channels.

        Returns the number of channels that successfully sent the notification.
        """
        notification = Notification(
            title=title,
            message=message,
            type=type,
            priority=priority,
            workflow_id=workflow_id,
            spec_name=spec_name,
            metadata=metadata or {},
        )

        success_count = 0
        for channel in self.channels:
            try:
                if channel.send(notification):
                    success_count += 1
            except Exception as e:
                logger.error(f"Channel {type(channel).__name__} failed: {e}")

        return success_count

    def notify_success(self, title: str, message: str, **kwargs) -> int:
        """Send a success notification."""
        return self.notify(title, message, type=NotificationType.SUCCESS, **kwargs)

    def notify_warning(self, title: str, message: str, **kwargs) -> int:
        """Send a warning notification."""
        return self.notify(
            title, message,
            type=NotificationType.WARNING,
            priority=NotificationPriority.HIGH,
            **kwargs,
        )

    def notify_error(self, title: str, message: str, **kwargs) -> int:
        """Send an error notification."""
        return self.notify(
            title, message,
            type=NotificationType.ERROR,
            priority=NotificationPriority.HIGH,
            **kwargs,
        )

    def notify_escalation(self, title: str, message: str, **kwargs) -> int:
        """Send an escalation notification (critical priority)."""
        return self.notify(
            title, message,
            type=NotificationType.ESCALATION,
            priority=NotificationPriority.CRITICAL,
            **kwargs,
        )


@dataclass
class EscalationEvent:
    """An escalation event requiring human intervention."""
    reason: EscalationReason
    title: str
    description: str
    workflow_id: Optional[str] = None
    spec_name: Optional[str] = None
    qa_iterations: int = 0
    failure_count: int = 0
    security_issues: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)


class EscalationManager:
    """
    Manages escalation to human intervention.

    Triggers escalation based on:
    - QA iterations > threshold (default 10)
    - Consecutive failures > threshold (default 3)
    - Security vulnerabilities detected
    - Idle timeout (configurable)
    """

    def __init__(
        self,
        notification_service: Optional[NotificationService] = None,
        max_qa_iterations: int = 10,
        max_consecutive_failures: int = 3,
        idle_timeout_minutes: int = 30,
    ):
        self.notification_service = notification_service or NotificationService()
        self.max_qa_iterations = max_qa_iterations
        self.max_consecutive_failures = max_consecutive_failures
        self.idle_timeout_minutes = idle_timeout_minutes
        self.escalation_history: List[EscalationEvent] = []

    def check_qa_iterations(
        self,
        iterations: int,
        workflow_id: Optional[str] = None,
        spec_name: Optional[str] = None,
    ) -> Optional[EscalationEvent]:
        """Check if QA iterations exceed threshold."""
        if iterations > self.max_qa_iterations:
            event = EscalationEvent(
                reason=EscalationReason.QA_ITERATIONS_EXCEEDED,
                title=f"QA Iterations Exceeded ({iterations}/{self.max_qa_iterations})",
                description=f"QA validation has run {iterations} times without passing. "
                           f"Human review required to resolve persistent issues.",
                workflow_id=workflow_id,
                spec_name=spec_name,
                qa_iterations=iterations,
            )
            self._trigger_escalation(event)
            return event
        return None

    def check_consecutive_failures(
        self,
        failure_count: int,
        last_error: Optional[str] = None,
        workflow_id: Optional[str] = None,
        spec_name: Optional[str] = None,
    ) -> Optional[EscalationEvent]:
        """Check if consecutive failures exceed threshold."""
        if failure_count >= self.max_consecutive_failures:
            event = EscalationEvent(
                reason=EscalationReason.CONSECUTIVE_FAILURES,
                title=f"Consecutive Failures ({failure_count})",
                description=f"The workflow has failed {failure_count} times consecutively. "
                           f"Last error: {last_error or 'Unknown'}",
                workflow_id=workflow_id,
                spec_name=spec_name,
                failure_count=failure_count,
                metadata={"last_error": last_error} if last_error else {},
            )
            self._trigger_escalation(event)
            return event
        return None

    def check_security_vulnerabilities(
        self,
        vulnerabilities: List[Dict[str, Any]],
        workflow_id: Optional[str] = None,
        spec_name: Optional[str] = None,
    ) -> Optional[EscalationEvent]:
        """Check for critical/high security vulnerabilities."""
        critical_vulns = [
            v for v in vulnerabilities
            if v.get("severity", "").upper() in ["CRITICAL", "HIGH"]
        ]

        if critical_vulns:
            vuln_list = [
                f"- {v.get('type', 'Unknown')}: {v.get('description', 'No description')}"
                for v in critical_vulns[:5]  # Limit to first 5
            ]

            event = EscalationEvent(
                reason=EscalationReason.SECURITY_VULNERABILITY,
                title=f"Security Vulnerabilities Detected ({len(critical_vulns)})",
                description="Critical/High security vulnerabilities found:\n" + "\n".join(vuln_list),
                workflow_id=workflow_id,
                spec_name=spec_name,
                security_issues=[v.get("type", "Unknown") for v in critical_vulns],
                metadata={"vulnerabilities": critical_vulns},
            )
            self._trigger_escalation(event)
            return event
        return None

    def trigger_manual_escalation(
        self,
        reason: str,
        workflow_id: Optional[str] = None,
        spec_name: Optional[str] = None,
    ) -> EscalationEvent:
        """Manually trigger an escalation."""
        event = EscalationEvent(
            reason=EscalationReason.MANUAL_REQUEST,
            title="Manual Escalation Requested",
            description=reason,
            workflow_id=workflow_id,
            spec_name=spec_name,
        )
        self._trigger_escalation(event)
        return event

    def _trigger_escalation(self, event: EscalationEvent):
        """Send escalation notification and record event."""
        self.escalation_history.append(event)

        self.notification_service.notify_escalation(
            title=event.title,
            message=event.description,
            workflow_id=event.workflow_id,
            spec_name=event.spec_name,
            metadata={
                "reason": event.reason.value,
                "qa_iterations": event.qa_iterations,
                "failure_count": event.failure_count,
                "security_issues": event.security_issues,
                **event.metadata,
            },
        )

        logger.warning(f"ESCALATION: {event.reason.value} - {event.title}")

    def get_escalation_history(self) -> List[EscalationEvent]:
        """Get all escalation events."""
        return self.escalation_history.copy()

    def clear_history(self):
        """Clear escalation history."""
        self.escalation_history.clear()
