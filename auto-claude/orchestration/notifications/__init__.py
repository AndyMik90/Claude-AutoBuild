"""
Notification and Escalation Services for CrewAI.

Available Services:
- NotificationService: Multi-channel notification delivery
- EscalationManager: Human escalation management
"""

from .service import (
    NotificationService,
    EscalationManager,
    NotificationChannel,
    ConsoleChannel,
    SlackChannel,
    EmailChannel,
    WebhookChannel,
    LinearChannel,
    Notification,
    NotificationType,
    NotificationPriority,
    EscalationEvent,
    EscalationReason,
)

__all__ = [
    # Service classes
    "NotificationService",
    "EscalationManager",
    # Channel implementations
    "NotificationChannel",
    "ConsoleChannel",
    "SlackChannel",
    "EmailChannel",
    "WebhookChannel",
    "LinearChannel",
    # Data classes
    "Notification",
    "EscalationEvent",
    # Enums
    "NotificationType",
    "NotificationPriority",
    "EscalationReason",
]
