"""Authentication API routes.

Handles user login, token refresh, logout, and user info.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User
from services.auth_service import get_auth_service, AuthError
from dependencies import get_current_user, get_client_info


router = APIRouter()


# Request/Response models

class SetupRequest(BaseModel):
    """Request for initial admin setup."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Request for user login."""
    email_or_username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    """Request for token refresh."""
    refresh_token: str


class LogoutRequest(BaseModel):
    """Request for logout."""
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    """Response containing access and refresh tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    """User information response."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str] = None

    @classmethod
    def from_user(cls, user: User) -> "UserResponse":
        return cls(
            id=str(user.id),
            email=user.email,
            username=user.username,
            role=user.role.value,
            is_active=user.is_active,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None,
        )


class SetupStatusResponse(BaseModel):
    """Response for setup status check."""
    setup_required: bool
    has_users: bool


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True


# Routes

@router.get("/status", response_model=SetupStatusResponse)
async def get_setup_status(
    db: AsyncSession = Depends(get_db),
):
    """Check if initial setup is required.

    Returns whether the system needs initial admin setup.
    """
    auth_service = get_auth_service(db)
    is_complete = await auth_service.is_setup_complete()

    return SetupStatusResponse(
        setup_required=not is_complete,
        has_users=is_complete,
    )


@router.post("/setup", response_model=TokenResponse)
async def setup_admin(
    data: SetupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Initial admin setup.

    Creates the first admin user. Only works if no users exist.
    Returns access and refresh tokens for immediate login.
    """
    auth_service = get_auth_service(db)
    client_info = get_client_info(request)

    try:
        user = await auth_service.setup_admin(
            email=data.email,
            username=data.username,
            password=data.password,
        )
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": e.message, "code": e.code},
        )

    # Create tokens for immediate login
    tokens = await auth_service.create_tokens(
        user,
        user_agent=client_info["user_agent"],
        ip_address=client_info["ip_address"],
    )

    return TokenResponse(**tokens)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and get tokens.

    Accepts email or username for login.
    """
    auth_service = get_auth_service(db)
    client_info = get_client_info(request)

    try:
        user = await auth_service.authenticate_user(
            email_or_username=data.email_or_username,
            password=data.password,
        )
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": e.message, "code": e.code},
        )

    tokens = await auth_service.create_tokens(
        user,
        user_agent=client_info["user_agent"],
        ip_address=client_info["ip_address"],
    )

    return TokenResponse(**tokens)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    data: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using refresh token.

    The old refresh token is revoked and a new one is issued.
    """
    auth_service = get_auth_service(db)
    client_info = get_client_info(request)

    try:
        tokens = await auth_service.refresh_tokens(
            refresh_token=data.refresh_token,
            user_agent=client_info["user_agent"],
            ip_address=client_info["ip_address"],
        )
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": e.message, "code": e.code},
        )

    return TokenResponse(**tokens)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    data: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Logout and revoke refresh token.

    If no refresh_token is provided, revokes all tokens for the user.
    """
    auth_service = get_auth_service(db)

    if data.refresh_token:
        await auth_service.logout(data.refresh_token)
        return MessageResponse(message="Logged out successfully")
    else:
        count = await auth_service.logout_all(current_user.id)
        return MessageResponse(message=f"Logged out from {count} sessions")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get current user information."""
    return UserResponse.from_user(current_user)
