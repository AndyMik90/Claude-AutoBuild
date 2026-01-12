"""Tests for git provider detection."""

import subprocess
import tempfile
from pathlib import Path

import pytest

from apps.backend.core.git_provider import (
    GitProvider,
    detect_provider_from_remote,
    get_provider_config,
)


def test_detect_github_from_https():
    """Test GitHub detection from HTTPS URL."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://github.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert detect_provider_from_remote(project_dir) == GitProvider.GITHUB


def test_detect_github_from_ssh():
    """Test GitHub detection from SSH URL."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            ["git", "remote", "add", "origin", "git@github.com:user/repo.git"],
            cwd=project_dir,
            check=True,
        )
        assert detect_provider_from_remote(project_dir) == GitProvider.GITHUB


def test_detect_gitlab_from_https():
    """Test GitLab detection from HTTPS URL."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://gitlab.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert detect_provider_from_remote(project_dir) == GitProvider.GITLAB


def test_detect_gitlab_from_ssh():
    """Test GitLab detection from SSH URL."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            ["git", "remote", "add", "origin", "git@gitlab.com:user/repo.git"],
            cwd=project_dir,
            check=True,
        )
        assert detect_provider_from_remote(project_dir) == GitProvider.GITLAB


def test_detect_self_hosted_gitlab():
    """Test GitLab detection from self-hosted instance."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://gitlab.mycompany.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert detect_provider_from_remote(project_dir) == GitProvider.GITLAB


def test_provider_config_explicit_github():
    """Test explicit GitHub selection overrides auto-detect."""
    # Even if remote is GitLab, explicit setting wins
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://gitlab.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert get_provider_config(project_dir, "github") == GitProvider.GITHUB


def test_provider_config_explicit_gitlab():
    """Test explicit GitLab selection overrides auto-detect."""
    # Even if remote is GitHub, explicit setting wins
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://github.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert get_provider_config(project_dir, "gitlab") == GitProvider.GITLAB


def test_provider_config_auto_detect_gitlab():
    """Test auto-detect falls back to detection logic for GitLab."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://gitlab.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert get_provider_config(project_dir, "auto") == GitProvider.GITLAB


def test_provider_config_auto_detect_github():
    """Test auto-detect falls back to detection logic for GitHub."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://github.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        assert get_provider_config(project_dir, "auto") == GitProvider.GITHUB


def test_provider_config_fallback_to_github():
    """Test fallback to GitHub when no remote."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        # No remote configured
        assert get_provider_config(project_dir, None) == GitProvider.GITHUB
        assert get_provider_config(project_dir, "auto") == GitProvider.GITHUB


def test_provider_config_invalid_setting():
    """Test that invalid setting falls back to auto-detect."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        subprocess.run(["git", "init"], cwd=project_dir, check=True)
        subprocess.run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://gitlab.com/user/repo.git",
            ],
            cwd=project_dir,
            check=True,
        )
        # Invalid setting should fall back to auto-detect
        assert get_provider_config(project_dir, "invalid") == GitProvider.GITLAB


def test_detect_no_git_repo():
    """Test that non-git directory defaults to GitHub."""
    with tempfile.TemporaryDirectory() as tmpdir:
        project_dir = Path(tmpdir)
        # Don't init git - should default to GitHub
        assert detect_provider_from_remote(project_dir) == GitProvider.GITHUB
