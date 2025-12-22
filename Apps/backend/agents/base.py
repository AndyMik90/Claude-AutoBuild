"""
Base Module for Agent System
=============================

Shared imports, types, and constants used across agent modules.
"""

import logging

# Configure logging
logger = logging.getLogger(__name__)

# Configuration constants
AUTO_CONTINUE_DELAY_SECONDS = 3
HUMAN_INTERVENTION_FILE = "PAUSE"
