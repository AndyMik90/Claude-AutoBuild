"""
Custom exception hierarchy for Auto-Claude
Issue #485: Replace broad Exception handlers with specific exceptions
"""


class AutoClaudeError(Exception):
    """Base exception for all Auto-Claude errors."""
    pass


class ConfigurationError(AutoClaudeError):
    """Configuration-related errors (missing tokens, invalid paths, etc.)."""
    pass


class WorkspaceError(AutoClaudeError):
    """Git worktree and workspace management errors."""
    pass


class SecurityError(AutoClaudeError):
    """Security validation failures."""
    pass


class AgentError(AutoClaudeError):
    """Agent execution errors."""
    pass


class MemoryError(AutoClaudeError):
    """Graphiti memory system errors."""
    pass


class SpecError(AutoClaudeError):
    """Spec creation and validation errors."""
    pass


class MCPServerError(AutoClaudeError):
    """MCP server configuration and execution errors."""
    pass


class FileOperationError(AutoClaudeError):
    """File I/O and path operation errors."""
    pass


class ValidationError(AutoClaudeError):
    """Input validation errors."""
    pass
