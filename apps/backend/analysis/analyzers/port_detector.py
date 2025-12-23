"""
Port Detector Module
====================

Detects application ports from multiple sources including entry points,
environment files, Docker Compose, configuration files, and scripts.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .base import BaseAnalyzer


class PortDetector(BaseAnalyzer):
    """Detects application ports from various configuration sources."""

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect_port_from_sources(self, default_port: int) -> int:
        """
        Robustly detect the actual port by checking multiple sources.

        Checks in order of priority:
        1. Entry point files (app.py, main.py, etc.) for uvicorn.run(), app.run(), etc.
        2. Environment files (.env, .env.local, .env.development)
        3. Docker Compose port mappings
        4. Configuration files (config.py, settings.py, etc.)
        5. Package.json scripts (for Node.js)
        6. Makefile/shell scripts
        7. Falls back to default_port if nothing found

        Args:
            default_port: The framework's conventional default port

        Returns:
            Detected port or default_port if not found
        """
        # 1. Check entry point files for explicit port definitions
        port = self._detect_port_in_entry_points()
        if port:
            return port

        # 2. Check environment files
        port = self._detect_port_in_env_files()
        if port:
            return port

        # 3. Check Docker Compose
        port = self._detect_port_in_docker_compose()
        if port:
            return port

        # 4. Check configuration files
        port = self._detect_port_in_config_files()
        if port:
            return port

        # 5. Check package.json scripts (for Node.js)
        if self.analysis.get("language") in ["JavaScript", "TypeScript"]:
            port = self._detect_port_in_package_scripts()
            if port:
                return port

        # 6. Check Makefile/shell scripts
        port = self._detect_port_in_scripts()
        if port:
            return port

        # Fall back to default
        return default_port

    def _detect_port_in_entry_points(self) -> int | None:
        """Detect port in entry point files."""
        entry_files = [
            "app.py",
            "main.py",
            "server.py",
            "__main__.py",
            "asgi.py",
            "wsgi.py",
            "src/app.py",
            "src/main.py",
            "src/server.py",
            "index.js",
            "index.ts",
            "server.js",
            "server.ts",
            "main.js",
            "main.ts",
            "src/index.js",
            "src/index.ts",
            "src/server.js",
            "src/server.ts",
            "main.go",
            "cmd/main.go",
            "src/main.rs",
        ]

        # Patterns to search for ports
        patterns = [
            # Python: uvicorn.run(app, host="0.0.0.0", port=8050)
            r"uvicorn\.run\([^)]*port\s*=\s*(\d+)",
            # Python: app.run(port=8050, host="0.0.0.0")
            r"\.run\([^)]*port\s*=\s*(\d+)",
            # Python: port = 8050 or PORT = 8050
            r"^\s*[Pp][Oo][Rr][Tt]\s*=\s*(\d+)",
            # Python: os.getenv("PORT", 8050) or os.environ.get("PORT", 8050)
            r'getenv\(\s*["\']PORT["\']\s*,\s*(\d+)',
            r'environ\.get\(\s*["\']PORT["\']\s*,\s*(\d+)',
            # JavaScript/TypeScript: app.listen(8050)
            r"\.listen\(\s*(\d+)",
            # JavaScript/TypeScript: const PORT = 8050 or let port = 8050
            r"(?:const|let|var)\s+[Pp][Oo][Rr][Tt]\s*=\s*(\d+)",
            # JavaScript/TypeScript: process.env.PORT || 8050
            r"process\.env\.PORT\s*\|\|\s*(\d+)",
            # JavaScript/TypeScript: Number(process.env.PORT) || 8050
            r"Number\(process\.env\.PORT\)\s*\|\|\s*(\d+)",
            # Go: :8050 or ":8050"
            r':\s*(\d+)(?:["\s]|$)',
            # Rust: .bind("127.0.0.1:8050")
            r'\.bind\(["\'][\d.]+:(\d+)',
        ]

        for entry_file in entry_files:
            content = self._read_file(entry_file)
            if not content:
                continue

            for pattern in patterns:
                matches = re.findall(pattern, content, re.MULTILINE)
                if matches:
                    # Return the first valid port found
                    for match in matches:
                        try:
                            port = int(match)
                            if 1000 <= port <= 65535:  # Valid port range
                                return port
                        except ValueError:
                            continue

        return None

    def _detect_port_in_env_files(self) -> int | None:
        """Detect port in environment files."""
        env_files = [
            ".env",
            ".env.local",
            ".env.development",
            ".env.dev",
            "config/.env",
            "config/.env.local",
            "../.env",
        ]

        patterns = [
            r"^\s*PORT\s*=\s*(\d+)",
            r"^\s*API_PORT\s*=\s*(\d+)",
            r"^\s*SERVER_PORT\s*=\s*(\d+)",
            r"^\s*APP_PORT\s*=\s*(\d+)",
        ]

        for env_file in env_files:
            content = self._read_file(env_file)
            if not content:
                continue

            for pattern in patterns:
                matches = re.findall(pattern, content, re.MULTILINE)
                if matches:
                    try:
                        port = int(matches[0])
                        if 1000 <= port <= 65535:
                            return port
                    except ValueError:
                        continue

        return None

    def _detect_port_in_docker_compose(self) -> int | None:
        """Detect port from docker-compose.yml mappings."""
        compose_files = [
            "docker-compose.yml",
            "docker-compose.yaml",
            "../docker-compose.yml",
            "../docker-compose.yaml",
        ]

        service_name = self.path.name.lower()

        for compose_file in compose_files:
            content = self._read_file(compose_file)
            if not content:
                continue

            # Look for port mappings like "8050:8000" or "8050:8050"
            # Match the service name if possible
            pattern = r'^\s*-\s*["\']?(\d+):\d+["\']?'

            in_service = False
            in_ports = False

            for line in content.split("\n"):
                # Check if we're in the right service block
                if re.match(rf"^\s*{re.escape(service_name)}\s*:", line):
                    in_service = True
                    continue

                # Check if we hit another service
                if (
                    in_service
                    and re.match(r"^\s*\w+\s*:", line)
                    and "ports:" not in line
                ):
                    in_service = False
                    in_ports = False
                    continue

                # Check if we're in the ports section
                if in_service and "ports:" in line:
                    in_ports = True
                    continue

                # Extract port mapping
                if in_ports:
                    match = re.match(pattern, line)
                    if match:
                        try:
                            port = int(match.group(1))
                            if 1000 <= port <= 65535:
                                return port
                        except ValueError:
                            continue

        return None

    def _detect_port_in_config_files(self) -> int | None:
        """Detect port in configuration files."""
        config_files = [
            "config.py",
            "settings.py",
            "config/settings.py",
            "src/config.py",
            "config.json",
            "settings.json",
            "config/config.json",
            "config.toml",
            "settings.toml",
        ]

        for config_file in config_files:
            content = self._read_file(config_file)
            if not content:
                continue

            # Python config patterns
            patterns = [
                r"[Pp][Oo][Rr][Tt]\s*=\s*(\d+)",
                r'["\']port["\']\s*:\s*(\d+)',
            ]

            for pattern in patterns:
                matches = re.findall(pattern, content)
                if matches:
                    try:
                        port = int(matches[0])
                        if 1000 <= port <= 65535:
                            return port
                    except ValueError:
                        continue

        return None

    def _detect_port_in_package_scripts(self) -> int | None:
        """Detect port in package.json scripts."""
        pkg = self._read_json("package.json")
        if not pkg:
            return None

        scripts = pkg.get("scripts", {})

        # Look for port specifications in scripts
        # e.g., "dev": "next dev -p 3001"
        # e.g., "start": "node server.js --port 8050"
        patterns = [
            r"-p\s+(\d+)",
            r"--port\s+(\d+)",
            r"PORT=(\d+)",
        ]

        for script in scripts.values():
            if not isinstance(script, str):
                continue

            for pattern in patterns:
                matches = re.findall(pattern, script)
                if matches:
                    try:
                        port = int(matches[0])
                        if 1000 <= port <= 65535:
                            return port
                    except ValueError:
                        continue

        return None

    def _detect_port_in_scripts(self) -> int | None:
        """Detect port in Makefile or shell scripts."""
        script_files = ["Makefile", "start.sh", "run.sh", "dev.sh"]

        patterns = [
            r"PORT=(\d+)",
            r"--port\s+(\d+)",
            r"-p\s+(\d+)",
        ]

        for script_file in script_files:
            content = self._read_file(script_file)
            if not content:
                continue

            for pattern in patterns:
                matches = re.findall(pattern, content)
                if matches:
                    try:
                        port = int(matches[0])
                        if 1000 <= port <= 65535:
                            return port
                    except ValueError:
                        continue

        return None
