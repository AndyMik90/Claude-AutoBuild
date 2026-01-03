#!/usr/bin/env python3
"""
Morph API Test Script

This script tests connectivity and basic functionality of the Morph Fast Apply API.
Run this script to verify API credentials and service availability before
implementing the full Morph integration.

Note: Morph API does not have a dedicated /health endpoint. Connectivity is tested
using HEAD requests to avoid consuming API credits.

Usage:
    # Set API key via environment variable
    export MORPH_API_KEY="your-api-key-here"
    python scripts/test_morph_api.py

    # Or pass directly
    python scripts/test_morph_api.py --api-key "your-api-key-here"

    # Test specific endpoints
    python scripts/test_morph_api.py --test connectivity  # HEAD request, no credits used
    python scripts/test_morph_api.py --test validate      # Tries validation endpoints
    python scripts/test_morph_api.py --test apply         # Full apply test (uses credits)

Requirements:
    pip install httpx

Results are printed to stdout and can be redirected to update MORPH_DISCOVERY.md
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx package required. Install with: pip install httpx")
    sys.exit(1)


# Morph API configuration
# Uses OpenAI-compatible /chat/completions endpoint
DEFAULT_BASE_URL = "https://api.morphllm.com/v1"
TIMEOUT_SECONDS = 30.0


class MorphAPITester:
    """Test harness for Morph API endpoints."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.results: list[dict[str, Any]] = []

        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=TIMEOUT_SECONDS,
        )

    def _record_result(
        self,
        test_name: str,
        success: bool,
        details: dict[str, Any],
        error: Optional[str] = None
    ) -> None:
        """Record a test result."""
        result = {
            "test": test_name,
            "success": success,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "details": details,
        }
        if error:
            result["error"] = error
        self.results.append(result)

    def test_connectivity(self) -> bool:
        """Test basic API connectivity using a HEAD request.

        Note: Morph API does not have a dedicated /health endpoint.
        We use a HEAD request to /chat/completions to verify connectivity
        without consuming API credits.
        """
        print("\n=== Testing API Connectivity ===")
        try:
            # Use HEAD request to check connectivity without consuming credits
            response = self._client.request("HEAD", "/chat/completions")

            # HEAD returning 2xx or 405 (Method Not Allowed) means the endpoint exists
            # 401/403 means auth is required (endpoint exists, key may be invalid)
            success = response.status_code in (200, 204, 401, 403, 405)

            self._record_result(
                "connectivity_check",
                success,
                {
                    "status_code": response.status_code,
                    "endpoint": f"{self.base_url}/chat/completions",
                    "method": "HEAD",
                }
            )

            print(f"  Endpoint: {self.base_url}/chat/completions (HEAD)")
            print(f"  Status Code: {response.status_code}")
            if success:
                print(f"  Result: ✓ PASSED - API endpoint is reachable")
            else:
                print(f"  Result: ✗ FAILED - Unexpected status code")

            return success

        except httpx.ConnectError as e:
            self._record_result(
                "connectivity_check",
                False,
                {"endpoint": f"{self.base_url}/chat/completions"},
                error=f"Connection error: {str(e)}"
            )
            print(f"  ERROR: Could not connect to {self.base_url}")
            print(f"  Details: {e}")
            return False
        except Exception as e:
            self._record_result(
                "connectivity_check",
                False,
                {"endpoint": f"{self.base_url}/chat/completions"},
                error=str(e)
            )
            print(f"  ERROR: {e}")
            return False

    def test_validate(self) -> bool:
        """Test API key validation endpoint."""
        print("\n=== Testing Validate Endpoint ===")

        # Try multiple possible validation endpoint paths
        endpoints_to_try = ["/auth/validate", "/validate", "/v1/auth/validate"]

        for endpoint in endpoints_to_try:
            try:
                response = self._client.get(endpoint)
                data = response.json() if response.status_code in [200, 401] else {}

                if response.status_code == 200:
                    success = data.get("valid", False)
                    self._record_result(
                        "validate_api_key",
                        success,
                        {
                            "status_code": response.status_code,
                            "response": data,
                            "endpoint": f"{self.base_url}{endpoint}",
                        }
                    )
                    print(f"  Endpoint: {self.base_url}{endpoint}")
                    print(f"  Status Code: {response.status_code}")
                    print(f"  Response: {json.dumps(data, indent=2)}")
                    print(f"  Result: {'✓ PASSED' if success else '✗ FAILED'}")
                    return success
                elif response.status_code == 401:
                    self._record_result(
                        "validate_api_key",
                        False,
                        {
                            "status_code": response.status_code,
                            "response": data,
                            "endpoint": f"{self.base_url}{endpoint}",
                        },
                        error="Invalid API key"
                    )
                    print(f"  Endpoint: {self.base_url}{endpoint}")
                    print(f"  Status Code: 401 (Unauthorized)")
                    print(f"  Result: ✗ FAILED - Invalid or expired API key")
                    return False

            except httpx.ConnectError as e:
                print(f"  Note: Could not connect to {self.base_url}{endpoint}: {e}")
                self._record_result(
                    "validate_api_key",
                    False,
                    {"endpoint": f"{self.base_url}{endpoint}"},
                    error=f"Connection error for {endpoint}: {e}"
                )
                continue
            except Exception as e:
                print(f"  Note: Error testing {self.base_url}{endpoint}: {e}")
                self._record_result(
                    "validate_api_key",
                    False,
                    {"endpoint": f"{self.base_url}{endpoint}"},
                    error=f"Error for {endpoint}: {e}"
                )
                continue

        self._record_result(
            "validate_api_key",
            False,
            {"endpoints_tried": endpoints_to_try},
            error="No validation endpoint found"
        )
        print(f"  ERROR: Could not find validation endpoint")
        print(f"  Tried: {endpoints_to_try}")
        return False

    def test_apply(self) -> bool:
        """Test apply endpoint with sample code using OpenAI-compatible format."""
        print("\n=== Testing Apply Endpoint ===")

        # Sample code for testing
        original_code = "def add(a, b):\n    return a + b"
        instruction = "Add type hints to the function"
        language = "python"

        # Build XML-formatted message content (matches morph_client.py implementation)
        message_content = (
            f"<language>{language}</language>\n"
            f"<instruction>{instruction}</instruction>\n"
            f"<code>{original_code}</code>\n"
            f"<update>{original_code}</update>"
        )

        # OpenAI-compatible chat completions payload
        test_payload = {
            "model": "auto",
            "messages": [{"role": "user", "content": message_content}],
        }

        try:
            response = self._client.post("/chat/completions", json=test_payload)
            data = response.json() if response.status_code in [200, 400, 401, 422] else {}

            # Check for OpenAI-compatible response format
            success = (
                response.status_code == 200
                and "choices" in data
                and len(data.get("choices", [])) > 0
                and "message" in data["choices"][0]
                and "content" in data["choices"][0]["message"]
            )

            self._record_result(
                "apply_code_change",
                success,
                {
                    "status_code": response.status_code,
                    "request": test_payload,
                    "response": data,
                    "endpoint": f"{self.base_url}/chat/completions",
                }
            )

            print(f"  Endpoint: {self.base_url}/chat/completions")
            print(f"  Request: {json.dumps(test_payload, indent=2)}")
            print(f"  Status Code: {response.status_code}")
            print(f"  Response: {json.dumps(data, indent=2)}")
            print(f"  Result: {'✓ PASSED' if success else '✗ FAILED'}")

            if success:
                new_content = data["choices"][0]["message"]["content"]
                print(f"\n  New Content:\n  {new_content}")

            return success

        except httpx.ConnectError as e:
            self._record_result(
                "apply_code_change",
                False,
                {"endpoint": f"{self.base_url}/chat/completions", "request": test_payload},
                error=f"Connection error: {str(e)}"
            )
            print(f"  ERROR: Could not connect to {self.base_url}")
            return False
        except Exception as e:
            self._record_result(
                "apply_code_change",
                False,
                {"endpoint": f"{self.base_url}/chat/completions", "request": test_payload},
                error=str(e)
            )
            print(f"  ERROR: {e}")
            return False

    def run_all_tests(self) -> bool:
        """Run all API tests."""
        print("=" * 60)
        print("Morph API Test Suite")
        print(f"Base URL: {self.base_url}")
        print(f"API Key: {self.api_key[:10]}..." + "*" * 20)
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}")
        print("=" * 60)

        connectivity_ok = self.test_connectivity()
        validate_ok = self.test_validate()
        apply_ok = self.test_apply()

        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"  Connectivity:  {'✓ PASSED' if connectivity_ok else '✗ FAILED'}")
        print(f"  API Validate:  {'✓ PASSED' if validate_ok else '✗ FAILED'}")
        print(f"  Apply Test:    {'✓ PASSED' if apply_ok else '✗ FAILED'}")
        print("=" * 60)

        all_passed = connectivity_ok and validate_ok and apply_ok
        print(f"\nOVERALL: {'✓ ALL TESTS PASSED' if all_passed else '✗ SOME TESTS FAILED'}")

        return all_passed

    def get_results_json(self) -> str:
        """Get test results as JSON for documentation."""
        return json.dumps({
            "test_run": {
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "base_url": self.base_url,
                "api_key_prefix": self.api_key[:10] + "...",
            },
            "results": self.results,
        }, indent=2)

    def close(self):
        """Close the HTTP client."""
        self._client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Test Morph Fast Apply API connectivity and functionality"
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("MORPH_API_KEY", ""),
        help="Morph API key (or set MORPH_API_KEY env var)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("MORPH_BASE_URL", DEFAULT_BASE_URL),
        help=f"Morph API base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--test",
        choices=["connectivity", "validate", "apply", "all"],
        default="all",
        help="Which test to run (default: all)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON",
    )

    args = parser.parse_args()

    if not args.api_key:
        print("ERROR: No API key provided.")
        print("Set MORPH_API_KEY environment variable or use --api-key argument.")
        print("\nExample:")
        print("  export MORPH_API_KEY='mk_live_xxxxx'")
        print("  python scripts/test_morph_api.py")
        sys.exit(1)

    tester = MorphAPITester(args.api_key, args.base_url)

    try:
        if args.test == "connectivity":
            success = tester.test_connectivity()
        elif args.test == "validate":
            success = tester.test_validate()
        elif args.test == "apply":
            success = tester.test_apply()
        else:
            success = tester.run_all_tests()

        if args.json:
            print("\n" + "=" * 60)
            print("JSON Results (for documentation):")
            print("=" * 60)
            print(tester.get_results_json())

        sys.exit(0 if success else 1)

    finally:
        tester.close()


if __name__ == "__main__":
    main()
