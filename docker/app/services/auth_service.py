"""Authentication service for user management and token operations."""

import secrets
from datetime import datetime, timedelta
from typing import Optional
import uuid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, UserRole, RefreshToken, Invitation, SystemSettings
from services.password_service import hash_password, verify_password, password_needs_rehash
from services.jwt_service import get_jwt_service, TokenError


class AuthError(Exception):
    """Exception for authentication errors."""

    def __init__(self, message: str, code: str = "auth_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class AuthService:
    """Service for handling authentication operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.jwt_service = get_jwt_service()

    async def is_setup_complete(self) -> bool:
        """Check if initial setup has been completed."""
        result = await self.db.execute(select(SystemSettings).limit(1))
        settings = result.scalar_one_or_none()

        if settings is None:
            return False

        return settings.setup_completed

    async def setup_admin(
        self,
        email: str,
        username: str,
        password: str,
    ) -> User:
        """Create the initial admin user during first-run setup.

        Args:
            email: Admin email
            username: Admin username
            password: Admin password

        Returns:
            Created admin user

        Raises:
            AuthError: If setup is already complete
        """
        # Check if setup is already done
        if await self.is_setup_complete():
            raise AuthError("Setup already completed", "setup_complete")

        # Check for existing users
        result = await self.db.execute(select(User).limit(1))
        if result.scalar_one_or_none() is not None:
            raise AuthError("Users already exist", "users_exist")

        # Create admin user
        admin = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.db.add(admin)

        # Create or update system settings
        result = await self.db.execute(select(SystemSettings).limit(1))
        settings = result.scalar_one_or_none()

        if settings is None:
            settings = SystemSettings(
                setup_completed=True,
                setup_completed_at=datetime.utcnow(),
            )
            self.db.add(settings)
        else:
            settings.setup_completed = True
            settings.setup_completed_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(admin)

        return admin

    async def authenticate_user(
        self,
        email_or_username: str,
        password: str,
    ) -> User:
        """Authenticate a user with email/username and password.

        Args:
            email_or_username: User's email or username
            password: Plain text password

        Returns:
            Authenticated user

        Raises:
            AuthError: If authentication fails
        """
        # Find user by email or username
        result = await self.db.execute(
            select(User).where(
                and_(
                    (User.email == email_or_username) | (User.username == email_or_username),
                    User.is_active == True,
                )
            )
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise AuthError("Invalid credentials", "invalid_credentials")

        # Verify password
        if not verify_password(password, user.password_hash):
            raise AuthError("Invalid credentials", "invalid_credentials")

        # Check if password needs rehash (work factor increased)
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)

        # Update last login
        user.last_login = datetime.utcnow()
        await self.db.commit()

        return user

    async def create_tokens(
        self,
        user: User,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict:
        """Create access and refresh tokens for a user.

        Args:
            user: User to create tokens for
            user_agent: Optional user agent string
            ip_address: Optional IP address

        Returns:
            Dict with access_token, refresh_token, and expires_in
        """
        # Create access token
        access_token = self.jwt_service.create_access_token(
            user_id=user.id,
            email=user.email,
            role=user.role.value,
        )

        # Create refresh token
        raw_refresh_token, token_hash, expires_at = self.jwt_service.create_refresh_token(
            user_id=user.id,
        )

        # Store refresh token in database
        refresh_token = RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(refresh_token)
        await self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": raw_refresh_token,
            "token_type": "bearer",
            "expires_in": self.jwt_service.access_token_expire_minutes * 60,
        }

    async def refresh_tokens(
        self,
        refresh_token: str,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict:
        """Refresh tokens using a refresh token.

        The old refresh token is revoked and a new one is issued.

        Args:
            refresh_token: The refresh token
            user_agent: Optional user agent string
            ip_address: Optional IP address

        Returns:
            Dict with new access_token, refresh_token, and expires_in

        Raises:
            AuthError: If refresh token is invalid
        """
        # Hash the token to find it
        token_hash = self.jwt_service._hash_token(refresh_token)

        # Find the refresh token
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored_token = result.scalar_one_or_none()

        if stored_token is None:
            raise AuthError("Invalid refresh token", "invalid_token")

        if not stored_token.is_valid:
            raise AuthError("Refresh token expired or revoked", "token_expired")

        # Get the user
        result = await self.db.execute(
            select(User).where(
                and_(
                    User.id == stored_token.user_id,
                    User.is_active == True,
                )
            )
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise AuthError("User not found or inactive", "user_inactive")

        # Revoke old token
        stored_token.revoked_at = datetime.utcnow()

        # Create new tokens
        return await self.create_tokens(user, user_agent, ip_address)

    async def logout(self, refresh_token: str) -> bool:
        """Revoke a refresh token (logout).

        Args:
            refresh_token: The refresh token to revoke

        Returns:
            True if token was revoked
        """
        token_hash = self.jwt_service._hash_token(refresh_token)

        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored_token = result.scalar_one_or_none()

        if stored_token is not None:
            stored_token.revoked_at = datetime.utcnow()
            await self.db.commit()
            return True

        return False

    async def logout_all(self, user_id: uuid.UUID) -> int:
        """Revoke all refresh tokens for a user.

        Args:
            user_id: User's UUID

        Returns:
            Number of tokens revoked
        """
        result = await self.db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
            )
        )
        tokens = result.scalars().all()

        count = 0
        for token in tokens:
            token.revoked_at = datetime.utcnow()
            count += 1

        await self.db.commit()
        return count

    async def get_user_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """Get a user by ID.

        Args:
            user_id: User's UUID

        Returns:
            User or None
        """
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get a user by email.

        Args:
            email: User's email

        Returns:
            User or None
        """
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def create_invitation(
        self,
        created_by: User,
        email: Optional[str] = None,
        role: UserRole = UserRole.USER,
        expires_hours: int = 168,  # 7 days
        note: Optional[str] = None,
    ) -> Invitation:
        """Create an invitation code for user registration.

        Args:
            created_by: Admin user creating the invitation
            email: Optional email to restrict invitation to
            role: Role to assign to registered user
            expires_hours: Hours until invitation expires
            note: Optional note about the invitation

        Returns:
            Created invitation
        """
        # Generate secure invitation code
        code = secrets.token_urlsafe(32)

        invitation = Invitation(
            code=code,
            email=email,
            role=role,
            created_by_id=created_by.id,
            expires_at=datetime.utcnow() + timedelta(hours=expires_hours),
            note=note,
        )
        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)

        return invitation

    async def validate_invitation(self, code: str) -> Invitation:
        """Validate an invitation code.

        Args:
            code: Invitation code

        Returns:
            Valid invitation

        Raises:
            AuthError: If invitation is invalid
        """
        result = await self.db.execute(
            select(Invitation).where(Invitation.code == code)
        )
        invitation = result.scalar_one_or_none()

        if invitation is None:
            raise AuthError("Invalid invitation code", "invalid_invitation")

        if not invitation.is_valid:
            if invitation.is_used:
                raise AuthError("Invitation already used", "invitation_used")
            else:
                raise AuthError("Invitation expired", "invitation_expired")

        return invitation

    async def register_with_invitation(
        self,
        code: str,
        email: str,
        username: str,
        password: str,
    ) -> User:
        """Register a new user with an invitation code.

        Args:
            code: Invitation code
            email: User's email
            username: User's username
            password: User's password

        Returns:
            Created user

        Raises:
            AuthError: If registration fails
        """
        # Validate invitation
        invitation = await self.validate_invitation(code)

        # Check if email is restricted
        if invitation.email and invitation.email.lower() != email.lower():
            raise AuthError("Email does not match invitation", "email_mismatch")

        # Check for existing user
        existing = await self.get_user_by_email(email)
        if existing:
            raise AuthError("Email already registered", "email_exists")

        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        if result.scalar_one_or_none():
            raise AuthError("Username already taken", "username_exists")

        # Create user
        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            role=invitation.role,
            is_active=True,
        )
        self.db.add(user)

        # Mark invitation as used
        invitation.used_at = datetime.utcnow()
        invitation.used_by_id = user.id

        await self.db.commit()
        await self.db.refresh(user)

        return user


def get_auth_service(db: AsyncSession) -> AuthService:
    """Get an auth service instance."""
    return AuthService(db)
