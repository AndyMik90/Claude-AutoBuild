#!/usr/bin/env python3
"""
AI-Enhanced Project Analyzer

Runs AI analysis to extract deep insights after programmatic analysis.
Uses Claude Agent SDK for intelligent codebase understanding.

Example:
    # Run full analysis
    python ai_analyzer_runner.py --project-dir /path/to/project

    # Run specific analyzers only
    python ai_analyzer_runner.py --analyzers security performance

    # Skip cache
    python ai_analyzer_runner.py --skip-cache
"""

from pathlib import Path
from typing import Optional
import json
import time
import asyncio
import os
from datetime import datetime

try:
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
    CLAUDE_SDK_AVAILABLE = True
except ImportError:
    CLAUDE_SDK_AVAILABLE = False
    print("⚠️  Warning: claude-agent-sdk not available. Install with: pip install claude-agent-sdk")


class AIAnalyzerRunner:
    """Orchestrates AI-powered project analysis."""

    def __init__(self, project_dir: Path, project_index: dict):
        """
        Initialize AI analyzer.

        Args:
            project_dir: Root directory of project
            project_index: Output from programmatic analyzer (analyzer.py)
        """
        self.project_dir = project_dir
        self.project_index = project_index
        self.cache_dir = project_dir / ".auto-claude" / "ai_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    async def run_full_analysis(
        self,
        skip_cache: bool = False,
        selected_analyzers: Optional[list[str]] = None
    ) -> dict:
        """
        Run all AI analyzers.

        Args:
            skip_cache: If True, ignore cached results
            selected_analyzers: If provided, only run these analyzers

        Returns:
            Complete AI insights
        """
        print("\n" + "=" * 60)
        print("  AI-ENHANCED PROJECT ANALYSIS")
        print("=" * 60 + "\n")

        # Check for cached analysis
        cache_file = self.cache_dir / "ai_insights.json"
        if not skip_cache and cache_file.exists():
            cache_age = time.time() - cache_file.stat().st_mtime
            hours_old = cache_age / 3600

            if hours_old < 24:  # Cache valid for 24 hours
                print(f"✓ Using cached AI insights ({hours_old:.1f} hours old)")
                return json.loads(cache_file.read_text())
            else:
                print(f"⚠️  Cache expired ({hours_old:.1f} hours old), re-analyzing...")

        if not CLAUDE_SDK_AVAILABLE:
            print("✗ Claude Agent SDK not available. Cannot run AI analysis.")
            return {"error": "Claude SDK not installed"}

        # Estimate cost before running
        cost_estimate = self._estimate_cost()
        print(f"\n📊 Cost Estimate:")
        print(f"   Tokens: ~{cost_estimate['estimated_tokens']:,}")
        print(f"   Cost: ~${cost_estimate['estimated_cost_usd']:.4f} USD")
        print(f"   Files: {cost_estimate['files_to_analyze']}")
        print()

        insights = {
            "analysis_timestamp": datetime.now().isoformat(),
            "project_dir": str(self.project_dir),
            "cost_estimate": cost_estimate,
        }

        # Determine which analyzers to run
        all_analyzers = [
            "code_relationships",
            "business_logic",
            "architecture",
            "security",
            "performance",
            "code_quality"
        ]

        analyzers_to_run = selected_analyzers if selected_analyzers else all_analyzers

        # Run each analyzer
        for analyzer_name in analyzers_to_run:
            if analyzer_name not in all_analyzers:
                print(f"⚠️  Unknown analyzer: {analyzer_name}, skipping...")
                continue

            print(f"\n🤖 Running {analyzer_name.replace('_', ' ').title()} Analyzer...")
            start_time = time.time()

            try:
                result = await self._run_analyzer(analyzer_name)
                insights[analyzer_name] = result

                duration = time.time() - start_time
                score = result.get("score", 0)
                print(f"   ✓ Completed in {duration:.1f}s (score: {score}/100)")

            except Exception as e:
                print(f"   ✗ Error: {e}")
                insights[analyzer_name] = {"error": str(e)}

        # Calculate overall score
        scores = [
            insights[name].get("score", 0)
            for name in analyzers_to_run
            if name in insights and "error" not in insights[name]
        ]
        insights["overall_score"] = sum(scores) // len(scores) if scores else 0

        # Cache results
        cache_file.write_text(json.dumps(insights, indent=2))
        print(f"\n✓ AI insights cached to: {cache_file}")
        print(f"\n📊 Overall Score: {insights['overall_score']}/100")

        return insights

    async def _run_analyzer(self, analyzer_name: str) -> dict:
        """Run a specific AI analyzer."""
        analyzer_methods = {
            "code_relationships": self._analyze_code_relationships,
            "business_logic": self._analyze_business_logic,
            "architecture": self._analyze_architecture,
            "security": self._analyze_security,
            "performance": self._analyze_performance,
            "code_quality": self._analyze_code_quality,
        }

        method = analyzer_methods.get(analyzer_name)
        if not method:
            raise ValueError(f"Unknown analyzer: {analyzer_name}")

        return await method()

    async def _analyze_code_relationships(self) -> dict:
        """Analyze code relationships using AI."""
        # Get known routes and models from programmatic analysis
        services = self.project_index.get("services", {})
        if not services:
            return {"error": "No services found in project index"}

        # Take first service for analysis
        service_name, service_data = next(iter(services.items()))
        routes = service_data.get("api", {}).get("routes", [])
        models = service_data.get("database", {}).get("models", {})

        routes_str = "\n".join([
            f"  - {r['methods']} {r['path']} (in {r['file']})"
            for r in routes[:10]  # Limit to top 10
        ])

        models_str = "\n".join([f"  - {name}" for name in list(models.keys())[:10]])

        prompt = f"""Analyze the code relationships in this project.

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

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "relationships": []})

    async def _analyze_business_logic(self) -> dict:
        """Analyze business logic and workflows."""
        services = self.project_index.get("services", {})
        if not services:
            return {"error": "No services found"}

        service_name, service_data = next(iter(services.items()))
        routes = service_data.get("api", {}).get("routes", [])

        prompt = f"""Analyze the business logic in this project.

Identify the key business workflows (payment processing, user registration, data sync, etc.).
For each workflow:
1. What triggers it? (API call, background job, event)
2. What are the main steps?
3. What validation/business rules are applied?
4. What happens on success vs failure?

Output JSON:
{{
  "workflows": [
    {{
      "name": "User Registration",
      "trigger": "POST /users",
      "steps": ["validate input", "create user", "send email", "return token"],
      "business_rules": ["email must be unique", "password min 8 chars"],
      "error_handling": "rolls back transaction on failure"
    }}
  ],
  "key_business_rules": [],
  "score": 80
}}

Use Read and Grep to analyze actual code logic."""

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "workflows": []})

    async def _analyze_architecture(self) -> dict:
        """Detect architecture patterns."""
        prompt = """Analyze the architecture patterns used in this codebase.

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

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "architecture_style": "unknown"})

    async def _analyze_security(self) -> dict:
        """Analyze security vulnerabilities."""
        prompt = """Perform a security analysis of this codebase.

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

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "vulnerabilities": []})

    async def _analyze_performance(self) -> dict:
        """Analyze performance bottlenecks."""
        prompt = """Analyze potential performance bottlenecks in this codebase.

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

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "bottlenecks": []})

    async def _analyze_code_quality(self) -> dict:
        """Analyze code quality and maintainability."""
        prompt = """Analyze code quality and maintainability.

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

        result = await self._run_claude_query(prompt)
        return self._parse_json_response(result, {"score": 0, "code_smells": []})

    async def _run_claude_query(self, prompt: str) -> str:
        """
        Run a Claude query with the agent SDK.

        Args:
            prompt: The analysis prompt

        Returns:
            Claude's response text
        """
        oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
        if not oauth_token:
            raise ValueError(
                "CLAUDE_CODE_OAUTH_TOKEN not set. Run: claude setup-token"
            )

        # Create minimal security settings
        settings = {
            "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
            "permissions": {
                "defaultMode": "acceptEdits",
                "allow": [
                    "Read(./**)",
                    "Glob(./**)",
                    "Grep(./**)",
                ],
            },
        }

        # Write settings file
        settings_file = self.project_dir / ".claude_ai_analyzer_settings.json"
        with open(settings_file, "w") as f:
            json.dump(settings, f, indent=2)

        try:
            # Create client
            client = ClaudeSDKClient(
                options=ClaudeAgentOptions(
                    model="claude-sonnet-4-5-20250929",
                    system_prompt=(
                        f"You are a senior software architect analyzing this codebase. "
                        f"Your working directory is: {self.project_dir.resolve()}\n"
                        f"Use Read, Grep, and Glob tools to analyze actual code. "
                        f"Output your analysis as valid JSON only."
                    ),
                    allowed_tools=["Read", "Glob", "Grep"],
                    max_turns=50,
                    cwd=str(self.project_dir.resolve()),
                    settings=str(settings_file.resolve()),
                )
            )

            # Run query
            async with client:
                await client.query(prompt)

                # Collect response
                response_text = ""
                async for msg in client.receive_response():
                    msg_type = type(msg).__name__

                    if msg_type == "AssistantMessage":
                        for content in msg.content:
                            if hasattr(content, "text"):
                                response_text += content.text

                return response_text

        finally:
            # Cleanup settings file
            if settings_file.exists():
                settings_file.unlink()

    def _parse_json_response(self, response: str, default: dict) -> dict:
        """
        Parse JSON from Claude's response.

        Tries multiple strategies:
        1. Direct JSON parse
        2. Extract from markdown code block
        3. Find JSON object in text
        4. Return default on failure
        """
        if not response:
            return default

        # Try direct parse
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        if "```json" in response:
            start = response.find("```json") + 7
            end = response.find("```", start)
            if end > start:
                try:
                    return json.loads(response[start:end].strip())
                except json.JSONDecodeError:
                    pass

        # Try finding JSON object
        start_idx = response.find("{")
        end_idx = response.rfind("}")
        if start_idx >= 0 and end_idx > start_idx:
            try:
                return json.loads(response[start_idx:end_idx + 1])
            except json.JSONDecodeError:
                pass

        # Return default with raw response
        return {**default, "_raw_response": response[:1000]}

    def _estimate_cost(self) -> dict:
        """Estimate API cost before running analysis."""
        services = self.project_index.get("services", {})
        if not services:
            return {
                "estimated_tokens": 0,
                "estimated_cost_usd": 0.0,
                "files_to_analyze": 0
            }

        # Count items from programmatic analysis
        total_routes = 0
        total_models = 0
        total_files = 0

        for service_data in services.values():
            total_routes += service_data.get("api", {}).get("total_routes", 0)
            total_models += service_data.get("database", {}).get("total_models", 0)

        # Count Python files in project
        python_files = list(self.project_dir.glob("**/*.py"))
        total_files = len([f for f in python_files if ".venv" not in str(f) and "node_modules" not in str(f)])

        # Rough estimation: each route = 500 tokens, each model = 300 tokens, each file scan = 200 tokens
        estimated_tokens = (total_routes * 500) + (total_models * 300) + (total_files * 200)

        # Claude Sonnet pricing: $9.00 per 1M tokens (input)
        cost_per_1m_tokens = 9.00
        estimated_cost = (estimated_tokens / 1_000_000) * cost_per_1m_tokens

        return {
            "estimated_tokens": estimated_tokens,
            "estimated_cost_usd": estimated_cost,
            "files_to_analyze": total_files,
            "routes_count": total_routes,
            "models_count": total_models
        }

    def print_summary(self, insights: dict):
        """Print a summary of the AI insights."""
        print("\n" + "=" * 60)
        print("  AI ANALYSIS SUMMARY")
        print("=" * 60)

        if "error" in insights:
            print(f"\n✗ Error: {insights['error']}")
            return

        print(f"\n📊 Overall Score: {insights.get('overall_score', 0)}/100")
        print(f"⏰ Analysis Time: {insights.get('analysis_timestamp', 'unknown')}")

        # Print each analyzer's score
        print("\n🤖 Analyzer Scores:")
        analyzers = ["code_relationships", "business_logic", "architecture", "security", "performance", "code_quality"]
        for name in analyzers:
            if name in insights and "error" not in insights[name]:
                score = insights[name].get("score", 0)
                print(f"   {name.replace('_', ' ').title():<25} {score}/100")

        # Show top issues
        if "security" in insights and "vulnerabilities" in insights["security"]:
            vulns = insights["security"]["vulnerabilities"]
            if vulns:
                print(f"\n🔒 Security: Found {len(vulns)} vulnerabilities")
                for vuln in vulns[:3]:
                    print(f"   - [{vuln.get('severity', 'unknown')}] {vuln.get('type', 'Unknown')}")

        if "performance" in insights and "bottlenecks" in insights["performance"]:
            bottlenecks = insights["performance"]["bottlenecks"]
            if bottlenecks:
                print(f"\n⚡ Performance: Found {len(bottlenecks)} bottlenecks")
                for bn in bottlenecks[:3]:
                    print(f"   - {bn.get('type', 'Unknown')} in {bn.get('location', 'unknown')}")


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="AI-Enhanced Project Analyzer")
    parser.add_argument("--project-dir", type=Path, default=Path.cwd(),
                        help="Project directory to analyze")
    parser.add_argument("--index", type=str, default="comprehensive_analysis.json",
                        help="Path to programmatic analysis JSON")
    parser.add_argument("--skip-cache", action="store_true",
                        help="Skip cached results and re-analyze")
    parser.add_argument("--analyzers", nargs="+",
                        help="Run only specific analyzers (code_relationships, business_logic, etc.)")

    args = parser.parse_args()

    # Load programmatic analysis
    index_path = args.project_dir / args.index
    if not index_path.exists():
        print(f"✗ Error: Programmatic analysis not found: {index_path}")
        print(f"Run: python analyzer.py --project-dir {args.project_dir} --index")
        return 1

    project_index = json.loads(index_path.read_text())

    # Create and run analyzer
    analyzer = AIAnalyzerRunner(args.project_dir, project_index)

    # Run async analysis
    insights = asyncio.run(
        analyzer.run_full_analysis(
            skip_cache=args.skip_cache,
            selected_analyzers=args.analyzers
        )
    )

    # Print summary
    analyzer.print_summary(insights)

    return 0


if __name__ == "__main__":
    exit(main())
