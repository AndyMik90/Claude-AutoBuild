"""
Element comparison and change classification logic.
"""

from __future__ import annotations

import re

from ..types import ChangeType, SemanticChange
from .models import ExtractedElement


def compare_elements(
    before: dict[str, ExtractedElement],
    after: dict[str, ExtractedElement],
    ext: str,
) -> list[SemanticChange]:
    """
    Compare extracted elements to generate semantic changes.

    Args:
        before: Elements extracted from the before version
        after: Elements extracted from the after version
        ext: File extension for language-specific classification

    Returns:
        List of semantic changes
    """
    changes: list[SemanticChange] = []

    all_keys = set(before.keys()) | set(after.keys())

    for key in all_keys:
        elem_before = before.get(key)
        elem_after = after.get(key)

        if elem_before and not elem_after:
            # Element was removed
            change_type = get_remove_change_type(elem_before.element_type)
            changes.append(
                SemanticChange(
                    change_type=change_type,
                    target=elem_before.name,
                    location=get_location(elem_before),
                    line_start=elem_before.start_line,
                    line_end=elem_before.end_line,
                    content_before=elem_before.content,
                    content_after=None,
                )
            )

        elif not elem_before and elem_after:
            # Element was added
            change_type = get_add_change_type(elem_after.element_type)
            changes.append(
                SemanticChange(
                    change_type=change_type,
                    target=elem_after.name,
                    location=get_location(elem_after),
                    line_start=elem_after.start_line,
                    line_end=elem_after.end_line,
                    content_before=None,
                    content_after=elem_after.content,
                )
            )

        elif elem_before and elem_after:
            # Element exists in both - check if modified
            if elem_before.content != elem_after.content:
                change_type = classify_modification(elem_before, elem_after, ext)
                changes.append(
                    SemanticChange(
                        change_type=change_type,
                        target=elem_after.name,
                        location=get_location(elem_after),
                        line_start=elem_after.start_line,
                        line_end=elem_after.end_line,
                        content_before=elem_before.content,
                        content_after=elem_after.content,
                    )
                )

    return changes


def get_add_change_type(element_type: str) -> ChangeType:
    """
    Map element type to add change type.

    Args:
        element_type: Type of the element (function, class, import, etc.)

    Returns:
        Corresponding ChangeType for addition
    """
    mapping = {
        "import": ChangeType.ADD_IMPORT,
        "import_from": ChangeType.ADD_IMPORT,
        "function": ChangeType.ADD_FUNCTION,
        "class": ChangeType.ADD_CLASS,
        "method": ChangeType.ADD_METHOD,
        "variable": ChangeType.ADD_VARIABLE,
        "interface": ChangeType.ADD_INTERFACE,
        "type": ChangeType.ADD_TYPE,
    }
    return mapping.get(element_type, ChangeType.UNKNOWN)


def get_remove_change_type(element_type: str) -> ChangeType:
    """
    Map element type to remove change type.

    Args:
        element_type: Type of the element (function, class, import, etc.)

    Returns:
        Corresponding ChangeType for removal
    """
    mapping = {
        "import": ChangeType.REMOVE_IMPORT,
        "import_from": ChangeType.REMOVE_IMPORT,
        "function": ChangeType.REMOVE_FUNCTION,
        "class": ChangeType.REMOVE_CLASS,
        "method": ChangeType.REMOVE_METHOD,
        "variable": ChangeType.REMOVE_VARIABLE,
    }
    return mapping.get(element_type, ChangeType.UNKNOWN)


def get_location(element: ExtractedElement) -> str:
    """
    Generate a location string for an element.

    Args:
        element: The element to generate location for

    Returns:
        Location string in format "element_type:name" or "element_type:parent.name"
    """
    if element.parent:
        return f"{element.element_type}:{element.parent}.{element.name.split('.')[-1]}"
    return f"{element.element_type}:{element.name}"


def classify_modification(
    before: ExtractedElement,
    after: ExtractedElement,
    ext: str,
) -> ChangeType:
    """
    Classify what kind of modification was made.

    Args:
        before: Element before modification
        after: Element after modification
        ext: File extension for language-specific classification

    Returns:
        ChangeType describing the modification
    """
    element_type = after.element_type

    if element_type == "import":
        return ChangeType.MODIFY_IMPORT

    if element_type in {"function", "method"}:
        # Analyze the function content for specific changes
        return classify_function_modification(before.content, after.content, ext)

    if element_type == "class":
        return ChangeType.MODIFY_CLASS

    if element_type == "interface":
        return ChangeType.MODIFY_INTERFACE

    if element_type == "type":
        return ChangeType.MODIFY_TYPE

    if element_type == "variable":
        return ChangeType.MODIFY_VARIABLE

    return ChangeType.UNKNOWN


def classify_function_modification(
    before: str,
    after: str,
    ext: str,
) -> ChangeType:
    """
    Classify what changed in a function.

    Args:
        before: Function content before changes
        after: Function content after changes
        ext: File extension for language-specific classification

    Returns:
        Specific ChangeType for the function modification
    """
    # Check for React hook additions
    hook_pattern = r"\buse[A-Z]\w*\s*\("
    hooks_before = set(re.findall(hook_pattern, before))
    hooks_after = set(re.findall(hook_pattern, after))

    if hooks_after - hooks_before:
        return ChangeType.ADD_HOOK_CALL
    if hooks_before - hooks_after:
        return ChangeType.REMOVE_HOOK_CALL

    # Check for JSX wrapping (more JSX elements in after)
    jsx_pattern = r"<[A-Z]\w*"
    jsx_before = len(re.findall(jsx_pattern, before))
    jsx_after = len(re.findall(jsx_pattern, after))

    if jsx_after > jsx_before:
        return ChangeType.WRAP_JSX
    if jsx_after < jsx_before:
        return ChangeType.UNWRAP_JSX

    # Check if only JSX props changed
    if ext in {".jsx", ".tsx"}:
        # Simplified check - if the structure is same but content differs
        struct_before = re.sub(r'=\{[^}]*\}|="[^"]*"', "=...", before)
        struct_after = re.sub(r'=\{[^}]*\}|="[^"]*"', "=...", after)
        if struct_before == struct_after:
            return ChangeType.MODIFY_JSX_PROPS

    return ChangeType.MODIFY_FUNCTION
