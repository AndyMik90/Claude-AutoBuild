"""
Context Formatting for MemoryGraph
===================================

Format memories into readable context for agent prompts.
"""


def format_context(memories: list[dict], solutions: list[dict]) -> str:
    """
    Format memories as injectable context.

    Args:
        memories: List of memory dicts from recall/search
        solutions: List of solution memory dicts (related to problems found in memories)

    Returns:
        Formatted markdown string for injection into prompts,
        or empty string if no memories to format.
    """
    if not memories and not solutions:
        return ""

    sections = ["## Prior Knowledge\n"]
    sections.append("_Retrieved from MemoryGraph for this task:_\n")

    # Combine solutions from memories and related solutions parameter
    # Use dict to deduplicate by ID
    all_solutions: dict[str, dict] = {}

    # Add solutions from memories
    for m in memories:
        if m.get("type") == "solution":
            mem_id = m.get("id", id(m))  # Use object id as fallback
            all_solutions[mem_id] = m

    # Add related solutions (these solved previously encountered problems)
    for s in solutions:
        mem_id = s.get("id", id(s))
        if mem_id not in all_solutions:
            all_solutions[mem_id] = s

    # Format combined solutions
    if all_solutions:
        sections.append("### What's worked before\n")
        for s in list(all_solutions.values())[:3]:  # Limit to top 3
            title = s.get("title", "Unknown")
            content = s.get("content", "")[:200]  # Truncate long content
            sections.append(f"- **{title}**: {content}\n")

    # Patterns to follow
    patterns = [m for m in memories if m.get("type") == "code_pattern"]
    if patterns:
        sections.append("\n### Patterns to follow\n")
        for p in patterns[:2]:  # Limit to top 2
            content = p.get("content", "")[:150]
            sections.append(f"- {content}\n")

    # Gotchas to avoid
    problems = [
        m
        for m in memories
        if m.get("type") == "problem" and "gotcha" in (m.get("tags") or [])
    ]
    if problems:
        sections.append("\n### Watch out for\n")
        for g in problems[:2]:  # Limit to top 2
            title = g.get("title", "Unknown issue")
            content = g.get("content", "")[:150]
            sections.append(f"- **{title}**: {content}\n")

    # Only return if we have actual content beyond the header
    if len(sections) > 2:
        return "\n".join(sections)
    return ""
