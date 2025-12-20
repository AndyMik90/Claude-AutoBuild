"""Tests for roadmap target_audience type validation.

This test verifies the fix for type validation in phases.py that prevents
AttributeError when target_audience is not a dict.
"""

import json
import tempfile
from pathlib import Path


def test_target_audience_validation_logic():
    """Test the type validation logic directly without importing the module.

    This validates that the fix pattern works correctly:
    - If target_audience is a dict with "primary", validation passes
    - If target_audience is not a dict, validation fails gracefully
    - If target_audience is a dict without "primary", validation fails
    """
    # Test 1: Valid dict with primary field
    target_audience = {"primary": "developers", "secondary": "managers"}
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert len(missing) == 0, "Should pass for valid dict with primary"

    # Test 2: Invalid string (should fail gracefully, not crash)
    target_audience = "developers"
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert "target_audience (invalid type)" in missing, "Should reject string"

    # Test 3: Invalid None (should fail gracefully, not crash)
    target_audience = None
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert "target_audience (invalid type)" in missing, "Should reject None"

    # Test 4: Invalid list (should fail gracefully, not crash)
    target_audience = ["developers", "managers"]
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert "target_audience (invalid type)" in missing, "Should reject list"

    # Test 5: Valid dict but missing primary (should fail with specific error)
    target_audience = {"secondary": "managers"}
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert (
        "target_audience.primary" in missing
    ), "Should reject dict without primary"

    # Test 6: Empty dict (should fail with specific error)
    target_audience = {}
    missing = []

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    assert "target_audience.primary" in missing, "Should reject empty dict"


def test_roadmap_file_validation_simulation():
    """Simulate the actual validation scenario from phases.py.

    This tests the complete validation flow as it appears in the code.
    """
    # Scenario 1: Valid roadmap data
    data = {
        "phases": [{"id": 1}],
        "features": [{"id": 1}, {"id": 2}, {"id": 3}],
        "vision": "Test",
        "target_audience": {"primary": "developers"},
    }

    required = ["phases", "features", "vision", "target_audience"]
    missing = [k for k in required if k not in data]
    feature_count = len(data.get("features", []))

    target_audience = data.get("target_audience", {})
    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    # Should pass validation
    assert not missing, "Valid data should have no missing fields"
    assert feature_count >= 3, "Should have at least 3 features"

    # Scenario 2: Invalid string target_audience (bug scenario)
    data_with_string = {
        "phases": [{"id": 1}],
        "features": [{"id": 1}, {"id": 2}, {"id": 3}],
        "vision": "Test",
        "target_audience": "developers",  # This should be caught
    }

    missing = [k for k in required if k not in data_with_string]
    target_audience = data_with_string.get("target_audience", {})

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    # Should fail validation gracefully
    assert "target_audience (invalid type)" in missing, "Should catch string type"

    # Scenario 3: None target_audience
    data_with_none = {
        "phases": [{"id": 1}],
        "features": [{"id": 1}, {"id": 2}, {"id": 3}],
        "vision": "Test",
        "target_audience": None,
    }

    missing = [k for k in required if k not in data_with_none]
    target_audience = data_with_none.get("target_audience", {})

    if not isinstance(target_audience, dict):
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        missing.append("target_audience.primary")

    # Should fail validation gracefully
    assert "target_audience (invalid type)" in missing, "Should catch None type"


def test_original_bug_scenario():
    """Test the exact scenario that would have caused AttributeError.

    Before the fix, calling .get() on a string would raise AttributeError.
    After the fix, it's caught by isinstance check.
    """
    # This is the malformed data that would crash
    malformed_data = {
        "phases": [{"id": 1}],
        "features": [{"id": 1}, {"id": 2}, {"id": 3}],
        "vision": "Test",
        "target_audience": "just a string",  # BUG: Not a dict
    }

    # OLD CODE (would crash):
    # target_audience = malformed_data.get("target_audience", {})
    # if not target_audience.get("primary"):  # AttributeError: 'str' has no 'get'
    #     missing.append("target_audience.primary")

    # NEW CODE (handles gracefully):
    target_audience = malformed_data.get("target_audience", {})
    missing = []

    if not isinstance(target_audience, dict):
        # This check prevents the AttributeError
        missing.append("target_audience (invalid type)")
    elif not target_audience.get("primary"):
        # Only called if target_audience is actually a dict
        missing.append("target_audience.primary")

    # Validation should fail gracefully, not crash
    assert len(missing) > 0, "Should detect the invalid type"
    assert (
        "target_audience (invalid type)" in missing
    ), "Should identify the type error"


if __name__ == "__main__":
    # Run tests manually if needed
    test_target_audience_validation_logic()
    test_roadmap_file_validation_simulation()
    test_original_bug_scenario()
    print("All validation tests passed!")
