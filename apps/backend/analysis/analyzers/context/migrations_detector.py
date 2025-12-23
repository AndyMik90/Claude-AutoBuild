"""
Database Migrations Detector Module
====================================

Detects database migration tools and configurations:
- Alembic (Python)
- Django migrations
- Knex (Node.js)
- TypeORM
- Prisma
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..base import BaseAnalyzer


class MigrationsDetector(BaseAnalyzer):
    """Detects database migration setup and tools."""

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect(self) -> None:
        """
        Detect database migration setup.

        Detects: Alembic, Django migrations, Knex, TypeORM, Prisma migrations.
        """
        migration_info = None

        # Try each migration tool in order
        migration_info = (
            self._detect_alembic()
            or self._detect_django()
            or self._detect_knex()
            or self._detect_typeorm()
            or self._detect_prisma()
        )

        if migration_info:
            self.analysis["migrations"] = migration_info

    def _detect_alembic(self) -> dict[str, Any] | None:
        """Detect Alembic (Python) migrations."""
        if not (self._exists("alembic.ini") or self._exists("alembic")):
            return None

        return {
            "tool": "alembic",
            "directory": "alembic/versions"
            if self._exists("alembic/versions")
            else "alembic",
            "config_file": "alembic.ini",
            "commands": {
                "upgrade": "alembic upgrade head",
                "downgrade": "alembic downgrade -1",
                "create": "alembic revision --autogenerate -m 'message'",
            },
        }

    def _detect_django(self) -> dict[str, Any] | None:
        """Detect Django migrations."""
        if not self._exists("manage.py"):
            return None

        migration_dirs = list(self.path.glob("**/migrations"))
        if not migration_dirs:
            return None

        return {
            "tool": "django",
            "directories": [str(d.relative_to(self.path)) for d in migration_dirs],
            "commands": {
                "migrate": "python manage.py migrate",
                "makemigrations": "python manage.py makemigrations",
            },
        }

    def _detect_knex(self) -> dict[str, Any] | None:
        """Detect Knex (Node.js) migrations."""
        if not (self._exists("knexfile.js") or self._exists("knexfile.ts")):
            return None

        return {
            "tool": "knex",
            "directory": "migrations",
            "config_file": "knexfile.js",
            "commands": {
                "migrate": "knex migrate:latest",
                "rollback": "knex migrate:rollback",
                "create": "knex migrate:make migration_name",
            },
        }

    def _detect_typeorm(self) -> dict[str, Any] | None:
        """Detect TypeORM migrations."""
        if not (self._exists("ormconfig.json") or self._exists("data-source.ts")):
            return None

        return {
            "tool": "typeorm",
            "directory": "migrations",
            "commands": {
                "run": "typeorm migration:run",
                "revert": "typeorm migration:revert",
                "create": "typeorm migration:create",
            },
        }

    def _detect_prisma(self) -> dict[str, Any] | None:
        """Detect Prisma migrations."""
        if not self._exists("prisma/schema.prisma"):
            return None

        return {
            "tool": "prisma",
            "directory": "prisma/migrations",
            "config_file": "prisma/schema.prisma",
            "commands": {
                "migrate": "prisma migrate deploy",
                "dev": "prisma migrate dev",
                "create": "prisma migrate dev --name migration_name",
            },
        }
