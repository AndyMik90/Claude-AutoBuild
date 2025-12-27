"""
JavaScript/TypeScript-specific semantic analysis using tree-sitter.
"""

from __future__ import annotations

from collections.abc import Callable

from .models import ExtractedElement

try:
    from tree_sitter import Node
except ImportError:
    Node = None


def extract_js_elements(
    node: Node,
    elements: dict[str, ExtractedElement],
    get_text: Callable[[Node], str],
    get_line: Callable[[int], int],
    ext: str,
    parent: str | None = None,
) -> None:
    """
    Extract structural elements from JavaScript/TypeScript AST.

    Args:
        node: The tree-sitter node to extract from
        elements: Dictionary to populate with extracted elements
        get_text: Function to extract text from a node
        get_line: Function to convert byte position to line number
        ext: File extension (.js, .jsx, .ts, .tsx)
        parent: Parent element name for nested elements
    """
    for child in node.children:
        if child.type == "import_statement":
            text = get_text(child)
            # Try to extract the source module
            source_node = child.child_by_field_name("source")
            if source_node:
                source = get_text(source_node).strip("'\"")
                elements[f"import:{source}"] = ExtractedElement(
                    element_type="import",
                    name=source,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=text,
                )

        elif child.type in {"function_declaration", "function"}:
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

        elif child.type == "arrow_function":
            # Arrow functions are usually assigned to variables
            # We'll catch these via variable declarations
            pass

        elif child.type in {"lexical_declaration", "variable_declaration"}:
            # const/let/var declarations
            for declarator in child.children:
                if declarator.type == "variable_declarator":
                    name_node = declarator.child_by_field_name("name")
                    value_node = declarator.child_by_field_name("value")
                    if name_node:
                        name = get_text(name_node)
                        content = get_text(child)

                        # Check if it's a function (arrow function or function expression)
                        is_function = False
                        if value_node and value_node.type in {
                            "arrow_function",
                            "function",
                        }:
                            is_function = True
                            elements[f"function:{name}"] = ExtractedElement(
                                element_type="function",
                                name=name,
                                start_line=get_line(child.start_byte),
                                end_line=get_line(child.end_byte),
                                content=content,
                                parent=parent,
                            )
                        else:
                            elements[f"variable:{name}"] = ExtractedElement(
                                element_type="variable",
                                name=name,
                                start_line=get_line(child.start_byte),
                                end_line=get_line(child.end_byte),
                                content=content,
                                parent=parent,
                            )

        elif child.type == "class_declaration":
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
                # Recurse into class body
                body = child.child_by_field_name("body")
                if body:
                    extract_js_elements(
                        body, elements, get_text, get_line, ext, parent=name
                    )

        elif child.type == "method_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                name = get_text(name_node)
                full_name = f"{parent}.{name}" if parent else name
                elements[f"method:{full_name}"] = ExtractedElement(
                    element_type="method",
                    name=full_name,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=get_text(child),
                    parent=parent,
                )

        elif child.type == "export_statement":
            # Recurse into exports to find the actual declaration
            extract_js_elements(child, elements, get_text, get_line, ext, parent)

        # TypeScript specific
        elif child.type in {"interface_declaration", "type_alias_declaration"}:
            name_node = child.child_by_field_name("name")
            if name_node:
                name = get_text(name_node)
                elem_type = "interface" if "interface" in child.type else "type"
                elements[f"{elem_type}:{name}"] = ExtractedElement(
                    element_type=elem_type,
                    name=name,
                    start_line=get_line(child.start_byte),
                    end_line=get_line(child.end_byte),
                    content=get_text(child),
                )

        # Recurse into statement blocks
        elif child.type in {"program", "statement_block", "class_body"}:
            extract_js_elements(child, elements, get_text, get_line, ext, parent)
