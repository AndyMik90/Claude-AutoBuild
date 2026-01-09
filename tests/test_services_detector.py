"""
Tests for Services Detector
============================

Tests for analysis/analyzers/context/services_detector.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from analysis.analyzers.context.services_detector import ServicesDetector


class TestServicesDetector:
    """Tests for ServicesDetector class."""

    def test_detect_postgresql(self, temp_dir: Path):
        """Detects PostgreSQL from psycopg2."""
        (temp_dir / "requirements.txt").write_text("psycopg2-binary==2.9.0\nflask==2.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "services" in analysis
        assert "databases" in analysis["services"]
        assert any(db["type"] == "postgresql" for db in analysis["services"]["databases"])

    def test_detect_mongodb(self, temp_dir: Path):
        """Detects MongoDB from pymongo."""
        (temp_dir / "requirements.txt").write_text("pymongo==4.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "databases" in analysis.get("services", {})
        assert any(db["type"] == "mongodb" for db in analysis["services"]["databases"])

    def test_detect_redis_cache(self, temp_dir: Path):
        """Detects Redis as cache service."""
        (temp_dir / "requirements.txt").write_text("redis==4.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "cache" in analysis.get("services", {})

    def test_detect_celery_queue(self, temp_dir: Path):
        """Detects Celery message queue."""
        (temp_dir / "requirements.txt").write_text("celery==5.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "message_queues" in analysis.get("services", {})
        assert any(q["type"] == "celery" for q in analysis["services"]["message_queues"])

    def test_detect_stripe_payments(self, temp_dir: Path):
        """Detects Stripe payment processor."""
        (temp_dir / "requirements.txt").write_text("stripe==3.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "payments" in analysis.get("services", {})
        assert any(p["provider"] == "stripe" for p in analysis["services"]["payments"])

    def test_detect_sendgrid_email(self, temp_dir: Path):
        """Detects SendGrid email provider."""
        (temp_dir / "requirements.txt").write_text("sendgrid==6.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "email" in analysis.get("services", {})
        assert any(e["provider"] == "sendgrid" for e in analysis["services"]["email"])

    def test_detect_aws_s3_storage(self, temp_dir: Path):
        """Detects AWS S3 storage."""
        (temp_dir / "requirements.txt").write_text("boto3==1.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "storage" in analysis.get("services", {})
        assert any(s["provider"] == "aws_s3" for s in analysis["services"]["storage"])

    def test_detect_jwt_auth(self, temp_dir: Path):
        """Detects JWT authentication."""
        (temp_dir / "requirements.txt").write_text("pyjwt==2.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "auth_providers" in analysis.get("services", {})
        assert any(a["type"] == "jwt" for a in analysis["services"]["auth_providers"])

    def test_detect_sentry_monitoring(self, temp_dir: Path):
        """Detects Sentry monitoring."""
        (temp_dir / "requirements.txt").write_text("sentry-sdk==1.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        assert "monitoring" in analysis.get("services", {})
        assert any(m["type"] == "sentry" for m in analysis["services"]["monitoring"])

    def test_detect_node_dependencies(self, temp_dir: Path):
        """Detects services from package.json."""
        pkg = {
            "dependencies": {
                "mongoose": "^6.0.0",
                "stripe": "^10.0.0",
                "jsonwebtoken": "^8.0.0"
            }
        }
        (temp_dir / "package.json").write_text(json.dumps(pkg))
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        services = analysis.get("services", {})
        assert "databases" in services
        assert "payments" in services
        assert "auth_providers" in services

    def test_no_services_detected(self, temp_dir: Path):
        """No services key when nothing detected."""
        (temp_dir / "requirements.txt").write_text("flask==2.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        # Services key should not be present if empty
        assert "services" not in analysis or not analysis["services"]

    def test_multiple_databases(self, temp_dir: Path):
        """Detects multiple database types."""
        (temp_dir / "requirements.txt").write_text("psycopg2==2.9.0\npymongo==4.0.0\nredis==4.0.0\n")
        analysis = {}
        detector = ServicesDetector(temp_dir, analysis)
        detector.detect()

        databases = analysis.get("services", {}).get("databases", [])
        types = [db["type"] for db in databases]
        assert "postgresql" in types
        assert "mongodb" in types
