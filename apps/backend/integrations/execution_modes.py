"""
Execution Mode System for Auto-Claude

Defines three execution modes:
- LOCAL_ONLY: All tasks run on Ollama, complex tasks are rejected
- HYBRID: Automatic switching between Claude and Ollama based on task complexity
- CLOUD_ONLY: All tasks run on Claude API

This module provides:
- ExecutionMode enum and configuration
- Task routing logic based on mode and complexity
- Mode-specific behavior and constraints
"""

import os
import json
import logging
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any, List, Literal
from pathlib import Path

logger = logging.getLogger(__name__)


class ExecutionMode(str, Enum):
    """Available execution modes for task processing."""
    LOCAL_ONLY = "local_only"      # Only use Ollama, reject complex tasks
    HYBRID = "hybrid"              # Auto-switch between Claude and Ollama
    CLOUD_ONLY = "cloud_only"      # Only use Claude API


class TaskComplexity(str, Enum):
    """Task complexity levels for routing decisions."""
    TRIVIAL = "trivial"       # Simple edits, formatting, comments
    SIMPLE = "simple"         # Single-file changes, small features
    MODERATE = "moderate"     # Multi-file changes, medium features
    COMPLEX = "complex"       # Architecture changes, large features
    EXPERT = "expert"         # System design, critical refactoring


@dataclass
class ExecutionModeConfig:
    """Configuration for execution mode behavior."""
    
    # Current execution mode
    mode: ExecutionMode = ExecutionMode.HYBRID
    
    # Local-only mode settings
    local_max_complexity: TaskComplexity = TaskComplexity.MODERATE
    local_reject_message: str = "This task is too complex for local execution. Please switch to Hybrid or Cloud mode."
    local_warn_on_complex: bool = True
    
    # Hybrid mode settings
    hybrid_prefer_local: bool = True  # Prefer local when possible
    hybrid_fallback_on_error: bool = True  # Fallback to Claude on Ollama errors
    hybrid_fallback_on_timeout: bool = True  # Fallback on Ollama timeout
    hybrid_timeout_seconds: int = 120  # Timeout before fallback
    hybrid_complexity_threshold: TaskComplexity = TaskComplexity.MODERATE  # Above this, use Claude
    
    # Cloud-only mode settings
    cloud_allow_local_fallback: bool = False  # Allow Ollama if Claude unavailable
    
    # Auto model selection
    auto_select_model: bool = True  # Automatically select best model for task
    
    # Complexity estimation settings
    estimate_complexity_before_start: bool = True
    complexity_estimation_model: str = "ollama:llama3.2:3b"  # Fast model for estimation
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "mode": self.mode.value,
            "local_max_complexity": self.local_max_complexity.value,
            "local_reject_message": self.local_reject_message,
            "local_warn_on_complex": self.local_warn_on_complex,
            "hybrid_prefer_local": self.hybrid_prefer_local,
            "hybrid_fallback_on_error": self.hybrid_fallback_on_error,
            "hybrid_fallback_on_timeout": self.hybrid_fallback_on_timeout,
            "hybrid_timeout_seconds": self.hybrid_timeout_seconds,
            "hybrid_complexity_threshold": self.hybrid_complexity_threshold.value,
            "cloud_allow_local_fallback": self.cloud_allow_local_fallback,
            "auto_select_model": self.auto_select_model,
            "estimate_complexity_before_start": self.estimate_complexity_before_start,
            "complexity_estimation_model": self.complexity_estimation_model,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionModeConfig":
        """Create from dictionary."""
        return cls(
            mode=ExecutionMode(data.get("mode", "hybrid")),
            local_max_complexity=TaskComplexity(data.get("local_max_complexity", "moderate")),
            local_reject_message=data.get("local_reject_message", cls.local_reject_message),
            local_warn_on_complex=data.get("local_warn_on_complex", True),
            hybrid_prefer_local=data.get("hybrid_prefer_local", True),
            hybrid_fallback_on_error=data.get("hybrid_fallback_on_error", True),
            hybrid_fallback_on_timeout=data.get("hybrid_fallback_on_timeout", True),
            hybrid_timeout_seconds=data.get("hybrid_timeout_seconds", 120),
            hybrid_complexity_threshold=TaskComplexity(data.get("hybrid_complexity_threshold", "moderate")),
            cloud_allow_local_fallback=data.get("cloud_allow_local_fallback", False),
            auto_select_model=data.get("auto_select_model", True),
            estimate_complexity_before_start=data.get("estimate_complexity_before_start", True),
            complexity_estimation_model=data.get("complexity_estimation_model", "ollama:llama3.2:3b"),
        )
    
    @classmethod
    def from_env(cls) -> "ExecutionModeConfig":
        """Create from environment variables."""
        mode_str = os.getenv("EXECUTION_MODE", "hybrid").lower()
        mode = ExecutionMode(mode_str) if mode_str in [m.value for m in ExecutionMode] else ExecutionMode.HYBRID
        
        return cls(
            mode=mode,
            local_max_complexity=TaskComplexity(os.getenv("LOCAL_MAX_COMPLEXITY", "moderate")),
            hybrid_prefer_local=os.getenv("HYBRID_PREFER_LOCAL", "true").lower() == "true",
            hybrid_fallback_on_error=os.getenv("HYBRID_FALLBACK_ON_ERROR", "true").lower() == "true",
            hybrid_timeout_seconds=int(os.getenv("HYBRID_TIMEOUT_SECONDS", "120")),
            hybrid_complexity_threshold=TaskComplexity(os.getenv("HYBRID_COMPLEXITY_THRESHOLD", "moderate")),
            auto_select_model=os.getenv("AUTO_SELECT_MODEL", "true").lower() == "true",
        )


@dataclass
class TaskRoutingDecision:
    """Result of task routing decision."""
    provider: Literal["claude", "ollama"]
    model: str
    reason: str
    complexity: TaskComplexity
    can_execute: bool = True
    warning: Optional[str] = None
    fallback_available: bool = False
    fallback_provider: Optional[Literal["claude", "ollama"]] = None
    fallback_model: Optional[str] = None


class ExecutionModeManager:
    """
    Manages execution mode and task routing decisions.
    
    This class is responsible for:
    - Loading and saving execution mode configuration
    - Making routing decisions based on task complexity
    - Handling mode-specific behavior
    """
    
    CONFIG_FILE = ".execution_mode.json"
    
    def __init__(self, config: Optional[ExecutionModeConfig] = None):
        self.config = config or ExecutionModeConfig.from_env()
        self._config_path = Path.home() / self.CONFIG_FILE
        self._load_config()
    
    def _load_config(self) -> None:
        """Load configuration from file if exists."""
        if self._config_path.exists():
            try:
                with open(self._config_path, "r") as f:
                    data = json.load(f)
                    self.config = ExecutionModeConfig.from_dict(data)
                    logger.info(f"Loaded execution mode config: {self.config.mode.value}")
            except Exception as e:
                logger.warning(f"Failed to load execution mode config: {e}")
    
    def save_config(self) -> None:
        """Save configuration to file."""
        try:
            with open(self._config_path, "w") as f:
                json.dump(self.config.to_dict(), f, indent=2)
            logger.info(f"Saved execution mode config: {self.config.mode.value}")
        except Exception as e:
            logger.error(f"Failed to save execution mode config: {e}")
    
    def set_mode(self, mode: ExecutionMode) -> None:
        """Set the execution mode."""
        self.config.mode = mode
        self.save_config()
        logger.info(f"Execution mode changed to: {mode.value}")
    
    def get_mode(self) -> ExecutionMode:
        """Get current execution mode."""
        return self.config.mode
    
    def route_task(
        self,
        complexity: TaskComplexity,
        preferred_model: Optional[str] = None,
        claude_available: bool = True,
        ollama_available: bool = True,
        available_ollama_models: Optional[List[str]] = None,
    ) -> TaskRoutingDecision:
        """
        Make a routing decision for a task based on complexity and mode.
        
        Args:
            complexity: Estimated task complexity
            preferred_model: User-preferred model (if any)
            claude_available: Whether Claude API is available
            ollama_available: Whether Ollama is available
            available_ollama_models: List of available Ollama models
        
        Returns:
            TaskRoutingDecision with provider, model, and execution details
        """
        mode = self.config.mode
        available_ollama_models = available_ollama_models or []
        
        # Complexity comparison helper
        complexity_order = list(TaskComplexity)
        
        def is_complex_enough(task_complexity: TaskComplexity, threshold: TaskComplexity) -> bool:
            return complexity_order.index(task_complexity) > complexity_order.index(threshold)
        
        # ============================================
        # LOCAL_ONLY Mode
        # ============================================
        if mode == ExecutionMode.LOCAL_ONLY:
            if not ollama_available:
                return TaskRoutingDecision(
                    provider="ollama",
                    model="",
                    reason="Ollama is not available",
                    complexity=complexity,
                    can_execute=False,
                    warning="Ollama is not running. Please start Ollama or switch to Cloud mode.",
                )
            
            # Check if task is too complex
            if is_complex_enough(complexity, self.config.local_max_complexity):
                return TaskRoutingDecision(
                    provider="ollama",
                    model="",
                    reason=f"Task complexity ({complexity.value}) exceeds local limit ({self.config.local_max_complexity.value})",
                    complexity=complexity,
                    can_execute=False,
                    warning=self.config.local_reject_message,
                )
            
            # Select best local model
            model = self._select_ollama_model(complexity, preferred_model, available_ollama_models)
            warning = None
            if self.config.local_warn_on_complex and complexity in [TaskComplexity.MODERATE]:
                warning = "This task may take longer on local hardware. Consider Hybrid mode for better performance."
            
            return TaskRoutingDecision(
                provider="ollama",
                model=model,
                reason=f"Local-only mode: using Ollama for {complexity.value} task",
                complexity=complexity,
                can_execute=True,
                warning=warning,
            )
        
        # ============================================
        # CLOUD_ONLY Mode
        # ============================================
        elif mode == ExecutionMode.CLOUD_ONLY:
            if not claude_available:
                if self.config.cloud_allow_local_fallback and ollama_available:
                    model = self._select_ollama_model(complexity, preferred_model, available_ollama_models)
                    return TaskRoutingDecision(
                        provider="ollama",
                        model=model,
                        reason="Claude unavailable, falling back to Ollama (cloud_allow_local_fallback enabled)",
                        complexity=complexity,
                        can_execute=True,
                        warning="Claude is unavailable. Using local Ollama as fallback.",
                    )
                return TaskRoutingDecision(
                    provider="claude",
                    model="",
                    reason="Claude is not available",
                    complexity=complexity,
                    can_execute=False,
                    warning="Claude API is unavailable. Please check your API key or switch to Local/Hybrid mode.",
                )
            
            # Use Claude with appropriate model
            model = self._select_claude_model(complexity, preferred_model)
            return TaskRoutingDecision(
                provider="claude",
                model=model,
                reason=f"Cloud-only mode: using Claude for {complexity.value} task",
                complexity=complexity,
                can_execute=True,
            )
        
        # ============================================
        # HYBRID Mode
        # ============================================
        else:  # HYBRID
            # Determine if task should go to Claude or Ollama
            use_claude = is_complex_enough(complexity, self.config.hybrid_complexity_threshold)
            
            # Override if user prefers local and task is not too complex
            if self.config.hybrid_prefer_local and not use_claude:
                use_claude = False
            
            # Check availability
            if use_claude and not claude_available:
                if ollama_available:
                    model = self._select_ollama_model(complexity, preferred_model, available_ollama_models)
                    return TaskRoutingDecision(
                        provider="ollama",
                        model=model,
                        reason="Claude unavailable, using Ollama fallback",
                        complexity=complexity,
                        can_execute=True,
                        warning="Claude is unavailable. Using local Ollama instead.",
                    )
                return TaskRoutingDecision(
                    provider="claude",
                    model="",
                    reason="Neither Claude nor Ollama available",
                    complexity=complexity,
                    can_execute=False,
                    warning="No AI providers available. Please check your configuration.",
                )
            
            if not use_claude and not ollama_available:
                if claude_available:
                    model = self._select_claude_model(complexity, preferred_model)
                    return TaskRoutingDecision(
                        provider="claude",
                        model=model,
                        reason="Ollama unavailable, using Claude",
                        complexity=complexity,
                        can_execute=True,
                        warning="Ollama is not running. Using Claude API instead.",
                    )
                return TaskRoutingDecision(
                    provider="ollama",
                    model="",
                    reason="Neither Claude nor Ollama available",
                    complexity=complexity,
                    can_execute=False,
                    warning="No AI providers available. Please check your configuration.",
                )
            
            # Normal hybrid routing
            if use_claude:
                model = self._select_claude_model(complexity, preferred_model)
                fallback_model = self._select_ollama_model(complexity, None, available_ollama_models) if ollama_available else None
                return TaskRoutingDecision(
                    provider="claude",
                    model=model,
                    reason=f"Hybrid mode: {complexity.value} task routed to Claude",
                    complexity=complexity,
                    can_execute=True,
                    fallback_available=ollama_available and self.config.hybrid_fallback_on_error,
                    fallback_provider="ollama" if ollama_available else None,
                    fallback_model=fallback_model,
                )
            else:
                model = self._select_ollama_model(complexity, preferred_model, available_ollama_models)
                fallback_model = self._select_claude_model(complexity, None) if claude_available else None
                return TaskRoutingDecision(
                    provider="ollama",
                    model=model,
                    reason=f"Hybrid mode: {complexity.value} task routed to Ollama",
                    complexity=complexity,
                    can_execute=True,
                    fallback_available=claude_available and self.config.hybrid_fallback_on_error,
                    fallback_provider="claude" if claude_available else None,
                    fallback_model=fallback_model,
                )
    
    def _select_claude_model(
        self,
        complexity: TaskComplexity,
        preferred_model: Optional[str] = None,
    ) -> str:
        """Select appropriate Claude model based on complexity."""
        if preferred_model and not preferred_model.startswith("ollama:"):
            return preferred_model
        
        # Auto-select based on complexity
        if complexity in [TaskComplexity.EXPERT, TaskComplexity.COMPLEX]:
            return "opus"
        elif complexity == TaskComplexity.MODERATE:
            return "sonnet"
        else:
            return "haiku"
    
    def _select_ollama_model(
        self,
        complexity: TaskComplexity,
        preferred_model: Optional[str] = None,
        available_models: Optional[List[str]] = None,
    ) -> str:
        """Select appropriate Ollama model based on complexity and availability."""
        available_models = available_models or []
        
        # If user has a preference and it's available, use it
        if preferred_model and preferred_model.startswith("ollama:"):
            model_name = preferred_model.replace("ollama:", "")
            if not available_models or model_name in available_models:
                return preferred_model
        
        # Model preferences by complexity (in order of preference)
        complexity_models = {
            TaskComplexity.EXPERT: [
                "llama3.1:70b", "qwen2.5-coder:32b", "mixtral:8x7b",
                "llama3.1:8b", "qwen2.5-coder:14b"
            ],
            TaskComplexity.COMPLEX: [
                "llama3.1:70b", "qwen2.5-coder:32b", "qwen2.5-coder:14b",
                "llama3.1:8b", "deepseek-coder-v2:16b"
            ],
            TaskComplexity.MODERATE: [
                "llama3.1:8b", "qwen2.5-coder:7b", "deepseek-coder-v2:16b",
                "codellama:13b", "mistral:7b"
            ],
            TaskComplexity.SIMPLE: [
                "qwen2.5-coder:7b", "llama3.1:8b", "codellama:7b",
                "llama3.2:3b", "phi3:mini"
            ],
            TaskComplexity.TRIVIAL: [
                "llama3.2:3b", "phi3:mini", "qwen2.5-coder:7b",
                "gemma2:9b"
            ],
        }
        
        preferred_models = complexity_models.get(complexity, complexity_models[TaskComplexity.SIMPLE])
        
        # Find first available model
        if available_models:
            for model in preferred_models:
                if model in available_models or any(model in m for m in available_models):
                    return f"ollama:{model}"
            # Fallback to first available
            if available_models:
                return f"ollama:{available_models[0]}"
        
        # Default if no models detected
        return f"ollama:{preferred_models[0]}"
    
    def get_mode_description(self) -> Dict[str, Any]:
        """Get human-readable description of current mode."""
        descriptions = {
            ExecutionMode.LOCAL_ONLY: {
                "name": "Local Only",
                "icon": "server",
                "color": "blue",
                "description": "All tasks run locally on Ollama. Complex tasks will be rejected.",
                "pros": ["Complete privacy", "No API costs", "Works offline"],
                "cons": ["Limited to local hardware", "Complex tasks rejected", "Slower for large tasks"],
            },
            ExecutionMode.HYBRID: {
                "name": "Hybrid",
                "icon": "shuffle",
                "color": "purple",
                "description": "Automatically routes tasks between Claude and Ollama based on complexity.",
                "pros": ["Best of both worlds", "Automatic optimization", "Fallback support"],
                "cons": ["Requires both providers", "May use API credits for complex tasks"],
            },
            ExecutionMode.CLOUD_ONLY: {
                "name": "Cloud Only",
                "icon": "cloud",
                "color": "orange",
                "description": "All tasks run on Claude API. Best quality but requires internet.",
                "pros": ["Highest quality", "Handles any complexity", "Fastest for complex tasks"],
                "cons": ["Requires internet", "API costs", "No privacy for code"],
            },
        }
        
        mode_info = descriptions[self.config.mode]
        mode_info["current"] = True
        mode_info["config"] = self.config.to_dict()
        
        return {
            "current_mode": self.config.mode.value,
            "modes": {
                mode.value: {**descriptions[mode], "current": mode == self.config.mode}
                for mode in ExecutionMode
            },
            "config": self.config.to_dict(),
        }


# Global instance
_execution_mode_manager: Optional[ExecutionModeManager] = None


def get_execution_mode_manager() -> ExecutionModeManager:
    """Get or create the global execution mode manager."""
    global _execution_mode_manager
    if _execution_mode_manager is None:
        _execution_mode_manager = ExecutionModeManager()
    return _execution_mode_manager


def set_execution_mode(mode: str) -> Dict[str, Any]:
    """Set execution mode (convenience function)."""
    manager = get_execution_mode_manager()
    try:
        execution_mode = ExecutionMode(mode)
        manager.set_mode(execution_mode)
        return {"success": True, "mode": mode}
    except ValueError:
        return {"success": False, "error": f"Invalid mode: {mode}"}


def get_execution_mode() -> str:
    """Get current execution mode (convenience function)."""
    return get_execution_mode_manager().get_mode().value
