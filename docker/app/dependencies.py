"""FastAPI dependencies for authentication and authorization."""

from typing import Optional
import uuid

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User, UserRole
from services.jwt_service import get_jwt_service, TokenError
from services.auth_service import get_auth_service


# Security scheme for JWT bearer tokens
bearer_scheme = HTTPBearer(auto_error=False)


async def get_token_from_request(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[str]:
    """Extract JWT token from request.

    Args:
        credentials: Optional bearer token credentials

    Returns:
        Token string or None
    """
    if credentials is None:
        return None
    return credentials.credentials


async def get_current_user(
    token: Optional[str] = Depends(get_token_from_request),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get the current authenticated user.

    Args:
        token: JWT access token
        db: Database session

    Returns:
        Current user

    Raises:
        HTTPException: If not authenticated
    """
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jwt_service = get_jwt_service()

    try:
        payload = jwt_service.decode_access_token(token)
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_service = get_auth_service(db)
    user = await auth_service.get_user_by_id(user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(get_token_from_request),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Get the current user if authenticated, None otherwise.

    Useful for endpoints that work both authenticated and anonymously.

    Args:
        token: JWT access token
        db: Database session

    Returns:
        Current user or None
    """
    if token is None:
        return None

    jwt_service = get_jwt_service()

    try:
        payload = jwt_service.decode_access_token(token)
    except TokenError:
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        return None

    auth_service = get_auth_service(db)
    user = await auth_service.get_user_by_id(user_id)

    if user is None or not user.is_active:
        return None

    return user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be an admin.

    Args:
        current_user: Current authenticated user

    Returns:
        Current user (verified as admin)

    Raises:
        HTTPException: If user is not an admin
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def get_client_info(request: Request) -> dict:
    """Extract client information from request.

    Args:
        request: FastAPI request object

    Returns:
        Dict with user_agent and ip_address
    """
    user_agent = request.headers.get("user-agent", "")[:500]  # Limit length
    ip_address = request.client.host if request.client else None

    # Check for forwarded IP (behind proxy)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        ip_address = forwarded_for.split(",")[0].strip()

    return {
        "user_agent": user_agent,
        "ip_address": ip_address,
    }
