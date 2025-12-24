"""OIDC/SSO authentication service.

Handles OpenID Connect authentication flow for enterprise SSO.
"""

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, UserRole
from db.models.settings import SystemSettings
from services.credential_service import CredentialService

logger = logging.getLogger(__name__)


@dataclass
class OIDCConfig:
    """OIDC configuration from database."""
    enabled: bool
    provider_name: str
    discovery_url: Optional[str]
    client_id: Optional[str]
    client_secret: Optional[str]
    scopes: str
    auto_provision: bool
    default_role: str
    disable_password_auth: bool
    email_claim: str
    username_claim: str


@dataclass
class OIDCProviderMetadata:
    """OIDC provider metadata from discovery endpoint."""
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str
    issuer: str
    jwks_uri: Optional[str] = None


@dataclass
class OIDCTokenResponse:
    """Token response from OIDC provider."""
    access_token: str
    token_type: str
    id_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None


@dataclass
class OIDCUserInfo:
    """User info from OIDC provider."""
    subject: str
    email: Optional[str]
    username: Optional[str]
    name: Optional[str] = None
    email_verified: bool = False
    raw_claims: dict = None

    def __post_init__(self):
        if self.raw_claims is None:
            self.raw_claims = {}


@dataclass
class OIDCResult:
    """Result of OIDC operations."""
    success: bool
    message: str
    error: Optional[str] = None
    data: Optional[dict] = None


class OIDCService:
    """Service for handling OIDC authentication."""

    def __init__(self, db: AsyncSession, credential_service: CredentialService):
        self.db = db
        self.credential_service = credential_service
        self._provider_metadata: Optional[OIDCProviderMetadata] = None

    async def get_config(self) -> Optional[OIDCConfig]:
        """Get OIDC configuration from database."""
        result = await self.db.execute(select(SystemSettings).limit(1))
        settings = result.scalar_one_or_none()

        if not settings:
            return None

        # Decrypt client secret if present
        client_secret = None
        if settings.oidc_client_secret_encrypted and self.credential_service.is_configured:
            client_secret = self.credential_service.decrypt(
                settings.oidc_client_secret_encrypted
            )

        return OIDCConfig(
            enabled=settings.oidc_enabled,
            provider_name=settings.oidc_provider_name,
            discovery_url=settings.oidc_discovery_url,
            client_id=settings.oidc_client_id,
            client_secret=client_secret,
            scopes=settings.oidc_scopes,
            auto_provision=settings.oidc_auto_provision,
            default_role=settings.oidc_default_role,
            disable_password_auth=settings.oidc_disable_password_auth,
            email_claim=settings.oidc_email_claim,
            username_claim=settings.oidc_username_claim,
        )

    async def is_configured(self) -> bool:
        """Check if OIDC is properly configured and enabled."""
        config = await self.get_config()
        if not config:
            return False

        return (
            config.enabled
            and config.discovery_url
            and config.client_id
            and config.client_secret
        )

    async def get_provider_metadata(self) -> Optional[OIDCProviderMetadata]:
        """Fetch and cache OIDC provider metadata from discovery endpoint."""
        if self._provider_metadata:
            return self._provider_metadata

        config = await self.get_config()
        if not config or not config.discovery_url:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    config.discovery_url,
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                self._provider_metadata = OIDCProviderMetadata(
                    authorization_endpoint=data["authorization_endpoint"],
                    token_endpoint=data["token_endpoint"],
                    userinfo_endpoint=data["userinfo_endpoint"],
                    issuer=data["issuer"],
                    jwks_uri=data.get("jwks_uri"),
                )
                return self._provider_metadata
        except Exception as e:
            logger.error("Failed to fetch OIDC provider metadata: %s", str(e))
            return None

    async def test_discovery(self) -> OIDCResult:
        """Test OIDC discovery endpoint connectivity."""
        config = await self.get_config()
        if not config or not config.discovery_url:
            return OIDCResult(
                success=False,
                message="OIDC not configured",
                error="Discovery URL not set",
            )

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    config.discovery_url,
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                # Verify required fields
                required = ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "issuer"]
                missing = [f for f in required if f not in data]
                if missing:
                    return OIDCResult(
                        success=False,
                        message="Invalid OIDC discovery response",
                        error=f"Missing fields: {', '.join(missing)}",
                    )

                return OIDCResult(
                    success=True,
                    message=f"Connected to {data.get('issuer', 'OIDC provider')}",
                    data={
                        "issuer": data.get("issuer"),
                        "authorization_endpoint": data.get("authorization_endpoint"),
                    },
                )
        except httpx.HTTPError as e:
            return OIDCResult(
                success=False,
                message="Failed to connect to OIDC provider",
                error=str(e),
            )
        except Exception as e:
            return OIDCResult(
                success=False,
                message="OIDC discovery failed",
                error=str(e),
            )

    def generate_state(self) -> str:
        """Generate a secure state parameter for CSRF protection."""
        return secrets.token_urlsafe(32)

    async def get_authorization_url(
        self,
        redirect_uri: str,
        state: str,
    ) -> Optional[str]:
        """Generate the OIDC authorization URL."""
        config = await self.get_config()
        if not config or not config.client_id:
            return None

        metadata = await self.get_provider_metadata()
        if not metadata:
            return None

        params = {
            "client_id": config.client_id,
            "response_type": "code",
            "scope": config.scopes,
            "redirect_uri": redirect_uri,
            "state": state,
        }

        return f"{metadata.authorization_endpoint}?{urlencode(params)}"

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> Optional[OIDCTokenResponse]:
        """Exchange authorization code for tokens."""
        config = await self.get_config()
        if not config or not config.client_id or not config.client_secret:
            return None

        metadata = await self.get_provider_metadata()
        if not metadata:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    metadata.token_endpoint,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "client_id": config.client_id,
                        "client_secret": config.client_secret,
                    },
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                return OIDCTokenResponse(
                    access_token=data["access_token"],
                    token_type=data.get("token_type", "Bearer"),
                    id_token=data.get("id_token"),
                    refresh_token=data.get("refresh_token"),
                    expires_in=data.get("expires_in"),
                )
        except Exception as e:
            logger.error("Failed to exchange OIDC authorization code: %s", str(e))
            return None

    async def get_user_info(
        self,
        access_token: str,
    ) -> Optional[OIDCUserInfo]:
        """Get user info from OIDC provider."""
        config = await self.get_config()
        if not config:
            return None

        metadata = await self.get_provider_metadata()
        if not metadata:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    metadata.userinfo_endpoint,
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                # Validate 'sub' claim - required per OIDC spec
                subject = data.get("sub")
                if not subject:
                    logger.warning("OIDC userinfo response missing required 'sub' claim")
                    return None

                return OIDCUserInfo(
                    subject=subject,
                    email=data.get(config.email_claim),
                    username=data.get(config.username_claim),
                    name=data.get("name"),
                    email_verified=data.get("email_verified", False),
                    raw_claims=data,
                )
        except Exception as e:
            logger.error("Failed to fetch OIDC user info: %s", str(e))
            return None

    async def find_user_by_oidc_subject(self, subject: str) -> Optional[User]:
        """Find a user by their OIDC subject."""
        result = await self.db.execute(
            select(User).where(User.oidc_subject == subject)
        )
        return result.scalar_one_or_none()

    async def find_user_by_email(self, email: str) -> Optional[User]:
        """Find a user by their email."""
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def provision_or_login_user(
        self,
        user_info: OIDCUserInfo,
    ) -> Optional[User]:
        """
        Find or create a user based on OIDC claims.

        Returns the user if successful, None if provisioning failed.
        """
        config = await self.get_config()
        if not config:
            return None

        # First, try to find by OIDC subject (existing SSO user)
        user = await self.find_user_by_oidc_subject(user_info.subject)
        if user:
            # Update last login
            user.last_login = datetime.now(timezone.utc)
            await self.db.commit()
            return user

        # Try to find by email (link existing account)
        if user_info.email:
            user = await self.find_user_by_email(user_info.email)
            if user:
                # Link the OIDC identity to existing user
                user.oidc_subject = user_info.subject
                user.oidc_provider = config.provider_name
                user.auth_method = "oidc"
                user.last_login = datetime.now(timezone.utc)
                await self.db.commit()
                return user

        # Check if auto-provisioning is enabled
        if not config.auto_provision:
            return None

        # Create a new user
        if not user_info.email:
            # Can't create user without email
            return None

        # Generate username from claims or email
        username = user_info.username
        if not username:
            # Use email prefix as username
            username = user_info.email.split("@")[0]

        # Ensure username is unique
        base_username = username
        counter = 1
        while await self._username_exists(username):
            username = f"{base_username}{counter}"
            counter += 1

        # Determine role with validation
        try:
            role = UserRole(config.default_role)
        except ValueError:
            # Invalid role value, fall back to USER role
            logger.warning(
                "Invalid OIDC default_role '%s' configured, falling back to USER role",
                config.default_role,
            )
            role = UserRole.USER

        # Create the user
        user = User(
            email=user_info.email,
            username=username,
            password_hash=None,  # No password for OIDC users
            role=role,
            is_active=True,
            oidc_subject=user_info.subject,
            oidc_provider=config.provider_name,
            auth_method="oidc",
            last_login=datetime.now(timezone.utc),
        )

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def _username_exists(self, username: str) -> bool:
        """Check if a username already exists."""
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none() is not None


def get_oidc_service(
    db: AsyncSession,
    credential_service: CredentialService,
) -> OIDCService:
    """Factory function to get OIDC service."""
    return OIDCService(db, credential_service)
