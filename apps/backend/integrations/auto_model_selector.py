"""
Automatic Model Selector

Intelligently selects the best model for a task based on:
- Task complexity and type
- Available hardware (VRAM, RAM, CPU)
- Installed Ollama models
- User preferences
- Historical performance data
"""

import os
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Tuple, Literal
from pathlib import Path
from datetime import datetime

from .execution_modes import TaskComplexity, ExecutionMode, get_execution_mode_manager
from .ollama_model_service import get_ollama_service, OllamaModelInfo
from .task_complexity_analyzer import get_complexity_analyzer, ComplexityAnalysis

logger = logging.getLogger(__name__)


@dataclass
class HardwareCapabilities:
    """System hardware capabilities for model selection."""
    
    # GPU
    gpu_available: bool = False
    gpu_name: str = ""
    vram_total_gb: float = 0.0
    vram_available_gb: float = 0.0
    
    # CPU
    cpu_cores: int = 4
    cpu_model: str = ""
    
    # RAM
    ram_total_gb: float = 16.0
    ram_available_gb: float = 8.0
    
    # Computed
    can_run_large_models: bool = False  # 70B+
    can_run_medium_models: bool = False  # 13B-34B
    can_run_small_models: bool = True    # 3B-8B
    
    def __post_init__(self):
        """Compute derived capabilities."""
        # Large models need 48GB+ VRAM or 64GB+ RAM
        self.can_run_large_models = (
            (self.gpu_available and self.vram_available_gb >= 40) or
            (not self.gpu_available and self.ram_available_gb >= 48)
        )
        
        # Medium models need 16GB+ VRAM or 32GB+ RAM
        self.can_run_medium_models = (
            (self.gpu_available and self.vram_available_gb >= 12) or
            (not self.gpu_available and self.ram_available_gb >= 24)
        )
        
        # Small models need 6GB+ VRAM or 16GB+ RAM
        self.can_run_small_models = (
            (self.gpu_available and self.vram_available_gb >= 4) or
            (not self.gpu_available and self.ram_available_gb >= 8)
        )
    
    @classmethod
    def detect(cls) -> "HardwareCapabilities":
        """Detect current hardware capabilities."""
        import subprocess
        import psutil
        
        caps = cls()
        
        # Detect RAM
        try:
            mem = psutil.virtual_memory()
            caps.ram_total_gb = mem.total / (1024 ** 3)
            caps.ram_available_gb = mem.available / (1024 ** 3)
        except:
            pass
        
        # Detect CPU
        try:
            caps.cpu_cores = psutil.cpu_count(logical=False) or 4
            import platform
            caps.cpu_model = platform.processor()
        except:
            pass
        
        # Detect GPU (NVIDIA)
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")
                if lines and lines[0]:
                    parts = lines[0].split(",")
                    if len(parts) >= 3:
                        caps.gpu_available = True
                        caps.gpu_name = parts[0].strip()
                        caps.vram_total_gb = float(parts[1].strip()) / 1024
                        caps.vram_available_gb = float(parts[2].strip()) / 1024
        except:
            pass
        
        # Recompute derived capabilities
        caps.__post_init__()
        
        return caps
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "gpu_available": self.gpu_available,
            "gpu_name": self.gpu_name,
            "vram_total_gb": round(self.vram_total_gb, 1),
            "vram_available_gb": round(self.vram_available_gb, 1),
            "cpu_cores": self.cpu_cores,
            "cpu_model": self.cpu_model,
            "ram_total_gb": round(self.ram_total_gb, 1),
            "ram_available_gb": round(self.ram_available_gb, 1),
            "can_run_large_models": self.can_run_large_models,
            "can_run_medium_models": self.can_run_medium_models,
            "can_run_small_models": self.can_run_small_models,
        }


@dataclass
class ModelSelection:
    """Result of automatic model selection."""
    
    provider: Literal["claude", "ollama"]
    model: str
    model_display_name: str
    
    # Selection reasoning
    reason: str
    confidence: float  # 0-1
    
    # Task analysis
    task_complexity: TaskComplexity
    complexity_analysis: Optional[ComplexityAnalysis] = None
    
    # Alternatives
    alternatives: List[Dict[str, Any]] = field(default_factory=list)
    
    # Warnings
    warnings: List[str] = field(default_factory=list)
    
    # Execution info
    can_execute: bool = True
    estimated_time_seconds: Optional[int] = None
    estimated_tokens: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "model_display_name": self.model_display_name,
            "reason": self.reason,
            "confidence": self.confidence,
            "task_complexity": self.task_complexity.value,
            "alternatives": self.alternatives,
            "warnings": self.warnings,
            "can_execute": self.can_execute,
            "estimated_time_seconds": self.estimated_time_seconds,
            "estimated_tokens": self.estimated_tokens,
        }


# Model capability tiers
MODEL_TIERS = {
    # Claude models
    "opus": {"tier": "expert", "context": 200000, "speed": "slow", "quality": "highest"},
    "sonnet": {"tier": "complex", "context": 200000, "speed": "medium", "quality": "high"},
    "haiku": {"tier": "simple", "context": 200000, "speed": "fast", "quality": "good"},
    
    # Ollama models - Large (70B+)
    "llama3.1:70b": {"tier": "complex", "context": 128000, "speed": "slow", "quality": "high", "vram": 40},
    "qwen2.5-coder:32b": {"tier": "complex", "context": 32000, "speed": "slow", "quality": "high", "vram": 24},
    "mixtral:8x7b": {"tier": "complex", "context": 32000, "speed": "medium", "quality": "high", "vram": 32},
    
    # Ollama models - Medium (13B-34B)
    "codellama:34b": {"tier": "moderate", "context": 16000, "speed": "medium", "quality": "good", "vram": 24},
    "qwen2.5-coder:14b": {"tier": "moderate", "context": 32000, "speed": "medium", "quality": "good", "vram": 12},
    "deepseek-coder-v2:16b": {"tier": "moderate", "context": 32000, "speed": "medium", "quality": "good", "vram": 12},
    "codellama:13b": {"tier": "moderate", "context": 16000, "speed": "medium", "quality": "good", "vram": 10},
    
    # Ollama models - Small (7B-8B)
    "llama3.1:8b": {"tier": "simple", "context": 128000, "speed": "fast", "quality": "good", "vram": 6},
    "qwen2.5-coder:7b": {"tier": "simple", "context": 32000, "speed": "fast", "quality": "good", "vram": 6},
    "codellama:7b": {"tier": "simple", "context": 16000, "speed": "fast", "quality": "moderate", "vram": 6},
    "mistral:7b": {"tier": "simple", "context": 32000, "speed": "fast", "quality": "good", "vram": 6},
    "gemma2:9b": {"tier": "simple", "context": 8000, "speed": "fast", "quality": "good", "vram": 8},
    
    # Ollama models - Tiny (3B-4B)
    "llama3.2:3b": {"tier": "trivial", "context": 128000, "speed": "fastest", "quality": "moderate", "vram": 3},
    "phi3:mini": {"tier": "trivial", "context": 4000, "speed": "fastest", "quality": "moderate", "vram": 3},
    "gemma2:2b": {"tier": "trivial", "context": 8000, "speed": "fastest", "quality": "basic", "vram": 2},
}

# Complexity to tier mapping
COMPLEXITY_TO_TIER = {
    TaskComplexity.TRIVIAL: ["trivial", "simple"],
    TaskComplexity.SIMPLE: ["simple", "trivial"],
    TaskComplexity.MODERATE: ["moderate", "simple", "complex"],
    TaskComplexity.COMPLEX: ["complex", "moderate"],
    TaskComplexity.EXPERT: ["expert", "complex"],
}

# Task type to model preferences
TASK_TYPE_PREFERENCES = {
    "coding": ["qwen2.5-coder", "codellama", "deepseek-coder", "starcoder"],
    "general": ["llama3", "mistral", "gemma"],
    "analysis": ["llama3.1", "qwen2.5", "mixtral"],
    "creative": ["llama3", "mistral", "gemma"],
}


class AutoModelSelector:
    """
    Automatically selects the best model for a task.
    
    Selection process:
    1. Analyze task complexity
    2. Detect hardware capabilities
    3. Get available Ollama models
    4. Check execution mode constraints
    5. Score and rank candidate models
    6. Return best selection with alternatives
    """
    
    def __init__(self):
        self.complexity_analyzer = get_complexity_analyzer()
        self.ollama_service = get_ollama_service()
        self.mode_manager = get_execution_mode_manager()
        self._hardware: Optional[HardwareCapabilities] = None
        self._hardware_cache_time: Optional[datetime] = None
    
    def get_hardware(self, refresh: bool = False) -> HardwareCapabilities:
        """Get hardware capabilities with caching."""
        cache_valid = (
            self._hardware is not None and
            self._hardware_cache_time is not None and
            (datetime.now() - self._hardware_cache_time).seconds < 60
        )
        
        if not cache_valid or refresh:
            self._hardware = HardwareCapabilities.detect()
            self._hardware_cache_time = datetime.now()
        
        return self._hardware
    
    async def select_model(
        self,
        task_description: str,
        task_type: str = "coding",
        preferred_provider: Optional[Literal["claude", "ollama"]] = None,
        preferred_model: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> ModelSelection:
        """
        Select the best model for a task.
        
        Args:
            task_description: Description of the task
            task_type: Type of task (coding, general, analysis, creative)
            preferred_provider: User's preferred provider (optional)
            preferred_model: User's preferred model (optional)
            context: Additional context (files, codebase info, etc.)
        
        Returns:
            ModelSelection with chosen model and reasoning
        """
        context = context or {}
        
        # Step 1: Analyze task complexity
        complexity_result = self.complexity_analyzer.analyze(task_description, context)
        complexity = complexity_result.complexity
        
        # Step 2: Get hardware capabilities
        hardware = self.get_hardware()
        
        # Step 3: Get available Ollama models
        await self.ollama_service.refresh_models()
        available_ollama = self.ollama_service.get_model_names()
        ollama_available = len(available_ollama) > 0
        
        # Step 4: Check execution mode
        mode = self.mode_manager.get_mode()
        
        # Step 5: Apply mode constraints
        if mode == ExecutionMode.CLOUD_ONLY:
            return self._select_claude_model(
                complexity, task_type, preferred_model, complexity_result
            )
        
        if mode == ExecutionMode.LOCAL_ONLY:
            if not ollama_available:
                return ModelSelection(
                    provider="ollama",
                    model="",
                    model_display_name="No model available",
                    reason="Ollama is not running or has no models installed",
                    confidence=0.0,
                    task_complexity=complexity,
                    complexity_analysis=complexity_result,
                    can_execute=False,
                    warnings=["Please start Ollama and install a model, or switch to Cloud mode"],
                )
            
            # Check complexity limit
            max_complexity = self.mode_manager.config.local_max_complexity
            if self._complexity_exceeds(complexity, max_complexity):
                return ModelSelection(
                    provider="ollama",
                    model="",
                    model_display_name="Task too complex",
                    reason=f"Task complexity ({complexity.value}) exceeds local limit ({max_complexity.value})",
                    confidence=0.9,
                    task_complexity=complexity,
                    complexity_analysis=complexity_result,
                    can_execute=False,
                    warnings=[
                        "This task is too complex for local execution",
                        "Switch to Hybrid or Cloud mode for complex tasks",
                    ],
                )
            
            return self._select_ollama_model(
                complexity, task_type, hardware, available_ollama,
                preferred_model, complexity_result
            )
        
        # HYBRID mode - intelligent selection
        return self._select_hybrid_model(
            complexity, task_type, hardware, available_ollama,
            ollama_available, preferred_provider, preferred_model,
            complexity_result
        )
    
    def _complexity_exceeds(self, actual: TaskComplexity, limit: TaskComplexity) -> bool:
        """Check if actual complexity exceeds limit."""
        order = list(TaskComplexity)
        return order.index(actual) > order.index(limit)
    
    def _select_claude_model(
        self,
        complexity: TaskComplexity,
        task_type: str,
        preferred_model: Optional[str],
        complexity_result: ComplexityAnalysis,
    ) -> ModelSelection:
        """Select best Claude model for task."""
        
        # Use preferred if valid
        if preferred_model and preferred_model in ["opus", "sonnet", "haiku"]:
            model = preferred_model
        else:
            # Auto-select based on complexity
            if complexity in [TaskComplexity.EXPERT, TaskComplexity.COMPLEX]:
                model = "opus"
            elif complexity == TaskComplexity.MODERATE:
                model = "sonnet"
            else:
                model = "haiku"
        
        model_info = MODEL_TIERS.get(model, {})
        
        return ModelSelection(
            provider="claude",
            model=model,
            model_display_name=f"Claude {model.title()}",
            reason=f"Selected {model} for {complexity.value} task (cloud mode)",
            confidence=0.9,
            task_complexity=complexity,
            complexity_analysis=complexity_result,
            alternatives=[
                {"provider": "claude", "model": "opus", "reason": "Highest quality"},
                {"provider": "claude", "model": "sonnet", "reason": "Balanced"},
                {"provider": "claude", "model": "haiku", "reason": "Fastest"},
            ],
        )
    
    def _select_ollama_model(
        self,
        complexity: TaskComplexity,
        task_type: str,
        hardware: HardwareCapabilities,
        available_models: List[str],
        preferred_model: Optional[str],
        complexity_result: ComplexityAnalysis,
    ) -> ModelSelection:
        """Select best Ollama model for task."""
        
        # Use preferred if available
        if preferred_model and preferred_model.startswith("ollama:"):
            model_name = preferred_model.replace("ollama:", "")
            if model_name in available_models or any(model_name in m for m in available_models):
                return ModelSelection(
                    provider="ollama",
                    model=preferred_model,
                    model_display_name=model_name,
                    reason=f"Using preferred model {model_name}",
                    confidence=0.8,
                    task_complexity=complexity,
                    complexity_analysis=complexity_result,
                )
        
        # Score and rank available models
        scored_models = []
        
        for model_name in available_models:
            score = self._score_model(
                model_name, complexity, task_type, hardware
            )
            scored_models.append((model_name, score))
        
        # Sort by score (descending)
        scored_models.sort(key=lambda x: x[1], reverse=True)
        
        if not scored_models:
            return ModelSelection(
                provider="ollama",
                model="",
                model_display_name="No suitable model",
                reason="No Ollama models available",
                confidence=0.0,
                task_complexity=complexity,
                complexity_analysis=complexity_result,
                can_execute=False,
            )
        
        best_model, best_score = scored_models[0]
        
        # Generate alternatives
        alternatives = [
            {"provider": "ollama", "model": f"ollama:{m}", "score": s}
            for m, s in scored_models[1:4]
        ]
        
        # Generate warnings
        warnings = []
        model_info = self._get_model_info(best_model)
        
        if model_info.get("vram", 0) > hardware.vram_available_gb:
            warnings.append(f"Model may be slow - requires {model_info.get('vram')}GB VRAM, only {hardware.vram_available_gb:.1f}GB available")
        
        if complexity in [TaskComplexity.COMPLEX, TaskComplexity.EXPERT]:
            warnings.append("Complex task - consider using Claude for better results")
        
        return ModelSelection(
            provider="ollama",
            model=f"ollama:{best_model}",
            model_display_name=best_model,
            reason=f"Best local model for {complexity.value} {task_type} task (score: {best_score:.2f})",
            confidence=min(0.9, best_score),
            task_complexity=complexity,
            complexity_analysis=complexity_result,
            alternatives=alternatives,
            warnings=warnings,
        )
    
    def _select_hybrid_model(
        self,
        complexity: TaskComplexity,
        task_type: str,
        hardware: HardwareCapabilities,
        available_ollama: List[str],
        ollama_available: bool,
        preferred_provider: Optional[Literal["claude", "ollama"]],
        preferred_model: Optional[str],
        complexity_result: ComplexityAnalysis,
    ) -> ModelSelection:
        """Select model in hybrid mode - intelligent routing."""
        
        # Get threshold from config
        threshold = self.mode_manager.config.hybrid_complexity_threshold
        use_claude = self._complexity_exceeds(complexity, threshold)
        
        # Override with preference if specified
        if preferred_provider == "claude":
            use_claude = True
        elif preferred_provider == "ollama" and ollama_available:
            use_claude = False
        
        # If prefer local and task is suitable, use Ollama
        if self.mode_manager.config.hybrid_prefer_local and not use_claude and ollama_available:
            selection = self._select_ollama_model(
                complexity, task_type, hardware, available_ollama,
                preferred_model, complexity_result
            )
            
            # Add Claude as fallback alternative
            selection.alternatives.insert(0, {
                "provider": "claude",
                "model": self._get_claude_for_complexity(complexity),
                "reason": "Cloud fallback for better quality",
            })
            
            selection.reason = f"Hybrid mode: routing {complexity.value} task to local Ollama"
            return selection
        
        # Use Claude for complex tasks
        if use_claude:
            selection = self._select_claude_model(
                complexity, task_type, preferred_model, complexity_result
            )
            
            # Add Ollama as alternative if available
            if ollama_available:
                best_ollama = self._get_best_ollama_for_complexity(
                    complexity, available_ollama, hardware
                )
                if best_ollama:
                    selection.alternatives.insert(0, {
                        "provider": "ollama",
                        "model": f"ollama:{best_ollama}",
                        "reason": "Local alternative (may be slower)",
                    })
            
            selection.reason = f"Hybrid mode: routing {complexity.value} task to Claude"
            return selection
        
        # Fallback to Claude if Ollama not available
        return self._select_claude_model(
            complexity, task_type, preferred_model, complexity_result
        )
    
    def _score_model(
        self,
        model_name: str,
        complexity: TaskComplexity,
        task_type: str,
        hardware: HardwareCapabilities,
    ) -> float:
        """Score a model for a given task."""
        score = 0.5  # Base score
        
        model_info = self._get_model_info(model_name)
        model_tier = model_info.get("tier", "simple")
        model_vram = model_info.get("vram", 6)
        
        # Tier match score
        suitable_tiers = COMPLEXITY_TO_TIER.get(complexity, ["simple"])
        if model_tier in suitable_tiers:
            score += 0.3
            if model_tier == suitable_tiers[0]:
                score += 0.1  # Bonus for best tier match
        
        # Task type preference
        type_prefs = TASK_TYPE_PREFERENCES.get(task_type, [])
        for pref in type_prefs:
            if pref in model_name.lower():
                score += 0.2
                break
        
        # Hardware fit
        if hardware.gpu_available:
            if model_vram <= hardware.vram_available_gb:
                score += 0.2
            elif model_vram <= hardware.vram_available_gb * 1.2:
                score += 0.1  # Slight penalty for tight fit
            else:
                score -= 0.2  # Penalty for insufficient VRAM
        
        # Quality bonus for complex tasks
        if complexity in [TaskComplexity.COMPLEX, TaskComplexity.EXPERT]:
            if model_info.get("quality") in ["high", "highest"]:
                score += 0.1
        
        # Speed bonus for simple tasks
        if complexity in [TaskComplexity.TRIVIAL, TaskComplexity.SIMPLE]:
            if model_info.get("speed") in ["fast", "fastest"]:
                score += 0.1
        
        return min(1.0, max(0.0, score))
    
    def _get_model_info(self, model_name: str) -> Dict[str, Any]:
        """Get model info from tiers database."""
        # Try exact match
        if model_name in MODEL_TIERS:
            return MODEL_TIERS[model_name]
        
        # Try partial match
        for tier_name, info in MODEL_TIERS.items():
            if tier_name in model_name or model_name.startswith(tier_name.split(":")[0]):
                return info
        
        # Default
        return {"tier": "simple", "vram": 6, "speed": "medium", "quality": "moderate"}
    
    def _get_claude_for_complexity(self, complexity: TaskComplexity) -> str:
        """Get appropriate Claude model for complexity."""
        if complexity in [TaskComplexity.EXPERT, TaskComplexity.COMPLEX]:
            return "opus"
        elif complexity == TaskComplexity.MODERATE:
            return "sonnet"
        return "haiku"
    
    def _get_best_ollama_for_complexity(
        self,
        complexity: TaskComplexity,
        available: List[str],
        hardware: HardwareCapabilities,
    ) -> Optional[str]:
        """Get best available Ollama model for complexity."""
        scored = [
            (m, self._score_model(m, complexity, "coding", hardware))
            for m in available
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0] if scored else None


# Global instance
_selector: Optional[AutoModelSelector] = None


def get_auto_selector() -> AutoModelSelector:
    """Get or create the global auto selector."""
    global _selector
    if _selector is None:
        _selector = AutoModelSelector()
    return _selector


async def auto_select_model(
    task_description: str,
    task_type: str = "coding",
    preferred_provider: Optional[str] = None,
    preferred_model: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Auto-select model for task (convenience function)."""
    selector = get_auto_selector()
    result = await selector.select_model(
        task_description, task_type,
        preferred_provider, preferred_model, context
    )
    return result.to_dict()
