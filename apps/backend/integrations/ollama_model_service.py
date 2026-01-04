"""
Ollama Model Service

Provides comprehensive Ollama model management:
- Auto-detection of all installed models
- Model capability analysis (context window, parameters, quantization)
- Model recommendations based on hardware
- Model pulling and management
- Real-time model status monitoring
"""

import os
import json
import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class OllamaModelInfo:
    """Detailed information about an Ollama model."""
    name: str
    tag: str = "latest"
    size_gb: float = 0.0
    parameter_size: str = ""  # e.g., "7B", "13B", "70B"
    quantization: str = ""    # e.g., "Q4_K_M", "Q8_0", "FP16"
    family: str = ""          # e.g., "llama", "qwen", "mistral"
    context_length: int = 4096
    modified_at: Optional[datetime] = None
    
    # Capabilities
    supports_tools: bool = False
    supports_vision: bool = False
    supports_code: bool = False
    
    # Performance estimates
    estimated_vram_gb: float = 0.0
    estimated_tokens_per_second: float = 0.0
    
    # Metadata
    digest: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def full_name(self) -> str:
        """Get full model name with tag."""
        return f"{self.name}:{self.tag}" if self.tag and self.tag != "latest" else self.name
    
    @property
    def ollama_id(self) -> str:
        """Get the ollama: prefixed ID for use in model selection."""
        return f"ollama:{self.full_name}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "tag": self.tag,
            "full_name": self.full_name,
            "ollama_id": self.ollama_id,
            "size_gb": self.size_gb,
            "parameter_size": self.parameter_size,
            "quantization": self.quantization,
            "family": self.family,
            "context_length": self.context_length,
            "modified_at": self.modified_at.isoformat() if self.modified_at else None,
            "supports_tools": self.supports_tools,
            "supports_vision": self.supports_vision,
            "supports_code": self.supports_code,
            "estimated_vram_gb": self.estimated_vram_gb,
            "estimated_tokens_per_second": self.estimated_tokens_per_second,
            "digest": self.digest,
        }


@dataclass
class OllamaStatus:
    """Current Ollama service status."""
    running: bool = False
    version: str = ""
    host: str = "http://localhost:11434"
    models_count: int = 0
    gpu_available: bool = False
    gpu_name: str = ""
    last_check: Optional[datetime] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "running": self.running,
            "version": self.version,
            "host": self.host,
            "models_count": self.models_count,
            "gpu_available": self.gpu_available,
            "gpu_name": self.gpu_name,
            "last_check": self.last_check.isoformat() if self.last_check else None,
            "error": self.error,
        }


# Model family detection patterns
MODEL_FAMILIES = {
    "llama": ["llama", "llama2", "llama3"],
    "qwen": ["qwen", "qwen2"],
    "mistral": ["mistral", "mixtral"],
    "codellama": ["codellama", "code-llama"],
    "deepseek": ["deepseek"],
    "phi": ["phi", "phi2", "phi3"],
    "gemma": ["gemma", "gemma2"],
    "starcoder": ["starcoder", "starcoder2"],
    "wizardcoder": ["wizardcoder", "wizard-coder"],
    "dolphin": ["dolphin"],
    "neural": ["neural-chat", "neuralchat"],
    "openchat": ["openchat"],
    "orca": ["orca", "orca2"],
    "vicuna": ["vicuna"],
    "yi": ["yi"],
    "falcon": ["falcon"],
    "mpt": ["mpt"],
    "stable": ["stablelm", "stable-code"],
}

# Models known to support specific features
CODE_MODELS = [
    "codellama", "qwen2.5-coder", "deepseek-coder", "starcoder", "wizardcoder",
    "stable-code", "codegemma", "codestral"
]

VISION_MODELS = [
    "llava", "bakllava", "moondream", "cogvlm", "llama3.2-vision"
]

TOOL_MODELS = [
    "llama3.1", "llama3.2", "qwen2.5", "mistral", "mixtral", "command-r"
]


class OllamaModelService:
    """
    Service for managing and discovering Ollama models.
    
    Features:
    - Auto-detection of installed models
    - Model capability analysis
    - Hardware-based recommendations
    - Model caching and refresh
    """
    
    CACHE_FILE = ".ollama_models_cache.json"
    CACHE_TTL_SECONDS = 300  # 5 minutes
    
    def __init__(self, host: Optional[str] = None):
        self.host = host or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self._models_cache: Dict[str, OllamaModelInfo] = {}
        self._status: OllamaStatus = OllamaStatus(host=self.host)
        self._cache_path = Path.home() / self.CACHE_FILE
        self._last_refresh: Optional[datetime] = None
        self._load_cache()
    
    def _load_cache(self) -> None:
        """Load cached model information."""
        if self._cache_path.exists():
            try:
                with open(self._cache_path, "r") as f:
                    data = json.load(f)
                    self._last_refresh = datetime.fromisoformat(data.get("last_refresh", "2000-01-01"))
                    for model_data in data.get("models", []):
                        info = self._dict_to_model_info(model_data)
                        self._models_cache[info.full_name] = info
            except Exception as e:
                logger.warning(f"Failed to load model cache: {e}")
    
    def _save_cache(self) -> None:
        """Save model information to cache."""
        try:
            data = {
                "last_refresh": datetime.now().isoformat(),
                "models": [m.to_dict() for m in self._models_cache.values()],
            }
            with open(self._cache_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save model cache: {e}")
    
    def _dict_to_model_info(self, data: Dict[str, Any]) -> OllamaModelInfo:
        """Convert dictionary to OllamaModelInfo."""
        return OllamaModelInfo(
            name=data.get("name", ""),
            tag=data.get("tag", "latest"),
            size_gb=data.get("size_gb", 0.0),
            parameter_size=data.get("parameter_size", ""),
            quantization=data.get("quantization", ""),
            family=data.get("family", ""),
            context_length=data.get("context_length", 4096),
            modified_at=datetime.fromisoformat(data["modified_at"]) if data.get("modified_at") else None,
            supports_tools=data.get("supports_tools", False),
            supports_vision=data.get("supports_vision", False),
            supports_code=data.get("supports_code", False),
            estimated_vram_gb=data.get("estimated_vram_gb", 0.0),
            estimated_tokens_per_second=data.get("estimated_tokens_per_second", 0.0),
            digest=data.get("digest", ""),
        )
    
    async def check_status(self) -> OllamaStatus:
        """Check Ollama service status."""
        import aiohttp
        
        self._status.last_check = datetime.now()
        
        try:
            async with aiohttp.ClientSession() as session:
                # Check if Ollama is running
                async with session.get(f"{self.host}/api/version", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self._status.running = True
                        self._status.version = data.get("version", "unknown")
                        self._status.error = None
                    else:
                        self._status.running = False
                        self._status.error = f"Unexpected status: {resp.status}"
                        return self._status
                
                # Get model count
                async with session.get(f"{self.host}/api/tags", timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        self._status.models_count = len(data.get("models", []))
                
        except asyncio.TimeoutError:
            self._status.running = False
            self._status.error = "Connection timeout"
        except aiohttp.ClientError as e:
            self._status.running = False
            self._status.error = f"Connection error: {str(e)}"
        except Exception as e:
            self._status.running = False
            self._status.error = f"Error: {str(e)}"
        
        return self._status
    
    async def refresh_models(self, force: bool = False) -> List[OllamaModelInfo]:
        """
        Refresh the list of available models from Ollama.
        
        Args:
            force: Force refresh even if cache is valid
        
        Returns:
            List of available models
        """
        import aiohttp
        
        # Check cache validity
        if not force and self._last_refresh:
            cache_age = (datetime.now() - self._last_refresh).total_seconds()
            if cache_age < self.CACHE_TTL_SECONDS and self._models_cache:
                return list(self._models_cache.values())
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.host}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status != 200:
                        logger.warning(f"Failed to fetch models: {resp.status}")
                        return list(self._models_cache.values())
                    
                    data = await resp.json()
                    models_data = data.get("models", [])
                    
                    self._models_cache.clear()
                    
                    for model_data in models_data:
                        info = self._parse_model_data(model_data)
                        self._models_cache[info.full_name] = info
                    
                    self._last_refresh = datetime.now()
                    self._status.models_count = len(self._models_cache)
                    self._save_cache()
                    
                    logger.info(f"Refreshed {len(self._models_cache)} Ollama models")
                    
        except Exception as e:
            logger.error(f"Failed to refresh models: {e}")
        
        return list(self._models_cache.values())
    
    def _parse_model_data(self, data: Dict[str, Any]) -> OllamaModelInfo:
        """Parse model data from Ollama API response."""
        name = data.get("name", "")
        
        # Parse name and tag
        if ":" in name:
            base_name, tag = name.rsplit(":", 1)
        else:
            base_name, tag = name, "latest"
        
        # Parse size
        size_bytes = data.get("size", 0)
        size_gb = size_bytes / (1024 ** 3)
        
        # Parse modified time
        modified_str = data.get("modified_at", "")
        modified_at = None
        if modified_str:
            try:
                # Handle various date formats
                modified_at = datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
            except:
                pass
        
        # Detect family
        family = self._detect_family(base_name)
        
        # Detect capabilities
        supports_code = any(code_model in base_name.lower() for code_model in CODE_MODELS)
        supports_vision = any(vision_model in base_name.lower() for vision_model in VISION_MODELS)
        supports_tools = any(tool_model in base_name.lower() for tool_model in TOOL_MODELS)
        
        # Parse parameter size and quantization from tag
        param_size, quantization = self._parse_tag(tag)
        
        # Estimate VRAM requirement
        estimated_vram = self._estimate_vram(param_size, quantization, size_gb)
        
        # Get context length from details if available
        details = data.get("details", {})
        context_length = details.get("context_length", 4096)
        
        return OllamaModelInfo(
            name=base_name,
            tag=tag,
            size_gb=round(size_gb, 2),
            parameter_size=param_size,
            quantization=quantization,
            family=family,
            context_length=context_length,
            modified_at=modified_at,
            supports_tools=supports_tools,
            supports_vision=supports_vision,
            supports_code=supports_code,
            estimated_vram_gb=estimated_vram,
            digest=data.get("digest", ""),
            details=details,
        )
    
    def _detect_family(self, name: str) -> str:
        """Detect model family from name."""
        name_lower = name.lower()
        for family, patterns in MODEL_FAMILIES.items():
            if any(pattern in name_lower for pattern in patterns):
                return family
        return "unknown"
    
    def _parse_tag(self, tag: str) -> Tuple[str, str]:
        """Parse parameter size and quantization from tag."""
        tag_lower = tag.lower()
        
        # Common parameter sizes
        param_patterns = [
            (r"(\d+)b", lambda m: f"{m.group(1)}B"),
            (r"(\d+)x(\d+)b", lambda m: f"{m.group(1)}x{m.group(2)}B"),
        ]
        
        param_size = ""
        for pattern, formatter in param_patterns:
            match = re.search(pattern, tag_lower)
            if match:
                param_size = formatter(match)
                break
        
        # Common quantization formats
        quant_patterns = ["q4_k_m", "q4_k_s", "q5_k_m", "q5_k_s", "q8_0", "q6_k", "fp16", "fp32", "int8", "int4"]
        quantization = ""
        for quant in quant_patterns:
            if quant in tag_lower:
                quantization = quant.upper()
                break
        
        return param_size, quantization
    
    def _estimate_vram(self, param_size: str, quantization: str, file_size_gb: float) -> float:
        """Estimate VRAM requirement based on model characteristics."""
        # If we have file size, use it as a rough estimate (model + overhead)
        if file_size_gb > 0:
            return round(file_size_gb * 1.2, 1)  # 20% overhead for KV cache etc.
        
        # Otherwise estimate from parameter size
        param_match = re.search(r"(\d+)", param_size)
        if param_match:
            params_b = int(param_match.group(1))
            
            # Bytes per parameter based on quantization
            bytes_per_param = {
                "Q4_K_M": 0.5,
                "Q4_K_S": 0.5,
                "Q5_K_M": 0.625,
                "Q5_K_S": 0.625,
                "Q6_K": 0.75,
                "Q8_0": 1.0,
                "INT8": 1.0,
                "INT4": 0.5,
                "FP16": 2.0,
                "FP32": 4.0,
            }.get(quantization.upper(), 0.5)
            
            vram_gb = (params_b * bytes_per_param) + 2  # +2GB for overhead
            return round(vram_gb, 1)
        
        return 4.0  # Default estimate
    
    def get_models(self) -> List[OllamaModelInfo]:
        """Get cached list of models (synchronous)."""
        return list(self._models_cache.values())
    
    def get_model(self, name: str) -> Optional[OllamaModelInfo]:
        """Get specific model info."""
        # Try exact match first
        if name in self._models_cache:
            return self._models_cache[name]
        
        # Try without ollama: prefix
        if name.startswith("ollama:"):
            name = name[7:]
            if name in self._models_cache:
                return self._models_cache[name]
        
        # Try partial match
        for model_name, info in self._models_cache.items():
            if name in model_name or model_name.startswith(name):
                return info
        
        return None
    
    def get_model_names(self) -> List[str]:
        """Get list of model names."""
        return [m.full_name for m in self._models_cache.values()]
    
    def get_models_for_ui(self) -> List[Dict[str, Any]]:
        """Get models formatted for UI display."""
        models = []
        for info in sorted(self._models_cache.values(), key=lambda m: m.name):
            models.append({
                "value": info.ollama_id,
                "label": f"{info.full_name}",
                "sublabel": f"{info.parameter_size} {info.quantization}".strip() or f"{info.size_gb:.1f}GB",
                "family": info.family,
                "size_gb": info.size_gb,
                "supports_code": info.supports_code,
                "supports_vision": info.supports_vision,
                "supports_tools": info.supports_tools,
                "estimated_vram_gb": info.estimated_vram_gb,
                "context_length": info.context_length,
            })
        return models
    
    def recommend_models(
        self,
        available_vram_gb: float,
        task_type: str = "general",
        prefer_quality: bool = False,
    ) -> List[OllamaModelInfo]:
        """
        Recommend models based on hardware and task type.
        
        Args:
            available_vram_gb: Available VRAM in GB
            task_type: Type of task (general, coding, vision)
            prefer_quality: Prefer quality over speed
        
        Returns:
            List of recommended models, sorted by suitability
        """
        suitable_models = []
        
        for info in self._models_cache.values():
            # Filter by VRAM
            if info.estimated_vram_gb > available_vram_gb:
                continue
            
            # Filter by task type
            if task_type == "coding" and not info.supports_code:
                # Still include general models but deprioritize
                pass
            elif task_type == "vision" and not info.supports_vision:
                continue
            
            suitable_models.append(info)
        
        # Sort by suitability
        def sort_key(m: OllamaModelInfo) -> Tuple:
            # Higher is better
            task_match = 0
            if task_type == "coding" and m.supports_code:
                task_match = 10
            elif task_type == "vision" and m.supports_vision:
                task_match = 10
            elif task_type == "general":
                task_match = 5
            
            # Prefer larger models if quality preferred, smaller if speed preferred
            size_score = m.size_gb if prefer_quality else -m.size_gb
            
            return (-task_match, size_score)
        
        suitable_models.sort(key=sort_key)
        return suitable_models[:5]  # Top 5 recommendations
    
    async def pull_model(self, model_name: str, progress_callback=None) -> bool:
        """
        Pull a model from Ollama registry.
        
        Args:
            model_name: Name of model to pull
            progress_callback: Optional callback for progress updates
        
        Returns:
            True if successful
        """
        import aiohttp
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.host}/api/pull",
                    json={"name": model_name, "stream": True},
                    timeout=aiohttp.ClientTimeout(total=3600)  # 1 hour timeout
                ) as resp:
                    if resp.status != 200:
                        return False
                    
                    async for line in resp.content:
                        if line:
                            try:
                                data = json.loads(line)
                                if progress_callback:
                                    progress_callback(data)
                                if data.get("status") == "success":
                                    await self.refresh_models(force=True)
                                    return True
                            except json.JSONDecodeError:
                                pass
                    
                    return True
                    
        except Exception as e:
            logger.error(f"Failed to pull model {model_name}: {e}")
            return False
    
    async def delete_model(self, model_name: str) -> bool:
        """Delete a model from Ollama."""
        import aiohttp
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.delete(
                    f"{self.host}/api/delete",
                    json={"name": model_name},
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as resp:
                    if resp.status == 200:
                        await self.refresh_models(force=True)
                        return True
                    return False
        except Exception as e:
            logger.error(f"Failed to delete model {model_name}: {e}")
            return False


# Global instance
_ollama_service: Optional[OllamaModelService] = None


def get_ollama_service() -> OllamaModelService:
    """Get or create the global Ollama service."""
    global _ollama_service
    if _ollama_service is None:
        _ollama_service = OllamaModelService()
    return _ollama_service


async def get_available_models() -> List[Dict[str, Any]]:
    """Get available Ollama models for UI (convenience function)."""
    service = get_ollama_service()
    await service.refresh_models()
    return service.get_models_for_ui()


async def check_ollama_status() -> Dict[str, Any]:
    """Check Ollama status (convenience function)."""
    service = get_ollama_service()
    status = await service.check_status()
    return status.to_dict()
