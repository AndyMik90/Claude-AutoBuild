"""
CrewAI Configuration Module.

Loads CrewAI settings from Auto-Claude UI settings file.
Settings are stored in ~/.config/Auto-Claude/settings.json
"""

import json
import os
from pathlib import Path
from typing import Any

# Model ID mapping (matches auto-claude-ui/src/shared/constants/models.ts)
MODEL_ID_MAP = {
    "opus": "claude-opus-4-5-20251101",
    "sonnet": "claude-sonnet-4-5-20250929",
    "haiku": "claude-haiku-4-5-20251001",
}

# Thinking budget mapping (matches phase_config.py)
THINKING_BUDGET_MAP = {
    "none": None,
    "low": 1024,
    "medium": 4096,
    "high": 16384,
    "ultrathink": 65536,
}

# Default CrewAI agent configurations
DEFAULT_CREWAI_AGENT_MODELS = {
    # Product Management Crew
    "productManager": {"model": "sonnet", "thinkingLevel": "medium"},
    "requirementsAnalyst": {"model": "sonnet", "thinkingLevel": "medium"},
    "priorityAnalyst": {"model": "haiku", "thinkingLevel": "low"},
    # Development Crew
    "techLead": {"model": "opus", "thinkingLevel": "high"},
    "seniorDeveloper": {"model": "sonnet", "thinkingLevel": "medium"},
    "codeReviewer": {"model": "sonnet", "thinkingLevel": "medium"},
    # QA & Release Crew
    "qaLead": {"model": "sonnet", "thinkingLevel": "high"},
    "securityAnalyst": {"model": "sonnet", "thinkingLevel": "medium"},
    "releaseManager": {"model": "haiku", "thinkingLevel": "low"},
}

# Predefined profiles
CREWAI_PROFILES = {
    "balanced": DEFAULT_CREWAI_AGENT_MODELS,
    "performance": {
        agent: {"model": "opus", "thinkingLevel": "high"}
        for agent in DEFAULT_CREWAI_AGENT_MODELS
    },
    "economy": {
        agent: {"model": "haiku", "thinkingLevel": "low"}
        for agent in DEFAULT_CREWAI_AGENT_MODELS
    },
}

DEFAULT_CONFIG = {
    "enabled": False,
    "profile": "balanced",
    "agent_models": DEFAULT_CREWAI_AGENT_MODELS,
}


def _get_settings_path() -> Path:
    """Get the path to Auto-Claude UI settings file."""
    # Check platform-specific paths
    if os.name == "nt":  # Windows
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        return base / "Auto-Claude" / "settings.json"
    elif os.uname().sysname == "Darwin":  # macOS
        return Path.home() / "Library" / "Application Support" / "Auto-Claude" / "settings.json"
    else:  # Linux and others
        xdg_config = os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
        return Path(xdg_config) / "Auto-Claude" / "settings.json"


def get_crewai_config() -> dict[str, Any]:
    """
    Load CrewAI configuration from Auto-Claude UI settings.

    Returns:
        Dictionary with keys:
        - enabled: bool - Whether CrewAI is enabled
        - profile: str - Selected profile (balanced/performance/economy/custom)
        - agent_models: dict - Model configuration per agent
    """
    settings_path = _get_settings_path()

    if not settings_path.exists():
        return DEFAULT_CONFIG.copy()

    try:
        with open(settings_path, encoding="utf-8") as f:
            settings = json.load(f)

        enabled = settings.get("crewaiEnabled", False)
        profile = settings.get("crewaiProfile", "balanced")

        # Get agent models based on profile
        if profile == "custom":
            agent_models = settings.get("crewaiAgentModels", DEFAULT_CREWAI_AGENT_MODELS)
        elif profile in CREWAI_PROFILES:
            agent_models = CREWAI_PROFILES[profile]
        else:
            agent_models = DEFAULT_CREWAI_AGENT_MODELS

        return {
            "enabled": enabled,
            "profile": profile,
            "agent_models": agent_models,
        }

    except (json.JSONDecodeError, OSError) as e:
        print(f"Warning: Could not load CrewAI config: {e}")
        return DEFAULT_CONFIG.copy()


def is_crewai_enabled() -> bool:
    """Check if CrewAI orchestration is enabled."""
    return get_crewai_config().get("enabled", False)


def get_agent_model(agent_name: str) -> tuple[str, int | None]:
    """
    Get model ID and thinking budget for a CrewAI agent.

    Args:
        agent_name: Name of the agent (e.g., "productManager", "techLead")

    Returns:
        Tuple of (model_id, thinking_budget)
        - model_id: Full Claude model ID string
        - thinking_budget: Token budget for extended thinking (or None)
    """
    config = get_crewai_config()
    agent_config = config["agent_models"].get(
        agent_name,
        {"model": "sonnet", "thinkingLevel": "medium"},
    )

    model_short = agent_config.get("model", "sonnet")
    thinking_level = agent_config.get("thinkingLevel", "medium")

    model_id = MODEL_ID_MAP.get(model_short, MODEL_ID_MAP["sonnet"])
    thinking_budget = THINKING_BUDGET_MAP.get(thinking_level, THINKING_BUDGET_MAP["medium"])

    return model_id, thinking_budget


def get_all_agent_configs() -> dict[str, tuple[str, int | None]]:
    """
    Get model configurations for all CrewAI agents.

    Returns:
        Dictionary mapping agent names to (model_id, thinking_budget) tuples
    """
    config = get_crewai_config()
    result = {}

    for agent_name in DEFAULT_CREWAI_AGENT_MODELS:
        result[agent_name] = get_agent_model(agent_name)

    return result
