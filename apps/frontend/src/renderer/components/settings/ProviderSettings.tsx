import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Settings2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { toast } from '../../hooks/use-toast';
import { ExecutionModeSettings } from './ExecutionModeSettings';

// Types
type Provider = 'claude' | 'ollama';
type ProviderStatus = 'available' | 'unavailable' | 'degraded' | 'checking';

interface GPUInfo {
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

interface HardwareInfo {
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

interface ProviderHealth {
  provider: Provider;
  status: ProviderStatus;
  model_available: boolean;
  response_time_ms?: number;
  error_message?: string;
}

interface ProviderInfo {
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

interface RecommendedSettings {
  max_parallel_agents: number;
  ollama_model: string;
  context_window: number;
  hardware_profile: string | null;
  gpu_layers: number;
}

interface ProviderSettings {
  primary_provider: Provider;
  fallback_provider: Provider;
  auto_fallback: boolean;
  ollama_model: string;
  max_parallel_agents: number;
  context_window: number;
}

const STATUS_COLORS: Record<ProviderStatus, string> = {
  available: 'text-green-500',
  unavailable: 'text-red-500',
  degraded: 'text-yellow-500',
  checking: 'text-blue-500',
};

const STATUS_BG_COLORS: Record<ProviderStatus, string> = {
  available: 'bg-green-500/10 border-green-500/20',
  unavailable: 'bg-red-500/10 border-red-500/20',
  degraded: 'bg-yellow-500/10 border-yellow-500/20',
  checking: 'bg-blue-500/10 border-blue-500/20',
};

/**
 * ProviderSettings Component
 *
 * Allows users to configure AI provider settings (Claude/Ollama),
 * view hardware information, and apply recommended settings.
 */
export function ProviderSettings() {
  const { t } = useTranslation('settings');

  // State
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [recommended, setRecommended] = useState<RecommendedSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state
  const [primaryProvider, setPrimaryProvider] = useState<Provider>('claude');
  const [autoFallback, setAutoFallback] = useState(true);
  const [ollamaModel, setOllamaModel] = useState('llama3.1:8b-instruct-q4_K_M');
  const [maxAgents, setMaxAgents] = useState(12);
  const [contextWindow, setContextWindow] = useState(8192);

  // Fetch provider info and hardware
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [providerResult, hardwareResult, recommendedResult] = await Promise.all([
        window.electronAPI?.getProviderInfo?.(),
        window.electronAPI?.getHardwareInfo?.(),
        window.electronAPI?.getRecommendedSettings?.(),
      ]);

      if (providerResult?.success && providerResult.data) {
        setProviderInfo(providerResult.data);
        setPrimaryProvider(providerResult.data.primary_provider);
        setAutoFallback(providerResult.data.auto_fallback_enabled);
        setOllamaModel(providerResult.data.current_model);
        setMaxAgents(providerResult.data.max_parallel_agents);
        setContextWindow(providerResult.data.context_window);
      }

      if (hardwareResult?.success && hardwareResult.data) {
        setHardware(hardwareResult.data);
      }

      if (recommendedResult?.success && recommendedResult.data) {
        setRecommended(recommendedResult.data);
      }
    } catch (error) {
      console.error('Failed to fetch provider data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load provider settings',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const settings: Partial<ProviderSettings> = {
        primary_provider: primaryProvider,
        auto_fallback: autoFallback,
        ollama_model: ollamaModel,
        max_parallel_agents: maxAgents,
        context_window: contextWindow,
      };

      const result = await window.electronAPI?.saveProviderSettings?.(settings);

      if (result?.success) {
        toast({
          title: 'Settings saved',
          description: 'Provider settings have been updated',
        });
        await fetchData();
      } else {
        throw new Error(result?.error || 'Failed to save settings');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Apply recommended settings
  const handleApplyRecommended = () => {
    if (recommended) {
      setOllamaModel(recommended.ollama_model);
      setMaxAgents(recommended.max_parallel_agents);
      setContextWindow(recommended.context_window);
      toast({
        title: 'Recommended settings applied',
        description: 'Click Save to apply these settings',
      });
    }
  };

  // Switch provider
  const handleProviderSwitch = async (provider: Provider) => {
    try {
      const result = await window.electronAPI?.switchProvider?.(provider);
      if (result?.success) {
        setPrimaryProvider(provider);
        toast({
          title: 'Provider switched',
          description: `Now using ${provider === 'claude' ? 'Claude (Cloud)' : 'Ollama (Local)'}`,
        });
        await fetchData();
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to switch provider',
      });
    }
  };

  if (isLoading) {
    return (
      <SettingsSection
        title="AI Provider"
        description="Configure AI provider settings"
      >
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="AI Provider"
      description="Choose between Claude (cloud) and Ollama (local) for AI tasks"
    >
      <div className="space-y-6">
        {/* Provider Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Claude Card */}
          <button
            onClick={() => handleProviderSwitch('claude')}
            className={cn(
              'relative rounded-lg border p-4 text-left transition-all',
              'hover:border-primary/50 hover:shadow-sm',
              primaryProvider === 'claude'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card',
              STATUS_BG_COLORS[providerInfo?.health.claude.status || 'checking']
            )}
          >
            {primaryProvider === 'claude' && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <CheckCircle className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                primaryProvider === 'claude' ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Cloud className={cn(
                  'h-5 w-5',
                  primaryProvider === 'claude' ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">Claude (Cloud)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Anthropic's Claude API - powerful, fast, large context
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium',
                    STATUS_COLORS[providerInfo?.health.claude.status || 'checking']
                  )}>
                    {providerInfo?.health.claude.status || 'checking'}
                  </span>
                  {providerInfo?.health.claude.status === 'unavailable' && (
                    <span className="text-xs text-muted-foreground">
                      (No token configured)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>

          {/* Ollama Card */}
          <button
            onClick={() => handleProviderSwitch('ollama')}
            className={cn(
              'relative rounded-lg border p-4 text-left transition-all',
              'hover:border-primary/50 hover:shadow-sm',
              primaryProvider === 'ollama'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card',
              STATUS_BG_COLORS[providerInfo?.health.ollama.status || 'checking']
            )}
          >
            {primaryProvider === 'ollama' && (
              <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <CheckCircle className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                primaryProvider === 'ollama' ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Server className={cn(
                  'h-5 w-5',
                  primaryProvider === 'ollama' ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">Ollama (Local)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run models locally - private, offline, no API costs
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium',
                    STATUS_COLORS[providerInfo?.health.ollama.status || 'checking']
                  )}>
                    {providerInfo?.health.ollama.status || 'checking'}
                  </span>
                  {providerInfo?.health.ollama.response_time_ms && (
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(providerInfo.health.ollama.response_time_ms)}ms)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Auto-Fallback Toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Automatic Fallback</Label>
            <p className="text-xs text-muted-foreground">
              Automatically switch to backup provider when primary is unavailable
            </p>
          </div>
          <Switch
            checked={autoFallback}
            onCheckedChange={setAutoFallback}
          />
        </div>

        {/* Hardware Detection Card */}
        {hardware && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Detected Hardware
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchData}
                  className="h-7"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
              </div>
              <CardDescription className="text-xs">
                Auto-detected system configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* CPU */}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" />
                  CPU
                </span>
                <span className="font-mono text-xs">{hardware.cpu.model}</span>
              </div>

              {/* RAM */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <MemoryStick className="h-3.5 w-3.5" />
                    RAM
                  </span>
                  <span className="text-xs">
                    {hardware.ram.used_gb.toFixed(1)}GB / {hardware.ram.total_gb.toFixed(1)}GB
                  </span>
                </div>
                <Progress value={hardware.ram.percent} className="h-1.5" />
              </div>

              {/* GPUs */}
              {hardware.gpus.map((gpu) => (
                <div key={gpu.index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      {gpu.name}
                    </span>
                    <span className="text-xs">
                      {gpu.vram_used_gb.toFixed(1)}GB / {gpu.vram_total_gb.toFixed(1)}GB VRAM
                    </span>
                  </div>
                  <Progress value={gpu.vram_percent} className="h-1.5" />
                </div>
              ))}

              {hardware.gpus.length === 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No GPU detected - CPU-only mode
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Execution Mode Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Execution Mode</CardTitle>
            <CardDescription className="text-xs">
              Configure how tasks are routed between local and cloud providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExecutionModeSettings />
          </CardContent>
        </Card>

        {/* Recommended Settings */}
        {recommended && (
          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                  <Zap className="h-4 w-4" />
                  Recommended Settings
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyRecommended}
                  className="h-7"
                >
                  Apply
                </Button>
              </div>
              <CardDescription className="text-xs">
                Optimized for your hardware
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Model:</span>
                  <br />
                  <span className="font-mono">{recommended.ollama_model}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Agents:</span>
                  <br />
                  {recommended.max_parallel_agents}
                </div>
                <div>
                  <span className="text-muted-foreground">Context Window:</span>
                  <br />
                  {recommended.context_window.toLocaleString()} tokens
                </div>
                <div>
                  <span className="text-muted-foreground">GPU Layers:</span>
                  <br />
                  {recommended.gpu_layers === -1 ? 'Auto' : recommended.gpu_layers}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Advanced Settings */}
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Advanced Settings</span>
            </div>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="border-t p-4 space-y-4">
              {/* Ollama Model */}
              <div className="space-y-2">
                <Label className="text-sm">Ollama Model</Label>
                <Input
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.1:8b-instruct-q4_K_M"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The Ollama model to use for local inference
                </p>
              </div>

              {/* Max Parallel Agents */}
              <div className="space-y-2">
                <Label className="text-sm">Max Parallel Agents</Label>
                <Input
                  type="number"
                  value={maxAgents}
                  onChange={(e) => setMaxAgents(parseInt(e.target.value) || 1)}
                  min={1}
                  max={20}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of concurrent AI agents (lower for Ollama)
                </p>
              </div>

              {/* Context Window */}
              <div className="space-y-2">
                <Label className="text-sm">Context Window (Ollama)</Label>
                <Select
                  value={contextWindow.toString()}
                  onValueChange={(v) => setContextWindow(parseInt(v))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4096">4,096 tokens</SelectItem>
                    <SelectItem value="8192">8,192 tokens</SelectItem>
                    <SelectItem value="16384">16,384 tokens</SelectItem>
                    <SelectItem value="32768">32,768 tokens</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Context window size for Ollama (larger = more memory)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

export default ProviderSettings;
