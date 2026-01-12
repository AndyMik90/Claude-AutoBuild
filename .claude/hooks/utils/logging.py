"""Logging utilities for hooks."""

import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

# Configure logging
LOG_DIR = Path(__file__).parent.parent
LOG_FILE = LOG_DIR / "hooks.log"

def setup_logger(name: str) -> logging.Logger:
    """Set up a logger for hook execution."""
    logger = logging.Logger(name)
    logger.setLevel(logging.DEBUG)

    # File handler
    if not LOG_FILE.parent.exists():
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    fh = logging.FileHandler(LOG_FILE)
    fh.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    return logger

def log_hook_execution(hook_name: str, input_data: Dict[str, Any]) -> logging.Logger:
    """Log hook execution details."""
    logger = setup_logger(hook_name)
    logger.info(f"Hook '{hook_name}' triggered")
    logger.debug(f"Input: {json.dumps(input_data, indent=2, default=str)}")
    return logger

def log_hook_result(logger: logging.Logger, result: Dict[str, Any], exit_code: int = 0):
    """Log hook result."""
    logger.info(f"Hook completed with exit code: {exit_code}")
    if result:
        logger.debug(f"Result: {json.dumps(result, indent=2, default=str)}")
