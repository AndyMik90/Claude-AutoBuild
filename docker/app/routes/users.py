"""User management API routes (Admin only).

Handles user listing, invitation management, and user administration.
"""

import os
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User, UserRole, Invitation
from services.auth_service import get_auth_service
from services.email_service import EmailService
from services.credential_service import get_credential_service
from dependencies import require_admin


router = APIRouter()


# Request/Response models

class UserListItem(BaseModel):
    """User item in list response."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str] = None


class UserListResponse(BaseModel):
    """Paginated user list response."""
    users: List[UserListItem]
    total: int
    page: int
    page_size: int


class CreateInvitationRequest(BaseModel):
    """Request to create an invitation."""
    email: Optional[EmailStr] = None
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    expires_hours: int = Field(default=168, ge=1, le=720)  # 1 hour to 30 days
    note: Optional[str] = Field(default=None, max_length=500)
    send_email: bool = Field(default=False)  # Whether to send invitation email


class InvitationResponse(BaseModel):
    """Invitation response."""
    id: str
    code: str
    email: Optional[str]
    role: str
    created_at: str
    expires_at: str
    used_at: Optional[str] = None
    is_valid: bool
    note: Optional[str] = None
    email_sent: bool = False  # Whether invitation email was sent


class InvitationListResponse(BaseModel):
    """List of invitations response."""
    invitations: List[InvitationResponse]
    total: int


class UpdateUserRequest(BaseModel):
    """Request to update a user."""
    is_active: Optional[bool] = None
    role: Optional[str] = Field(default=None, pattern=r"^(admin|user)$")


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True


# Routes

@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all users (admin only)."""
    offset = (page - 1) * page_size

    # Get total count
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar()

    # Get users
    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    users = result.scalars().all()

    return UserListResponse(
        users=[
            UserListItem(
                id=str(u.id),
                email=u.email,
                username=u.username,
                role=u.role.value,
                is_active=u.is_active,
                created_at=u.created_at.isoformat(),
                last_login=u.last_login.isoformat() if u.last_login else None,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


# Invitation management (must come before /{user_id} routes)

@router.get("/invitations", response_model=InvitationListResponse)
async def list_invitations(
    include_used: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all invitations (admin only)."""
    query = select(Invitation).order_by(Invitation.created_at.desc())

    if not include_used:
        query = query.where(Invitation.used_at.is_(None))

    result = await db.execute(query)
    invitations = result.scalars().all()

    return InvitationListResponse(
        invitations=[
            InvitationResponse(
                id=str(inv.id),
                code=inv.code,
                email=inv.email,
                role=inv.role.value,
                created_at=inv.created_at.isoformat(),
                expires_at=inv.expires_at.isoformat(),
                used_at=inv.used_at.isoformat() if inv.used_at else None,
                is_valid=inv.is_valid,
                note=inv.note,
            )
            for inv in invitations
        ],
        total=len(invitations),
    )


@router.post("/invitations", response_model=InvitationResponse)
async def create_invitation(
    data: CreateInvitationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new invitation (admin only).

    If send_email is True and email is provided, attempts to send
    an invitation email using configured SMTP settings.
    """
    auth_service = get_auth_service(db)

    invitation = await auth_service.create_invitation(
        created_by=admin,
        email=data.email,
        role=UserRole(data.role),
        expires_hours=data.expires_hours,
        note=data.note,
    )

    # Attempt to send email if requested
    email_sent = False
    if data.send_email and data.email:
        credential_service = get_credential_service()
        email_service = EmailService(db, credential_service)

        if await email_service.is_configured():
            # Determine base URL from request or environment
            base_url = os.environ.get("BASE_URL", str(request.base_url).rstrip("/"))

            result = await email_service.send_invitation_email(
                to_email=data.email,
                invitation_code=invitation.code,
                invited_by=admin.username or admin.email,
                expires_at=invitation.expires_at.strftime("%B %d, %Y at %I:%M %p"),
                base_url=base_url,
            )
            email_sent = result.success

    return InvitationResponse(
        id=str(invitation.id),
        code=invitation.code,
        email=invitation.email,
        role=invitation.role.value,
        created_at=invitation.created_at.isoformat(),
        expires_at=invitation.expires_at.isoformat(),
        is_valid=invitation.is_valid,
        note=invitation.note,
        email_sent=email_sent,
    )


@router.delete("/invitations/{invitation_id}", response_model=MessageResponse)
async def revoke_invitation(
    invitation_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Revoke (delete) an invitation (admin only)."""
    import uuid

    result = await db.execute(
        select(Invitation).where(Invitation.id == uuid.UUID(invitation_id))
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if invitation.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke used invitation",
        )

    await db.delete(invitation)
    await db.commit()

    return MessageResponse(message="Invitation revoked")


# User-specific routes (after static paths)

@router.get("/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get a specific user (admin only)."""
    auth_service = get_auth_service(db)
    import uuid
    user = await auth_service.get_user_by_id(uuid.UUID(user_id))

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return UserListItem(
        id=str(user.id),
        email=user.email,
        username=user.username,
        role=user.role.value,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    data: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a user (admin only)."""
    import uuid
    auth_service = get_auth_service(db)
    user = await auth_service.get_user_by_id(uuid.UUID(user_id))

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Prevent admin from deactivating themselves
    if data.is_active is False and user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    # Update fields
    if data.is_active is not None:
        user.is_active = data.is_active

    if data.role is not None:
        # Prevent admin from demoting themselves
        if user.id == admin.id and data.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role",
            )
        user.role = UserRole(data.role)

    await db.commit()

    return UserListItem(
        id=str(user.id),
        email=user.email,
        username=user.username,
        role=user.role.value,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None,
    )
