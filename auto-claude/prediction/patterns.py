"""
Common issue patterns and work type detection for bug prediction.
"""

from .models import PredictedIssue


def get_common_issues() -> dict[str, list[PredictedIssue]]:
    """
    Get common issue patterns by work type.

    Returns:
        Dictionary mapping work types to lists of predicted issues
    """
    return {
        "api_endpoint": [
            PredictedIssue(
                "integration",
                "CORS configuration missing or incorrect",
                "high",
                "Check existing CORS setup in similar endpoints and ensure new routes are included",
            ),
            PredictedIssue(
                "security",
                "Authentication middleware not applied",
                "high",
                "Verify auth decorator is applied if endpoint requires authentication",
            ),
            PredictedIssue(
                "pattern",
                "Response format doesn't match API conventions",
                "medium",
                'Check existing endpoints for response structure (e.g., {"data": ..., "error": ...})',
            ),
            PredictedIssue(
                "edge_case",
                "Missing input validation",
                "high",
                "Add validation for all user inputs to prevent invalid data and SQL injection",
            ),
            PredictedIssue(
                "edge_case",
                "Error handling not comprehensive",
                "medium",
                "Handle edge cases: missing fields, invalid types, database errors, etc.",
            ),
        ],
        "database_model": [
            PredictedIssue(
                "integration",
                "Database migration not created or run",
                "high",
                "Create migration after model changes and run db upgrade before testing",
            ),
            PredictedIssue(
                "pattern",
                "Field naming doesn't match conventions",
                "medium",
                "Check existing models for naming style (snake_case, timestamps, etc.)",
            ),
            PredictedIssue(
                "edge_case",
                "Missing indexes on frequently queried fields",
                "low",
                "Add indexes for foreign keys and fields used in WHERE clauses",
            ),
            PredictedIssue(
                "pattern",
                "Relationship configuration incorrect",
                "medium",
                "Check existing relationships for backref and cascade patterns",
            ),
        ],
        "frontend_component": [
            PredictedIssue(
                "integration",
                "API client not used correctly",
                "high",
                "Use existing ApiClient or hook pattern, don't call fetch() directly",
            ),
            PredictedIssue(
                "pattern",
                "State management doesn't follow conventions",
                "medium",
                "Follow existing hook patterns (useState, useEffect, custom hooks)",
            ),
            PredictedIssue(
                "edge_case",
                "Loading and error states not handled",
                "high",
                "Show loading indicator during async operations and display errors to users",
            ),
            PredictedIssue(
                "pattern",
                "Styling doesn't match design system",
                "low",
                "Use existing CSS classes or styled components from the design system",
            ),
            PredictedIssue(
                "edge_case",
                "Form validation missing",
                "medium",
                "Add client-side validation before submission and show helpful error messages",
            ),
        ],
        "celery_task": [
            PredictedIssue(
                "integration",
                "Task not registered with Celery app",
                "high",
                "Import task in celery app initialization or __init__.py",
            ),
            PredictedIssue(
                "pattern",
                "Arguments not JSON-serializable",
                "high",
                "Use only JSON-serializable arguments (no objects, use IDs instead)",
            ),
            PredictedIssue(
                "edge_case",
                "Retry logic not implemented",
                "medium",
                "Add retry decorator for network/external service failures",
            ),
            PredictedIssue(
                "integration",
                "Task not called from correct location",
                "medium",
                "Call with .delay() or .apply_async() after database commit",
            ),
        ],
        "authentication": [
            PredictedIssue(
                "security",
                "Password not hashed",
                "high",
                "Use bcrypt or similar for password hashing, never store plaintext",
            ),
            PredictedIssue(
                "security",
                "Token not validated properly",
                "high",
                "Verify token signature and expiration on every request",
            ),
            PredictedIssue(
                "security",
                "Session not invalidated on logout",
                "medium",
                "Clear session/token on logout and after password changes",
            ),
        ],
        "database_query": [
            PredictedIssue(
                "performance",
                "N+1 query problem",
                "medium",
                "Use eager loading (joinedload/selectinload) for relationships",
            ),
            PredictedIssue(
                "security",
                "SQL injection vulnerability",
                "high",
                "Use parameterized queries, never concatenate user input into SQL",
            ),
            PredictedIssue(
                "edge_case",
                "Large result sets not paginated",
                "medium",
                "Add pagination for queries that could return many results",
            ),
        ],
        "file_upload": [
            PredictedIssue(
                "security",
                "File type not validated",
                "high",
                "Validate file extension and MIME type, don't trust user input",
            ),
            PredictedIssue(
                "security",
                "File size not limited",
                "high",
                "Set maximum file size to prevent DoS attacks",
            ),
            PredictedIssue(
                "edge_case",
                "Uploaded files not cleaned up on error",
                "low",
                "Use try/finally or context managers to ensure cleanup",
            ),
        ],
    }


def detect_work_type(subtask: dict) -> list[str]:
    """
    Detect what type of work this subtask involves.

    Args:
        subtask: Subtask dictionary with keys like description, files_to_modify, etc.

    Returns:
        List of work types (e.g., ["api_endpoint", "database_model"])
    """
    work_types = []

    description = subtask.get("description", "").lower()
    files = subtask.get("files_to_modify", []) + subtask.get("files_to_create", [])
    service = subtask.get("service", "").lower()

    # API endpoint detection
    if any(
        kw in description for kw in ["endpoint", "api", "route", "request", "response"]
    ):
        work_types.append("api_endpoint")
    if any("routes" in f or "api" in f for f in files):
        work_types.append("api_endpoint")

    # Database model detection
    if any(kw in description for kw in ["model", "database", "migration", "schema"]):
        work_types.append("database_model")
    if any("models" in f or "migration" in f for f in files):
        work_types.append("database_model")

    # Frontend component detection
    if service in ["frontend", "web", "ui"]:
        work_types.append("frontend_component")
    if any(f.endswith((".tsx", ".jsx", ".vue", ".svelte")) for f in files):
        work_types.append("frontend_component")

    # Celery task detection
    if "celery" in description or "task" in description or "worker" in service:
        work_types.append("celery_task")
    if any("task" in f for f in files):
        work_types.append("celery_task")

    # Authentication detection
    if any(
        kw in description for kw in ["auth", "login", "password", "token", "session"]
    ):
        work_types.append("authentication")

    # Database query detection
    if any(kw in description for kw in ["query", "search", "filter", "fetch"]):
        work_types.append("database_query")

    # File upload detection
    if any(kw in description for kw in ["upload", "file", "image", "attachment"]):
        work_types.append("file_upload")

    return work_types
