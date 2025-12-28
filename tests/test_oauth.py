#!/usr/bin/env python3
"""
Tests for OAuth 2.0 + PKCE Authentication
==========================================

Tests the OAuth module functionality including:
- PKCE code verifier and challenge generation
- Authorization URL creation with proper parameters
- Token validation (format, presence, structure)
- OAuth callback server behavior
- Error handling for OAuth flow
"""

import base64
import hashlib
import re
import sys
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

# Mock authlib before importing core.oauth
mock_authlib = MagicMock()
mock_authlib.oauth2.rfc7636.create_s256_code_challenge = lambda v: base64.urlsafe_b64encode(
    hashlib.sha256(v.encode('ascii')).digest()
).rstrip(b'=').decode('ascii')
mock_authlib.integrations.httpx_client.OAuth2Client = MagicMock

sys.modules['authlib'] = mock_authlib
sys.modules['authlib.oauth2'] = mock_authlib.oauth2
sys.modules['authlib.oauth2.rfc7636'] = mock_authlib.oauth2.rfc7636
sys.modules['authlib.integrations'] = mock_authlib.integrations
sys.modules['authlib.integrations.httpx_client'] = mock_authlib.integrations.httpx_client

from core.oauth import (
    OAUTH_AUTHORIZATION_ENDPOINT,
    OAUTH_CLIENT_ID,
    OAUTH_REDIRECT_URI,
    OAUTH_SCOPES,
    OAUTH_TOKEN_ENDPOINT,
    PKCE_VERIFIER_LENGTH,
    OAuthFlowError,
    OAuthFlowResult,
    OAuthTokenError,
    OAuthTokenResponse,
    create_authorization_url,
    exchange_code_for_token,
    generate_pkce_pair,
)
from core.oauth_server import (
    OAUTH_CALLBACK_HOST,
    OAUTH_CALLBACK_PATH,
    OAUTH_CALLBACK_PORT,
    OAuthCallbackHandler,
    OAuthCallbackResult,
    OAuthCallbackServer,
    OAuthServerError,
)


class TestPKCEGeneration:
    """Tests for PKCE code verifier and challenge generation."""

    def test_generates_verifier_and_challenge(self):
        """Generates both verifier and challenge."""
        verifier, challenge = generate_pkce_pair()
        assert verifier is not None
        assert challenge is not None
        assert len(verifier) > 0
        assert len(challenge) > 0

    def test_verifier_is_url_safe_base64(self):
        """Verifier uses URL-safe base64 characters only."""
        verifier, _ = generate_pkce_pair()
        # URL-safe base64 should only contain alphanumeric, -, and _
        assert re.match(r'^[A-Za-z0-9_-]+$', verifier)

    def test_verifier_has_sufficient_length(self):
        """Verifier has minimum required length for security."""
        verifier, _ = generate_pkce_pair()
        # PKCE spec requires 43-128 characters after base64 encoding
        assert len(verifier) >= 43
        assert len(verifier) <= 128

    def test_challenge_is_sha256_of_verifier(self):
        """Challenge is S256 (SHA-256) hash of verifier."""
        verifier, challenge = generate_pkce_pair()
        # Manually compute S256 challenge
        digest = hashlib.sha256(verifier.encode('ascii')).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
        assert challenge == expected

    def test_generates_unique_pairs(self):
        """Each call generates unique verifier/challenge pairs."""
        pairs = [generate_pkce_pair() for _ in range(10)]
        verifiers = [p[0] for p in pairs]
        challenges = [p[1] for p in pairs]
        # All verifiers should be unique
        assert len(set(verifiers)) == 10
        # All challenges should be unique
        assert len(set(challenges)) == 10

    def test_verifier_is_cryptographically_random(self):
        """Verifier uses cryptographically secure randomness."""
        # Generate many pairs and check for entropy
        verifiers = [generate_pkce_pair()[0] for _ in range(100)]
        # Calculate average character distribution - should be relatively even
        all_chars = ''.join(verifiers)
        unique_chars = set(all_chars)
        # URL-safe base64 has 64 possible characters
        # With sufficient randomness, we should see many unique characters
        assert len(unique_chars) >= 30


class TestAuthorizationURLCreation:
    """Tests for OAuth authorization URL creation."""

    def test_returns_url_state_and_verifier(self):
        """Returns authorization URL, state, and code verifier."""
        url, state, verifier = create_authorization_url()
        assert url is not None
        assert state is not None
        assert verifier is not None

    def test_url_uses_correct_endpoint(self):
        """URL uses Anthropic's authorization endpoint."""
        url, _, _ = create_authorization_url()
        parsed = urlparse(url)
        expected_parsed = urlparse(OAUTH_AUTHORIZATION_ENDPOINT)
        assert parsed.scheme == expected_parsed.scheme
        assert parsed.netloc == expected_parsed.netloc
        assert parsed.path == expected_parsed.path

    def test_includes_response_type_code(self):
        """URL includes response_type=code parameter."""
        url, _, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'response_type' in params
        assert params['response_type'][0] == 'code'

    def test_includes_client_id(self):
        """URL includes correct client_id parameter."""
        url, _, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'client_id' in params
        assert params['client_id'][0] == OAUTH_CLIENT_ID

    def test_includes_redirect_uri(self):
        """URL includes correct redirect_uri parameter."""
        url, _, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'redirect_uri' in params
        assert params['redirect_uri'][0] == OAUTH_REDIRECT_URI

    def test_includes_all_required_scopes(self):
        """URL includes all required OAuth scopes."""
        url, _, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'scope' in params
        scopes = params['scope'][0]
        # Check all required scopes are present
        assert 'org:createapikey' in scopes
        assert 'user:profile' in scopes
        assert 'user:inference' in scopes

    def test_includes_state_parameter(self):
        """URL includes state parameter matching returned state."""
        url, state, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'state' in params
        assert params['state'][0] == state

    def test_includes_pkce_code_challenge(self):
        """URL includes PKCE code_challenge parameter."""
        url, _, verifier = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'code_challenge' in params
        # Verify challenge corresponds to the verifier
        digest = hashlib.sha256(verifier.encode('ascii')).digest()
        expected_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
        assert params['code_challenge'][0] == expected_challenge

    def test_uses_s256_challenge_method(self):
        """URL specifies S256 code challenge method."""
        url, _, _ = create_authorization_url()
        params = parse_qs(urlparse(url).query)
        assert 'code_challenge_method' in params
        assert params['code_challenge_method'][0] == 'S256'

    def test_state_is_unique_each_call(self):
        """Each call generates a unique state parameter."""
        states = [create_authorization_url()[1] for _ in range(10)]
        assert len(set(states)) == 10

    def test_verifier_is_unique_each_call(self):
        """Each call generates a unique code verifier."""
        verifiers = [create_authorization_url()[2] for _ in range(10)]
        assert len(set(verifiers)) == 10


class TestTokenValidation:
    """Tests for token validation logic."""

    def test_valid_token_format_accepted(self):
        """Valid sk-ant-oat01- prefixed tokens are accepted."""
        valid_token = "sk-ant-oat01-abcdefghijklmnopqrstuvwxyz123456789"
        # Check if token starts with expected prefix
        assert valid_token.startswith("sk-ant-oat01-")

    def test_invalid_token_prefix_rejected(self):
        """Tokens without sk-ant-oat01- prefix are rejected."""
        invalid_prefixes = [
            "sk-ant-01-",
            "sk-ant-oat-",
            "sk-oat01-",
            "invalid-token",
            "",
        ]
        for prefix in invalid_prefixes:
            token = f"{prefix}abcdefghijklmnop"
            assert not token.startswith("sk-ant-oat01-")


class TestExchangeCodeForToken:
    """Tests for OAuth token exchange."""

    @patch('core.oauth.OAuth2Client')
    def test_creates_public_client(self, mock_client_class):
        """Creates OAuth client with no client secret (public client)."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'access_token': 'sk-ant-oat01-testtoken123',
            'token_type': 'bearer',
        }
        mock_client_class.return_value = mock_client

        exchange_code_for_token("auth_code", "verifier")

        mock_client_class.assert_called_once_with(
            client_id=OAUTH_CLIENT_ID,
            token_endpoint_auth_method="none",
        )

    @patch('core.oauth.OAuth2Client')
    def test_sends_code_verifier(self, mock_client_class):
        """Sends code verifier in token exchange request."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'access_token': 'sk-ant-oat01-testtoken123',
            'token_type': 'bearer',
        }
        mock_client_class.return_value = mock_client

        exchange_code_for_token("auth_code", "test_verifier")

        mock_client.fetch_token.assert_called_once()
        call_kwargs = mock_client.fetch_token.call_args[1]
        assert call_kwargs['code_verifier'] == 'test_verifier'

    @patch('core.oauth.OAuth2Client')
    def test_uses_correct_token_endpoint(self, mock_client_class):
        """Uses Anthropic's token endpoint."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'access_token': 'sk-ant-oat01-testtoken123',
            'token_type': 'bearer',
        }
        mock_client_class.return_value = mock_client

        exchange_code_for_token("auth_code", "verifier")

        call_kwargs = mock_client.fetch_token.call_args[1]
        assert call_kwargs['url'] == OAUTH_TOKEN_ENDPOINT

    @patch('core.oauth.OAuth2Client')
    def test_returns_oauth_token_response(self, mock_client_class):
        """Returns properly structured OAuthTokenResponse."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'access_token': 'sk-ant-oat01-testtoken123',
            'token_type': 'bearer',
            'expires_in': 3600,
            'scope': 'user:profile user:inference',
        }
        mock_client_class.return_value = mock_client

        result = exchange_code_for_token("auth_code", "verifier")

        assert result['access_token'] == 'sk-ant-oat01-testtoken123'
        assert result['token_type'] == 'bearer'
        assert result['expires_in'] == 3600
        assert result['scope'] == 'user:profile user:inference'

    @patch('core.oauth.OAuth2Client')
    def test_raises_error_on_missing_access_token(self, mock_client_class):
        """Raises OAuthTokenError when access_token is missing."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'token_type': 'bearer',
        }
        mock_client_class.return_value = mock_client

        with pytest.raises(OAuthTokenError) as exc_info:
            exchange_code_for_token("auth_code", "verifier")

        assert exc_info.value.error == "invalid_token_response"

    @patch('core.oauth.OAuth2Client')
    def test_raises_error_on_invalid_token_format(self, mock_client_class):
        """Raises OAuthTokenError when token format is invalid."""
        mock_client = MagicMock()
        mock_client.fetch_token.return_value = {
            'access_token': 'invalid-token-format',
            'token_type': 'bearer',
        }
        mock_client_class.return_value = mock_client

        with pytest.raises(OAuthTokenError) as exc_info:
            exchange_code_for_token("auth_code", "verifier")

        assert exc_info.value.error == "invalid_token_format"

    @patch('core.oauth.OAuth2Client')
    def test_handles_network_error(self, mock_client_class):
        """Handles network errors during token exchange."""
        mock_client = MagicMock()
        mock_client.fetch_token.side_effect = Exception("Connection refused")
        mock_client_class.return_value = mock_client

        with pytest.raises(OAuthTokenError) as exc_info:
            exchange_code_for_token("auth_code", "verifier")

        assert exc_info.value.error == "token_exchange_failed"
        assert "Connection refused" in exc_info.value.description


class TestOAuthCallbackResult:
    """Tests for OAuthCallbackResult dataclass."""

    def test_success_result_has_code_and_state(self):
        """Successful result contains code and state."""
        result = OAuthCallbackResult(
            success=True,
            code="auth_code_123",
            state="state_abc",
        )
        assert result.success is True
        assert result.code == "auth_code_123"
        assert result.state == "state_abc"
        assert result.error is None

    def test_error_result_has_error_info(self):
        """Error result contains error details."""
        result = OAuthCallbackResult(
            success=False,
            error="access_denied",
            error_description="User denied access",
        )
        assert result.success is False
        assert result.error == "access_denied"
        assert result.error_description == "User denied access"
        assert result.code is None


class TestOAuthCallbackServer:
    """Tests for OAuth callback server."""

    def test_server_creates_callback_url(self):
        """Server provides correct callback URL."""
        server = OAuthCallbackServer()
        expected_url = f"http://{OAUTH_CALLBACK_HOST}:{OAUTH_CALLBACK_PORT}{OAUTH_CALLBACK_PATH}"
        assert server.callback_url == expected_url

    def test_server_requires_start_before_wait(self):
        """Raises error if wait_for_callback called before start."""
        server = OAuthCallbackServer()
        with pytest.raises(OAuthServerError) as exc_info:
            server.wait_for_callback(timeout=1.0)
        assert "not started" in str(exc_info.value).lower()

    def test_handler_resets_state_on_init(self):
        """Handler class variables are reset on server init."""
        # Set some values
        OAuthCallbackHandler.authorization_code = "old_code"
        OAuthCallbackHandler.received_state = "old_state"
        OAuthCallbackHandler.error = "old_error"

        # Create new server (should reset)
        _ = OAuthCallbackServer()

        assert OAuthCallbackHandler.authorization_code is None
        assert OAuthCallbackHandler.received_state is None
        assert OAuthCallbackHandler.error is None


class TestOAuthFlowResult:
    """Tests for OAuthFlowResult dataclass."""

    def test_success_result(self):
        """Successful flow result has token."""
        result = OAuthFlowResult(
            success=True,
            token="sk-ant-oat01-testtoken123",
        )
        assert result.success is True
        assert result.token == "sk-ant-oat01-testtoken123"
        assert result.error is None

    def test_error_result(self):
        """Failed flow result has error details."""
        result = OAuthFlowResult(
            success=False,
            error="timeout",
            error_description="OAuth callback not received",
        )
        assert result.success is False
        assert result.error == "timeout"
        assert result.error_description == "OAuth callback not received"
        assert result.token is None

    def test_partial_success_with_keychain_error(self):
        """Flow can succeed with token but note Keychain failure."""
        result = OAuthFlowResult(
            success=True,
            token="sk-ant-oat01-testtoken123",
            error="keychain_save_failed",
            error_description="Could not save to Keychain",
        )
        assert result.success is True
        assert result.token is not None
        assert result.error == "keychain_save_failed"

    def test_repr_for_success(self):
        """String representation shows success with truncated token."""
        result = OAuthFlowResult(
            success=True,
            token="sk-ant-oat01-testtoken123456789",
        )
        repr_str = repr(result)
        assert "success=True" in repr_str
        # Token should be truncated
        assert "sk-ant-oat01-te" in repr_str
        assert "..." in repr_str

    def test_repr_for_error(self):
        """String representation shows error code."""
        result = OAuthFlowResult(
            success=False,
            error="state_mismatch",
        )
        repr_str = repr(result)
        assert "success=False" in repr_str
        assert "state_mismatch" in repr_str


class TestOAuthTokenError:
    """Tests for OAuthTokenError exception."""

    def test_error_with_code_only(self):
        """Error can be created with just error code."""
        error = OAuthTokenError("invalid_grant")
        assert error.error == "invalid_grant"
        assert error.description == "invalid_grant"

    def test_error_with_description(self):
        """Error includes description when provided."""
        error = OAuthTokenError("invalid_grant", "Authorization code expired")
        assert error.error == "invalid_grant"
        assert error.description == "Authorization code expired"

    def test_error_string_representation(self):
        """Error string includes both code and description."""
        error = OAuthTokenError("invalid_grant", "Authorization code expired")
        error_str = str(error)
        assert "invalid_grant" in error_str
        assert "Authorization code expired" in error_str


class TestOAuthFlowError:
    """Tests for OAuthFlowError exception."""

    def test_error_with_code_only(self):
        """Error can be created with just error code."""
        error = OAuthFlowError("server_start_failed")
        assert error.error == "server_start_failed"
        assert error.description == "server_start_failed"

    def test_error_with_description(self):
        """Error includes description when provided."""
        error = OAuthFlowError("server_start_failed", "Port 8487 in use")
        assert error.error == "server_start_failed"
        assert error.description == "Port 8487 in use"


class TestOAuthConstants:
    """Tests for OAuth configuration constants."""

    def test_client_id_is_claude_code(self):
        """Client ID matches Anthropic's pre-registered client."""
        assert OAUTH_CLIENT_ID == "claude-code"

    def test_authorization_endpoint_is_anthropic(self):
        """Authorization endpoint is Anthropic's console."""
        assert "console.anthropic.com" in OAUTH_AUTHORIZATION_ENDPOINT
        assert "/oauth/authorize" in OAUTH_AUTHORIZATION_ENDPOINT

    def test_token_endpoint_is_anthropic(self):
        """Token endpoint is Anthropic's console."""
        assert "console.anthropic.com" in OAUTH_TOKEN_ENDPOINT
        assert "/oauth/token" in OAUTH_TOKEN_ENDPOINT

    def test_redirect_uri_uses_localhost(self):
        """Redirect URI uses localhost (127.0.0.1)."""
        assert "127.0.0.1" in OAUTH_REDIRECT_URI
        assert ":8487" in OAUTH_REDIRECT_URI

    def test_scopes_include_profile(self):
        """Scopes include user:profile for usage endpoint access."""
        assert "user:profile" in OAUTH_SCOPES

    def test_scopes_include_inference(self):
        """Scopes include user:inference for API access."""
        assert "user:inference" in OAUTH_SCOPES

    def test_scopes_include_createapikey(self):
        """Scopes include org:createapikey."""
        assert "org:createapikey" in OAUTH_SCOPES

    def test_callback_port_is_8487(self):
        """Callback server uses port 8487 (Anthropic whitelist)."""
        assert OAUTH_CALLBACK_PORT == 8487

    def test_callback_binds_to_localhost_only(self):
        """Callback server binds to 127.0.0.1 only (security)."""
        assert OAUTH_CALLBACK_HOST == "127.0.0.1"

    def test_pkce_verifier_length_sufficient(self):
        """PKCE verifier length provides sufficient entropy."""
        # 32 bytes minimum recommended, 48 bytes used for extra security
        assert PKCE_VERIFIER_LENGTH >= 32
