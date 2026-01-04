import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Cloud, 
  Server, 
  Shuffle, 
  Zap,
  Check,
  Info,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
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
import type { ProjectSettings } from '../../../shared/types';

// Execution mode types
export type ProjectExecutionMode = 'local_only' | 'hybrid' | 'cloud_only' | 'automatic';

interface ProjectExecutionModeSettingsProps {
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
  className?: string;
}

const MODE_INFO: Record<ProjectExecutionMode, {
  name: string;
  icon: typeof Cloud;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  description: string;
  shortDesc: string;
}> = {
  automatic: {
    name: 'Automatic',
    icon: Zap,
    color: 'green',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-400',
    description: 'Intelligently selects the best provider based on task complexity, hardware, and availability. Uses local models for simple tasks and Claude for complex ones.',
    shortDesc: 'Best of all modes',
  },
  local_only: {
    name: 'Local Only',
    icon: Server,
    color: 'blue',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    description: 'All tasks run locally on Ollama. Complex tasks that exceed local capabilities will be rejected.',
    shortDesc: 'Privacy first',
  },
  hybrid: {
    name: 'Hybrid',
    icon: Shuffle,
    color: 'purple',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400',
    description: 'Routes tasks between Claude and Ollama based on complexity thresholds. Includes fallback support.',
    shortDesc: 'Balanced approach',
  },
  cloud_only: {
    name: 'Cloud Only',
    icon: Cloud,
    color: 'orange',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-400',
    description: 'All tasks run on Claude API. Best quality but requires internet and uses API credits.',
    shortDesc: 'Maximum quality',
  },
};

const MODES_ORDER: ProjectExecutionMode[] = ['automatic', 'local_only', 'hybrid', 'cloud_only'];

export function ProjectExecutionModeSettings({ 
  settings, 
  setSettings,
  className 
}: ProjectExecutionModeSettingsProps) {
  const { t } = useTranslation();
  
  // Get current mode from settings or default to automatic
  const currentMode = (settings.executionMode as ProjectExecutionMode) || 'automatic';
  
  // Provider status (would be fetched from API in real implementation)
  const [providerStatus, setProviderStatus] = useState<{
    claude: 'available' | 'unavailable' | 'degraded';
    ollama: 'available' | 'unavailable' | 'degraded';
  }>({
    claude: 'available',
    ollama: 'available',
  });

  // Check provider status on mount
  useEffect(() => {
    const checkProviders = async () => {
      try {
        // Check Ollama
        const ollamaResponse = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        }).catch(() => null);
        
        setProviderStatus(prev => ({
          ...prev,
          ollama: ollamaResponse?.ok ? 'available' : 'unavailable',
        }));
      } catch {
        // Ignore errors
      }
    };
    
    checkProviders();
  }, []);

  const handleModeChange = (mode: ProjectExecutionMode) => {
    setSettings(prev => ({
      ...prev,
      executionMode: mode,
    }));
  };

  const getStatusIcon = (status: 'available' | 'unavailable' | 'degraded') => {
    switch (status) {
      case 'available':
        return <Check className="h-3 w-3 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
      case 'unavailable':
        return <AlertTriangle className="h-3 w-3 text-red-400" />;
    }
  };

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Execution Mode</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose how tasks are executed for this project
            </p>
          </div>
          
          {/* Provider Status */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Claude</span>
              {getStatusIcon(providerStatus.claude)}
            </div>
            <div className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Ollama</span>
              {getStatusIcon(providerStatus.ollama)}
            </div>
          </div>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-2 gap-3">
          {MODES_ORDER.map((mode) => {
            const info = MODE_INFO[mode];
            const Icon = info.icon;
            const isSelected = currentMode === mode;
            const isDisabled = 
              (mode === 'local_only' && providerStatus.ollama === 'unavailable') ||
              (mode === 'cloud_only' && providerStatus.claude === 'unavailable');

            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !isDisabled && handleModeChange(mode)}
                    disabled={isDisabled}
                    className={cn(
                      'relative flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left',
                      'hover:bg-accent/50',
                      isSelected
                        ? `${info.bgColor} ${info.borderColor}`
                        : 'border-border/50 hover:border-border',
                      isDisabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className={cn(
                        'absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center',
                        info.bgColor
                      )}>
                        <Check className={cn('h-3 w-3', info.textColor)} />
                      </div>
                    )}

                    {/* Icon and name */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        'h-7 w-7 rounded-md flex items-center justify-center',
                        info.bgColor
                      )}>
                        <Icon className={cn('h-4 w-4', info.textColor)} />
                      </div>
                      <span className={cn(
                        'font-medium text-sm',
                        isSelected ? info.textColor : 'text-foreground'
                      )}>
                        {info.name}
                      </span>
                    </div>

                    {/* Short description */}
                    <span className="text-xs text-muted-foreground">
                      {info.shortDesc}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-sm">{info.description}</p>
                  {isDisabled && (
                    <p className="text-xs text-yellow-400 mt-1">
                      Provider unavailable
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Current mode description */}
        <div className={cn(
          'p-3 rounded-lg border',
          MODE_INFO[currentMode].bgColor,
          MODE_INFO[currentMode].borderColor
        )}>
          <div className="flex items-start gap-2">
            <Info className={cn('h-4 w-4 mt-0.5', MODE_INFO[currentMode].textColor)} />
            <div>
              <p className="text-sm text-foreground">
                {MODE_INFO[currentMode].description}
              </p>
              {currentMode === 'automatic' && (
                <p className="text-xs text-muted-foreground mt-1">
                  This mode analyzes each task and selects the optimal provider automatically.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Mode-specific settings */}
        {(currentMode === 'hybrid' || currentMode === 'automatic') && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Advanced Options
            </h4>
            
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-foreground">Prefer Local Execution</span>
                <p className="text-xs text-muted-foreground">
                  Use Ollama when possible to save API costs
                </p>
              </div>
              <Switch
                checked={settings.preferLocalExecution ?? true}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, preferLocalExecution: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-foreground">Enable Fallback</span>
                <p className="text-xs text-muted-foreground">
                  Automatically switch providers on errors
                </p>
              </div>
              <Switch
                checked={settings.enableFallback ?? true}
                onCheckedChange={(checked) => 
                  setSettings(prev => ({ ...prev, enableFallback: checked }))
                }
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
