"""Password hashing service using bcrypt."""

import bcrypt


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to check against

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def password_needs_rehash(hashed_password: str) -> bool:
    """Check if a password hash needs to be updated.

    For bcrypt, we check the rounds prefix.
    Current target is 12 rounds.

    Args:
        hashed_password: Existing password hash

    Returns:
        True if password should be rehashed
    """
    try:
        # bcrypt hash format: $2b$12$... where 12 is the rounds
        parts = hashed_password.split('$')
        if len(parts) >= 3:
            current_rounds = int(parts[2])
            return current_rounds < 12
    except (ValueError, IndexError):
        return True
    return False
