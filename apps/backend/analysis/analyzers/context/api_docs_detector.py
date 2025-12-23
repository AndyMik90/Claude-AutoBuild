"""
API Documentation Detector Module
==================================

Detects API documentation tools and configurations:
- OpenAPI/Swagger (FastAPI auto-generated, swagger-ui-express)
- GraphQL playground
- API documentation endpoints
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..base import BaseAnalyzer


class ApiDocsDetector(BaseAnalyzer):
    """Detects API documentation setup."""

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect(self) -> None:
        """
        Detect API documentation setup.

        Detects: OpenAPI/Swagger, GraphQL playground, API docs endpoints.
        """
        docs_info = {}

        # Detect OpenAPI/Swagger
        openapi_info = self._detect_fastapi() or self._detect_swagger_nodejs()
        if openapi_info:
            docs_info.update(openapi_info)

        # Detect GraphQL
        graphql_info = self._detect_graphql()
        if graphql_info:
            docs_info["graphql"] = graphql_info

        if docs_info:
            self.analysis["api_documentation"] = docs_info

    def _detect_fastapi(self) -> dict[str, Any] | None:
        """Detect FastAPI auto-generated OpenAPI docs."""
        if self.analysis.get("framework") != "FastAPI":
            return None

        return {
            "type": "openapi",
            "auto_generated": True,
            "docs_url": "/docs",
            "redoc_url": "/redoc",
            "openapi_url": "/openapi.json",
        }

    def _detect_swagger_nodejs(self) -> dict[str, Any] | None:
        """Detect Swagger for Node.js projects."""
        if not self._exists("package.json"):
            return None

        pkg = self._read_json("package.json")
        if not pkg:
            return None

        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "swagger-ui-express" in deps or "swagger-jsdoc" in deps:
            return {
                "type": "openapi",
                "library": "swagger-ui-express",
                "docs_url": "/api-docs",
            }

        return None

    def _detect_graphql(self) -> dict[str, str] | None:
        """Detect GraphQL API and playground."""
        if not self._exists("package.json"):
            return None

        pkg = self._read_json("package.json")
        if not pkg:
            return None

        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "graphql" in deps or "apollo-server" in deps or "@apollo/server" in deps:
            return {
                "playground_url": "/graphql",
                "library": "apollo-server" if "apollo-server" in deps else "graphql",
            }

        return None
