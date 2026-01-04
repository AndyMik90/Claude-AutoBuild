import { ipcMain } from 'electron';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { getSettingsPath, readSettingsFile } from '../settings-utils';

// Types for provider management
export type Provider = 'claude' | 'ollama';
export type ProviderStatus = 'available' | 'unavailable' | 'degraded' | 'checking';

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
}

export interface ProviderSettings {
  primary_provider: Provider;
  fallback_provider: Provider;
  auto_fallback: boolean;
  ollama_model: string;
  max_parallel_agents: number;
  context_window: number;
}

/**
 * Detect GPU information using nvidia-smi
 */
async function detectGPUs(): Promise<GPUInfo[]> {
  const gpus: GPUInfo[] = [];

  try {
    // Try nvidia-smi for NVIDIA GPUs
    const result = execSync(
      'nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 10000 }
    );

    const lines = result.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 6) continue;

      try {
        const index = parseInt(parts[0], 10);
        const name = parts[1];
        const memoryTotal = parseFloat(parts[2]) / 1024; // MB to GB
        const memoryUsed = parseFloat(parts[3]) / 1024;
        const memoryFree = parseFloat(parts[4]) / 1024;
        const utilization = parseFloat(parts[5]);
        const temperature = parts[6] && parts[6] !== '[N/A]' ? parseFloat(parts[6]) : null;
        const powerDraw = parts[7] && parts[7] !== '[N/A]' ? parseFloat(parts[7]) : null;

        gpus.push({
          index,
          name,
          vram_total_gb: Math.round(memoryTotal * 100) / 100,
          vram_used_gb: Math.round(memoryUsed * 100) / 100,
          vram_free_gb: Math.round(memoryFree * 100) / 100,
          vram_percent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 1000) / 10 : 0,
          utilization: Math.round(utilization * 10) / 10,
          temperature,
          power_draw: powerDraw ? Math.round(powerDraw * 10) / 10 : null,
        });
      } catch (parseError) {
        console.warn('[provider-handlers] Failed to parse GPU line:', line, parseError);
      }
    }
  } catch (error) {
    // nvidia-smi not available or no NVIDIA GPU
    console.log('[provider-handlers] No NVIDIA GPU detected or nvidia-smi not available');
  }

  return gpus;
}

/**
 * Get CPU information
 */
function getCPUInfo(): { model: string; cores: number; threads: number; percent: number } {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model : 'Unknown';
  const cores = cpus.length;
  const threads = cpus.length;

  // Calculate CPU usage
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as Record<string, number>)[type];
    }
    totalIdle += cpu.times.idle;
  }
  const percent = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 1000) / 10 : 0;

  return { model, cores, threads, percent };
}

/**
 * Get RAM information
 */
function getRAMInfo(): { total_gb: number; used_gb: number; available_gb: number; percent: number } {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    total_gb: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
    used_gb: Math.round((usedMem / (1024 ** 3)) * 100) / 100,
    available_gb: Math.round((freeMem / (1024 ** 3)) * 100) / 100,
    percent: Math.round((usedMem / totalMem) * 1000) / 10,
  };
}

/**
 * Check Ollama health
 */
async function checkOllamaHealth(ollamaModel: string): Promise<ProviderHealth> {
  const startTime = Date.now();

  try {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const response = await fetch(`${ollamaHost}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        provider: 'ollama',
        status: 'unavailable',
        model_available: false,
        error_message: `Ollama returned status ${response.status}`,
      };
    }

    const data = await response.json() as { models?: Array<{ name: string }> };
    const models = data.models || [];
    const modelNames = models.map(m => m.name);

    // Check if the configured model is available
    const modelAvailable = modelNames.some(name =>
      name === ollamaModel || name.startsWith(ollamaModel.split(':')[0])
    );

    return {
      provider: 'ollama',
      status: modelAvailable ? 'available' : 'degraded',
      model_available: modelAvailable,
      response_time_ms: Date.now() - startTime,
      error_message: modelAvailable ? undefined : `Model ${ollamaModel} not found. Available: ${modelNames.join(', ')}`,
    };
  } catch (error) {
    return {
      provider: 'ollama',
      status: 'unavailable',
      model_available: false,
      error_message: error instanceof Error ? error.message : 'Failed to connect to Ollama',
    };
  }
}

/**
 * Check Claude health with proper rate limit detection
 */
async function checkClaudeHealth(): Promise<ProviderHealth> {
  const startTime = Date.now();

  // Check for OAuth token
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!oauthToken && !apiKey) {
    return {
      provider: 'claude',
      status: 'unavailable',
      model_available: false,
      error_message: 'No Claude authentication configured (OAuth token or API key required)',
    };
  }

  try {
    // Make a lightweight API call to check status
    // Using the messages endpoint with minimal payload
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    } else if (oauthToken) {
      headers['Authorization'] = `Bearer ${oauthToken}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const responseTime = Date.now() - startTime;

    // Handle different response codes
    if (response.status === 200) {
      return {
        provider: 'claude',
        status: 'available',
        model_available: true,
        response_time_ms: responseTime,
      };
    }

    if (response.status === 429) {
      // Rate limited - this is DEGRADED, not unavailable!
      // The service is reachable, just temporarily limited
      const retryAfter = response.headers.get('retry-after');
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: `Rate limited${retryAfter ? `. Retry after ${retryAfter}s` : ''}. Service is reachable but temporarily limited.`,
      };
    }

    if (response.status === 401) {
      return {
        provider: 'claude',
        status: 'unavailable',
        model_available: false,
        response_time_ms: responseTime,
        error_message: 'Authentication failed. Please check your API key or OAuth token.',
      };
    }

    if (response.status === 503 || response.status === 502 || response.status === 500) {
      // Service temporarily unavailable - degraded, not unavailable
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: `Service temporarily unavailable (${response.status}). Will retry automatically.`,
      };
    }

    if (response.status === 529) {
      // Overloaded - degraded
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        response_time_ms: responseTime,
        error_message: 'API is overloaded. Requests may be slower than usual.',
      };
    }

    // Other errors
    const errorBody = await response.text().catch(() => '');
    return {
      provider: 'claude',
      status: 'degraded',
      model_available: true,
      response_time_ms: responseTime,
      error_message: `Unexpected response (${response.status}): ${errorBody.slice(0, 100)}`,
    };

  } catch (error) {
    // Network errors - check if it's a timeout or connection issue
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return {
        provider: 'claude',
        status: 'degraded',
        model_available: true,
        error_message: 'Request timed out. Service may be slow or overloaded.',
      };
    }

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      return {
        provider: 'claude',
        status: 'unavailable',
        model_available: false,
        error_message: 'Cannot connect to Anthropic API. Check your internet connection.',
      };
    }

    // For other errors, assume degraded (reachable but having issues)
    return {
      provider: 'claude',
      status: 'degraded',
      model_available: true,
      error_message: `Health check error: ${errorMessage}`,
    };
  }
}

/**
 * Get recommended settings based on detected hardware
 */
function getRecommendedSettings(hardware: HardwareInfo): RecommendedSettings {
  const recommendations: RecommendedSettings = {
    max_parallel_agents: 12,
    ollama_model: 'llama3.1:8b-instruct-q4_K_M',
    context_window: 8192,
    hardware_profile: null,
    gpu_layers: -1, // Auto-detect
  };

  // Adjust based on RAM
  if (hardware.ram.total_gb < 16) {
    recommendations.max_parallel_agents = 2;
    recommendations.ollama_model = 'llama3.2:3b';
    recommendations.context_window = 4096;
    recommendations.hardware_profile = 'low_memory';
  } else if (hardware.ram.total_gb < 32) {
    recommendations.max_parallel_agents = 4;
    recommendations.context_window = 8192;
  } else if (hardware.ram.total_gb >= 64) {
    recommendations.max_parallel_agents = 12;
    recommendations.context_window = 16384;
    recommendations.hardware_profile = 'high_memory';
  }

  // Adjust based on GPU
  if (hardware.gpus.length > 0) {
    const totalVram = hardware.gpus.reduce((sum, gpu) => sum + gpu.vram_total_gb, 0);
    const gpuName = hardware.gpus[0].name.toLowerCase();

    if (totalVram >= 24) {
      recommendations.ollama_model = 'llama3.1:70b-instruct-q4_K_M';
      recommendations.context_window = 32768;
      recommendations.max_parallel_agents = Math.min(10, recommendations.max_parallel_agents);

      if (gpuName.includes('4090')) {
        recommendations.hardware_profile = 'rtx_4090';
      } else if (gpuName.includes('3090')) {
        recommendations.hardware_profile = 'rtx_3090';
      }
    } else if (totalVram >= 12) {
      recommendations.ollama_model = 'llama3.1:8b-instruct-q4_K_M';
      recommendations.context_window = 8192;
      recommendations.max_parallel_agents = Math.min(6, recommendations.max_parallel_agents);

      if (gpuName.includes('3080')) {
        recommendations.hardware_profile = 'rtx_3080_ti';
      } else if (gpuName.includes('4070')) {
        recommendations.hardware_profile = 'rtx_4070';
      }
    } else if (totalVram >= 8) {
      recommendations.ollama_model = 'qwen2.5-coder:7b';
      recommendations.context_window = 8192;
      recommendations.max_parallel_agents = Math.min(4, recommendations.max_parallel_agents);
    } else {
      recommendations.ollama_model = 'llama3.2:3b';
      recommendations.context_window = 4096;
      recommendations.max_parallel_agents = Math.min(2, recommendations.max_parallel_agents);
    }
  } else {
    // CPU only
    recommendations.hardware_profile = 'cpu_only';
    recommendations.max_parallel_agents = 2;
    recommendations.ollama_model = 'llama3.2:3b';
    recommendations.context_window = 4096;
    recommendations.gpu_layers = 0;
  }

  return recommendations;
}

/**
 * Load provider settings from settings file
 */
function loadProviderSettings(): Partial<ProviderSettings> {
  try {
    const settings = readSettingsFile();
    return {
      primary_provider: settings.aiProvider || 'claude',
      fallback_provider: settings.aiFallbackProvider || 'ollama',
      auto_fallback: settings.aiAutoFallback !== false,
      ollama_model: settings.ollamaModel || 'llama3.1:8b-instruct-q4_K_M',
      max_parallel_agents: settings.maxParallelAgents || 12,
      context_window: settings.ollamaContextWindow || 8192,
    };
  } catch {
    return {};
  }
}

/**
 * Save provider settings to settings file
 */
function saveProviderSettings(providerSettings: Partial<ProviderSettings>): boolean {
  try {
    const settingsPath = getSettingsPath();
    const currentSettings = readSettingsFile();

    const newSettings = {
      ...currentSettings,
      aiProvider: providerSettings.primary_provider,
      aiFallbackProvider: providerSettings.fallback_provider,
      aiAutoFallback: providerSettings.auto_fallback,
      ollamaModel: providerSettings.ollama_model,
      maxParallelAgents: providerSettings.max_parallel_agents,
      ollamaContextWindow: providerSettings.context_window,
    };

    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
    return true;
  } catch (error) {
    console.error('[provider-handlers] Failed to save provider settings:', error);
    return false;
  }
}

/**
 * Register provider management IPC handlers
 */
export function registerProviderHandlers(): void {
  // Get comprehensive provider information
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_INFO,
    async (): Promise<IPCResult<ProviderInfo>> => {
      try {
        const settings = loadProviderSettings();
        const ollamaModel = settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M';

        const [claudeHealth, ollamaHealth] = await Promise.all([
          checkClaudeHealth(),
          checkOllamaHealth(ollamaModel),
        ]);

        // Determine current provider based on health and settings
        const primaryProvider = settings.primary_provider || 'claude';
        const fallbackProvider = settings.fallback_provider || 'ollama';
        const autoFallback = settings.auto_fallback !== false;

        let currentProvider: Provider = primaryProvider;
        let fallbackActive = false;

        const primaryHealth = primaryProvider === 'claude' ? claudeHealth : ollamaHealth;
        const fallbackHealth = primaryProvider === 'claude' ? ollamaHealth : claudeHealth;

        if (primaryHealth.status === 'unavailable' && autoFallback && fallbackHealth.status !== 'unavailable') {
          currentProvider = fallbackProvider;
          fallbackActive = true;
        }

        const currentModel = currentProvider === 'claude'
          ? 'claude-sonnet-4-20250514'
          : ollamaModel;

        const info: ProviderInfo = {
          current_provider: currentProvider,
          fallback_active: fallbackActive,
          primary_provider: primaryProvider,
          fallback_provider: fallbackProvider,
          current_model: currentModel,
          max_parallel_agents: settings.max_parallel_agents || 12,
          context_window: currentProvider === 'claude' ? 200000 : (settings.context_window || 8192),
          hardware_profile: null,
          auto_fallback_enabled: autoFallback,
          health: {
            claude: claudeHealth,
            ollama: ollamaHealth,
          },
        };

        return { success: true, data: info };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get provider info',
        };
      }
    }
  );

  // Switch provider
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SWITCH,
    async (_, provider: Provider): Promise<IPCResult<{ success: boolean }>> => {
      try {
        const settings = loadProviderSettings();
        settings.primary_provider = provider;
        const saved = saveProviderSettings(settings);

        if (!saved) {
          return { success: false, error: 'Failed to save provider settings' };
        }

        return { success: true, data: { success: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch provider',
        };
      }
    }
  );

  // Get hardware information
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_HARDWARE,
    async (): Promise<IPCResult<HardwareInfo>> => {
      try {
        const gpus = await detectGPUs();
        const cpu = getCPUInfo();
        const ram = getRAMInfo();

        const hardware: HardwareInfo = {
          cpu,
          ram,
          gpus,
          platform: os.platform(),
          arch: os.arch(),
        };

        return { success: true, data: hardware };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get hardware info',
        };
      }
    }
  );

  // Check provider health
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_CHECK_HEALTH,
    async (_, provider: Provider): Promise<IPCResult<ProviderHealth>> => {
      try {
        const settings = loadProviderSettings();
        const health = provider === 'claude'
          ? await checkClaudeHealth()
          : await checkOllamaHealth(settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M');

        return { success: true, data: health };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check provider health',
        };
      }
    }
  );

  // Get recommended settings based on hardware
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_RECOMMENDED_SETTINGS,
    async (): Promise<IPCResult<RecommendedSettings>> => {
      try {
        const gpus = await detectGPUs();
        const cpu = getCPUInfo();
        const ram = getRAMInfo();

        const hardware: HardwareInfo = {
          cpu,
          ram,
          gpus,
          platform: os.platform(),
          arch: os.arch(),
        };

        const recommendations = getRecommendedSettings(hardware);
        return { success: true, data: recommendations };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recommended settings',
        };
      }
    }
  );

  // Save provider settings
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SAVE_SETTINGS,
    async (_, settings: Partial<ProviderSettings>): Promise<IPCResult<{ success: boolean }>> => {
      try {
        const saved = saveProviderSettings(settings);
        if (!saved) {
          return { success: false, error: 'Failed to save provider settings' };
        }
        return { success: true, data: { success: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save provider settings',
        };
      }
    }
  );
}


// ============================================
// Execution Mode Types and Handlers
// ============================================

type ExecutionMode = 'local_only' | 'hybrid' | 'cloud_only';
type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

interface ModeConfig {
  mode: ExecutionMode;
  local_max_complexity: TaskComplexity;
  hybrid_prefer_local: boolean;
  hybrid_fallback_on_error: boolean;
  hybrid_complexity_threshold: TaskComplexity;
  auto_select_model: boolean;
}

interface OllamaModelInfo {
  value: string;
  label: string;
  sublabel?: string;
  family: string;
  size_gb: number;
  supports_code: boolean;
  estimated_vram_gb: number;
  parameter_size?: string;
}

interface ComplexityAnalysis {
  complexity: TaskComplexity;
  score: number;
  factors: string[];
  can_run_locally: boolean;
  recommended_provider: 'claude' | 'ollama';
}

interface ModelSelection {
  provider: 'claude' | 'ollama';
  model: string;
  reason: string;
  fallback_available: boolean;
  fallback_provider?: 'claude' | 'ollama';
  fallback_model?: string;
}

// Execution mode config file path
function getModeConfigPath(): string {
  const settingsPath = getSettingsPath();
  return path.join(path.dirname(settingsPath), 'execution-mode.json');
}

// Load execution mode config
function loadModeConfig(): ModeConfig {
  const configPath = getModeConfigPath();
  const defaultConfig: ModeConfig = {
    mode: 'hybrid',
    local_max_complexity: 'moderate',
    hybrid_prefer_local: true,
    hybrid_fallback_on_error: true,
    hybrid_complexity_threshold: 'moderate',
    auto_select_model: true,
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (error) {
    console.warn('[provider-handlers] Failed to load mode config:', error);
  }

  return defaultConfig;
}

// Save execution mode config
function saveModeConfig(config: Partial<ModeConfig>): boolean {
  const configPath = getModeConfigPath();
  try {
    const currentConfig = loadModeConfig();
    const newConfig = { ...currentConfig, ...config };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return true;
  } catch (error) {
    console.error('[provider-handlers] Failed to save mode config:', error);
    return false;
  }
}

// Get installed Ollama models
async function getOllamaModels(): Promise<OllamaModelInfo[]> {
  const models: OllamaModelInfo[] = [];

  try {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const response = await fetch(`${ollamaHost}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return models;
    }

    const data = await response.json() as { models?: Array<{ name: string; size: number; details?: { family?: string; parameter_size?: string } }> };
    const ollamaModels = data.models || [];

    for (const model of ollamaModels) {
      const name = model.name;
      const sizeGb = model.size / (1024 ** 3);
      const family = model.details?.family || 'unknown';
      const parameterSize = model.details?.parameter_size || '';

      // Determine if model supports code
      const supportsCode = name.toLowerCase().includes('code') ||
        name.toLowerCase().includes('coder') ||
        name.toLowerCase().includes('qwen') ||
        name.toLowerCase().includes('deepseek') ||
        name.toLowerCase().includes('starcoder');

      // Estimate VRAM requirement (rough estimate: model size * 1.2 for overhead)
      const estimatedVram = sizeGb * 1.2;

      models.push({
        value: name,
        label: name.split(':')[0],
        sublabel: parameterSize || `${sizeGb.toFixed(1)}GB`,
        family,
        size_gb: Math.round(sizeGb * 100) / 100,
        supports_code: supportsCode,
        estimated_vram_gb: Math.round(estimatedVram * 100) / 100,
        parameter_size: parameterSize,
      });
    }
  } catch (error) {
    console.warn('[provider-handlers] Failed to get Ollama models:', error);
  }

  return models;
}

// Analyze task complexity
function analyzeTaskComplexity(taskDescription: string, context?: { files?: string[]; codeSize?: number }): ComplexityAnalysis {
  let score = 0;
  const factors: string[] = [];

  // Length-based scoring
  const wordCount = taskDescription.split(/\s+/).length;
  if (wordCount > 200) {
    score += 2;
    factors.push('Long description');
  } else if (wordCount > 100) {
    score += 1;
    factors.push('Medium description');
  }

  // Keyword-based scoring
  const complexKeywords = [
    'architecture', 'refactor', 'redesign', 'migrate', 'integrate',
    'security', 'performance', 'optimize', 'scale', 'distributed',
    'microservices', 'database schema', 'api design', 'authentication',
    'authorization', 'encryption', 'caching', 'load balancing'
  ];

  const moderateKeywords = [
    'implement', 'create', 'build', 'develop', 'add feature',
    'multiple files', 'component', 'service', 'module', 'class'
  ];

  const simpleKeywords = [
    'fix', 'bug', 'typo', 'update', 'change', 'modify', 'edit',
    'rename', 'move', 'delete', 'add comment', 'format'
  ];

  const lowerDesc = taskDescription.toLowerCase();

  for (const keyword of complexKeywords) {
    if (lowerDesc.includes(keyword)) {
      score += 2;
      factors.push(`Complex keyword: ${keyword}`);
    }
  }

  for (const keyword of moderateKeywords) {
    if (lowerDesc.includes(keyword)) {
      score += 1;
      factors.push(`Moderate keyword: ${keyword}`);
    }
  }

  for (const keyword of simpleKeywords) {
    if (lowerDesc.includes(keyword)) {
      score -= 1;
      factors.push(`Simple keyword: ${keyword}`);
    }
  }

  // Context-based scoring
  if (context?.files && context.files.length > 10) {
    score += 2;
    factors.push(`Many files: ${context.files.length}`);
  } else if (context?.files && context.files.length > 5) {
    score += 1;
    factors.push(`Multiple files: ${context.files.length}`);
  }

  if (context?.codeSize && context.codeSize > 10000) {
    score += 2;
    factors.push('Large codebase');
  } else if (context?.codeSize && context.codeSize > 5000) {
    score += 1;
    factors.push('Medium codebase');
  }

  // Determine complexity level
  let complexity: TaskComplexity;
  if (score <= 0) {
    complexity = 'trivial';
  } else if (score <= 2) {
    complexity = 'simple';
  } else if (score <= 5) {
    complexity = 'moderate';
  } else if (score <= 8) {
    complexity = 'complex';
  } else {
    complexity = 'expert';
  }

  // Load mode config to determine if can run locally
  const modeConfig = loadModeConfig();
  const complexityOrder: TaskComplexity[] = ['trivial', 'simple', 'moderate', 'complex', 'expert'];
  const complexityIndex = complexityOrder.indexOf(complexity);
  const thresholdIndex = complexityOrder.indexOf(modeConfig.hybrid_complexity_threshold);
  const localMaxIndex = complexityOrder.indexOf(modeConfig.local_max_complexity);

  const canRunLocally = complexityIndex <= localMaxIndex;
  const recommendedProvider = complexityIndex > thresholdIndex ? 'claude' : 'ollama';

  return {
    complexity,
    score: Math.max(0, score),
    factors,
    can_run_locally: canRunLocally,
    recommended_provider: recommendedProvider,
  };
}

// Auto-select model based on task and hardware
async function autoSelectModel(
  taskDescription: string,
  taskType: string = 'coding',
  preferredProvider?: 'claude' | 'ollama'
): Promise<ModelSelection> {
  const modeConfig = loadModeConfig();
  const complexity = analyzeTaskComplexity(taskDescription);
  const gpus = await detectGPUs();
  const ram = getRAMInfo();

  // Check provider availability
  const settings = loadProviderSettings();
  const ollamaHealth = await checkOllamaHealth(settings.ollama_model || 'llama3.1:8b-instruct-q4_K_M');
  const claudeHealth = await checkClaudeHealth();

  const ollamaAvailable = ollamaHealth.status !== 'unavailable';
  const claudeAvailable = claudeHealth.status !== 'unavailable';

  // Determine provider based on mode
  let provider: 'claude' | 'ollama';
  let model: string;
  let reason: string;
  let fallbackAvailable = false;
  let fallbackProvider: 'claude' | 'ollama' | undefined;
  let fallbackModel: string | undefined;

  if (modeConfig.mode === 'cloud_only') {
    if (!claudeAvailable) {
      return {
        provider: 'claude',
        model: 'sonnet',
        reason: 'Cloud-only mode but Claude unavailable',
        fallback_available: false,
      };
    }
    provider = 'claude';
    model = complexity.complexity === 'expert' ? 'opus' : 'sonnet';
    reason = 'Cloud-only mode';
  } else if (modeConfig.mode === 'local_only') {
    if (!ollamaAvailable) {
      return {
        provider: 'ollama',
        model: 'llama3.1:8b',
        reason: 'Local-only mode but Ollama unavailable',
        fallback_available: false,
      };
    }
    if (!complexity.can_run_locally) {
      return {
        provider: 'ollama',
        model: settings.ollama_model || 'llama3.1:8b',
        reason: `Task too complex for local mode (${complexity.complexity})`,
        fallback_available: false,
      };
    }
    provider = 'ollama';
    model = await selectBestOllamaModel(taskType, gpus, ram);
    reason = 'Local-only mode';
  } else {
    // Hybrid mode
    if (preferredProvider) {
      provider = preferredProvider;
    } else if (modeConfig.hybrid_prefer_local && ollamaAvailable && complexity.can_run_locally) {
      provider = 'ollama';
    } else if (complexity.recommended_provider === 'claude' && claudeAvailable) {
      provider = 'claude';
    } else if (ollamaAvailable) {
      provider = 'ollama';
    } else {
      provider = 'claude';
    }

    if (provider === 'claude') {
      model = complexity.complexity === 'expert' ? 'opus' : 'sonnet';
      reason = `Hybrid mode: ${complexity.complexity} complexity`;
      if (ollamaAvailable && modeConfig.hybrid_fallback_on_error) {
        fallbackAvailable = true;
        fallbackProvider = 'ollama';
        fallbackModel = await selectBestOllamaModel(taskType, gpus, ram);
      }
    } else {
      model = await selectBestOllamaModel(taskType, gpus, ram);
      reason = `Hybrid mode: local preferred for ${complexity.complexity} complexity`;
      if (claudeAvailable && modeConfig.hybrid_fallback_on_error) {
        fallbackAvailable = true;
        fallbackProvider = 'claude';
        fallbackModel = 'sonnet';
      }
    }
  }

  return {
    provider,
    model,
    reason,
    fallback_available: fallbackAvailable,
    fallback_provider: fallbackProvider,
    fallback_model: fallbackModel,
  };
}

// Select best Ollama model based on task and hardware
async function selectBestOllamaModel(
  taskType: string,
  gpus: GPUInfo[],
  ram: { total_gb: number; available_gb: number }
): Promise<string> {
  const models = await getOllamaModels();
  if (models.length === 0) {
    return 'llama3.1:8b-instruct-q4_K_M';
  }

  // Calculate available VRAM
  const availableVram = gpus.length > 0
    ? gpus.reduce((sum, gpu) => sum + gpu.vram_free_gb, 0)
    : 0;

  // Filter models that fit in VRAM/RAM
  const maxVram = availableVram > 0 ? availableVram : ram.available_gb * 0.5;
  const fittingModels = models.filter(m => m.estimated_vram_gb <= maxVram);

  if (fittingModels.length === 0) {
    // Return smallest model
    const smallest = models.sort((a, b) => a.size_gb - b.size_gb)[0];
    return smallest?.value || 'llama3.2:3b';
  }

  // For coding tasks, prefer code-specialized models
  if (taskType === 'coding' || taskType === 'code') {
    const codeModels = fittingModels.filter(m => m.supports_code);
    if (codeModels.length > 0) {
      // Return largest code model that fits
      const best = codeModels.sort((a, b) => b.size_gb - a.size_gb)[0];
      return best.value;
    }
  }

  // Return largest general model that fits
  const best = fittingModels.sort((a, b) => b.size_gb - a.size_gb)[0];
  return best.value;
}

// Register execution mode handlers
export function registerExecutionModeHandlers(): void {
  // Get mode info
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_MODE_INFO,
    async (): Promise<IPCResult<{ current_mode: ExecutionMode; config: ModeConfig }>> => {
      try {
        const config = loadModeConfig();
        return {
          success: true,
          data: {
            current_mode: config.mode,
            config,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get mode info',
        };
      }
    }
  );

  // Set mode
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SET_MODE,
    async (_, mode: ExecutionMode): Promise<IPCResult<{ success: boolean }>> => {
      try {
        const saved = saveModeConfig({ mode });
        return { success: saved, data: { success: saved } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set mode',
        };
      }
    }
  );

  // Update mode config
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_UPDATE_MODE_CONFIG,
    async (_, config: Partial<ModeConfig>): Promise<IPCResult<{ success: boolean }>> => {
      try {
        const saved = saveModeConfig(config);
        return { success: saved, data: { success: saved } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update mode config',
        };
      }
    }
  );

  // Get Ollama models
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET_OLLAMA_MODELS,
    async (): Promise<IPCResult<OllamaModelInfo[]>> => {
      try {
        const models = await getOllamaModels();
        return { success: true, data: models };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Ollama models',
        };
      }
    }
  );

  // Analyze task complexity
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_ANALYZE_TASK_COMPLEXITY,
    async (_, taskDescription: string, context?: { files?: string[]; codeSize?: number }): Promise<IPCResult<ComplexityAnalysis>> => {
      try {
        const analysis = analyzeTaskComplexity(taskDescription, context);
        return { success: true, data: analysis };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to analyze task complexity',
        };
      }
    }
  );

  // Auto-select model
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_AUTO_SELECT_MODEL,
    async (_, taskDescription: string, taskType?: string, preferredProvider?: 'claude' | 'ollama'): Promise<IPCResult<ModelSelection>> => {
      try {
        const selection = await autoSelectModel(taskDescription, taskType || 'coding', preferredProvider);
        return { success: true, data: selection };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to auto-select model',
        };
      }
    }
  );
}
