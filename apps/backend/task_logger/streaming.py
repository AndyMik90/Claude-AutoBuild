"""
Streaming marker functionality for real-time UI updates.
"""

import json


def emit_marker(marker_type: str, data: dict, enabled: bool = True) -> None:
    """
    Emit a streaming marker to stdout for UI consumption.

    Args:
        marker_type: Type of marker (e.g., "PHASE_START", "TOOL_END")
        data: Data to include in the marker
        enabled: Whether marker emission is enabled
    """
    if not enabled:
        return
    try:
        marker = f"__TASK_LOG_{marker_type.upper()}__:{json.dumps(data)}"
        print(marker, flush=True)
    except Exception:
        pass  # Don't let marker emission break logging
