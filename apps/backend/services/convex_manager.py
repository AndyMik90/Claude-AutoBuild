"""
Convex Service Manager

Manages the Convex dev server lifecycle for the Auto Claude application.
Convex runs as a separate service in services/convex/ at the repository root.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

from loguru import logger


class ConvexManager:
    """Manages the Convex development server."""

    def __init__(self):
        """Initialize the Convex manager."""
        # The Convex service is located at services/convex/ relative to the repo root
        self.repo_root = Path(__file__).parent.parent.parent.parent
        self.convex_dir = self.repo_root / "services" / "convex"
        self.process: Optional[subprocess.Popen] = None
        self.env_file = self.convex_dir / ".env.local"

    def is_convex_available(self) -> bool:
        """Check if Convex is available (node_modules installed)."""
        return (self.convex_dir / "node_modules" / ".bin" / "convex").exists()

    def is_running(self) -> bool:
        """Check if the Convex dev server is running."""
        if self.process is None:
            return False
        return self.process.poll() is None

    def get_deployment_url(self) -> Optional[str]:
        """Get the Convex deployment URL from .env.local."""
        if not self.env_file.exists():
            return None

        try:
            with open(self.env_file, 'r') as f:
                for line in f:
                    if line.startswith('NEXT_PUBLIC_CONVEX_SITE_URL='):
                        return line.strip().split('=', 1)[1].strip('"\'')
        except Exception as e:
            logger.error(f"Error reading Convex env file: {e}")

        return None

    async def start_dev_server(self) -> dict:
        """
        Start the Convex dev server.

        Returns:
            dict: Result with success status and deployment info
        """
        if self.is_running():
            return {
                "success": True,
                "already_running": True,
                "url": self.get_deployment_url()
            }

        if not self.is_convex_available():
            return {
                "success": False,
                "error": "Convex not installed. Run 'npm install' in services/convex/"
            }

        # Check if .env.local exists, create from .env.example if not
        if not self.env_file.exists():
            env_example = self.convex_dir / ".env.example"
            if env_example.exists():
                import shutil
                shutil.copy(env_example, self.env_file)
                logger.info(f"Created {self.env_file} from .env.example")
            else:
                return {
                    "success": False,
                    "error": "No .env.local file found. Please configure Convex environment."
                }

        try:
            # Start convex dev in the background
            # Using npm run dev which runs: convex dev
            self.process = subprocess.Popen(
                [sys.executable, "-m", "npm", "run", "dev"],
                cwd=self.convex_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # Wait a bit for it to start
            await asyncio.sleep(3)

            if self.is_running():
                # Try to get the deployment URL from the output
                url = self.get_deployment_url()

                # If not found in .env.local, check the output
                if not url:
                    # Read output to find the URL
                    for _ in range(10):
                        line = self.process.stdout.readline()
                        if 'Convex deployment URL:' in line or 'https://' in line:
                            # Extract URL from output
                            parts = line.split('https://')
                            if len(parts) > 1:
                                url = 'https://' + parts[1].strip().split()[0]
                                break
                        await asyncio.sleep(0.5)

                return {
                    "success": True,
                    "url": url,
                    "message": "Convex dev server started successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to start Convex dev server"
                }

        except Exception as e:
            logger.error(f"Error starting Convex: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def stop_dev_server(self) -> dict:
        """
        Stop the Convex dev server.

        Returns:
            dict: Result with success status
        """
        if self.process is None:
            return {
                "success": True,
                "message": "Convex dev server was not running"
            }

        try:
            self.process.terminate()
            await asyncio.sleep(2)

            if self.process.poll() is None:
                # Force kill if it didn't terminate
                self.process.kill()
                await asyncio.sleep(1)

            self.process = None

            return {
                "success": True,
                "message": "Convex dev server stopped"
            }

        except Exception as e:
            logger.error(f"Error stopping Convex: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_status(self) -> dict:
        """
        Get the current status of Convex.

        Returns:
            dict: Status information
        """
        return {
            "available": self.is_convex_available(),
            "running": self.is_running(),
            "url": self.get_deployment_url(),
            "env_configured": self.env_file.exists()
        }


# Singleton instance
_convex_manager: Optional[ConvexManager] = None


def get_convex_manager() -> ConvexManager:
    """Get the singleton Convex manager instance."""
    global _convex_manager
    if _convex_manager is None:
        _convex_manager = ConvexManager()
    return _convex_manager
