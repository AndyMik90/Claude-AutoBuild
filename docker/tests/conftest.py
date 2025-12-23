"""Pytest configuration and fixtures for Auto-Claude Docker tests."""

import sys
import os
import pytest

# Add app directory to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Reset the settings cache before each test."""
    from config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def mock_debug_env(monkeypatch):
    """Set DEBUG=true for tests."""
    monkeypatch.setenv("DEBUG", "true")
    from config import get_settings
    get_settings.cache_clear()


@pytest.fixture
def mock_production_env(monkeypatch):
    """Set DEBUG=false for production-like tests."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", "secure-production-key-12345")
    from config import get_settings
    get_settings.cache_clear()
