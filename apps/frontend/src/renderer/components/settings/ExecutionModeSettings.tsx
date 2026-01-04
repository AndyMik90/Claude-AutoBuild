import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Cloud, 
  Server, 
  Shuffle, 
  Check, 
  AlertTriangle,
  Info,
  Settings,
  Cpu,
  HardDrive,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';

// Execution mode types
type ExecutionMode = 'local_only' | 'hybrid' | 'cloud_only' | 'automatic';
type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

interface ModeConfig {
  mode: ExecutionMode;
  local_max_complexity: TaskComplexity;
  hybrid_prefer_local: boolean;
  hybrid_fallback_on_error: boolean;
  hybrid_complexity_threshold: TaskComplexity;
  auto_select_model: boolean;
}

interface HardwareInfo {
  gpu_available: boolean;
  gpu_name: string;
  vram_total_gb: number;
  vram_available_gb: number;
  cpu_cores: number;
  cpu_model: string;
  ram_total_gb: number;
  ram_available_gb: number;
  can_run_large_models: boolean;
  can_run_medium_models: boolean;
  can_run_small_models: boolean;
}

interface OllamaModel {
  value: string;
  label: string;
  sublabel?: string;
  family: string;
  size_gb: number;
  supports_code: boolean;
  estimated_vram_gb: number;
}

interface ExecutionModeSettingsProps {
  className?: string;
}

const MODE_INFO = {
  local_only: {
    name: 'Local Only',
    icon: Server,
    color: 'blue',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    description: 'All tasks run locally on Ollama. Complex tasks will be rejected.',
    pros: ['Complete privacy', 'No API costs', 'Works offline'],
    cons: ['Limited to local hardware', 'Complex tasks rejected'],
  },
  hybrid: {
    name: 'Hybrid',
    icon: Shuffle,
    color: 'purple',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400',
    description: 'Automatically routes tasks between Claude and Ollama based on complexity.',
    pros: ['Best of both worlds', 'Automatic optimization', 'Fallback support'],
    cons: ['May use API credits for complex tasks'],
  },
  cloud_only: {
    name: 'Cloud Only',
    icon: Cloud,
    color: 'orange',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-400',
    description: 'All tasks run on Claude API. Best quality but requires internet.',
    pros: ['Highest quality', 'Handles any complexity', 'Fastest for complex tasks'],
    cons: ['Requires internet', 'API costs'],
  },
  automatic: {
    name: 'Automatic',
    icon: Zap,
    color: 'green',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-400',
    description: 'Intelligently selects the best provider based on task, hardware, and availability.',
    pros: ['Optimal performance', 'Cost-efficient', 'Adapts to conditions'],
    cons: ['Less predictable provider choice'],
  },
};

const COMPLEXITY_LEVELS: { value: TaskComplexity; label: string; description: string }[] = [
  { value: 'trivial', label: 'Trivial', description: 'Simple edits, formatting' },
  { value: 'simple', label: 'Simple', description: 'Single-file changes' },
  { value: 'moderate', label: 'Moderate', description: 'Multi-file changes' },
  { value: 'complex', label: 'Complex', description: 'Architecture changes' },
  { value: 'expert', label: 'Expert', description: 'System design' },
];

export function ExecutionModeSettings({ className }: ExecutionModeSettingsProps) {
  const { t } = useTranslation();
  
  // State
  const [currentMode, setCurrentMode] = useState<ExecutionMode>('hybrid');
  const [config, setConfig] = useState<ModeConfig>({
    mode: 'hybrid',
    local_max_complexity: 'moderate',
    hybrid_prefer_local: true,
    hybrid_fallback_on_error: true,
    hybrid_complexity_threshold: 'moderate',
    auto_select_model: true,
  });
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [claudeAvailable, setClaudeAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  // Load initial data
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      // Load execution mode config
      const modeInfo = await window.electronAPI?.provider?.getModeInfo?.();
      if (modeInfo) {
        setCurrentMode(modeInfo.current_mode);
        if (modeInfo.config) {
          setConfig(modeInfo.config);
        }
      }
      
      // Load hardware info
      const hwInfo = await window.electronAPI?.provider?.getHardware?.();
      if (hwInfo) {
        setHardware(hwInfo);
      }
      
      // Load provider status
      const status = await window.electronAPI?.provider?.getInfo?.();
      if (status) {
        setOllamaAvailable(status.ollama_status?.health !== 'unavailable');
        setClaudeAvailable(status.claude_status?.health !== 'unavailable');
      }
      
      // Load Ollama models
      const models = await window.electronAPI?.provider?.getOllamaModels?.();
      if (models) {
        setOllamaModels(models);
      }
    } catch (error) {
      console.error('Failed to load execution mode data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleModeChange = async (mode: ExecutionMode) => {
    try {
      await window.electronAPI?.provider?.setMode?.(mode);
      setCurrentMode(mode);
      setConfig(prev => ({ ...prev, mode }));
    } catch (error) {
      console.error('Failed to change mode:', error);
    }
  };
  
  const handleConfigChange = async (key: keyof ModeConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    try {
      await window.electronAPI?.provider?.updateModeConfig?.(newConfig);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };
  
  const refreshHardware = async () => {
    try {
      const hwInfo = await window.electronAPI?.provider?.getHardware?.(true);
      if (hwInfo) {
        setHardware(hwInfo);
      }
    } catch (error) {
      console.error('Failed to refresh hardware:', error);
    }
  };
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Execution Mode</h3>
          <p className="text-sm text-gray-400">
            Choose how tasks are routed between local and cloud AI providers
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>
      
      {/* Mode Selection Cards */}
      <div className="grid grid-cols-3 gap-4">
        {(Object.entries(MODE_INFO) as [ExecutionMode, typeof MODE_INFO.local_only][]).map(([mode, info]) => {
          const Icon = info.icon;
          const isSelected = currentMode === mode;
          const isDisabled = 
            (mode === 'local_only' && !ollamaAvailable) ||
            (mode === 'cloud_only' && !claudeAvailable);
          
          return (
            <button
              key={mode}
              onClick={() => !isDisabled && handleModeChange(mode)}
              disabled={isDisabled}
              className={cn(
                'relative p-4 rounded-lg border-2 transition-all text-left',
                isSelected
                  ? `${info.borderColor} ${info.bgColor}`
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/50',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className={cn(
                  'absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center',
                  info.bgColor
                )}>
                  <Check className={cn('h-3 w-3', info.textColor)} />
                </div>
              )}
              
              {/* Icon and name */}
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-5 w-5', isSelected ? info.textColor : 'text-gray-400')} />
                <span className={cn('font-medium', isSelected ? 'text-white' : 'text-gray-300')}>
                  {info.name}
                </span>
              </div>
              
              {/* Description */}
              <p className="text-xs text-gray-400 mb-3">
                {info.description}
              </p>
              
              {/* Pros */}
              <div className="space-y-1">
                {info.pros.slice(0, 2).map((pro, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="h-3 w-3" />
                    <span>{pro}</span>
                  </div>
                ))}
              </div>
              
              {/* Disabled reason */}
              {isDisabled && (
                <div className="mt-2 flex items-center gap-1 text-xs text-yellow-400">
                  <AlertTriangle className="h-3 w-3" />
                  <span>
                    {mode === 'local_only' ? 'Ollama not available' : 'Claude not available'}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Hardware Info */}
      {hardware && (
        <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Detected Hardware</span>
            </div>
            <Button variant="ghost" size="sm" onClick={refreshHardware}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* GPU */}
            <div>
              <div className="text-gray-400 text-xs mb-1">GPU</div>
              {hardware.gpu_available ? (
                <div>
                  <div className="text-white">{hardware.gpu_name}</div>
                  <div className="text-gray-400 text-xs">
                    {hardware.vram_available_gb.toFixed(1)} / {hardware.vram_total_gb.toFixed(1)} GB VRAM
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">No GPU detected</div>
              )}
            </div>
            
            {/* RAM */}
            <div>
              <div className="text-gray-400 text-xs mb-1">System RAM</div>
              <div className="text-white">
                {hardware.ram_available_gb.toFixed(1)} / {hardware.ram_total_gb.toFixed(1)} GB
              </div>
            </div>
            
            {/* Model Capabilities */}
            <div className="col-span-2">
              <div className="text-gray-400 text-xs mb-2">Model Capabilities</div>
              <div className="flex gap-2">
                <span className={cn(
                  'px-2 py-1 rounded text-xs',
                  hardware.can_run_small_models ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'
                )}>
                  Small (3-8B)
                </span>
                <span className={cn(
                  'px-2 py-1 rounded text-xs',
                  hardware.can_run_medium_models ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'
                )}>
                  Medium (13-34B)
                </span>
                <span className={cn(
                  'px-2 py-1 rounded text-xs',
                  hardware.can_run_large_models ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'
                )}>
                  Large (70B+)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Mode-specific Settings */}
      {currentMode === 'local_only' && (
        <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            Local Mode Settings
          </h4>
          
          <div className="space-y-4">
            {/* Max complexity for local */}
            <div>
              <label className="text-sm text-gray-300 mb-2 block">
                Maximum Task Complexity
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Tasks above this complexity will be rejected in Local Only mode
              </p>
              <Select
                value={config.local_max_complexity}
                onValueChange={(v) => handleConfigChange('local_max_complexity', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex items-center gap-2">
                        <span>{level.label}</span>
                        <span className="text-xs text-gray-500">- {level.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Available models count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Available Ollama Models</span>
              <span className="text-white">{ollamaModels.length}</span>
            </div>
          </div>
        </div>
      )}
      
      {currentMode === 'hybrid' && (
        <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-purple-400" />
            Hybrid Mode Settings
          </h4>
          
          <div className="space-y-4">
            {/* Prefer local */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300">Prefer Local Execution</label>
                <p className="text-xs text-gray-500">
                  Use Ollama when task complexity allows
                </p>
              </div>
              <Switch
                checked={config.hybrid_prefer_local}
                onCheckedChange={(v) => handleConfigChange('hybrid_prefer_local', v)}
              />
            </div>
            
            {/* Fallback on error */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300">Enable Fallback</label>
                <p className="text-xs text-gray-500">
                  Automatically switch provider on errors
                </p>
              </div>
              <Switch
                checked={config.hybrid_fallback_on_error}
                onCheckedChange={(v) => handleConfigChange('hybrid_fallback_on_error', v)}
              />
            </div>
            
            {/* Complexity threshold */}
            <div>
              <label className="text-sm text-gray-300 mb-2 block">
                Claude Threshold
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Tasks above this complexity will use Claude
              </p>
              <Select
                value={config.hybrid_complexity_threshold}
                onValueChange={(v) => handleConfigChange('hybrid_complexity_threshold', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex items-center gap-2">
                        <span>{level.label}</span>
                        <span className="text-xs text-gray-500">- {level.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      
      {currentMode === 'cloud_only' && (
        <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-orange-400" />
            Cloud Mode Settings
          </h4>
          
          <div className="text-sm text-gray-400">
            All tasks will be executed using Claude API.
            {!claudeAvailable && (
              <div className="mt-2 flex items-center gap-2 text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Claude API is currently unavailable</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Auto Model Selection */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <label className="text-sm font-medium text-white">Auto Model Selection</label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Automatically select the best model based on task complexity and hardware
          </p>
        </div>
        <Switch
          checked={config.auto_select_model}
          onCheckedChange={(v) => handleConfigChange('auto_select_model', v)}
        />
      </div>
      
      {/* Advanced Settings */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Advanced Settings
            </span>
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700 space-y-4">
            {/* Environment variables info */}
            <div>
              <h5 className="text-sm font-medium text-white mb-2">Environment Variables</h5>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">EXECUTION_MODE</span>
                  <span className="text-green-400">{currentMode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">HYBRID_PREFER_LOCAL</span>
                  <span className="text-green-400">{config.hybrid_prefer_local ? 'true' : 'false'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">AUTO_SELECT_MODEL</span>
                  <span className="text-green-400">{config.auto_select_model ? 'true' : 'false'}</span>
                </div>
              </div>
            </div>
            
            {/* Provider status */}
            <div>
              <h5 className="text-sm font-medium text-white mb-2">Provider Status</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <Cloud className="h-4 w-4" />
                    Claude
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs',
                    claudeAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  )}>
                    {claudeAvailable ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Ollama
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs',
                    ollamaAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  )}>
                    {ollamaAvailable ? `Available (${ollamaModels.length} models)` : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default ExecutionModeSettings;
