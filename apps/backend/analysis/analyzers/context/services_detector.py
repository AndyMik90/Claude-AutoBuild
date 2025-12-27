"""
External Services Detector Module
==================================

Detects external service integrations based on dependencies:
- Databases (PostgreSQL, MySQL, MongoDB, Redis, SQLite)
- Cache services (Redis, Memcached)
- Message queues (Celery, BullMQ, Kafka, RabbitMQ)
- Email services (SendGrid, Mailgun, Postmark)
- Payment processors (Stripe, PayPal, Square)
- Storage services (AWS S3, Google Cloud Storage, Azure)
- Auth providers (OAuth, JWT)
- Monitoring tools (Sentry, Datadog, New Relic)
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..base import BaseAnalyzer


class ServicesDetector(BaseAnalyzer):
    """Detects external service integrations."""

    # Service indicator mappings
    DATABASE_INDICATORS = {
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

    CACHE_INDICATORS = ["redis", "memcached", "node-cache"]

    QUEUE_INDICATORS = {
        "celery": "celery",
        "bullmq": "bullmq",
        "bull": "bull",
        "kafka-python": "kafka",
        "kafkajs": "kafka",
        "amqplib": "rabbitmq",
        "amqp": "rabbitmq",
    }

    EMAIL_INDICATORS = {
        "sendgrid": "sendgrid",
        "@sendgrid/mail": "sendgrid",
        "nodemailer": "smtp",
        "mailgun": "mailgun",
        "postmark": "postmark",
    }

    PAYMENT_INDICATORS = {
        "stripe": "stripe",
        "paypal": "paypal",
        "square": "square",
        "braintree": "braintree",
    }

    STORAGE_INDICATORS = {
        "boto3": "aws_s3",
        "@aws-sdk/client-s3": "aws_s3",
        "aws-sdk": "aws_s3",
        "@google-cloud/storage": "google_cloud_storage",
        "azure-storage-blob": "azure_blob_storage",
    }

    AUTH_INDICATORS = {
        "authlib": "oauth",
        "python-jose": "jwt",
        "pyjwt": "jwt",
        "jsonwebtoken": "jwt",
        "passport": "oauth",
        "next-auth": "oauth",
        "@auth/core": "oauth",
    }

    MONITORING_INDICATORS = {
        "sentry-sdk": "sentry",
        "@sentry/node": "sentry",
        "datadog": "datadog",
        "newrelic": "new_relic",
        "loguru": "logging",
        "winston": "logging",
        "pino": "logging",
    }

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect(self) -> None:
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
        all_deps = self._get_all_dependencies()

        # Detect each service category
        self._detect_databases(all_deps, services["databases"])
        self._detect_cache(all_deps, services["cache"])
        self._detect_message_queues(all_deps, services["message_queues"])
        self._detect_email(all_deps, services["email"])
        self._detect_payments(all_deps, services["payments"])
        self._detect_storage(all_deps, services["storage"])
        self._detect_auth_providers(all_deps, services["auth_providers"])
        self._detect_monitoring(all_deps, services["monitoring"])

        # Remove empty categories
        services = {k: v for k, v in services.items() if v}

        if services:
            self.analysis["services"] = services

    def _get_all_dependencies(self) -> set[str]:
        """Extract all dependencies from Python and Node.js projects."""
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

        return all_deps

    def _detect_databases(
        self, all_deps: set[str], databases: list[dict[str, str]]
    ) -> None:
        """Detect database clients."""
        for dep, db_type in self.DATABASE_INDICATORS.items():
            if dep in all_deps:
                databases.append({"type": db_type, "client": dep})

    def _detect_cache(self, all_deps: set[str], cache: list[dict[str, str]]) -> None:
        """Detect cache services."""
        for indicator in self.CACHE_INDICATORS:
            if indicator in all_deps:
                cache.append({"type": indicator})

    def _detect_message_queues(
        self, all_deps: set[str], queues: list[dict[str, str]]
    ) -> None:
        """Detect message queue systems."""
        for dep, queue_type in self.QUEUE_INDICATORS.items():
            if dep in all_deps:
                queues.append({"type": queue_type, "client": dep})

    def _detect_email(self, all_deps: set[str], email: list[dict[str, str]]) -> None:
        """Detect email service providers."""
        for dep, email_type in self.EMAIL_INDICATORS.items():
            if dep in all_deps:
                email.append({"provider": email_type, "client": dep})

    def _detect_payments(
        self, all_deps: set[str], payments: list[dict[str, str]]
    ) -> None:
        """Detect payment processors."""
        for dep, payment_type in self.PAYMENT_INDICATORS.items():
            if dep in all_deps:
                payments.append({"provider": payment_type, "client": dep})

    def _detect_storage(
        self, all_deps: set[str], storage: list[dict[str, str]]
    ) -> None:
        """Detect storage services."""
        for dep, storage_type in self.STORAGE_INDICATORS.items():
            if dep in all_deps:
                storage.append({"provider": storage_type, "client": dep})

    def _detect_auth_providers(
        self, all_deps: set[str], auth: list[dict[str, str]]
    ) -> None:
        """Detect authentication providers."""
        for dep, auth_type in self.AUTH_INDICATORS.items():
            if dep in all_deps:
                auth.append({"type": auth_type, "client": dep})

    def _detect_monitoring(
        self, all_deps: set[str], monitoring: list[dict[str, str]]
    ) -> None:
        """Detect monitoring and observability tools."""
        for dep, monitoring_type in self.MONITORING_INDICATORS.items():
            if dep in all_deps:
                monitoring.append({"type": monitoring_type, "client": dep})
