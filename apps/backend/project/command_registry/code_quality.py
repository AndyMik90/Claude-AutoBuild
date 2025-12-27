"""
Code Quality Commands Module
============================

Commands for linters, formatters, security scanners, and code analysis tools.
"""


# =============================================================================
# CODE QUALITY COMMANDS
# =============================================================================

CODE_QUALITY_COMMANDS: dict[str, set[str]] = {
    "shellcheck": {"shellcheck"},
    "hadolint": {"hadolint"},
    "actionlint": {"actionlint"},
    "yamllint": {"yamllint"},
    "jsonlint": {"jsonlint"},
    "markdownlint": {"markdownlint", "markdownlint-cli"},
    "vale": {"vale"},
    "cspell": {"cspell"},
    "codespell": {"codespell"},
    "cloc": {"cloc"},
    "scc": {"scc"},
    "tokei": {"tokei"},
    "git-secrets": {"git-secrets"},
    "gitleaks": {"gitleaks"},
    "trufflehog": {"trufflehog"},
    "detect-secrets": {"detect-secrets"},
    "semgrep": {"semgrep"},
    "snyk": {"snyk"},
    "trivy": {"trivy"},
    "grype": {"grype"},
    "syft": {"syft"},
    "dockle": {"dockle"},
}


__all__ = ["CODE_QUALITY_COMMANDS"]
