"""
Individual analyzer implementations for different aspects of code analysis.
"""

from typing import Any


class BaseAnalyzer:
    """Base class for all analyzers."""

    def __init__(self, project_index: dict[str, Any]):
        """
        Initialize analyzer.

        Args:
            project_index: Output from programmatic analyzer
        """
        self.project_index = project_index

    def get_services(self) -> dict[str, Any]:
        """Get services from project index."""
        return self.project_index.get("services", {})

    def get_first_service(self) -> tuple[str, dict[str, Any]] | None:
        """
        Get first service from project index.

        Returns:
            Tuple of (service_name, service_data) or None if no services
        """
        services = self.get_services()
        if not services:
            return None
        return next(iter(services.items()))


class CodeRelationshipsAnalyzer(BaseAnalyzer):
    """Analyzes code relationships and dependencies."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        service_data_tuple = self.get_first_service()
        if not service_data_tuple:
            raise ValueError("No services found in project index")

        service_name, service_data = service_data_tuple
        routes = service_data.get("api", {}).get("routes", [])
        models = service_data.get("database", {}).get("models", {})

        routes_str = "\n".join(
            [
                f"  - {r['methods']} {r['path']} (in {r['file']})"
                for r in routes[:10]  # Limit to top 10
            ]
        )

        models_str = "\n".join([f"  - {name}" for name in list(models.keys())[:10]])

        return f"""Analyze the code relationships in this project.

**Known API Routes:**
{routes_str}

**Known Database Models:**
{models_str}

For the top 3 most important API routes, trace the complete execution path:
1. What handler/controller handles it?
2. What services/functions are called?
3. What database operations occur?
4. What external services are used?

Output your analysis as JSON with this structure:
{{
  "relationships": [
    {{
      "route": "/api/endpoint",
      "handler": "function_name",
      "calls": ["service1.method", "service2.method"],
      "database_operations": ["User.create", "Post.query"],
      "external_services": ["stripe", "sendgrid"]
    }}
  ],
  "circular_dependencies": [],
  "dead_code_found": [],
  "score": 85
}}

Use Read, Grep, and Glob tools to analyze the codebase. Focus on actual code, not guessing."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "relationships": []}


class BusinessLogicAnalyzer(BaseAnalyzer):
    """Analyzes business logic and workflows."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        return """Analyze the business logic in this project.

Identify the key business workflows (payment processing, user registration, data sync, etc.).
For each workflow:
1. What triggers it? (API call, background job, event)
2. What are the main steps?
3. What validation/business rules are applied?
4. What happens on success vs failure?

Output JSON:
{
  "workflows": [
    {
      "name": "User Registration",
      "trigger": "POST /users",
      "steps": ["validate input", "create user", "send email", "return token"],
      "business_rules": ["email must be unique", "password min 8 chars"],
      "error_handling": "rolls back transaction on failure"
    }
  ],
  "key_business_rules": [],
  "score": 80
}

Use Read and Grep to analyze actual code logic."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "workflows": []}


class ArchitectureAnalyzer(BaseAnalyzer):
    """Analyzes architecture patterns and design."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        return """Analyze the architecture patterns used in this codebase.

Identify:
1. Design patterns (Repository, Factory, Dependency Injection, etc.)
2. Architectural style (MVC, Layered, Microservices, etc.)
3. SOLID principles adherence
4. Code organization and separation of concerns

Output JSON:
{
  "architecture_style": "Layered architecture with MVC pattern",
  "design_patterns": ["Repository pattern for data access", "Factory for service creation"],
  "solid_compliance": {
    "single_responsibility": 8,
    "open_closed": 7,
    "liskov_substitution": 6,
    "interface_segregation": 7,
    "dependency_inversion": 8
  },
  "suggestions": ["Extract validation logic into separate validators"],
  "score": 75
}

Analyze the actual code structure using Read, Grep, and Glob."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "architecture_style": "unknown"}


class SecurityAnalyzer(BaseAnalyzer):
    """Analyzes security vulnerabilities."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        return """Perform a security analysis of this codebase.

Check for OWASP Top 10 vulnerabilities:
1. SQL Injection (use of raw queries, string concatenation)
2. XSS (unsafe HTML rendering, missing sanitization)
3. Authentication/Authorization issues
4. Sensitive data exposure (hardcoded secrets, logging passwords)
5. Security misconfiguration
6. Insecure dependencies (check for known vulnerable packages)

Output JSON:
{
  "vulnerabilities": [
    {
      "type": "SQL Injection",
      "severity": "high",
      "location": "users.py:45",
      "description": "Raw SQL query with user input",
      "recommendation": "Use parameterized queries"
    }
  ],
  "security_score": 65,
  "critical_count": 2,
  "high_count": 5,
  "score": 65
}

Use Grep to search for security anti-patterns."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "vulnerabilities": []}


class PerformanceAnalyzer(BaseAnalyzer):
    """Analyzes performance bottlenecks."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        return """Analyze potential performance bottlenecks in this codebase.

Look for:
1. N+1 query problems (loops with database queries)
2. Missing database indexes
3. Inefficient algorithms (nested loops, repeated computations)
4. Memory leaks (unclosed resources, large data structures)
5. Blocking I/O in async contexts

Output JSON:
{
  "bottlenecks": [
    {
      "type": "N+1 Query",
      "severity": "high",
      "location": "posts.py:120",
      "description": "Loading comments in loop for each post",
      "impact": "Database load increases linearly with posts",
      "fix": "Use eager loading or join query"
    }
  ],
  "performance_score": 70,
  "score": 70
}

Use Grep to find database queries and loops."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "bottlenecks": []}


class CodeQualityAnalyzer(BaseAnalyzer):
    """Analyzes code quality and maintainability."""

    def get_prompt(self) -> str:
        """Generate analysis prompt."""
        return """Analyze code quality and maintainability.

Check for:
1. Code duplication (repeated logic)
2. Function complexity (long functions, deep nesting)
3. Code smells (god classes, feature envy, shotgun surgery)
4. Test coverage gaps
5. Documentation quality

Output JSON:
{
  "code_smells": [
    {
      "type": "Long Function",
      "location": "handlers.py:process_request",
      "lines": 250,
      "recommendation": "Split into smaller functions"
    }
  ],
  "duplication_percentage": 15,
  "avg_function_complexity": 12,
  "documentation_score": 60,
  "maintainability_score": 70,
  "score": 70
}

Use Read and Glob to analyze code structure."""

    def get_default_result(self) -> dict[str, Any]:
        """Get default result structure."""
        return {"score": 0, "code_smells": []}


class AnalyzerFactory:
    """Factory for creating analyzer instances."""

    ANALYZER_CLASSES = {
        "code_relationships": CodeRelationshipsAnalyzer,
        "business_logic": BusinessLogicAnalyzer,
        "architecture": ArchitectureAnalyzer,
        "security": SecurityAnalyzer,
        "performance": PerformanceAnalyzer,
        "code_quality": CodeQualityAnalyzer,
    }

    @classmethod
    def create(cls, analyzer_name: str, project_index: dict[str, Any]) -> BaseAnalyzer:
        """
        Create analyzer instance.

        Args:
            analyzer_name: Name of analyzer to create
            project_index: Project index data

        Returns:
            Analyzer instance

        Raises:
            ValueError: If analyzer name is unknown
        """
        analyzer_class = cls.ANALYZER_CLASSES.get(analyzer_name)
        if not analyzer_class:
            raise ValueError(f"Unknown analyzer: {analyzer_name}")

        return analyzer_class(project_index)
