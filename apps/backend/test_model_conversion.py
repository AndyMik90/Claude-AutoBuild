#!/usr/bin/env python3
"""Test model name conversion for Vertex AI compatibility."""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from core.auth import (
    is_vertex_ai_enabled,
    get_vertex_ai_config,
    get_vertex_ai_access_token,
    convert_model_for_vertex
)

print("=" * 70)
print("Model Conversion Test - Vertex AI Compatibility")
print("=" * 70)
print()

print("=== Configuration ===")
enabled = is_vertex_ai_enabled()
print("Vertex AI enabled:", enabled)
if enabled:
    config = get_vertex_ai_config()
    print("Project:", config["project_id"])
    print("Location:", config["location"])
print()

print("=== Model Conversion Tests ===")
test_cases = [
    ("claude-sonnet-4-5-20250929", "claude-sonnet-4-5@20250929"),
    ("claude-opus-4-5-20251101", "claude-opus-4-5@20251101"),
    ("claude-haiku-4-5-20251001", "claude-haiku-4-5@20251001"),
    ("claude-sonnet-4-5@20250929", "claude-sonnet-4-5@20250929"),  # Already @ format
    ("custom-model", "custom-model"),  # Non-standard
]

all_passed = True
for input_model, expected in test_cases:
    output = convert_model_for_vertex(input_model)
    status = "PASS" if output == expected else "FAIL"
    print(status, input_model.ljust(35), "->", output.ljust(35), "(expected:", expected + ")")
    if output != expected:
        all_passed = False

print()

if is_vertex_ai_enabled():
    print("=== Testing API Call with Converted Model ===")
    try:
        import requests

        config = get_vertex_ai_config()
        token = get_vertex_ai_access_token()
        test_model = "claude-sonnet-4-5-20250929"  # Standard Anthropic format
        converted_model = convert_model_for_vertex(test_model)

        url = (
            "https://" + config['location'] + "-aiplatform.googleapis.com/v1"
            "/projects/" + config['project_id'] + "/locations/" + config['location'] +
            "/publishers/anthropic/models/" + converted_model + ":streamRawPredict"
        )

        print("Model:", test_model, "->", converted_model)
        print("URL: .../" + converted_model + ":streamRawPredict")
        print()

        response = requests.post(
            url,
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            json={
                "anthropic_version": "vertex-2023-10-16",
                "messages": [{"role": "user", "content": "Say hello"}],
                "max_tokens": 5
            },
            timeout=10
        )

        print("Status:", response.status_code)
        if response.status_code == 200:
            print("SUCCESS - Vertex AI API working with auto-converted model!")
            data = response.json()
            print("Response:", data['content'][0]['text'])
        else:
            print("API Error:", response.text[:300])
            all_passed = False

    except Exception as e:
        print("Test failed:", str(e))
        all_passed = False

print()
print("=" * 70)
if all_passed:
    print("All tests passed!")
    print("=" * 70)
    print()
    print("Summary:")
    print("- Model names auto-convert from Anthropic format to Vertex AI format")
    print("- Same config works with both direct Anthropic API and Vertex AI")
    print("- No need to change model names when switching between APIs")
else:
    print("Some tests failed")
    print("=" * 70)
    sys.exit(1)
