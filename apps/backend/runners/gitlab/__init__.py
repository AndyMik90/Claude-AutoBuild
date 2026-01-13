"""
GitLab Automation Runner
=========================

CLI interface for GitLab automation features:
- MR Review: AI-powered merge request review
- Follow-up Review: Review changes since last review
"""

from .runner import main

__all__ = ["main"]
