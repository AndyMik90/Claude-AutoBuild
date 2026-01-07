"""
Command Parsing Utilities
==========================

Functions for parsing and extracting commands from shell command strings.
Handles compound commands, pipes, subshells, and various shell constructs.
"""

import os
import re
import shlex


def split_command_segments(command_string: str) -> list[str]:
    """
    Split a compound command into individual command segments.

    Handles command chaining (&&, ||, ;, |, &) but respects quotes.
    """
    segments = []
    start = 0
    in_quote = None
    escaped = False
    
    i = 0
    while i < len(command_string):
        char = command_string[i]
        
        if escaped:
            escaped = False
            i += 1
            continue
            
        if char == '\\':
            escaped = True
            i += 1
            continue
            
        if in_quote:
            if char == in_quote:
                in_quote = None
        elif char in ('"', "'"):
            in_quote = char
        else:
            # Check for separators: ; | &
            if char in (';', '|', '&'):
                # Check for double chars like &&, ||
                is_double = False
                if i + 1 < len(command_string) and command_string[i+1] == char:
                    is_double = True
                
                # Check for pipe-ampersand |& (bash 4+ pipe stdout+stderr)
                # Treat it as a separator (double char)
                is_pipe_amp = False
                if char == '|' and i + 1 < len(command_string) and command_string[i+1] == '&':
                    is_pipe_amp = True
                
                # Check for redirects >& or <&
                # Note: |& is now handled as a separator above, so we only check > and <
                is_redirect = False
                if char == '&' and i > 0 and command_string[i-1] in ('>', '<'):
                    is_redirect = True
                
                if not is_redirect:
                    segment = command_string[start:i].strip()
                    if segment:
                        segments.append(segment)
                    
                    if is_double or is_pipe_amp:
                        start = i + 2
                        i += 1
                    else:
                        start = i + 1
        i += 1
        
    final_segment = command_string[start:].strip()
    if final_segment:
        segments.append(final_segment)
        
    return segments


def extract_commands(command_string: str) -> list[str]:
    """
    Extract command names from a shell command string.

    Handles pipes, command chaining (&&, ||, ;), and subshells.
    Returns the base command names (without paths).
    """
    commands = []

    try:
        # Use shlex.shlex to handle punctuation and quotes correctly.
        # punctuation_chars=True makes it treat operators like ; && | as separate tokens.
        lexer = shlex.shlex(command_string, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        # Malformed command (unclosed quotes, etc.)
        # Return empty to trigger block (fail-safe)
        return []

    if not tokens:
        return []

    # Track when we expect a command vs arguments
    expect_command = True

    for token in tokens:
        # Command separators
        if token in (";", "|", "||", "&&", "&", "|&"):
            expect_command = True
            continue

        # Skip shell keywords that precede commands
        if token in (
            "if",
            "then",
            "else",
            "elif",
            "fi",
            "for",
            "while",
            "until",
            "do",
            "done",
            "case",
            "esac",
            "in",
            "!",
            "{",
            "}",
            "(",
            ")",
            "function",
        ):
            continue

        # Skip flags/options
        if token.startswith("-"):
            continue

        # Skip variable assignments (VAR=value)
        if "=" in token and not token.startswith("="):
            continue

        # Skip here-doc markers and redirects
        if token in ("<<", "<<<", ">>", ">", "<", "2>", "2>&1", "&>", ">&"):
            continue

        if expect_command:
            # Extract the base command name (handle paths like /usr/bin/python)
            cmd = os.path.basename(token)
            commands.append(cmd)
            expect_command = False

    return commands


def get_command_for_validation(cmd: str, segments: list[str]) -> str:
    """
    Find the specific command segment that contains the given command.
    """
    for segment in segments:
        segment_commands = extract_commands(segment)
        if cmd in segment_commands:
            return segment
    return ""
