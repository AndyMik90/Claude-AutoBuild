"""
Python-specific semantic analysis using tree-sitter.
"""

from __future__ import annotations

from collections.abc import Callable

from .models import ExtractedElement

try:
    from tree_sitter import Node
except ImportError:
    Node = None


def extract_python_elements(
    node: Node,
    elements: dict[str, ExtractedElement],
    get_text: Callable[[Node], str],
    get_line: Callable[[int], int],
    parent: str | None = None,
) -> None:
    """
    Extract structural elements from Python AST.

    Args:
        node: The tree-sitter node to extract from
        elements: Dictionary to populate with extracted elements
        get_text: Function to extract text from a node
        get_line: Function to convert byte position to line number
        parent: Parent element name for nested elements
    """
    for child in node.children:
        if child.type == "import_statement":
            # import x, y
            text = get_text(child)
            # Extract module names
            for name_node in child.children:
                if name_node.type == "dotted_name":
                    name = get_text(name_node)
                    elements[f"import:{name}"] = ExtractedElement(
                        element_type="import",
                        name=name,
                        start_line=get_line(child.start_byte),
                        end_line=get_line(child.end_byte),
                        content=text,
                    )

        elif child.type == "import_from_statement":
            # from x import y, z
            text = get_text(child)
            module = None
            for sub in child.children:
                if sub.type == "dotted_name":
                    module = get_text(sub)
                    break
            if module:
                elements[f"import_from:{module}"] = ExtractedElement(
                    element_type="import_from",
                    name=module,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=text,
                )

        elif child.type == "function_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                name = get_text(name_node)
                full_name = f"{parent}.{name}" if parent else name
                elements[f"function:{full_name}"] = ExtractedElement(
                    element_type="function",
                    name=full_name,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=get_text(child),
                    parent=parent,
                )

        elif child.type == "class_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                name = get_text(name_node)
                elements[f"class:{name}"] = ExtractedElement(
                    element_type="class",
                    name=name,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=get_text(child),
                )
                # Recurse into class body for methods
                body = child.child_by_field_name("body")
                if body:
                    extract_python_elements(
                        body, elements, get_text, get_line, parent=name
                    )

        elif child.type == "decorated_definition":
            # Handle decorated functions/classes
            for sub in child.children:
                if sub.type in {"function_definition", "class_definition"}:
                    extract_python_elements(child, elements, get_text, get_line, parent)
                    break

        # Recurse for other compound statements
        elif child.type in {
            "if_statement",
            "while_statement",
            "for_statement",
            "try_statement",
            "with_statement",
        }:
            extract_python_elements(child, elements, get_text, get_line, parent)
