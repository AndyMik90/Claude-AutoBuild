"""
Data models for semantic analysis.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ExtractedElement:
    """A structural element extracted from code."""

    element_type: str  # function, class, import, variable, etc.
    name: str
    start_line: int
    end_line: int
    content: str
    parent: str | None = None  # For nested elements (methods in classes)
    metadata: dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
