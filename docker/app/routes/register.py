"""Registration API routes.

Handles user registration with invitation codes.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.auth_service import get_auth_service, AuthError
from dependencies import get_client_info


router = APIRouter()


# Request/Response models

class ValidateInvitationRequest(BaseModel):
    """Request to validate an invitation code."""
    code: str


class InvitationInfoResponse(BaseModel):
    """Response with invitation details."""
    valid: bool
    email: Optional[str] = None
    role: Optional[str] = None
    expires_at: Optional[str] = None
    message: Optional[str] = None


class RegisterRequest(BaseModel):
    """Request for user registration."""
    code: str = Field(..., description="Invitation code")
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)


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


# Routes

@router.post("/validate", response_model=InvitationInfoResponse)
async def validate_invitation(
    data: ValidateInvitationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate an invitation code.

    Returns information about the invitation if valid.
    """
    auth_service = get_auth_service(db)

    try:
        invitation = await auth_service.validate_invitation(data.code)
        return InvitationInfoResponse(
            valid=True,
            email=invitation.email,
            role=invitation.role.value,
            expires_at=invitation.expires_at.isoformat(),
        )
    except AuthError as e:
        return InvitationInfoResponse(
            valid=False,
            message=e.message,
        )


@router.post("", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with an invitation code.

    Returns tokens for immediate login after registration.
    """
    auth_service = get_auth_service(db)
    client_info = get_client_info(request)

    try:
        user = await auth_service.register_with_invitation(
            code=data.code,
            email=data.email,
            username=data.username,
            password=data.password,
        )
    except AuthError as e:
        status_code = status.HTTP_400_BAD_REQUEST
        if e.code == "invalid_invitation":
            status_code = status.HTTP_404_NOT_FOUND
        elif e.code in ("invitation_used", "invitation_expired"):
            status_code = status.HTTP_410_GONE

        raise HTTPException(
            status_code=status_code,
            detail={"message": e.message, "code": e.code},
        )

    # Create tokens for immediate login
    tokens = await auth_service.create_tokens(
        user,
        user_agent=client_info["user_agent"],
        ip_address=client_info["ip_address"],
    )

    return TokenResponse(**tokens)
