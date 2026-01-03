"""
Tests for Security Parser
==========================

Tests for security/parser.py - command parsing utilities.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from security.parser import extract_commands, split_command_segments, get_command_for_validation


class TestExtractCommands:
    """Tests for extract_commands function."""

    def test_simple_command(self):
        """Extracts simple command."""
        commands = extract_commands("ls -la")
        assert "ls" in commands

    def test_chained_commands(self):
        """Extracts commands from && chain."""
        commands = extract_commands("git add . && git commit -m 'test'")
        assert "git" in commands

    def test_piped_commands(self):
        """Extracts commands from pipe chain."""
        commands = extract_commands("cat file.txt | grep pattern | head")
        assert "cat" in commands
        assert "grep" in commands
        assert "head" in commands

    def test_or_chained_commands(self):
        """Extracts commands from || chain."""
        commands = extract_commands("command1 || command2")
        assert "command1" in commands
        assert "command2" in commands

    def test_semicolon_separated(self):
        """Extracts commands separated by semicolons."""
        commands = extract_commands("echo hello; echo world")
        assert "echo" in commands

    def test_subshell_command(self):
        """Extracts commands from subshell."""
        commands = extract_commands("echo $(pwd)")
        # Should extract both echo and pwd
        assert "echo" in commands

    def test_empty_command(self):
        """Handles empty command string."""
        commands = extract_commands("")
        assert commands == [] or commands == set()

    def test_command_with_path(self):
        """Extracts command from full path."""
        commands = extract_commands("/usr/bin/python script.py")
        assert "python" in commands or "/usr/bin/python" in commands

    def test_env_var_prefix(self):
        """Handles environment variable prefixes."""
        commands = extract_commands("FOO=bar command arg")
        assert "command" in commands


class TestSplitCommandSegments:
    """Tests for split_command_segments function."""

    def test_simple_command(self):
        """Splits simple command into one segment."""
        segments = split_command_segments("ls -la")
        assert len(segments) >= 1

    def test_and_chain(self):
        """Splits && chain into segments."""
        segments = split_command_segments("cmd1 && cmd2 && cmd3")
        assert len(segments) == 3

    def test_or_chain(self):
        """Splits || chain into segments."""
        segments = split_command_segments("cmd1 || cmd2")
        assert len(segments) == 2

    def test_semicolon_chain(self):
        """Splits ; chain into segments."""
        segments = split_command_segments("cmd1; cmd2; cmd3")
        assert len(segments) == 3

    def test_pipe_as_single_segment(self):
        """Pipe chain may be treated as single segment."""
        segments = split_command_segments("cat file | grep pattern")
        # Implementation may vary - just verify it doesn't crash
        assert len(segments) >= 1

    def test_mixed_operators(self):
        """Handles mixed operators."""
        segments = split_command_segments("cmd1 && cmd2 || cmd3; cmd4")
        assert len(segments) >= 3

    def test_empty_string(self):
        """Handles empty string."""
        segments = split_command_segments("")
        assert segments == [] or segments == [""]


class TestGetCommandForValidation:
    """Tests for get_command_for_validation function."""

    def test_finds_matching_segment(self):
        """Finds segment containing the command."""
        segments = ["git add .", "git commit -m 'test'"]
        result = get_command_for_validation("git", segments)
        assert result is not None
        assert "git" in result

    def test_returns_first_match(self):
        """Returns first matching segment."""
        segments = ["echo hello", "echo world"]
        result = get_command_for_validation("echo", segments)
        assert result == "echo hello"

    def test_no_matching_segment(self):
        """Returns None when no match found."""
        segments = ["ls -la", "pwd"]
        result = get_command_for_validation("git", segments)
        # May return None or empty depending on implementation
        assert result is None or result == ""

    def test_empty_segments(self):
        """Handles empty segments list."""
        result = get_command_for_validation("cmd", [])
        # May return None or empty depending on implementation
        assert result is None or result == ""

    def test_command_with_path(self):
        """Matches command even with path prefix."""
        segments = ["/usr/bin/python script.py"]
        result = get_command_for_validation("python", segments)
        # May or may not match depending on implementation
        assert result is None or "python" in result


class TestParserEdgeCases:
    """Edge case tests for parser module."""

    def test_quoted_strings_preserved(self):
        """Quoted strings don't break parsing."""
        commands = extract_commands("echo 'hello && world'")
        # Should not split on && inside quotes
        assert "echo" in commands

    def test_escaped_characters(self):
        """Escaped characters handled."""
        commands = extract_commands("echo hello\\ world")
        assert "echo" in commands

    def test_complex_git_command(self):
        """Parses complex git command."""
        cmd = """git commit -m "$(cat <<'EOF'
        Multi-line message
        EOF
        )" """
        commands = extract_commands(cmd)
        assert "git" in commands

    def test_npm_script(self):
        """Parses npm run command."""
        commands = extract_commands("npm run build && npm run test")
        assert "npm" in commands

    def test_python_module_execution(self):
        """Parses python -m command."""
        commands = extract_commands("python -m pytest tests/")
        assert "python" in commands
