"""
Context Analyzer Module
=======================

Analyzes comprehensive project context including:
- Environment variables and configuration
- External service integrations
- Authentication patterns
- Database migrations
- Background jobs/task queues
- API documentation
- Monitoring and observability
"""

import re
from pathlib import Path
from typing import Any

from .base import BaseAnalyzer


class ContextAnalyzer(BaseAnalyzer):
    """Analyzes project context and configuration patterns."""

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect_environment_variables(self) -> None:
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
            ".env",
            ".env.local",
            ".env.development",
            ".env.production",
            ".env.dev",
            ".env.prod",
            ".env.test",
            ".env.staging",
            "config/.env",
            "../.env",
        ]

        for env_file in env_files:
            content = self._read_file(env_file)
            if not content:
                continue

            for line in content.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                # Parse KEY=value or KEY="value" or KEY='value'
                match = re.match(r"^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$", line)
                if match:
                    key = match.group(1)
                    value = match.group(2).strip().strip('"').strip("'")

                    # Detect if sensitive
                    is_sensitive = any(
                        keyword in key.lower()
                        for keyword in [
                            "secret",
                            "key",
                            "password",
                            "token",
                            "api_key",
                            "private",
                            "credential",
                            "auth",
                        ]
                    )

                    # Detect type
                    var_type = self._infer_env_var_type(value)

                    env_vars[key] = {
                        "value": "<REDACTED>" if is_sensitive else value,
                        "source": env_file,
                        "type": var_type,
                        "sensitive": is_sensitive,
                    }

        # 2. Parse .env.example to find required variables
        example_content = self._read_file(".env.example") or self._read_file(
            ".env.sample"
        )
        if example_content:
            for line in example_content.split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue

                match = re.match(r"^([A-Z_][A-Z0-9_]*)\s*=", line)
                if match:
                    key = match.group(1)
                    required_vars.add(key)

                    if key not in env_vars:
                        env_vars[key] = {
                            "value": None,
                            "source": ".env.example",
                            "type": "string",
                            "sensitive": any(
                                k in key.lower()
                                for k in ["secret", "key", "password", "token"]
                            ),
                            "required": True,
                        }

        # 3. Parse docker-compose.yml environment section
        for compose_file in ["docker-compose.yml", "../docker-compose.yml"]:
            content = self._read_file(compose_file)
            if not content:
                continue

            # Look for environment variables in docker-compose
            in_env_section = False
            for line in content.split("\n"):
                if "environment:" in line:
                    in_env_section = True
                    continue

                if in_env_section:
                    # Check if we left the environment section
                    if line and not line.startswith((" ", "\t", "-")):
                        in_env_section = False
                        continue

                    # Parse - KEY=value or - KEY
                    match = re.match(r"^\s*-\s*([A-Z_][A-Z0-9_]*)", line)
                    if match:
                        key = match.group(1)
                        if key not in env_vars:
                            env_vars[key] = {
                                "value": None,
                                "source": compose_file,
                                "type": "string",
                                "sensitive": False,
                            }

        # 4. Scan code for os.getenv() / process.env usage to find optional vars
        entry_files = [
            "app.py",
            "main.py",
            "config.py",
            "settings.py",
            "src/config.py",
            "src/settings.py",
            "index.js",
            "index.ts",
            "config.js",
            "config.ts",
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
                r"process\.env\.([A-Z_][A-Z0-9_]*)",
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
                            "sensitive": any(
                                k in var_name.lower()
                                for k in ["secret", "key", "password", "token"]
                            ),
                            "required": False,
                        }

        # Mark required vs optional
        for key in env_vars:
            if "required" not in env_vars[key]:
                env_vars[key]["required"] = key in required_vars

        if env_vars:
            self.analysis["environment"] = {
                "variables": env_vars,
                "required_count": len(required_vars),
                "optional_count": len(optional_vars),
                "detected_count": len(env_vars),
            }

    def detect_external_services(self) -> None:
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
            "monitoring": [],
        }

        # Get all dependencies
        all_deps = set()

        # Python dependencies
        if self._exists("requirements.txt"):
            content = self._read_file("requirements.txt")
            all_deps.update(re.findall(r"^([a-zA-Z0-9_-]+)", content, re.MULTILINE))

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
            "better-sqlite3": "sqlite",
        }

        for dep, db_type in db_indicators.items():
            if dep in all_deps:
                services["databases"].append({"type": db_type, "client": dep})

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
            "amqp": "rabbitmq",
        }

        for dep, queue_type in queue_indicators.items():
            if dep in all_deps:
                services["message_queues"].append({"type": queue_type, "client": dep})

        # Email services
        email_indicators = {
            "sendgrid": "sendgrid",
            "@sendgrid/mail": "sendgrid",
            "nodemailer": "smtp",
            "mailgun": "mailgun",
            "postmark": "postmark",
        }

        for dep, email_type in email_indicators.items():
            if dep in all_deps:
                services["email"].append({"provider": email_type, "client": dep})

        # Payment processors
        payment_indicators = {
            "stripe": "stripe",
            "paypal": "paypal",
            "square": "square",
            "braintree": "braintree",
        }

        for dep, payment_type in payment_indicators.items():
            if dep in all_deps:
                services["payments"].append({"provider": payment_type, "client": dep})

        # Storage services
        storage_indicators = {
            "boto3": "aws_s3",
            "@aws-sdk/client-s3": "aws_s3",
            "aws-sdk": "aws_s3",
            "@google-cloud/storage": "google_cloud_storage",
            "azure-storage-blob": "azure_blob_storage",
        }

        for dep, storage_type in storage_indicators.items():
            if dep in all_deps:
                services["storage"].append({"provider": storage_type, "client": dep})

        # Auth providers
        auth_indicators = {
            "authlib": "oauth",
            "python-jose": "jwt",
            "pyjwt": "jwt",
            "jsonwebtoken": "jwt",
            "passport": "oauth",
            "next-auth": "oauth",
            "@auth/core": "oauth",
        }

        for dep, auth_type in auth_indicators.items():
            if dep in all_deps:
                services["auth_providers"].append({"type": auth_type, "client": dep})

        # Monitoring/observability
        monitoring_indicators = {
            "sentry-sdk": "sentry",
            "@sentry/node": "sentry",
            "datadog": "datadog",
            "newrelic": "new_relic",
            "loguru": "logging",
            "winston": "logging",
            "pino": "logging",
        }

        for dep, monitoring_type in monitoring_indicators.items():
            if dep in all_deps:
                services["monitoring"].append({"type": monitoring_type, "client": dep})

        # Remove empty categories
        services = {k: v for k, v in services.items() if v}

        if services:
            self.analysis["services"] = services

    def detect_auth_patterns(self) -> None:
        """
        Detect authentication and authorization patterns.

        Detects: JWT, OAuth, session-based, API keys, user models, protected routes.
        """
        auth_info = {
            "strategies": [],
            "libraries": [],
            "user_model": None,
            "middleware": [],
        }

        # Scan for auth libraries in dependencies
        all_deps = set()

        if self._exists("requirements.txt"):
            content = self._read_file("requirements.txt")
            all_deps.update(re.findall(r"^([a-zA-Z0-9_-]+)", content, re.MULTILINE))

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
            "models/user.py",
            "models/User.py",
            "app/models/user.py",
            "models/user.ts",
            "models/User.ts",
            "src/models/user.ts",
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
                if (
                    "@require" in content
                    or "@login_required" in content
                    or "@authenticate" in content
                ):
                    decorators = re.findall(r"@(\w*(?:require|auth|login)\w*)", content)
                    auth_decorators.update(decorators)
            except (OSError, UnicodeDecodeError):
                continue

        if auth_decorators:
            auth_info["middleware"] = list(auth_decorators)

        # Remove duplicates
        auth_info["strategies"] = list(set(auth_info["strategies"]))

        if auth_info["strategies"] or auth_info["libraries"]:
            self.analysis["auth"] = auth_info

    def detect_migrations(self) -> None:
        """
        Detect database migration setup.

        Detects: Alembic, Django migrations, Knex, TypeORM, Prisma migrations.
        """
        migration_info = {}

        # Alembic (Python)
        if self._exists("alembic.ini") or self._exists("alembic"):
            migration_info = {
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

        # Django migrations
        elif self._exists("manage.py"):
            migration_dirs = list(self.path.glob("**/migrations"))
            if migration_dirs:
                migration_info = {
                    "tool": "django",
                    "directories": [
                        str(d.relative_to(self.path)) for d in migration_dirs
                    ],
                    "commands": {
                        "migrate": "python manage.py migrate",
                        "makemigrations": "python manage.py makemigrations",
                    },
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
                    "create": "knex migrate:make migration_name",
                },
            }

        # TypeORM migrations
        elif self._exists("ormconfig.json") or self._exists("data-source.ts"):
            migration_info = {
                "tool": "typeorm",
                "directory": "migrations",
                "commands": {
                    "run": "typeorm migration:run",
                    "revert": "typeorm migration:revert",
                    "create": "typeorm migration:create",
                },
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
                    "create": "prisma migrate dev --name migration_name",
                },
            }

        if migration_info:
            self.analysis["migrations"] = migration_info

    def detect_background_jobs(self) -> None:
        """
        Detect background job/task queue systems.

        Detects: Celery, BullMQ, Sidekiq, cron jobs, scheduled tasks.
        """
        jobs_info = {}

        # Celery (Python)
        celery_files = list(self.path.glob("**/celery.py")) + list(
            self.path.glob("**/tasks.py")
        )
        if celery_files:
            tasks = []
            for task_file in celery_files:
                try:
                    content = task_file.read_text()
                    # Find @celery.task or @shared_task decorators
                    task_pattern = r"@(?:celery\.task|shared_task|app\.task)\s*(?:\([^)]*\))?\s*def\s+(\w+)"
                    task_matches = re.findall(task_pattern, content)

                    for task_name in task_matches:
                        tasks.append(
                            {
                                "name": task_name,
                                "file": str(task_file.relative_to(self.path)),
                            }
                        )

                except (OSError, UnicodeDecodeError):
                    continue

            if tasks:
                jobs_info = {
                    "system": "celery",
                    "tasks": tasks,
                    "total_tasks": len(tasks),
                    "worker_command": "celery -A app worker",
                }

        # BullMQ (Node.js)
        elif self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg and (
                "bullmq" in pkg.get("dependencies", {})
                or "bull" in pkg.get("dependencies", {})
            ):
                jobs_info = {
                    "system": "bullmq"
                    if "bullmq" in pkg.get("dependencies", {})
                    else "bull",
                    "tasks": [],
                    "worker_command": "node worker.js",
                }

        # Sidekiq (Ruby)
        elif self._exists("Gemfile"):
            gemfile = self._read_file("Gemfile")
            if "sidekiq" in gemfile.lower():
                jobs_info = {
                    "system": "sidekiq",
                    "worker_command": "bundle exec sidekiq",
                }

        if jobs_info:
            self.analysis["background_jobs"] = jobs_info

    def detect_api_documentation(self) -> None:
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
                "openapi_url": "/openapi.json",
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
                        "docs_url": "/api-docs",
                    }

        # GraphQL
        if self._exists("package.json"):
            pkg = self._read_json("package.json")
            if pkg:
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if (
                    "graphql" in deps
                    or "apollo-server" in deps
                    or "@apollo/server" in deps
                ):
                    if not docs_info:
                        docs_info = {}
                    docs_info["graphql"] = {
                        "playground_url": "/graphql",
                        "library": "apollo-server"
                        if "apollo-server" in deps
                        else "graphql",
                    }

        if docs_info:
            self.analysis["api_documentation"] = docs_info

    def detect_monitoring(self) -> None:
        """
        Detect monitoring and observability setup.

        Detects: Health checks, metrics endpoints, APM tools, logging.
        """
        monitoring_info = {}

        # Health check endpoints (look in routes)
        if "api" in self.analysis:
            routes = self.analysis["api"].get("routes", [])
            health_routes = [
                r
                for r in routes
                if "health" in r["path"].lower() or "ping" in r["path"].lower()
            ]

            if health_routes:
                monitoring_info["health_checks"] = [r["path"] for r in health_routes]

        # Prometheus metrics - look for actual Prometheus imports/usage, not just keywords
        all_files = (
            list(self.path.glob("**/*.py"))[:30] + list(self.path.glob("**/*.js"))[:30]
        )
        for file_path in all_files:
            # Skip analyzer files to avoid self-detection
            if "analyzers" in str(file_path) or "analyzer.py" in str(file_path):
                continue

            try:
                content = file_path.read_text()
                # Look for actual Prometheus imports or usage patterns
                prometheus_patterns = [
                    "from prometheus_client import",
                    "import prometheus_client",
                    "prometheus_client.",
                    "@app.route('/metrics')",  # Flask
                    "app.get('/metrics'",  # Express/Fastify
                    "router.get('/metrics'",  # Express Router
                ]

                if any(pattern in content for pattern in prometheus_patterns):
                    monitoring_info["metrics_endpoint"] = "/metrics"
                    monitoring_info["metrics_type"] = "prometheus"
                    break
            except (OSError, UnicodeDecodeError):
                continue

        # APM tools (already detected in external_services, just reference here)
        if "services" in self.analysis and "monitoring" in self.analysis["services"]:
            monitoring_info["apm_tools"] = [
                s["type"] for s in self.analysis["services"]["monitoring"]
            ]

        if monitoring_info:
            self.analysis["monitoring"] = monitoring_info
