#!/usr/bin/env python3
"""
Codebase Analyzer
=================

Automatically detects project structure, frameworks, and services.
Supports monorepos with multiple services.

Usage:
    # Index entire project (creates project_index.json)
    python auto-claude/analyzer.py --index

    # Analyze specific service
    python auto-claude/analyzer.py --service backend

    # Output to specific file
    python auto-claude/analyzer.py --index --output path/to/output.json

The analyzer will:
1. Detect if this is a monorepo or single project
2. Find all services/packages and analyze each separately
3. Map interdependencies between services
4. Identify infrastructure (Docker, CI/CD)
5. Document conventions (linting, testing)
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# Directories to skip during analysis
SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".env",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "vendor",
    ".idea",
    ".vscode",
    "auto-claude",
    ".pytest_cache",
    ".mypy_cache",
    "coverage",
    ".coverage",
    "htmlcov",
    "eggs",
    "*.egg-info",
    ".turbo",
    ".cache",
}

# Common service directory names
SERVICE_INDICATORS = {
    "backend", "frontend", "api", "web", "app", "server", "client",
    "worker", "workers", "services", "packages", "apps", "libs",
    "scraper", "crawler", "proxy", "gateway", "admin", "dashboard",
    "mobile", "desktop", "cli", "sdk", "core", "shared", "common",
}

# Files that indicate a service root
SERVICE_ROOT_FILES = {
    "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
    "go.mod", "Gemfile", "composer.json", "pom.xml", "build.gradle",
    "Makefile", "Dockerfile",
}


class ServiceAnalyzer:
    """Analyzes a single service/package within a project."""

    def __init__(self, service_path: Path, service_name: str):
        self.path = service_path.resolve()
        self.name = service_name
        self.analysis = {
            "name": service_name,
            "path": str(service_path),
            "language": None,
            "framework": None,
            "type": None,  # backend, frontend, worker, library, etc.
        }

    def analyze(self) -> dict[str, Any]:
        """Run full analysis on this service."""
        self._detect_language_and_framework()
        self._detect_service_type()
        self._find_key_directories()
        self._find_entry_points()
        self._detect_dependencies()
        self._detect_testing()
        self._find_dockerfile()

        # Comprehensive context extraction
        self._detect_environment_variables()
        self._detect_api_routes()
        self._detect_database_models()
        self._detect_external_services()
        self._detect_auth_patterns()
        self._detect_migrations()
        self._detect_background_jobs()
        self._detect_api_documentation()
        self._detect_monitoring()

        return self.analysis

    def _detect_language_and_framework(self) -> None:
        """Detect primary language and framework."""
        # Python detection
        if self._exists("requirements.txt"):
            self.analysis["language"] = "Python"
            self.analysis["package_manager"] = "pip"
            deps = self._read_file("requirements.txt")
            self._detect_python_framework(deps)

        elif self._exists("pyproject.toml"):
            self.analysis["language"] = "Python"
            content = self._read_file("pyproject.toml")
            if "[tool.poetry]" in content:
                self.analysis["package_manager"] = "poetry"
            elif "[tool.uv]" in content:
                self.analysis["package_manager"] = "uv"
            else:
                self.analysis["package_manager"] = "pip"
            self._detect_python_framework(content)

        elif self._exists("Pipfile"):
            self.analysis["language"] = "Python"
            self.analysis["package_manager"] = "pipenv"
            content = self._read_file("Pipfile")
            self._detect_python_framework(content)

        # Node.js/TypeScript detection
        elif self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                # Check if TypeScript
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "typescript" in deps:
                    self.analysis["language"] = "TypeScript"
                else:
                    self.analysis["language"] = "JavaScript"

                self.analysis["package_manager"] = self._detect_node_package_manager()
                self._detect_node_framework(pkg)

        # Go detection
        elif self._exists("go.mod"):
            self.analysis["language"] = "Go"
            self.analysis["package_manager"] = "go mod"
            content = self._read_file("go.mod")
            self._detect_go_framework(content)

        # Rust detection
        elif self._exists("Cargo.toml"):
            self.analysis["language"] = "Rust"
            self.analysis["package_manager"] = "cargo"
            content = self._read_file("Cargo.toml")
            self._detect_rust_framework(content)

        # Ruby detection
        elif self._exists("Gemfile"):
            self.analysis["language"] = "Ruby"
            self.analysis["package_manager"] = "bundler"
            content = self._read_file("Gemfile")
            self._detect_ruby_framework(content)

    def _detect_python_framework(self, content: str) -> None:
        """Detect Python framework."""
        content_lower = content.lower()

        # Web frameworks (with conventional defaults)
        frameworks = {
            "fastapi": {"name": "FastAPI", "type": "backend", "port": 8000},
            "flask": {"name": "Flask", "type": "backend", "port": 5000},
            "django": {"name": "Django", "type": "backend", "port": 8000},
            "starlette": {"name": "Starlette", "type": "backend", "port": 8000},
            "litestar": {"name": "Litestar", "type": "backend", "port": 8000},
        }

        for key, info in frameworks.items():
            if key in content_lower:
                self.analysis["framework"] = info["name"]
                self.analysis["type"] = info["type"]
                # Try to detect actual port, fall back to default
                detected_port = self._detect_port_from_sources(info["port"])
                self.analysis["default_port"] = detected_port
                break

        # Task queues
        if "celery" in content_lower:
            self.analysis["task_queue"] = "Celery"
            if not self.analysis.get("type"):
                self.analysis["type"] = "worker"
        elif "dramatiq" in content_lower:
            self.analysis["task_queue"] = "Dramatiq"
        elif "huey" in content_lower:
            self.analysis["task_queue"] = "Huey"

        # ORM
        if "sqlalchemy" in content_lower:
            self.analysis["orm"] = "SQLAlchemy"
        elif "tortoise" in content_lower:
            self.analysis["orm"] = "Tortoise ORM"
        elif "prisma" in content_lower:
            self.analysis["orm"] = "Prisma"

    def _detect_node_framework(self, pkg: dict) -> None:
        """Detect Node.js/TypeScript framework."""
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        deps_lower = {k.lower(): k for k in deps.keys()}

        # Frontend frameworks
        frontend_frameworks = {
            "next": {"name": "Next.js", "type": "frontend", "port": 3000},
            "nuxt": {"name": "Nuxt", "type": "frontend", "port": 3000},
            "react": {"name": "React", "type": "frontend", "port": 3000},
            "vue": {"name": "Vue", "type": "frontend", "port": 5173},
            "svelte": {"name": "Svelte", "type": "frontend", "port": 5173},
            "@sveltejs/kit": {"name": "SvelteKit", "type": "frontend", "port": 5173},
            "angular": {"name": "Angular", "type": "frontend", "port": 4200},
            "@angular/core": {"name": "Angular", "type": "frontend", "port": 4200},
            "solid-js": {"name": "SolidJS", "type": "frontend", "port": 3000},
            "astro": {"name": "Astro", "type": "frontend", "port": 4321},
        }

        # Backend frameworks
        backend_frameworks = {
            "express": {"name": "Express", "type": "backend", "port": 3000},
            "fastify": {"name": "Fastify", "type": "backend", "port": 3000},
            "koa": {"name": "Koa", "type": "backend", "port": 3000},
            "hono": {"name": "Hono", "type": "backend", "port": 3000},
            "elysia": {"name": "Elysia", "type": "backend", "port": 3000},
            "@nestjs/core": {"name": "NestJS", "type": "backend", "port": 3000},
        }

        detected_port = None

        # Check frontend first (Next.js includes React, etc.)
        for key, info in frontend_frameworks.items():
            if key in deps_lower:
                self.analysis["framework"] = info["name"]
                self.analysis["type"] = info["type"]
                # Try to detect actual port, fall back to default
                detected_port = self._detect_port_from_sources(info["port"])
                self.analysis["default_port"] = detected_port
                break

        # If no frontend, check backend
        if not self.analysis.get("framework"):
            for key, info in backend_frameworks.items():
                if key in deps_lower:
                    self.analysis["framework"] = info["name"]
                    self.analysis["type"] = info["type"]
                    # Try to detect actual port, fall back to default
                    detected_port = self._detect_port_from_sources(info["port"])
                    self.analysis["default_port"] = detected_port
                    break

        # Build tool
        if "vite" in deps_lower:
            self.analysis["build_tool"] = "Vite"
            if not self.analysis.get("default_port"):
                detected_port = self._detect_port_from_sources(5173)
                self.analysis["default_port"] = detected_port
        elif "webpack" in deps_lower:
            self.analysis["build_tool"] = "Webpack"
        elif "esbuild" in deps_lower:
            self.analysis["build_tool"] = "esbuild"
        elif "turbopack" in deps_lower:
            self.analysis["build_tool"] = "Turbopack"

        # Styling
        if "tailwindcss" in deps_lower:
            self.analysis["styling"] = "Tailwind CSS"
        elif "styled-components" in deps_lower:
            self.analysis["styling"] = "styled-components"
        elif "@emotion/react" in deps_lower:
            self.analysis["styling"] = "Emotion"

        # State management
        if "zustand" in deps_lower:
            self.analysis["state_management"] = "Zustand"
        elif "@reduxjs/toolkit" in deps_lower or "redux" in deps_lower:
            self.analysis["state_management"] = "Redux"
        elif "jotai" in deps_lower:
            self.analysis["state_management"] = "Jotai"
        elif "pinia" in deps_lower:
            self.analysis["state_management"] = "Pinia"

        # Task queues
        if "bullmq" in deps_lower or "bull" in deps_lower:
            self.analysis["task_queue"] = "BullMQ"
            if not self.analysis.get("type"):
                self.analysis["type"] = "worker"

        # ORM
        if "@prisma/client" in deps_lower or "prisma" in deps_lower:
            self.analysis["orm"] = "Prisma"
        elif "typeorm" in deps_lower:
            self.analysis["orm"] = "TypeORM"
        elif "drizzle-orm" in deps_lower:
            self.analysis["orm"] = "Drizzle"
        elif "mongoose" in deps_lower:
            self.analysis["orm"] = "Mongoose"

        # Scripts
        scripts = pkg.get("scripts", {})
        if "dev" in scripts:
            self.analysis["dev_command"] = f"npm run dev"
        elif "start" in scripts:
            self.analysis["dev_command"] = f"npm run start"

    def _detect_go_framework(self, content: str) -> None:
        """Detect Go framework."""
        frameworks = {
            "gin-gonic/gin": {"name": "Gin", "port": 8080},
            "labstack/echo": {"name": "Echo", "port": 8080},
            "gofiber/fiber": {"name": "Fiber", "port": 3000},
            "go-chi/chi": {"name": "Chi", "port": 8080},
        }

        for key, info in frameworks.items():
            if key in content:
                self.analysis["framework"] = info["name"]
                self.analysis["type"] = "backend"
                # Try to detect actual port, fall back to default
                detected_port = self._detect_port_from_sources(info["port"])
                self.analysis["default_port"] = detected_port
                break

    def _detect_rust_framework(self, content: str) -> None:
        """Detect Rust framework."""
        frameworks = {
            "actix-web": {"name": "Actix Web", "port": 8080},
            "axum": {"name": "Axum", "port": 3000},
            "rocket": {"name": "Rocket", "port": 8000},
        }

        for key, info in frameworks.items():
            if key in content:
                self.analysis["framework"] = info["name"]
                self.analysis["type"] = "backend"
                # Try to detect actual port, fall back to default
                detected_port = self._detect_port_from_sources(info["port"])
                self.analysis["default_port"] = detected_port
                break

    def _detect_ruby_framework(self, content: str) -> None:
        """Detect Ruby framework."""
        if "rails" in content.lower():
            self.analysis["framework"] = "Ruby on Rails"
            self.analysis["type"] = "backend"
            # Try to detect actual port, fall back to default
            detected_port = self._detect_port_from_sources(3000)
            self.analysis["default_port"] = detected_port
        elif "sinatra" in content.lower():
            self.analysis["framework"] = "Sinatra"
            self.analysis["type"] = "backend"
            # Try to detect actual port, fall back to default
            detected_port = self._detect_port_from_sources(4567)
            self.analysis["default_port"] = detected_port

        if "sidekiq" in content.lower():
            self.analysis["task_queue"] = "Sidekiq"

    def _detect_service_type(self) -> None:
        """Infer service type from name and content if not already set."""
        if self.analysis.get("type"):
            return

        name_lower = self.name.lower()

        # Infer from name
        if any(kw in name_lower for kw in ["frontend", "client", "web", "ui", "app"]):
            self.analysis["type"] = "frontend"
        elif any(kw in name_lower for kw in ["backend", "api", "server", "service"]):
            self.analysis["type"] = "backend"
        elif any(kw in name_lower for kw in ["worker", "job", "queue", "task", "celery"]):
            self.analysis["type"] = "worker"
        elif any(kw in name_lower for kw in ["scraper", "crawler", "spider"]):
            self.analysis["type"] = "scraper"
        elif any(kw in name_lower for kw in ["proxy", "gateway", "router"]):
            self.analysis["type"] = "proxy"
        elif any(kw in name_lower for kw in ["lib", "shared", "common", "core", "utils"]):
            self.analysis["type"] = "library"
        else:
            self.analysis["type"] = "unknown"

    def _find_key_directories(self) -> None:
        """Find important directories within this service."""
        key_dirs = {}

        # Common directory patterns
        patterns = {
            "src": "Source code",
            "lib": "Library code",
            "app": "Application code",
            "api": "API endpoints",
            "routes": "Route handlers",
            "controllers": "Controllers",
            "models": "Data models",
            "schemas": "Schemas/DTOs",
            "services": "Business logic",
            "components": "UI components",
            "pages": "Page components",
            "views": "Views/templates",
            "hooks": "Custom hooks",
            "utils": "Utilities",
            "helpers": "Helper functions",
            "middleware": "Middleware",
            "tests": "Tests",
            "test": "Tests",
            "__tests__": "Tests",
            "config": "Configuration",
            "tasks": "Background tasks",
            "jobs": "Background jobs",
            "workers": "Worker processes",
        }

        for dir_name, purpose in patterns.items():
            dir_path = self.path / dir_name
            if dir_path.exists() and dir_path.is_dir():
                key_dirs[dir_name] = {
                    "path": str(dir_path.relative_to(self.path)),
                    "purpose": purpose,
                }

        if key_dirs:
            self.analysis["key_directories"] = key_dirs

    def _find_entry_points(self) -> None:
        """Find main entry point files."""
        entry_patterns = [
            "main.py", "app.py", "__main__.py", "server.py", "wsgi.py", "asgi.py",
            "index.ts", "index.js", "main.ts", "main.js", "server.ts", "server.js",
            "app.ts", "app.js", "src/index.ts", "src/index.js", "src/main.ts",
            "src/app.ts", "src/server.ts", "src/App.tsx", "src/App.jsx",
            "pages/_app.tsx", "pages/_app.js",  # Next.js
            "main.go", "cmd/main.go",
            "src/main.rs", "src/lib.rs",
        ]

        for pattern in entry_patterns:
            if self._exists(pattern):
                self.analysis["entry_point"] = pattern
                break

    def _detect_dependencies(self) -> None:
        """Extract key dependencies."""
        if self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                deps = pkg.get("dependencies", {})
                dev_deps = pkg.get("devDependencies", {})
                self.analysis["dependencies"] = list(deps.keys())[:20]  # Top 20
                self.analysis["dev_dependencies"] = list(dev_deps.keys())[:10]

        elif self._exists("requirements.txt"):
            content = self._read_file("requirements.txt")
            deps = []
            for line in content.split("\n"):
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    match = re.match(r"^([a-zA-Z0-9_-]+)", line)
                    if match:
                        deps.append(match.group(1))
            self.analysis["dependencies"] = deps[:20]

    def _detect_testing(self) -> None:
        """Detect testing framework and configuration."""
        if self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "vitest" in deps:
                    self.analysis["testing"] = "Vitest"
                elif "jest" in deps:
                    self.analysis["testing"] = "Jest"
                if "@playwright/test" in deps:
                    self.analysis["e2e_testing"] = "Playwright"
                elif "cypress" in deps:
                    self.analysis["e2e_testing"] = "Cypress"

        elif self._exists("pytest.ini") or self._exists("pyproject.toml"):
            self.analysis["testing"] = "pytest"

        # Find test directory
        for test_dir in ["tests", "test", "__tests__", "spec"]:
            if self._exists(test_dir):
                self.analysis["test_directory"] = test_dir
                break

    def _find_dockerfile(self) -> None:
        """Find Dockerfile for this service."""
        dockerfile_patterns = [
            "Dockerfile",
            f"Dockerfile.{self.name}",
            f"docker/{self.name}.Dockerfile",
            f"docker/Dockerfile.{self.name}",
            "../docker/Dockerfile." + self.name,
        ]

        for pattern in dockerfile_patterns:
            if self._exists(pattern):
                self.analysis["dockerfile"] = pattern
                break

    def _detect_node_package_manager(self) -> str:
        """Detect Node.js package manager."""
        if self._exists("pnpm-lock.yaml"):
            return "pnpm"
        elif self._exists("yarn.lock"):
            return "yarn"
        elif self._exists("bun.lockb"):
            return "bun"
        return "npm"

    # =============================================================================
    # COMPREHENSIVE CONTEXT EXTRACTION
    # =============================================================================

    def _detect_environment_variables(self) -> None:
        """
        Discover all environment variables from multiple sources.

        Extracts from: .env files, docker-compose, example files.
        Categorizes as required/optional and detects sensitive data.
        """
        env_vars = {}
        required_vars = set()
        optional_vars = set()

        # 1. Parse .env files
        env_files = [
            ".env", ".env.local", ".env.development", ".env.production",
            ".env.dev", ".env.prod", ".env.test", ".env.staging",
            "config/.env", "../.env"
        ]

        for env_file in env_files:
            content = self._read_file(env_file)
            if not content:
                continue

            for line in content.split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                # Parse KEY=value or KEY="value" or KEY='value'
                match = re.match(r'^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$', line)
                if match:
                    key = match.group(1)
                    value = match.group(2).strip().strip('"').strip("'")

                    # Detect if sensitive
                    is_sensitive = any(keyword in key.lower() for keyword in [
                        'secret', 'key', 'password', 'token', 'api_key',
                        'private', 'credential', 'auth'
                    ])

                    # Detect type
                    var_type = self._infer_env_var_type(value)

                    env_vars[key] = {
                        "value": "<REDACTED>" if is_sensitive else value,
                        "source": env_file,
                        "type": var_type,
                        "sensitive": is_sensitive
                    }

        # 2. Parse .env.example to find required variables
        example_content = self._read_file(".env.example") or self._read_file(".env.sample")
        if example_content:
            for line in example_content.split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                match = re.match(r'^([A-Z_][A-Z0-9_]*)\s*=', line)
                if match:
                    key = match.group(1)
                    required_vars.add(key)

                    if key not in env_vars:
                        env_vars[key] = {
                            "value": None,
                            "source": ".env.example",
                            "type": "string",
                            "sensitive": any(k in key.lower() for k in ['secret', 'key', 'password', 'token']),
                            "required": True
                        }

        # 3. Parse docker-compose.yml environment section
        for compose_file in ["docker-compose.yml", "../docker-compose.yml"]:
            content = self._read_file(compose_file)
            if not content:
                continue

            # Look for environment variables in docker-compose
            in_env_section = False
            for line in content.split('\n'):
                if 'environment:' in line:
                    in_env_section = True
                    continue

                if in_env_section:
                    # Check if we left the environment section
                    if line and not line.startswith((' ', '\t', '-')):
                        in_env_section = False
                        continue

                    # Parse - KEY=value or - KEY
                    match = re.match(r'^\s*-\s*([A-Z_][A-Z0-9_]*)', line)
                    if match:
                        key = match.group(1)
                        if key not in env_vars:
                            env_vars[key] = {
                                "value": None,
                                "source": compose_file,
                                "type": "string",
                                "sensitive": False
                            }

        # 4. Scan code for os.getenv() / process.env usage to find optional vars
        entry_files = [
            "app.py", "main.py", "config.py", "settings.py",
            "src/config.py", "src/settings.py",
            "index.js", "index.ts", "config.js", "config.ts"
        ]

        for entry_file in entry_files:
            content = self._read_file(entry_file)
            if not content:
                continue

            # Python: os.getenv("VAR") or os.environ.get("VAR")
            python_patterns = [
                r'os\.getenv\(["\']([A-Z_][A-Z0-9_]*)["\']',
                r'os\.environ\.get\(["\']([A-Z_][A-Z0-9_]*)["\']',
                r'os\.environ\[["\']([A-Z_][A-Z0-9_]*)["\']',
            ]

            # JavaScript: process.env.VAR
            js_patterns = [
                r'process\.env\.([A-Z_][A-Z0-9_]*)',
            ]

            for pattern in python_patterns + js_patterns:
                matches = re.findall(pattern, content)
                for var_name in matches:
                    if var_name not in env_vars:
                        optional_vars.add(var_name)
                        env_vars[var_name] = {
                            "value": None,
                            "source": f"code:{entry_file}",
                            "type": "string",
                            "sensitive": any(k in var_name.lower() for k in ['secret', 'key', 'password', 'token']),
                            "required": False
                        }

        # Mark required vs optional
        for key in env_vars:
            if 'required' not in env_vars[key]:
                env_vars[key]['required'] = key in required_vars

        if env_vars:
            self.analysis["environment"] = {
                "variables": env_vars,
                "required_count": len(required_vars),
                "optional_count": len(optional_vars),
                "detected_count": len(env_vars)
            }

    def _infer_env_var_type(self, value: str) -> str:
        """Infer the type of an environment variable from its value."""
        if not value:
            return "string"

        # Boolean
        if value.lower() in ['true', 'false', '1', '0', 'yes', 'no']:
            return "boolean"

        # Number
        if value.isdigit():
            return "number"

        # URL
        if value.startswith(('http://', 'https://', 'postgres://', 'postgresql://', 'mysql://', 'mongodb://', 'redis://')):
            return "url"

        # Email
        if '@' in value and '.' in value:
            return "email"

        # Path
        if '/' in value or '\\' in value:
            return "path"

        return "string"

    def _detect_api_routes(self) -> None:
        """
        Detect all API routes/endpoints across different frameworks.

        Supports: FastAPI, Flask, Django, Express, Next.js, Gin, Axum, etc.
        """
        routes = []

        # Python FastAPI
        routes.extend(self._detect_fastapi_routes())

        # Python Flask
        routes.extend(self._detect_flask_routes())

        # Python Django
        routes.extend(self._detect_django_routes())

        # Node.js Express/Fastify/Koa
        routes.extend(self._detect_express_routes())

        # Next.js (file-based routing)
        routes.extend(self._detect_nextjs_routes())

        # Go Gin/Echo/Chi
        routes.extend(self._detect_go_routes())

        # Rust Axum/Actix
        routes.extend(self._detect_rust_routes())

        if routes:
            self.analysis["api"] = {
                "routes": routes,
                "total_routes": len(routes),
                "methods": list(set(method for r in routes for method in r.get("methods", []))),
                "protected_routes": [r["path"] for r in routes if r.get("requires_auth")]
            }

    def _detect_fastapi_routes(self) -> list[dict]:
        """Detect FastAPI routes."""
        routes = []
        files_to_check = list(self.path.glob("**/*.py"))

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Pattern: @app.get("/path") or @router.post("/path", dependencies=[...])
            patterns = [
                (r'@(?:app|router)\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']', 'decorator'),
                (r'@(?:app|router)\.api_route\(["\']([^"\']+)["\'][^)]*methods\s*=\s*\[([^\]]+)\]', 'api_route'),
            ]

            for pattern, pattern_type in patterns:
                matches = re.finditer(pattern, content, re.MULTILINE)
                for match in matches:
                    if pattern_type == 'decorator':
                        method = match.group(1).upper()
                        path = match.group(2)
                        methods = [method]
                    else:
                        path = match.group(1)
                        methods_str = match.group(2)
                        methods = [m.strip().strip('"').strip("'").upper() for m in methods_str.split(',')]

                    # Check if route requires auth (has Depends in the decorator)
                    line_start = content.rfind('\n', 0, match.start()) + 1
                    line_end = content.find('\n', match.end())
                    route_definition = content[line_start:line_end if line_end != -1 else len(content)]

                    requires_auth = 'Depends' in route_definition or 'require' in route_definition.lower()

                    routes.append({
                        "path": path,
                        "methods": methods,
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "FastAPI",
                        "requires_auth": requires_auth
                    })

        return routes

    def _detect_flask_routes(self) -> list[dict]:
        """Detect Flask routes."""
        routes = []
        files_to_check = list(self.path.glob("**/*.py"))

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Pattern: @app.route("/path", methods=["GET", "POST"])
            pattern = r'@(?:app|bp|blueprint)\.route\(["\']([^"\']+)["\'](?:[^)]*methods\s*=\s*\[([^\]]+)\])?'
            matches = re.finditer(pattern, content, re.MULTILINE)

            for match in matches:
                path = match.group(1)
                methods_str = match.group(2)

                if methods_str:
                    methods = [m.strip().strip('"').strip("'").upper() for m in methods_str.split(',')]
                else:
                    methods = ["GET"]  # Flask default

                # Check for @login_required decorator
                decorator_start = content.rfind('@', 0, match.start())
                decorator_section = content[decorator_start:match.end()]
                requires_auth = 'login_required' in decorator_section or 'require' in decorator_section.lower()

                routes.append({
                    "path": path,
                    "methods": methods,
                    "file": str(file_path.relative_to(self.path)),
                    "framework": "Flask",
                    "requires_auth": requires_auth
                })

        return routes

    def _detect_django_routes(self) -> list[dict]:
        """Detect Django routes from urls.py files."""
        routes = []
        url_files = list(self.path.glob("**/urls.py"))

        for file_path in url_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Pattern: path('users/<int:id>/', views.user_detail)
            patterns = [
                r'path\(["\']([^"\']+)["\']',
                r're_path\([r]?["\']([^"\']+)["\']',
            ]

            for pattern in patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    path = match.group(1)

                    routes.append({
                        "path": f"/{path}" if not path.startswith('/') else path,
                        "methods": ["GET", "POST"],  # Django allows both by default
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "Django",
                        "requires_auth": False  # Can't easily detect without middleware analysis
                    })

        return routes

    def _detect_express_routes(self) -> list[dict]:
        """Detect Express/Fastify/Koa routes."""
        routes = []
        files_to_check = list(self.path.glob("**/*.js")) + list(self.path.glob("**/*.ts"))

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Pattern: app.get('/path', handler) or router.post('/path', middleware, handler)
            pattern = r'(?:app|router)\.(get|post|put|delete|patch|use)\(["\']([^"\']+)["\']'
            matches = re.finditer(pattern, content)

            for match in matches:
                method = match.group(1).upper()
                path = match.group(2)

                if method == 'USE':
                    # .use() is middleware, might be a route prefix
                    continue

                # Check for auth middleware in the route definition
                line_start = content.rfind('\n', 0, match.start()) + 1
                line_end = content.find('\n', match.end())
                route_line = content[line_start:line_end if line_end != -1 else len(content)]

                requires_auth = any(keyword in route_line.lower() for keyword in [
                    'auth', 'authenticate', 'protect', 'require'
                ])

                routes.append({
                    "path": path,
                    "methods": [method],
                    "file": str(file_path.relative_to(self.path)),
                    "framework": "Express",
                    "requires_auth": requires_auth
                })

        return routes

    def _detect_nextjs_routes(self) -> list[dict]:
        """Detect Next.js file-based routes."""
        routes = []

        # Next.js App Router (app directory)
        app_dir = self.path / "app"
        if app_dir.exists():
            # Find all route.ts/js files
            for route_file in app_dir.glob("**/route.{ts,js,tsx,jsx}"):
                # Convert file path to route path
                # app/api/users/[id]/route.ts -> /api/users/:id
                relative_path = route_file.parent.relative_to(app_dir)
                route_path = "/" + str(relative_path).replace("\\", "/")

                # Convert [id] to :id
                route_path = re.sub(r'\[([^\]]+)\]', r':\1', route_path)

                try:
                    content = route_file.read_text()
                    # Detect exported methods: export async function GET(request)
                    methods = re.findall(r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)', content)

                    if methods:
                        routes.append({
                            "path": route_path,
                            "methods": methods,
                            "file": str(route_file.relative_to(self.path)),
                            "framework": "Next.js",
                            "requires_auth": 'auth' in content.lower()
                        })
                except (IOError, UnicodeDecodeError):
                    continue

        # Next.js Pages Router (pages/api directory)
        pages_api = self.path / "pages" / "api"
        if pages_api.exists():
            for api_file in pages_api.glob("**/*.{ts,js,tsx,jsx}"):
                if api_file.name.startswith('_'):
                    continue

                # Convert file path to route
                relative_path = api_file.relative_to(pages_api)
                route_path = "/api/" + str(relative_path.with_suffix('')).replace("\\", "/")

                # Convert [id] to :id
                route_path = re.sub(r'\[([^\]]+)\]', r':\1', route_path)

                routes.append({
                    "path": route_path,
                    "methods": ["GET", "POST"],  # Next.js API routes handle all methods
                    "file": str(api_file.relative_to(self.path)),
                    "framework": "Next.js",
                    "requires_auth": False
                })

        return routes

    def _detect_go_routes(self) -> list[dict]:
        """Detect Go framework routes (Gin, Echo, Chi, Fiber)."""
        routes = []
        go_files = list(self.path.glob("**/*.go"))

        for file_path in go_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Gin: r.GET("/path", handler)
            # Echo: e.POST("/path", handler)
            # Chi: r.Get("/path", handler)
            # Fiber: app.Get("/path", handler)
            pattern = r'(?:r|e|app|router)\.(GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch)\(["\']([^"\']+)["\']'
            matches = re.finditer(pattern, content)

            for match in matches:
                method = match.group(1).upper()
                path = match.group(2)

                routes.append({
                    "path": path,
                    "methods": [method],
                    "file": str(file_path.relative_to(self.path)),
                    "framework": "Go",
                    "requires_auth": False
                })

        return routes

    def _detect_rust_routes(self) -> list[dict]:
        """Detect Rust framework routes (Axum, Actix)."""
        routes = []
        rust_files = list(self.path.glob("**/*.rs"))

        for file_path in rust_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Axum: .route("/path", get(handler))
            # Actix: web::get().to(handler)
            patterns = [
                r'\.route\(["\']([^"\']+)["\'],\s*(get|post|put|delete|patch)',
                r'web::(get|post|put|delete|patch)\(\)',
            ]

            for pattern in patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    if len(match.groups()) == 2:
                        path = match.group(1)
                        method = match.group(2).upper()
                    else:
                        path = "/"  # Can't determine path from web:: syntax
                        method = match.group(1).upper()

                    routes.append({
                        "path": path,
                        "methods": [method],
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "Rust",
                        "requires_auth": False
                    })

        return routes

    def _detect_database_models(self) -> None:
        """
        Detect database models/schemas across different ORMs.

        Supports: SQLAlchemy, Prisma, Django, TypeORM, Drizzle, Mongoose, etc.
        """
        models = {}

        # Python SQLAlchemy
        models.update(self._detect_sqlalchemy_models())

        # Python Django
        models.update(self._detect_django_models())

        # Prisma schema
        models.update(self._detect_prisma_models())

        # TypeORM entities
        models.update(self._detect_typeorm_models())

        # Drizzle schema
        models.update(self._detect_drizzle_models())

        # Mongoose models
        models.update(self._detect_mongoose_models())

        if models:
            self.analysis["database"] = {
                "models": models,
                "total_models": len(models),
                "model_names": list(models.keys())
            }

    def _detect_sqlalchemy_models(self) -> dict:
        """Detect SQLAlchemy models."""
        models = {}
        py_files = list(self.path.glob("**/*.py"))

        for file_path in py_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Find class definitions that inherit from Base or db.Model
            class_pattern = r'class\s+(\w+)\([^)]*(?:Base|db\.Model|DeclarativeBase)[^)]*\):'
            matches = re.finditer(class_pattern, content)

            for match in matches:
                model_name = match.group(1)

                # Extract table name if defined
                table_match = re.search(r'__tablename__\s*=\s*["\'](\w+)["\']', content)
                table_name = table_match.group(1) if table_match else model_name.lower() + 's'

                # Extract columns
                fields = {}
                column_pattern = r'(\w+)\s*=\s*Column\((.*?)\)'
                column_matches = re.finditer(column_pattern, content[match.end():match.end() + 2000])

                for col_match in column_matches:
                    field_name = col_match.group(1)
                    field_def = col_match.group(2)

                    # Detect field properties
                    is_primary = 'primary_key=True' in field_def
                    is_unique = 'unique=True' in field_def
                    is_nullable = 'nullable=False' not in field_def

                    # Extract type
                    type_match = re.search(r'(Integer|String|Text|Boolean|DateTime|Float|JSON)', field_def)
                    field_type = type_match.group(1) if type_match else "Unknown"

                    fields[field_name] = {
                        "type": field_type,
                        "primary_key": is_primary,
                        "unique": is_unique,
                        "nullable": is_nullable
                    }

                if fields:  # Only add if we found fields
                    models[model_name] = {
                        "table": table_name,
                        "fields": fields,
                        "file": str(file_path.relative_to(self.path)),
                        "orm": "SQLAlchemy"
                    }

        return models

    def _detect_django_models(self) -> dict:
        """Detect Django models."""
        models = {}
        model_files = list(self.path.glob("**/models.py")) + list(self.path.glob("**/models/*.py"))

        for file_path in model_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Find class definitions that inherit from models.Model
            class_pattern = r'class\s+(\w+)\(models\.Model\):'
            matches = re.finditer(class_pattern, content)

            for match in matches:
                model_name = match.group(1)
                table_name = model_name.lower()

                # Extract fields
                fields = {}
                field_pattern = r'(\w+)\s*=\s*models\.(\w+Field)\((.*?)\)'
                field_matches = re.finditer(field_pattern, content[match.end():match.end() + 2000])

                for field_match in field_matches:
                    field_name = field_match.group(1)
                    field_type = field_match.group(2)
                    field_args = field_match.group(3)

                    fields[field_name] = {
                        "type": field_type,
                        "unique": 'unique=True' in field_args,
                        "nullable": 'null=True' in field_args
                    }

                if fields:
                    models[model_name] = {
                        "table": table_name,
                        "fields": fields,
                        "file": str(file_path.relative_to(self.path)),
                        "orm": "Django"
                    }

        return models

    def _detect_prisma_models(self) -> dict:
        """Detect Prisma models from schema.prisma."""
        models = {}
        schema_file = self.path / "prisma" / "schema.prisma"

        if not schema_file.exists():
            return models

        try:
            content = schema_file.read_text()
        except (IOError, UnicodeDecodeError):
            return models

        # Find model definitions
        model_pattern = r'model\s+(\w+)\s*\{([^}]+)\}'
        matches = re.finditer(model_pattern, content, re.MULTILINE)

        for match in matches:
            model_name = match.group(1)
            model_body = match.group(2)

            fields = {}
            # Parse fields: id Int @id @default(autoincrement())
            field_pattern = r'(\w+)\s+(\w+)([^/\n]*)'
            field_matches = re.finditer(field_pattern, model_body)

            for field_match in field_matches:
                field_name = field_match.group(1)
                field_type = field_match.group(2)
                field_attrs = field_match.group(3)

                fields[field_name] = {
                    "type": field_type,
                    "primary_key": '@id' in field_attrs,
                    "unique": '@unique' in field_attrs,
                    "nullable": '?' in field_type
                }

            if fields:
                models[model_name] = {
                    "table": model_name.lower(),
                    "fields": fields,
                    "file": "prisma/schema.prisma",
                    "orm": "Prisma"
                }

        return models

    def _detect_typeorm_models(self) -> dict:
        """Detect TypeORM entities."""
        models = {}
        ts_files = list(self.path.glob("**/*.entity.ts")) + list(self.path.glob("**/entities/*.ts"))

        for file_path in ts_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Find @Entity() class declarations
            entity_pattern = r'@Entity\([^)]*\)\s*(?:export\s+)?class\s+(\w+)'
            matches = re.finditer(entity_pattern, content)

            for match in matches:
                model_name = match.group(1)

                # Extract columns
                fields = {}
                column_pattern = r'@(PrimaryGeneratedColumn|Column)\(([^)]*)\)\s+(\w+):\s*(\w+)'
                column_matches = re.finditer(column_pattern, content)

                for col_match in column_matches:
                    decorator = col_match.group(1)
                    options = col_match.group(2)
                    field_name = col_match.group(3)
                    field_type = col_match.group(4)

                    fields[field_name] = {
                        "type": field_type,
                        "primary_key": decorator == "PrimaryGeneratedColumn",
                        "unique": 'unique: true' in options
                    }

                if fields:
                    models[model_name] = {
                        "table": model_name.lower(),
                        "fields": fields,
                        "file": str(file_path.relative_to(self.path)),
                        "orm": "TypeORM"
                    }

        return models

    def _detect_drizzle_models(self) -> dict:
        """Detect Drizzle ORM schemas."""
        models = {}
        schema_files = list(self.path.glob("**/schema.ts")) + list(self.path.glob("**/db/schema.ts"))

        for file_path in schema_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Find table definitions: export const users = pgTable('users', {...})
            table_pattern = r'export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\(["\'](\w+)["\']'
            matches = re.finditer(table_pattern, content)

            for match in matches:
                const_name = match.group(1)
                table_name = match.group(2)

                models[const_name] = {
                    "table": table_name,
                    "fields": {},  # Would need more parsing for fields
                    "file": str(file_path.relative_to(self.path)),
                    "orm": "Drizzle"
                }

        return models

    def _detect_mongoose_models(self) -> dict:
        """Detect Mongoose models."""
        models = {}
        model_files = list(self.path.glob("**/models/*.js")) + list(self.path.glob("**/models/*.ts"))

        for file_path in model_files:
            try:
                content = file_path.read_text()
            except (IOError, UnicodeDecodeError):
                continue

            # Find mongoose.model() or new Schema()
            model_pattern = r'mongoose\.model\(["\'](\w+)["\']'
            matches = re.finditer(model_pattern, content)

            for match in matches:
                model_name = match.group(1)

                models[model_name] = {
                    "table": model_name.lower(),
                    "fields": {},
                    "file": str(file_path.relative_to(self.path)),
                    "orm": "Mongoose"
                }

        return models

    def _detect_external_services(self) -> None:
        """
        Detect external service integrations.

        Detects: databases, cache, email, payments, storage, monitoring, etc.
        """
        services = {
            "databases": [],
            "cache": [],
            "message_queues": [],
            "email": [],
            "payments": [],
            "storage": [],
            "auth_providers": [],
            "monitoring": []
        }

        # Get all dependencies
        all_deps = set()

        # Python dependencies
        if self._exists("requirements.txt"):
            content = self._read_file("requirements.txt")
            all_deps.update(re.findall(r'^([a-zA-Z0-9_-]+)', content, re.MULTILINE))

        # Node.js dependencies
        pkg = self._read_json("package.json")
        if pkg:
            all_deps.update(pkg.get("dependencies", {}).keys())
            all_deps.update(pkg.get("devDependencies", {}).keys())

        # Database services
        db_indicators = {
            "psycopg2": "postgresql",
            "psycopg2-binary": "postgresql",
            "pg": "postgresql",
            "mysql": "mysql",
            "mysql2": "mysql",
            "pymongo": "mongodb",
            "mongodb": "mongodb",
            "mongoose": "mongodb",
            "redis": "redis",
            "redis-py": "redis",
            "ioredis": "redis",
            "sqlite3": "sqlite",
            "better-sqlite3": "sqlite"
        }

        for dep, db_type in db_indicators.items():
            if dep in all_deps:
                services["databases"].append({
                    "type": db_type,
                    "client": dep
                })

        # Cache services
        cache_indicators = ["redis", "memcached", "node-cache"]
        for indicator in cache_indicators:
            if indicator in all_deps:
                services["cache"].append({"type": indicator})

        # Message queues
        queue_indicators = {
            "celery": "celery",
            "bullmq": "bullmq",
            "bull": "bull",
            "kafka-python": "kafka",
            "kafkajs": "kafka",
            "amqplib": "rabbitmq",
            "amqp": "rabbitmq"
        }

        for dep, queue_type in queue_indicators.items():
            if dep in all_deps:
                services["message_queues"].append({
                    "type": queue_type,
                    "client": dep
                })

        # Email services
        email_indicators = {
            "sendgrid": "sendgrid",
            "@sendgrid/mail": "sendgrid",
            "nodemailer": "smtp",
            "mailgun": "mailgun",
            "postmark": "postmark"
        }

        for dep, email_type in email_indicators.items():
            if dep in all_deps:
                services["email"].append({
                    "provider": email_type,
                    "client": dep
                })

        # Payment processors
        payment_indicators = {
            "stripe": "stripe",
            "paypal": "paypal",
            "square": "square",
            "braintree": "braintree"
        }

        for dep, payment_type in payment_indicators.items():
            if dep in all_deps:
                services["payments"].append({
                    "provider": payment_type,
                    "client": dep
                })

        # Storage services
        storage_indicators = {
            "boto3": "aws_s3",
            "@aws-sdk/client-s3": "aws_s3",
            "aws-sdk": "aws_s3",
            "@google-cloud/storage": "google_cloud_storage",
            "azure-storage-blob": "azure_blob_storage"
        }

        for dep, storage_type in storage_indicators.items():
            if dep in all_deps:
                services["storage"].append({
                    "provider": storage_type,
                    "client": dep
                })

        # Auth providers
        auth_indicators = {
            "authlib": "oauth",
            "python-jose": "jwt",
            "pyjwt": "jwt",
            "jsonwebtoken": "jwt",
            "passport": "oauth",
            "next-auth": "oauth",
            "@auth/core": "oauth"
        }

        for dep, auth_type in auth_indicators.items():
            if dep in all_deps:
                services["auth_providers"].append({
                    "type": auth_type,
                    "client": dep
                })

        # Monitoring/observability
        monitoring_indicators = {
            "sentry-sdk": "sentry",
            "@sentry/node": "sentry",
            "datadog": "datadog",
            "newrelic": "new_relic",
            "loguru": "logging",
            "winston": "logging",
            "pino": "logging"
        }

        for dep, monitoring_type in monitoring_indicators.items():
            if dep in all_deps:
                services["monitoring"].append({
                    "type": monitoring_type,
                    "client": dep
                })

        # Remove empty categories
        services = {k: v for k, v in services.items() if v}

        if services:
            self.analysis["services"] = services

    def _detect_auth_patterns(self) -> None:
        """
        Detect authentication and authorization patterns.

        Detects: JWT, OAuth, session-based, API keys, user models, protected routes.
        """
        auth_info = {
            "strategies": [],
            "libraries": [],
            "user_model": None,
            "middleware": []
        }

        # Scan for auth libraries in dependencies
        all_deps = set()

        if self._exists("requirements.txt"):
            content = self._read_file("requirements.txt")
            all_deps.update(re.findall(r'^([a-zA-Z0-9_-]+)', content, re.MULTILINE))

        pkg = self._read_json("package.json")
        if pkg:
            all_deps.update(pkg.get("dependencies", {}).keys())

        # Detect auth strategies
        jwt_libs = ["python-jose", "pyjwt", "jsonwebtoken", "jose"]
        oauth_libs = ["authlib", "passport", "next-auth", "@auth/core", "oauth2"]
        session_libs = ["flask-login", "express-session", "django.contrib.auth"]

        for lib in jwt_libs:
            if lib in all_deps:
                auth_info["strategies"].append("jwt")
                auth_info["libraries"].append(lib)
                break

        for lib in oauth_libs:
            if lib in all_deps:
                auth_info["strategies"].append("oauth")
                auth_info["libraries"].append(lib)
                break

        for lib in session_libs:
            if lib in all_deps:
                auth_info["strategies"].append("session")
                auth_info["libraries"].append(lib)
                break

        # Find user model
        user_model_files = [
            "models/user.py", "models/User.py", "app/models/user.py",
            "models/user.ts", "models/User.ts", "src/models/user.ts"
        ]

        for model_file in user_model_files:
            if self._exists(model_file):
                auth_info["user_model"] = model_file
                break

        # Detect auth middleware/decorators
        all_py_files = list(self.path.glob("**/*.py"))[:20]  # Limit to first 20 files
        auth_decorators = set()

        for py_file in all_py_files:
            try:
                content = py_file.read_text()
                # Find custom decorators
                if '@require' in content or '@login_required' in content or '@authenticate' in content:
                    decorators = re.findall(r'@(\w*(?:require|auth|login)\w*)', content)
                    auth_decorators.update(decorators)
            except (IOError, UnicodeDecodeError):
                continue

        if auth_decorators:
            auth_info["middleware"] = list(auth_decorators)

        # Remove duplicates
        auth_info["strategies"] = list(set(auth_info["strategies"]))

        if auth_info["strategies"] or auth_info["libraries"]:
            self.analysis["auth"] = auth_info

    def _detect_migrations(self) -> None:
        """
        Detect database migration setup.

        Detects: Alembic, Django migrations, Knex, TypeORM, Prisma migrations.
        """
        migration_info = {}

        # Alembic (Python)
        if self._exists("alembic.ini") or self._exists("alembic"):
            migration_info = {
                "tool": "alembic",
                "directory": "alembic/versions" if self._exists("alembic/versions") else "alembic",
                "config_file": "alembic.ini",
                "commands": {
                    "upgrade": "alembic upgrade head",
                    "downgrade": "alembic downgrade -1",
                    "create": "alembic revision --autogenerate -m 'message'"
                }
            }

        # Django migrations
        elif self._exists("manage.py"):
            migration_dirs = list(self.path.glob("**/migrations"))
            if migration_dirs:
                migration_info = {
                    "tool": "django",
                    "directories": [str(d.relative_to(self.path)) for d in migration_dirs],
                    "commands": {
                        "migrate": "python manage.py migrate",
                        "makemigrations": "python manage.py makemigrations"
                    }
                }

        # Knex (Node.js)
        elif self._exists("knexfile.js") or self._exists("knexfile.ts"):
            migration_info = {
                "tool": "knex",
                "directory": "migrations",
                "config_file": "knexfile.js",
                "commands": {
                    "migrate": "knex migrate:latest",
                    "rollback": "knex migrate:rollback",
                    "create": "knex migrate:make migration_name"
                }
            }

        # TypeORM migrations
        elif self._exists("ormconfig.json") or self._exists("data-source.ts"):
            migration_info = {
                "tool": "typeorm",
                "directory": "migrations",
                "commands": {
                    "run": "typeorm migration:run",
                    "revert": "typeorm migration:revert",
                    "create": "typeorm migration:create"
                }
            }

        # Prisma migrations
        elif self._exists("prisma/schema.prisma"):
            migration_info = {
                "tool": "prisma",
                "directory": "prisma/migrations",
                "config_file": "prisma/schema.prisma",
                "commands": {
                    "migrate": "prisma migrate deploy",
                    "dev": "prisma migrate dev",
                    "create": "prisma migrate dev --name migration_name"
                }
            }

        if migration_info:
            self.analysis["migrations"] = migration_info

    def _detect_background_jobs(self) -> None:
        """
        Detect background job/task queue systems.

        Detects: Celery, BullMQ, Sidekiq, cron jobs, scheduled tasks.
        """
        jobs_info = {}

        # Celery (Python)
        celery_files = list(self.path.glob("**/celery.py")) + list(self.path.glob("**/tasks.py"))
        if celery_files:
            tasks = []
            for task_file in celery_files:
                try:
                    content = task_file.read_text()
                    # Find @celery.task or @shared_task decorators
                    task_pattern = r'@(?:celery\.task|shared_task|app\.task)\s*(?:\([^)]*\))?\s*def\s+(\w+)'
                    task_matches = re.findall(task_pattern, content)

                    for task_name in task_matches:
                        tasks.append({
                            "name": task_name,
                            "file": str(task_file.relative_to(self.path))
                        })

                except (IOError, UnicodeDecodeError):
                    continue

            if tasks:
                jobs_info = {
                    "system": "celery",
                    "tasks": tasks,
                    "total_tasks": len(tasks),
                    "worker_command": "celery -A app worker"
                }

        # BullMQ (Node.js)
        elif self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg and ("bullmq" in pkg.get("dependencies", {}) or "bull" in pkg.get("dependencies", {})):
                jobs_info = {
                    "system": "bullmq" if "bullmq" in pkg.get("dependencies", {}) else "bull",
                    "tasks": [],
                    "worker_command": "node worker.js"
                }

        # Sidekiq (Ruby)
        elif self._exists("Gemfile"):
            gemfile = self._read_file("Gemfile")
            if "sidekiq" in gemfile.lower():
                jobs_info = {
                    "system": "sidekiq",
                    "worker_command": "bundle exec sidekiq"
                }

        if jobs_info:
            self.analysis["background_jobs"] = jobs_info

    def _detect_api_documentation(self) -> None:
        """
        Detect API documentation setup.

        Detects: OpenAPI/Swagger, GraphQL playground, API docs endpoints.
        """
        docs_info = {}

        # FastAPI auto-generates OpenAPI docs
        if self.analysis.get("framework") == "FastAPI":
            docs_info = {
                "type": "openapi",
                "auto_generated": True,
                "docs_url": "/docs",
                "redoc_url": "/redoc",
                "openapi_url": "/openapi.json"
            }

        # Swagger/OpenAPI for Node.js
        elif self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "swagger-ui-express" in deps or "swagger-jsdoc" in deps:
                    docs_info = {
                        "type": "openapi",
                        "library": "swagger-ui-express",
                        "docs_url": "/api-docs"
                    }

        # GraphQL
        if self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "graphql" in deps or "apollo-server" in deps or "@apollo/server" in deps:
                    if not docs_info:
                        docs_info = {}
                    docs_info["graphql"] = {
                        "playground_url": "/graphql",
                        "library": "apollo-server" if "apollo-server" in deps else "graphql"
                    }

        if docs_info:
            self.analysis["api_documentation"] = docs_info

    def _detect_monitoring(self) -> None:
        """
        Detect monitoring and observability setup.

        Detects: Health checks, metrics endpoints, APM tools, logging.
        """
        monitoring_info = {}

        # Health check endpoints (look in routes)
        if "api" in self.analysis:
            routes = self.analysis["api"].get("routes", [])
            health_routes = [r for r in routes if "health" in r["path"].lower() or "ping" in r["path"].lower()]

            if health_routes:
                monitoring_info["health_checks"] = [r["path"] for r in health_routes]

        # Prometheus metrics
        all_files = list(self.path.glob("**/*.py"))[:30] + list(self.path.glob("**/*.js"))[:30]
        for file_path in all_files:
            try:
                content = file_path.read_text()
                if "prometheus" in content.lower() and "/metrics" in content:
                    monitoring_info["metrics_endpoint"] = "/metrics"
                    monitoring_info["metrics_type"] = "prometheus"
                    break
            except (IOError, UnicodeDecodeError):
                continue

        # APM tools (already detected in external_services, just reference here)
        if "services" in self.analysis and "monitoring" in self.analysis["services"]:
            monitoring_info["apm_tools"] = [s["type"] for s in self.analysis["services"]["monitoring"]]

        if monitoring_info:
            self.analysis["monitoring"] = monitoring_info

    def _detect_port_from_sources(self, default_port: int) -> int:
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
            "app.py", "main.py", "server.py", "__main__.py", "asgi.py", "wsgi.py",
            "src/app.py", "src/main.py", "src/server.py",
            "index.js", "index.ts", "server.js", "server.ts", "main.js", "main.ts",
            "src/index.js", "src/index.ts", "src/server.js", "src/server.ts",
            "main.go", "cmd/main.go", "src/main.rs",
        ]

        # Patterns to search for ports
        patterns = [
            # Python: uvicorn.run(app, host="0.0.0.0", port=8050)
            r'uvicorn\.run\([^)]*port\s*=\s*(\d+)',
            # Python: app.run(port=8050, host="0.0.0.0")
            r'\.run\([^)]*port\s*=\s*(\d+)',
            # Python: port = 8050 or PORT = 8050
            r'^\s*[Pp][Oo][Rr][Tt]\s*=\s*(\d+)',
            # Python: os.getenv("PORT", 8050) or os.environ.get("PORT", 8050)
            r'getenv\(\s*["\']PORT["\']\s*,\s*(\d+)',
            r'environ\.get\(\s*["\']PORT["\']\s*,\s*(\d+)',
            # JavaScript/TypeScript: app.listen(8050)
            r'\.listen\(\s*(\d+)',
            # JavaScript/TypeScript: const PORT = 8050 or let port = 8050
            r'(?:const|let|var)\s+[Pp][Oo][Rr][Tt]\s*=\s*(\d+)',
            # JavaScript/TypeScript: process.env.PORT || 8050
            r'process\.env\.PORT\s*\|\|\s*(\d+)',
            # JavaScript/TypeScript: Number(process.env.PORT) || 8050
            r'Number\(process\.env\.PORT\)\s*\|\|\s*(\d+)',
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
            ".env", ".env.local", ".env.development", ".env.dev",
            "config/.env", "config/.env.local", "../.env",
        ]

        patterns = [
            r'^\s*PORT\s*=\s*(\d+)',
            r'^\s*API_PORT\s*=\s*(\d+)',
            r'^\s*SERVER_PORT\s*=\s*(\d+)',
            r'^\s*APP_PORT\s*=\s*(\d+)',
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
            "docker-compose.yml", "docker-compose.yaml",
            "../docker-compose.yml", "../docker-compose.yaml",
        ]

        for compose_file in compose_files:
            content = self._read_file(compose_file)
            if not content:
                continue

            # Look for port mappings like "8050:8000" or "8050:8050"
            # Match the service name if possible
            service_name = self.name.lower()

            # Pattern: ports: - "8050:8000" or - 8050:8000
            pattern = r'^\s*-\s*["\']?(\d+):\d+["\']?'

            in_service = False
            in_ports = False

            for line in content.split('\n'):
                # Check if we're in the right service block
                if re.match(rf'^\s*{re.escape(service_name)}\s*:', line):
                    in_service = True
                    continue

                # Check if we hit another service
                if in_service and re.match(r'^\s*\w+\s*:', line) and 'ports:' not in line:
                    in_service = False
                    in_ports = False
                    continue

                # Check if we're in the ports section
                if in_service and 'ports:' in line:
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
            "config.py", "settings.py", "config/settings.py", "src/config.py",
            "config.json", "settings.json", "config/config.json",
            "config.toml", "settings.toml",
        ]

        for config_file in config_files:
            content = self._read_file(config_file)
            if not content:
                continue

            # Python config patterns
            patterns = [
                r'[Pp][Oo][Rr][Tt]\s*=\s*(\d+)',
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
            r'-p\s+(\d+)',
            r'--port\s+(\d+)',
            r'PORT=(\d+)',
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
            r'PORT=(\d+)',
            r'--port\s+(\d+)',
            r'-p\s+(\d+)',
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

    # Helper methods
    def _exists(self, path: str) -> bool:
        return (self.path / path).exists()

    def _read_file(self, path: str) -> str:
        try:
            return (self.path / path).read_text()
        except (IOError, UnicodeDecodeError):
            return ""

    def _read_json(self, path: str) -> dict | None:
        content = self._read_file(path)
        if content:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                return None
        return None


class ProjectAnalyzer:
    """Analyzes an entire project, detecting monorepo structure and all services."""

    def __init__(self, project_dir: Path):
        self.project_dir = project_dir.resolve()
        self.index = {
            "project_root": str(self.project_dir),
            "project_type": "single",  # or "monorepo"
            "services": {},
            "infrastructure": {},
            "conventions": {},
        }

    def analyze(self) -> dict[str, Any]:
        """Run full project analysis."""
        self._detect_project_type()
        self._find_and_analyze_services()
        self._analyze_infrastructure()
        self._detect_conventions()
        self._map_dependencies()
        return self.index

    def _detect_project_type(self) -> None:
        """Detect if this is a monorepo or single project."""
        monorepo_indicators = [
            "pnpm-workspace.yaml",
            "lerna.json",
            "nx.json",
            "turbo.json",
            "rush.json",
        ]

        for indicator in monorepo_indicators:
            if (self.project_dir / indicator).exists():
                self.index["project_type"] = "monorepo"
                self.index["monorepo_tool"] = indicator.replace(".json", "").replace(".yaml", "")
                return

        # Check for packages/apps directories
        if (self.project_dir / "packages").exists() or (self.project_dir / "apps").exists():
            self.index["project_type"] = "monorepo"
            return

        # Check for multiple service directories
        service_dirs_found = 0
        for item in self.project_dir.iterdir():
            if item.is_dir() and item.name in SERVICE_INDICATORS:
                if any((item / f).exists() for f in SERVICE_ROOT_FILES):
                    service_dirs_found += 1

        if service_dirs_found >= 2:
            self.index["project_type"] = "monorepo"

    def _find_and_analyze_services(self) -> None:
        """Find all services and analyze each."""
        services = {}

        if self.index["project_type"] == "monorepo":
            # Look for services in common locations
            service_locations = [
                self.project_dir,
                self.project_dir / "packages",
                self.project_dir / "apps",
                self.project_dir / "services",
            ]

            for location in service_locations:
                if not location.exists():
                    continue

                for item in location.iterdir():
                    if not item.is_dir():
                        continue
                    if item.name in SKIP_DIRS:
                        continue
                    if item.name.startswith("."):
                        continue

                    # Check if this looks like a service
                    has_root_file = any((item / f).exists() for f in SERVICE_ROOT_FILES)
                    is_service_name = item.name.lower() in SERVICE_INDICATORS

                    if has_root_file or (location == self.project_dir and is_service_name):
                        analyzer = ServiceAnalyzer(item, item.name)
                        service_info = analyzer.analyze()
                        if service_info.get("language"):  # Only include if we detected something
                            services[item.name] = service_info
        else:
            # Single project - analyze root
            analyzer = ServiceAnalyzer(self.project_dir, "main")
            service_info = analyzer.analyze()
            if service_info.get("language"):
                services["main"] = service_info

        self.index["services"] = services

    def _analyze_infrastructure(self) -> None:
        """Analyze infrastructure configuration."""
        infra = {}

        # Docker
        if (self.project_dir / "docker-compose.yml").exists():
            infra["docker_compose"] = "docker-compose.yml"
            compose_content = self._read_file("docker-compose.yml")
            infra["docker_services"] = self._parse_compose_services(compose_content)
        elif (self.project_dir / "docker-compose.yaml").exists():
            infra["docker_compose"] = "docker-compose.yaml"
            compose_content = self._read_file("docker-compose.yaml")
            infra["docker_services"] = self._parse_compose_services(compose_content)

        if (self.project_dir / "Dockerfile").exists():
            infra["dockerfile"] = "Dockerfile"

        # Docker directory
        docker_dir = self.project_dir / "docker"
        if docker_dir.exists():
            dockerfiles = list(docker_dir.glob("Dockerfile*")) + list(docker_dir.glob("*.Dockerfile"))
            if dockerfiles:
                infra["docker_directory"] = "docker/"
                infra["dockerfiles"] = [str(f.relative_to(self.project_dir)) for f in dockerfiles]

        # CI/CD
        if (self.project_dir / ".github" / "workflows").exists():
            infra["ci"] = "GitHub Actions"
            workflows = list((self.project_dir / ".github" / "workflows").glob("*.yml"))
            infra["ci_workflows"] = [f.name for f in workflows]
        elif (self.project_dir / ".gitlab-ci.yml").exists():
            infra["ci"] = "GitLab CI"
        elif (self.project_dir / ".circleci").exists():
            infra["ci"] = "CircleCI"

        # Deployment
        deployment_files = {
            "vercel.json": "Vercel",
            "netlify.toml": "Netlify",
            "fly.toml": "Fly.io",
            "render.yaml": "Render",
            "railway.json": "Railway",
            "Procfile": "Heroku",
            "app.yaml": "Google App Engine",
            "serverless.yml": "Serverless Framework",
        }

        for file, platform in deployment_files.items():
            if (self.project_dir / file).exists():
                infra["deployment"] = platform
                break

        self.index["infrastructure"] = infra

    def _parse_compose_services(self, content: str) -> list[str]:
        """Extract service names from docker-compose content."""
        services = []
        in_services = False
        for line in content.split("\n"):
            if line.strip() == "services:":
                in_services = True
                continue
            if in_services:
                # Service names are at 2-space indent
                if line.startswith("  ") and not line.startswith("    ") and line.strip().endswith(":"):
                    service_name = line.strip().rstrip(":")
                    services.append(service_name)
                elif line and not line.startswith(" "):
                    break  # End of services section
        return services

    def _detect_conventions(self) -> None:
        """Detect project-wide conventions."""
        conventions = {}

        # Python linting
        if (self.project_dir / "ruff.toml").exists() or self._has_in_pyproject("ruff"):
            conventions["python_linting"] = "Ruff"
        elif (self.project_dir / ".flake8").exists():
            conventions["python_linting"] = "Flake8"
        elif (self.project_dir / "pylintrc").exists():
            conventions["python_linting"] = "Pylint"

        # Python formatting
        if (self.project_dir / "pyproject.toml").exists():
            content = self._read_file("pyproject.toml")
            if "[tool.black]" in content:
                conventions["python_formatting"] = "Black"

        # JavaScript/TypeScript linting
        eslint_files = [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js"]
        if any((self.project_dir / f).exists() for f in eslint_files):
            conventions["js_linting"] = "ESLint"

        # Prettier
        prettier_files = [".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js"]
        if any((self.project_dir / f).exists() for f in prettier_files):
            conventions["formatting"] = "Prettier"

        # TypeScript
        if (self.project_dir / "tsconfig.json").exists():
            conventions["typescript"] = True

        # Git hooks
        if (self.project_dir / ".husky").exists():
            conventions["git_hooks"] = "Husky"
        elif (self.project_dir / ".pre-commit-config.yaml").exists():
            conventions["git_hooks"] = "pre-commit"

        self.index["conventions"] = conventions

    def _map_dependencies(self) -> None:
        """Map dependencies between services."""
        services = self.index.get("services", {})

        for service_name, service_info in services.items():
            consumes = []

            # Check for API client patterns
            if service_info.get("type") == "frontend":
                # Frontend typically consumes backend
                for other_name, other_info in services.items():
                    if other_info.get("type") == "backend":
                        consumes.append(f"{other_name}.api")

            # Check for shared libraries
            if service_info.get("dependencies"):
                deps = service_info["dependencies"]
                for other_name in services.keys():
                    if other_name in deps or f"@{other_name}" in str(deps):
                        consumes.append(other_name)

            if consumes:
                service_info["consumes"] = consumes

    def _has_in_pyproject(self, tool: str) -> bool:
        """Check if a tool is configured in pyproject.toml."""
        if (self.project_dir / "pyproject.toml").exists():
            content = self._read_file("pyproject.toml")
            return f"[tool.{tool}]" in content
        return False

    def _read_file(self, path: str) -> str:
        try:
            return (self.project_dir / path).read_text()
        except (IOError, UnicodeDecodeError):
            return ""


def analyze_project(project_dir: Path, output_file: Path | None = None) -> dict:
    """
    Analyze a project and optionally save results.

    Args:
        project_dir: Path to the project root
        output_file: Optional path to save JSON output

    Returns:
        Project index as a dictionary
    """
    analyzer = ProjectAnalyzer(project_dir)
    results = analyzer.analyze()

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Project index saved to: {output_file}")

    return results


def analyze_service(project_dir: Path, service_name: str, output_file: Path | None = None) -> dict:
    """
    Analyze a specific service within a project.

    Args:
        project_dir: Path to the project root
        service_name: Name of the service to analyze
        output_file: Optional path to save JSON output

    Returns:
        Service analysis as a dictionary
    """
    # Find the service
    service_path = project_dir / service_name
    if not service_path.exists():
        # Check common locations
        for parent in ["packages", "apps", "services"]:
            candidate = project_dir / parent / service_name
            if candidate.exists():
                service_path = candidate
                break

    if not service_path.exists():
        raise ValueError(f"Service '{service_name}' not found in {project_dir}")

    analyzer = ServiceAnalyzer(service_path, service_name)
    results = analyzer.analyze()

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Service analysis saved to: {output_file}")

    return results


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Analyze project structure, frameworks, and services"
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory to analyze (default: current directory)",
    )
    parser.add_argument(
        "--index",
        action="store_true",
        help="Create full project index (default behavior)",
    )
    parser.add_argument(
        "--service",
        type=str,
        default=None,
        help="Analyze a specific service only",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file for JSON results",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only output JSON, no status messages",
    )

    args = parser.parse_args()

    # Determine what to analyze
    if args.service:
        results = analyze_service(args.project_dir, args.service, args.output)
    else:
        results = analyze_project(args.project_dir, args.output)

    # Print results
    if not args.quiet or not args.output:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
