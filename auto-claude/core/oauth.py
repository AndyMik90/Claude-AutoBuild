"""
OAuth 2.0 + PKCE authentication flow for Auto Claude.

Implements OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure
authentication with Anthropic's Claude console. Uses Anthropic's pre-whitelisted
redirect URI and supports extended scopes for full API access.
"""

import secrets

from authlib.oauth2.rfc7636 import create_s256_code_challenge


# OAuth 2.0 configuration for Anthropic Claude
OAUTH_CLIENT_ID = "claude-code"  # Pre-registered public client
OAUTH_AUTHORIZATION_ENDPOINT = "https://console.anthropic.com/oauth/authorize"
OAUTH_TOKEN_ENDPOINT = "https://console.anthropic.com/oauth/token"
OAUTH_REDIRECT_URI = "http://127.0.0.1:8487/oauth/callback"
OAUTH_SCOPES = "org:createapikey user:profile user:inference"

# PKCE configuration
PKCE_VERIFIER_LENGTH = 48  # bytes before base64 encoding


def generate_pkce_pair() -> tuple[str, str]:
    """
    Generate a PKCE code verifier and code challenge pair.

    Uses cryptographically secure random bytes for the verifier and
    S256 hashing for the challenge as per RFC 7636.

    Returns:
        Tuple of (code_verifier, code_challenge)
        - code_verifier: Base64 URL-safe random string (for token exchange)
        - code_challenge: S256 hash of verifier (sent with authorization request)
    """
    # Generate cryptographically secure verifier
    code_verifier = secrets.token_urlsafe(PKCE_VERIFIER_LENGTH)

    # Create S256 challenge from verifier
    code_challenge = create_s256_code_challenge(code_verifier)

    return code_verifier, code_challenge
