import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';

// Types for provider management
export type Provider = 'claude' | 'ollama';
export type ProviderStatus = 'available' | 'unavailable' | 'degraded' | 'checking';
export type ExecutionMode = 'local_only' | 'hybrid' | 'cloud_only';
export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

export interface ProviderHealth {
  provider: Provider;
  status: ProviderStatus;
  model_available: boolean;
  response_time_ms?: number;
  error_message?: string;
}

export interface GPUInfo {
  index: number;
  name: string;
  vram_total_gb: number;
  vram_used_gb: number;
  vram_free_gb: number;
  vram_percent: number;
  utilization: number;
  temperature: number | null;
  power_draw: number | null;
}

export interface HardwareInfo {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    percent: number;
  };
  ram: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    percent: number;
  };
  gpus: GPUInfo[];
  platform: string;
  arch: string;
  // Extended hardware info for execution mode
  gpu_available?: boolean;
  gpu_name?: string;
  vram_total_gb?: number;
  vram_available_gb?: number;
  can_run_small_models?: boolean;
  can_run_medium_models?: boolean;
  can_run_large_models?: boolean;
}

export interface RecommendedSettings {
  max_parallel_agents: number;
  ollama_model: string;
  context_window: number;
  hardware_profile: string | null;
  gpu_layers: number;
}

export interface ProviderInfo {
  current_provider: Provider;
  fallback_active: boolean;
  primary_provider: Provider;
  fallback_provider: Provider;
  current_model: string;
  max_parallel_agents: number;
  context_window: number;
  hardware_profile: string | null;
  auto_fallback_enabled: boolean;
  health: {
    claude: ProviderHealth;
    ollama: ProviderHealth;
  };
  // Extended for execution mode
  claude_status?: ProviderHealth;
  ollama_status?: ProviderHealth;
}

export interface ProviderSettings {
  primary_provider: Provider;
  fallback_provider: Provider;
  auto_fallback: boolean;
  ollama_model: string;
  max_parallel_agents: number;
  context_window: number;
}

// Execution mode types
export interface ModeConfig {
  mode: ExecutionMode;
  local_max_complexity: TaskComplexity;
  hybrid_prefer_local: boolean;
  hybrid_fallback_on_error: boolean;
  hybrid_complexity_threshold: TaskComplexity;
  auto_select_model: boolean;
}

export interface OllamaModelInfo {
  value: string;
  label: string;
  sublabel?: string;
  family: string;
  size_gb: number;
  supports_code: boolean;
  estimated_vram_gb: number;
  parameter_size?: string;
}

export interface ComplexityAnalysis {
  complexity: TaskComplexity;
  score: number;
  factors: string[];
  can_run_locally: boolean;
  recommended_provider: Provider;
}

export interface ModelSelection {
  provider: Provider;
  model: string;
  reason: string;
  fallback_available: boolean;
  fallback_provider?: Provider;
  fallback_model?: string;
}

export interface ModeInfo {
  current_mode: ExecutionMode;
  config: ModeConfig;
}

export interface ProviderAPI {
  // Get comprehensive provider information
  getProviderInfo: () => Promise<IPCResult<ProviderInfo>>;
  getInfo: () => Promise<ProviderInfo | null>;

  // Switch to a specific provider
  switchProvider: (provider: Provider) => Promise<IPCResult<{ success: boolean }>>;

  // Get hardware information
  getHardwareInfo: () => Promise<IPCResult<HardwareInfo>>;
  getHardware: (forceRefresh?: boolean) => Promise<HardwareInfo | null>;

  // Check provider health
  checkProviderHealth: (provider: Provider) => Promise<IPCResult<ProviderHealth>>;

  // Get recommended settings based on hardware
  getRecommendedSettings: () => Promise<IPCResult<RecommendedSettings>>;

  // Save provider settings
  saveProviderSettings: (settings: Partial<ProviderSettings>) => Promise<IPCResult<{ success: boolean }>>;

  // Execution mode methods
  getModeInfo: () => Promise<ModeInfo | null>;
  setMode: (mode: ExecutionMode) => Promise<boolean>;
  updateModeConfig: (config: Partial<ModeConfig>) => Promise<boolean>;
  getOllamaModels: () => Promise<OllamaModelInfo[]>;
  analyzeTaskComplexity: (taskDescription: string, context?: { files?: string[]; codeSize?: number }) => Promise<ComplexityAnalysis | null>;
  autoSelectModel: (taskDescription: string, taskType?: string, preferredProvider?: Provider) => Promise<ModelSelection | null>;
}

export const createProviderAPI = (): ProviderAPI => ({
  getProviderInfo: (): Promise<IPCResult<ProviderInfo>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_INFO),

  getInfo: async (): Promise<ProviderInfo | null> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_INFO);
      if (result?.success && result.data) {
        // Add extended status info
        return {
          ...result.data,
          claude_status: result.data.health?.claude,
          ollama_status: result.data.health?.ollama,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get provider info:', error);
      return null;
    }
  },

  switchProvider: (provider: Provider): Promise<IPCResult<{ success: boolean }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_SWITCH, provider),

  getHardwareInfo: (): Promise<IPCResult<HardwareInfo>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_HARDWARE),

  getHardware: async (forceRefresh?: boolean): Promise<HardwareInfo | null> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_HARDWARE, forceRefresh);
      if (result?.success && result.data) {
        const hw = result.data;
        // Add extended hardware info
        const gpuAvailable = hw.gpus && hw.gpus.length > 0;
        const primaryGpu = gpuAvailable ? hw.gpus[0] : null;
        const totalVram = gpuAvailable ? hw.gpus.reduce((sum: number, g: GPUInfo) => sum + g.vram_total_gb, 0) : 0;
        const availableVram = gpuAvailable ? hw.gpus.reduce((sum: number, g: GPUInfo) => sum + g.vram_free_gb, 0) : 0;

        return {
          ...hw,
          gpu_available: gpuAvailable,
          gpu_name: primaryGpu?.name || 'No GPU',
          vram_total_gb: totalVram,
          vram_available_gb: availableVram,
          can_run_small_models: hw.ram.available_gb >= 4 || availableVram >= 4,
          can_run_medium_models: availableVram >= 8 || hw.ram.available_gb >= 16,
          can_run_large_models: availableVram >= 24,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get hardware info:', error);
      return null;
    }
  },

  checkProviderHealth: (provider: Provider): Promise<IPCResult<ProviderHealth>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CHECK_HEALTH, provider),

  getRecommendedSettings: (): Promise<IPCResult<RecommendedSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_RECOMMENDED_SETTINGS),

  saveProviderSettings: (settings: Partial<ProviderSettings>): Promise<IPCResult<{ success: boolean }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_SAVE_SETTINGS, settings),

  // Execution mode methods
  getModeInfo: async (): Promise<ModeInfo | null> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_MODE_INFO);
      return result?.success ? result.data : null;
    } catch (error) {
      console.error('Failed to get mode info:', error);
      return null;
    }
  },

  setMode: async (mode: ExecutionMode): Promise<boolean> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_SET_MODE, mode);
      return result?.success ?? false;
    } catch (error) {
      console.error('Failed to set mode:', error);
      return false;
    }
  },

  updateModeConfig: async (config: Partial<ModeConfig>): Promise<boolean> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_UPDATE_MODE_CONFIG, config);
      return result?.success ?? false;
    } catch (error) {
      console.error('Failed to update mode config:', error);
      return false;
    }
  },

  getOllamaModels: async (): Promise<OllamaModelInfo[]> => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_OLLAMA_MODELS);
      return result?.success ? result.data : [];
    } catch (error) {
      console.error('Failed to get Ollama models:', error);
      return [];
    }
  },

  analyzeTaskComplexity: async (
    taskDescription: string,
    context?: { files?: string[]; codeSize?: number }
  ): Promise<ComplexityAnalysis | null> => {
    try {
      const result = await ipcRenderer.invoke(
        IPC_CHANNELS.PROVIDER_ANALYZE_TASK_COMPLEXITY,
        taskDescription,
        context
      );
      return result?.success ? result.data : null;
    } catch (error) {
      console.error('Failed to analyze task complexity:', error);
      return null;
    }
  },

  autoSelectModel: async (
    taskDescription: string,
    taskType?: string,
    preferredProvider?: Provider
  ): Promise<ModelSelection | null> => {
    try {
      const result = await ipcRenderer.invoke(
        IPC_CHANNELS.PROVIDER_AUTO_SELECT_MODEL,
        taskDescription,
        taskType,
        preferredProvider
      );
      return result?.success ? result.data : null;
    } catch (error) {
      console.error('Failed to auto-select model:', error);
      return null;
    }
  },
});
