#!/usr/bin/env python3
"""
Test script for Vertex AI integration with Auto-Claude.

This script verifies:
1. Vertex AI configuration is valid
2. Google Cloud authentication works
3. Access token can be obtained
"""

import os
import sys
import tempfile
import traceback
from pathlib import Path

# Add backend to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Import after adding to path
from core.client import create_client

def test_vertex_ai():
    """Test Vertex AI integration."""
    print("=" * 60)
    print("Auto-Claude Vertex AI Integration Test")
    print("=" * 60)
    print()

    # Load .env file if it exists
    env_file = backend_dir / ".env"
    if env_file.exists():
        print(f"✓ Found .env file: {env_file}")
        from dotenv import load_dotenv
        load_dotenv(env_file)
    else:
        print(f"✗ No .env file found at: {env_file}")
        print()
        print("To test Vertex AI, create apps/backend/.env with:")
        print()
        print("  USE_VERTEX_AI=true")
        print("  VERTEX_PROJECT_ID=your-gcp-project-id")
        print("  VERTEX_LOCATION=us-east5")
        print()
        return False

    print()

    # Import auth functions
    try:
        from core.auth import (
            is_vertex_ai_enabled,
            get_vertex_ai_config,
            get_vertex_ai_access_token,
            get_vertex_ai_base_url,
        )
    except ImportError as e:
        print(f"✗ Failed to import auth functions: {e}")
        return False

    # Test 1: Check if Vertex AI is enabled
    print("Test 1: Vertex AI Mode")
    print("-" * 60)
    is_enabled = is_vertex_ai_enabled()
    print(f"USE_VERTEX_AI: {os.getenv('USE_VERTEX_AI', 'not set')}")
    print(f"CLAUDE_CODE_USE_VERTEX: {os.getenv('CLAUDE_CODE_USE_VERTEX', 'not set')}")
    print(f"Vertex AI enabled: {is_enabled}")

    if not is_enabled:
        print()
        print("✗ Vertex AI is not enabled")
        print("  Set USE_VERTEX_AI=true in your .env file")
        return False

    print("✓ Vertex AI mode is enabled")
    print()

    # Test 2: Validate configuration
    print("Test 2: Configuration")
    print("-" * 60)
    try:
        config = get_vertex_ai_config()
        print(f"VERTEX_PROJECT_ID: {os.getenv('VERTEX_PROJECT_ID', 'not set')}")
        print(f"ANTHROPIC_VERTEX_PROJECT_ID: {os.getenv('ANTHROPIC_VERTEX_PROJECT_ID', 'not set')}")
        print(f"VERTEX_LOCATION: {os.getenv('VERTEX_LOCATION', 'not set')}")
        print(f"CLOUD_ML_REGION: {os.getenv('CLOUD_ML_REGION', 'not set')}")
        print(f"→ Using Project ID: {config['project_id']}")
        print(f"→ Using Location: {config['location']}")
        print("✓ Configuration is valid")
    except ValueError as e:
        print(f"✗ Configuration error: {e}")
        return False
    print()

    # Test 3: Get base URL
    print("Test 3: API Endpoint")
    print("-" * 60)
    try:
        base_url = get_vertex_ai_base_url()
        print(f"Base URL: {base_url}")
        print("✓ Base URL constructed successfully")
    except Exception as e:
        print(f"✗ Failed to get base URL: {e}")
        return False
    print()

    # Test 4: Authenticate and get access token
    print("Test 4: Authentication")
    print("-" * 60)
    print("Attempting to get Google Cloud access token...")
    try:
        token = get_vertex_ai_access_token()
        print("✓ Access token obtained successfully")
        print(f"  Token type: {'OAuth 2.0' if token.startswith('ya29.') else 'Unknown'}")
        print(f"  Token length: {len(token)} characters")
    except ValueError as e:
        print(f"✗ Authentication failed: {e}")
        print()
        print("To authenticate:")
        print("  Option 1: gcloud auth application-default login")
        print("  Option 2: Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False
    print()

    # Test 5: Test full client creation
    print("Test 5: Client Creation")
    print("-" * 60)
    print("Testing create_client() with Vertex AI...")
    try:
        # Create a temporary test directory (cross-platform)
        test_dir = Path(tempfile.mkdtemp(prefix="auto-claude-vertex-test-"))

        print(f"Creating client with project_dir={test_dir}")
        client = create_client(
            project_dir=test_dir,
            spec_dir=test_dir,
            model="claude-sonnet-4-5-20250929",
            agent_type="coder",
        )
        print("✓ Client created successfully")
        print(f"  Client type: {type(client).__name__}")
    except Exception as e:
        print(f"✗ Client creation failed: {e}")
        traceback.print_exc()
        return False
    print()

    # Summary
    print("=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)
    print()
    print("Your Vertex AI integration is working correctly.")
    print("You can now use Auto-Claude with Vertex AI.")
    return True


if __name__ == "__main__":
    success = test_vertex_ai()
    sys.exit(0 if success else 1)
