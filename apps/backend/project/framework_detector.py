"""
Framework Detection Module
==========================

Detects frameworks and libraries from package dependencies
(package.json, pyproject.toml, requirements.txt, Gemfile, etc.).
"""

import re
from pathlib import Path

from .config_parser import ConfigParser


class FrameworkDetector:
    """Detects frameworks from project dependencies."""

    def __init__(self, project_dir: Path):
        """
        Initialize framework detector.

        Args:
            project_dir: Root directory of the project
        """
        self.project_dir = Path(project_dir).resolve()
        self.parser = ConfigParser(project_dir)
        self.frameworks = []

    def detect_all(self) -> list[str]:
        """
        Run all framework detection methods.

        Returns:
            List of detected frameworks
        """
        self.detect_nodejs_frameworks()
        self.detect_python_frameworks()
        self.detect_ruby_frameworks()
        self.detect_php_frameworks()
        self.detect_dart_frameworks()
        return self.frameworks

    def detect_nodejs_frameworks(self) -> None:
        """Detect Node.js frameworks from package.json."""
        pkg = self.parser.read_json("package.json")
        if not pkg:
            return

        deps = {
            **pkg.get("dependencies", {}),
            **pkg.get("devDependencies", {}),
        }

        # Detect Node.js frameworks
        framework_deps = {
            "next": "nextjs",
            "nuxt": "nuxt",
            "react": "react",
            "vue": "vue",
            "@angular/core": "angular",
            "svelte": "svelte",
            "@sveltejs/kit": "svelte",
            "astro": "astro",
            "@remix-run/react": "remix",
            "gatsby": "gatsby",
            "express": "express",
            "@nestjs/core": "nestjs",
            "fastify": "fastify",
            "koa": "koa",
            "@hapi/hapi": "hapi",
            "@adonisjs/core": "adonis",
            "strapi": "strapi",
            "@keystonejs/core": "keystone",
            "payload": "payload",
            "@directus/sdk": "directus",
            "@medusajs/medusa": "medusa",
            "blitz": "blitz",
            "@redwoodjs/core": "redwood",
            "sails": "sails",
            "meteor": "meteor",
            "electron": "electron",
            "@tauri-apps/api": "tauri",
            "@capacitor/core": "capacitor",
            "expo": "expo",
            "react-native": "react-native",
            # Build tools
            "vite": "vite",
            "webpack": "webpack",
            "rollup": "rollup",
            "esbuild": "esbuild",
            "parcel": "parcel",
            "turbo": "turbo",
            "nx": "nx",
            "lerna": "lerna",
            # Testing
            "jest": "jest",
            "vitest": "vitest",
            "mocha": "mocha",
            "@playwright/test": "playwright",
            "cypress": "cypress",
            "puppeteer": "puppeteer",
            # Linting
            "eslint": "eslint",
            "prettier": "prettier",
            "@biomejs/biome": "biome",
            "oxlint": "oxlint",
            # Database
            "prisma": "prisma",
            "drizzle-orm": "drizzle",
            "typeorm": "typeorm",
            "sequelize": "sequelize",
            "knex": "knex",
        }

        for dep, framework in framework_deps.items():
            if dep in deps:
                self.frameworks.append(framework)

    def detect_python_frameworks(self) -> None:
        """Detect Python frameworks from dependencies."""
        python_deps = set()

        # Parse pyproject.toml
        toml = self.parser.read_toml("pyproject.toml")
        if toml:
            # Poetry style
            if "tool" in toml and "poetry" in toml.get("tool", {}):
                poetry = toml["tool"]["poetry"]
                python_deps.update(poetry.get("dependencies", {}).keys())
                python_deps.update(poetry.get("dev-dependencies", {}).keys())
                if "group" in poetry:
                    for group in poetry["group"].values():
                        python_deps.update(group.get("dependencies", {}).keys())

            # Modern pyproject.toml style
            if "project" in toml:
                for dep in toml["project"].get("dependencies", []):
                    # Parse "package>=1.0" style
                    match = re.match(r"^([a-zA-Z0-9_-]+)", dep)
                    if match:
                        python_deps.add(match.group(1).lower())

            # Optional dependencies
            if "project" in toml and "optional-dependencies" in toml["project"]:
                for group_deps in toml["project"]["optional-dependencies"].values():
                    for dep in group_deps:
                        match = re.match(r"^([a-zA-Z0-9_-]+)", dep)
                        if match:
                            python_deps.add(match.group(1).lower())

        # Parse requirements.txt
        for req_file in [
            "requirements.txt",
            "requirements-dev.txt",
            "requirements/dev.txt",
        ]:
            content = self.parser.read_text(req_file)
            if content:
                for line in content.splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and not line.startswith("-"):
                        match = re.match(r"^([a-zA-Z0-9_-]+)", line)
                        if match:
                            python_deps.add(match.group(1).lower())

        # Detect Python frameworks from dependencies
        python_framework_deps = {
            "flask": "flask",
            "django": "django",
            "fastapi": "fastapi",
            "starlette": "starlette",
            "tornado": "tornado",
            "bottle": "bottle",
            "pyramid": "pyramid",
            "sanic": "sanic",
            "aiohttp": "aiohttp",
            "celery": "celery",
            "dramatiq": "dramatiq",
            "rq": "rq",
            "airflow": "airflow",
            "prefect": "prefect",
            "dagster": "dagster",
            "dbt-core": "dbt",
            "streamlit": "streamlit",
            "gradio": "gradio",
            "panel": "panel",
            "dash": "dash",
            "pytest": "pytest",
            "tox": "tox",
            "nox": "nox",
            "mypy": "mypy",
            "pyright": "pyright",
            "ruff": "ruff",
            "black": "black",
            "isort": "isort",
            "flake8": "flake8",
            "pylint": "pylint",
            "bandit": "bandit",
            "coverage": "coverage",
            "pre-commit": "pre-commit",
            "alembic": "alembic",
            "sqlalchemy": "sqlalchemy",
        }

        for dep, framework in python_framework_deps.items():
            if dep in python_deps:
                self.frameworks.append(framework)

    def detect_ruby_frameworks(self) -> None:
        """Detect Ruby frameworks from Gemfile."""
        if not self.parser.file_exists("Gemfile"):
            return

        content = self.parser.read_text("Gemfile")
        if content:
            content_lower = content.lower()
            if "rails" in content_lower:
                self.frameworks.append("rails")
            if "sinatra" in content_lower:
                self.frameworks.append("sinatra")
            if "rspec" in content_lower:
                self.frameworks.append("rspec")
            if "rubocop" in content_lower:
                self.frameworks.append("rubocop")

    def detect_php_frameworks(self) -> None:
        """Detect PHP frameworks from composer.json."""
        composer = self.parser.read_json("composer.json")
        if not composer:
            return

        deps = {
            **composer.get("require", {}),
            **composer.get("require-dev", {}),
        }

        if "laravel/framework" in deps:
            self.frameworks.append("laravel")
        if "symfony/framework-bundle" in deps:
            self.frameworks.append("symfony")
        if "phpunit/phpunit" in deps:
            self.frameworks.append("phpunit")

    def detect_dart_frameworks(self) -> None:
        """Detect Dart/Flutter frameworks from pubspec.yaml."""
        # Read pubspec.yaml as text since we don't have a YAML parser
        content = self.parser.read_text("pubspec.yaml")
        if not content:
            return

        content_lower = content.lower()

        # Detect Flutter
        if "flutter:" in content_lower or "sdk: flutter" in content_lower:
            self.frameworks.append("flutter")

        # Detect Dart backend frameworks
        if "dart_frog" in content_lower:
            self.frameworks.append("dart_frog")
        if "serverpod" in content_lower:
            self.frameworks.append("serverpod")
        if "shelf" in content_lower:
            self.frameworks.append("shelf")
        if "aqueduct" in content_lower:
            self.frameworks.append("aqueduct")
