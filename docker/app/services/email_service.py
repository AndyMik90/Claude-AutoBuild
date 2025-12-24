"""Email service for sending emails via SMTP."""

import logging
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models.settings import SystemSettings
from services.credential_service import CredentialService

logger = logging.getLogger(__name__)


def _mask_email(email: str) -> str:
    """Mask email address for logging to protect PII.

    Args:
        email: The email address to mask

    Returns:
        Masked email (e.g., 'j***@example.com')
    """
    if not email or "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    if len(local) <= 1:
        masked_local = "*"
    else:
        masked_local = local[0] + "***"
    return f"{masked_local}@{domain}"


@dataclass
class SMTPConfig:
    """SMTP configuration data class."""

    enabled: bool
    host: Optional[str]
    port: int
    username: Optional[str]
    password: Optional[str]  # Decrypted password
    use_tls: bool
    use_ssl: bool
    from_email: Optional[str]
    from_name: str


@dataclass
class EmailResult:
    """Result of an email send operation."""

    success: bool
    message: str
    error: Optional[str] = None


class EmailService:
    """Service for sending emails via SMTP."""

    def __init__(self, db: AsyncSession, credential_service: Optional[CredentialService] = None):
        self.db = db
        self.credential_service = credential_service or CredentialService()

    async def get_smtp_config(self) -> Optional[SMTPConfig]:
        """Get SMTP configuration from system settings."""
        result = await self.db.execute(select(SystemSettings).limit(1))
        settings = result.scalar_one_or_none()

        if not settings:
            return None

        # Decrypt password if set
        password = None
        if settings.smtp_password_encrypted:
            try:
                password = self.credential_service.decrypt(settings.smtp_password_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt SMTP password: {e}")

        return SMTPConfig(
            enabled=settings.smtp_enabled,
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=password,
            use_tls=settings.smtp_use_tls,
            use_ssl=settings.smtp_use_ssl,
            from_email=settings.smtp_from_email,
            from_name=settings.smtp_from_name,
        )

    async def is_configured(self) -> bool:
        """Check if SMTP is properly configured."""
        config = await self.get_smtp_config()
        if not config:
            return False

        return (
            config.enabled
            and config.host is not None
            and config.from_email is not None
        )

    async def test_connection(self) -> EmailResult:
        """Test SMTP connection without sending an email."""
        config = await self.get_smtp_config()

        if not config:
            return EmailResult(
                success=False,
                message="SMTP not configured",
                error="No system settings found",
            )

        if not config.enabled:
            return EmailResult(
                success=False,
                message="SMTP is disabled",
                error="SMTP is not enabled in settings",
            )

        if not config.host:
            return EmailResult(
                success=False,
                message="SMTP host not configured",
                error="SMTP host is required",
            )

        try:
            # Create SMTP client
            smtp = aiosmtplib.SMTP(
                hostname=config.host,
                port=config.port,
                use_tls=config.use_ssl,  # use_tls in aiosmtplib means implicit TLS (port 465)
                start_tls=config.use_tls and not config.use_ssl,  # STARTTLS for port 587
            )

            await smtp.connect()

            # Authenticate if credentials provided
            if config.username and config.password:
                await smtp.login(config.username, config.password)

            await smtp.quit()

            return EmailResult(
                success=True,
                message="SMTP connection successful",
            )

        except aiosmtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return EmailResult(
                success=False,
                message="Authentication failed",
                error=str(e),
            )
        except aiosmtplib.SMTPConnectError as e:
            logger.error(f"SMTP connection failed: {e}")
            return EmailResult(
                success=False,
                message="Connection failed",
                error=str(e),
            )
        except Exception as e:
            logger.error(f"SMTP test failed: {e}")
            return EmailResult(
                success=False,
                message="SMTP test failed",
                error=str(e),
            )

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> EmailResult:
        """Send an email via SMTP.

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_body: HTML content of the email
            text_body: Plain text content (optional, generated from HTML if not provided)

        Returns:
            EmailResult indicating success or failure
        """
        config = await self.get_smtp_config()

        if not config:
            return EmailResult(
                success=False,
                message="SMTP not configured",
                error="No system settings found",
            )

        if not config.enabled:
            return EmailResult(
                success=False,
                message="SMTP is disabled",
                error="SMTP is not enabled in settings",
            )

        if not config.host or not config.from_email:
            return EmailResult(
                success=False,
                message="SMTP configuration incomplete",
                error="Host and from_email are required",
            )

        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{config.from_name} <{config.from_email}>"
            msg["To"] = to_email

            # Add plain text part
            if text_body:
                msg.attach(MIMEText(text_body, "plain"))
            else:
                # Generate plain text from HTML (simple strip)
                import re
                plain = re.sub(r'<[^>]+>', '', html_body)
                msg.attach(MIMEText(plain, "plain"))

            # Add HTML part
            msg.attach(MIMEText(html_body, "html"))

            # Create SMTP client
            smtp = aiosmtplib.SMTP(
                hostname=config.host,
                port=config.port,
                use_tls=config.use_ssl,
                start_tls=config.use_tls and not config.use_ssl,
            )

            await smtp.connect()

            # Authenticate if credentials provided
            if config.username and config.password:
                await smtp.login(config.username, config.password)

            # Send email
            await smtp.send_message(msg)
            await smtp.quit()

            masked_recipient = _mask_email(to_email)
            logger.info(f"Email sent successfully to {masked_recipient}")
            return EmailResult(
                success=True,
                message=f"Email sent to {to_email}",
            )

        except aiosmtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed: {e}")
            return EmailResult(
                success=False,
                message="Authentication failed",
                error=str(e),
            )
        except aiosmtplib.SMTPRecipientsRefused as e:
            logger.error(f"Recipient refused: {e}")
            return EmailResult(
                success=False,
                message="Recipient refused",
                error=str(e),
            )
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return EmailResult(
                success=False,
                message="Failed to send email",
                error=str(e),
            )

    async def send_invitation_email(
        self,
        to_email: str,
        invitation_code: str,
        invited_by: str,
        expires_at: str,
        base_url: str = "http://localhost:8080",
    ) -> EmailResult:
        """Send an invitation email.

        Args:
            to_email: Recipient email address
            invitation_code: The invitation code
            invited_by: Name or email of the person who sent the invitation
            expires_at: Expiration date/time string
            base_url: Base URL of the application

        Returns:
            EmailResult indicating success or failure
        """
        register_url = f"{base_url}/register?code={invitation_code}"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Invited to Auto-Claude</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
    </div>

    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>{invited_by}</strong> has invited you to join <strong>Auto-Claude</strong>, a multi-agent autonomous coding platform.
        </p>

        <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your invitation code:</p>
            <code style="font-size: 24px; font-weight: bold; color: #667eea; letter-spacing: 2px;">{invitation_code}</code>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{register_url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Accept Invitation
            </a>
        </div>

        <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Or copy this link: <a href="{register_url}" style="color: #667eea;">{register_url}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; margin: 0;">
            This invitation expires on <strong>{expires_at}</strong>.
            If you didn't expect this invitation, you can safely ignore this email.
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p style="margin: 0;">Sent by Auto-Claude</p>
    </div>
</body>
</html>
"""

        text_body = f"""
You're Invited to Auto-Claude!

{invited_by} has invited you to join Auto-Claude, a multi-agent autonomous coding platform.

Your invitation code: {invitation_code}

Click here to accept: {register_url}

This invitation expires on {expires_at}.

If you didn't expect this invitation, you can safely ignore this email.
"""

        return await self.send_email(
            to_email=to_email,
            subject="You're Invited to Auto-Claude",
            html_body=html_body,
            text_body=text_body,
        )

    async def send_test_email(self, to_email: str) -> EmailResult:
        """Send a test email to verify SMTP configuration.

        Args:
            to_email: Recipient email address

        Returns:
            EmailResult indicating success or failure
        """
        html_body = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Auto-Claude Test Email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SMTP Test Successful!</h1>
    </div>

    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
            Congratulations! Your SMTP configuration is working correctly.
        </p>

        <div style="background: #d1fae5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-size: 16px; color: #065f46;">
                Auto-Claude can now send invitation emails and notifications.
            </p>
        </div>

        <p style="font-size: 14px; color: #666;">
            This is a test email sent from your Auto-Claude instance to verify that email delivery is working.
        </p>
    </div>

    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p style="margin: 0;">Sent by Auto-Claude</p>
    </div>
</body>
</html>
"""

        text_body = """
SMTP Test Successful!

Congratulations! Your SMTP configuration is working correctly.

Auto-Claude can now send invitation emails and notifications.

This is a test email sent from your Auto-Claude instance to verify that email delivery is working.
"""

        return await self.send_email(
            to_email=to_email,
            subject="Auto-Claude - SMTP Test Successful",
            html_body=html_body,
            text_body=text_body,
        )
