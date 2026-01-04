/**
 * AgentProfileSelector - Reusable component for selecting agent profile in forms
 *
 * Provides a dropdown for quick profile selection (Auto, Complex, Balanced, Quick)
 * with an inline "Custom" option that reveals model and thinking level selects.
 * The "Auto" profile shows per-phase model configuration.
 * Now includes Ollama profiles and execution mode selection.
 *
 * Used in TaskCreationWizard and TaskEditDialog.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Brain, 
  Scale, 
  Zap, 
  Sliders, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Pencil,
  Server,
  Cloud,
  Code,
  Shuffle,
  Monitor
} from 'lucide-react';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator
} from './ui/select';
import {
  DEFAULT_AGENT_PROFILES,
  OLLAMA_AGENT_PROFILES,
  CLAUDE_MODELS,
  OLLAMA_MODELS,
  AVAILABLE_MODELS,
  THINKING_LEVELS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING,
  isOllamaModel,
  getModelProvider
} from '../../shared/constants';
import type { ModelType, ThinkingLevel } from '../../shared/types';
import type { PhaseModelConfig, PhaseThinkingConfig } from '../../shared/types/settings';
import { cn } from '../lib/utils';

// Execution mode type
type ExecutionMode = 'automatic' | 'local_only' | 'hybrid' | 'cloud_only';

interface AgentProfileSelectorProps {
  /** Currently selected profile ID ('auto', 'complex', 'balanced', 'quick', or 'custom') */
  profileId: string;
  /** Current model value (fallback for non-auto profiles) */
  model: ModelType | '';
  /** Current thinking level value (fallback for non-auto profiles) */
  thinkingLevel: ThinkingLevel | '';
  /** Phase model configuration (for auto profile) */
  phaseModels?: PhaseModelConfig;
  /** Phase thinking configuration (for auto profile) */
  phaseThinking?: PhaseThinkingConfig;
  /** Execution mode for this task */
  executionMode?: ExecutionMode;
  /** Called when profile selection changes */
  onProfileChange: (profileId: string, model: ModelType, thinkingLevel: ThinkingLevel) => void;
  /** Called when model changes (in custom mode) */
  onModelChange: (model: ModelType) => void;
  /** Called when thinking level changes (in custom mode) */
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  /** Called when phase models change (in auto mode) */
  onPhaseModelsChange?: (phaseModels: PhaseModelConfig) => void;
  /** Called when phase thinking changes (in auto mode) */
  onPhaseThinkingChange?: (phaseThinking: PhaseThinkingConfig) => void;
  /** Called when execution mode changes */
  onExecutionModeChange?: (mode: ExecutionMode) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Show execution mode selector */
  showExecutionMode?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  Brain,
  Scale,
  Zap,
  Sparkles,
  Server,
  Code
};

// Phase label translation keys
const PHASE_LABEL_KEYS: Record<keyof PhaseModelConfig, { label: string; description: string }> = {
  spec: { label: 'agentProfile.phases.spec.label', description: 'agentProfile.phases.spec.description' },
  planning: { label: 'agentProfile.phases.planning.label', description: 'agentProfile.phases.planning.description' },
  coding: { label: 'agentProfile.phases.coding.label', description: 'agentProfile.phases.coding.description' },
  qa: { label: 'agentProfile.phases.qa.label', description: 'agentProfile.phases.qa.description' }
};

// Execution mode info
const EXECUTION_MODE_INFO: Record<ExecutionMode, { icon: React.ElementType; label: string; description: string }> = {
  automatic: { 
    icon: Sparkles, 
    label: 'Automatic', 
    description: 'Smart routing based on task complexity and availability' 
  },
  local_only: { 
    icon: Monitor, 
    label: 'Local Only', 
    description: 'All tasks run on Ollama (privacy, no API costs)' 
  },
  hybrid: { 
    icon: Shuffle, 
    label: 'Hybrid', 
    description: 'Simple tasks local, complex tasks on Claude' 
  },
  cloud_only: { 
    icon: Cloud, 
    label: 'Cloud Only', 
    description: 'All tasks run on Claude API' 
  }
};

export function AgentProfileSelector({
  profileId,
  model,
  thinkingLevel,
  phaseModels,
  phaseThinking,
  executionMode = 'automatic',
  onProfileChange,
  onModelChange,
  onThinkingLevelChange,
  onPhaseModelsChange,
  onPhaseThinkingChange,
  onExecutionModeChange,
  disabled,
  showExecutionMode = true
}: AgentProfileSelectorProps) {
  const { t } = useTranslation('settings');
  const [showPhaseDetails, setShowPhaseDetails] = useState(false);
  const [showOllamaProfiles, setShowOllamaProfiles] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [claudeAvailable, setClaudeAvailable] = useState(true);

  const isCustom = profileId === 'custom';
  const isAuto = profileId === 'auto';
  const isOllamaProfile = profileId.startsWith('ollama-');

  // Use provided phase configs or defaults
  const currentPhaseModels = phaseModels || DEFAULT_PHASE_MODELS;
  const currentPhaseThinking = phaseThinking || DEFAULT_PHASE_THINKING;

  // Check provider availability on mount
  useEffect(() => {
    const checkProviders = async () => {
      try {
        // getInfo() returns ProviderInfo | null directly, not IPCResult
        const providerInfo = await window.electronAPI?.provider?.getInfo?.();
        if (providerInfo) {
          // Check both health and extended status (ollama_status) for availability
          const ollamaStatus = providerInfo.health?.ollama?.status || providerInfo.ollama_status?.status;
          const claudeStatus = providerInfo.health?.claude?.status || providerInfo.claude_status?.status;
          
          // Accept 'available' or 'degraded' as available (model exists but may have issues)
          setOllamaAvailable(ollamaStatus === 'available' || ollamaStatus === 'degraded');
          setClaudeAvailable(claudeStatus === 'available' || claudeStatus === 'degraded');
        }
      } catch (error) {
        console.error('Failed to check provider availability:', error);
      }
    };
    checkProviders();
  }, []);

  const handleProfileSelect = (selectedId: string) => {
    if (selectedId === 'custom') {
      // Keep current model/thinking level, just mark as custom
      onProfileChange('custom', model as ModelType || 'sonnet', thinkingLevel as ThinkingLevel || 'medium');
    } else if (selectedId === 'auto') {
      // Auto profile - set defaults
      const autoProfile = DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto');
      if (autoProfile) {
        onProfileChange('auto', autoProfile.model, autoProfile.thinkingLevel);
        // Initialize phase configs with defaults if callback provided
        if (onPhaseModelsChange && autoProfile.phaseModels) {
          onPhaseModelsChange(autoProfile.phaseModels);
        }
        if (onPhaseThinkingChange && autoProfile.phaseThinking) {
          onPhaseThinkingChange(autoProfile.phaseThinking);
        }
      }
    } else if (selectedId.startsWith('ollama-')) {
      // Ollama profile
      const profile = OLLAMA_AGENT_PROFILES.find(p => p.id === selectedId);
      if (profile) {
        onProfileChange(profile.id, profile.model as ModelType, profile.thinkingLevel);
      }
    } else {
      const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === selectedId);
      if (profile) {
        onProfileChange(profile.id, profile.model, profile.thinkingLevel);
      }
    }
  };

  const handlePhaseModelChange = (phase: keyof PhaseModelConfig, value: ModelType) => {
    if (onPhaseModelsChange) {
      onPhaseModelsChange({
        ...currentPhaseModels,
        [phase]: value
      });
    }
  };

  const handlePhaseThinkingChange = (phase: keyof PhaseThinkingConfig, value: ThinkingLevel) => {
    if (onPhaseThinkingChange) {
      onPhaseThinkingChange({
        ...currentPhaseThinking,
        [phase]: value
      });
    }
  };

  // Get profile display info
  const getProfileDisplay = () => {
    if (isCustom) {
      return {
        icon: Sliders,
        label: t('agentProfile.customConfiguration'),
        description: t('agentProfile.customDescription'),
        provider: getModelProvider(model as string)
      };
    }
    
    // Check Ollama profiles
    const ollamaProfile = OLLAMA_AGENT_PROFILES.find(p => p.id === profileId);
    if (ollamaProfile) {
      return {
        icon: iconMap[ollamaProfile.icon || 'Server'] || Server,
        label: ollamaProfile.name,
        description: ollamaProfile.description,
        provider: 'ollama' as const
      };
    }
    
    const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === profileId);
    if (profile) {
      return {
        icon: iconMap[profile.icon || 'Scale'] || Scale,
        label: profile.name,
        description: profile.description,
        provider: 'claude' as const
      };
    }
    // Default to auto profile (the actual default)
    return {
      icon: Sparkles,
      label: 'Auto (Optimized)',
      description: 'Uses Opus across all phases with optimized thinking levels',
      provider: 'claude' as const
    };
  };

  const display = getProfileDisplay();

  // Get the current execution mode info
  const currentModeInfo = EXECUTION_MODE_INFO[executionMode];
  const ModeIcon = currentModeInfo.icon;

  return (
    <div className="space-y-4">
      {/* Execution Mode Selection */}
      {showExecutionMode && onExecutionModeChange && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Shuffle className="h-4 w-4" />
            Execution Mode
          </Label>
          <Select
            value={executionMode}
            onValueChange={(value) => onExecutionModeChange(value as ExecutionMode)}
            disabled={disabled}
          >
            <SelectTrigger className="h-10">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <ModeIcon className="h-4 w-4" />
                  <span>{currentModeInfo.label}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(EXECUTION_MODE_INFO) as [ExecutionMode, typeof currentModeInfo][]).map(([mode, info]) => {
                const Icon = info.icon;
                const isDisabled = 
                  (mode === 'local_only' && !ollamaAvailable) ||
                  (mode === 'cloud_only' && !claudeAvailable);
                return (
                  <SelectItem key={mode} value={mode} disabled={isDisabled}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      <div>
                        <span className="font-medium">{info.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {info.description}
                        </span>
                        {isDisabled && (
                          <span className="ml-1 text-xs text-destructive">(unavailable)</span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {currentModeInfo.description}
          </p>
        </div>
      )}

      {/* Agent Profile Selection */}
      <div className="space-y-2">
        <Label htmlFor="agent-profile" className="text-sm font-medium text-foreground">
          {t('agentProfile.label')}
        </Label>
        <Select
          value={profileId}
          onValueChange={handleProfileSelect}
          disabled={disabled}
        >
          <SelectTrigger id="agent-profile" className="h-10">
            <SelectValue>
              <div className="flex items-center gap-2">
                <display.icon className="h-4 w-4" />
                <span>{display.label}</span>
                {display.provider === 'ollama' && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Local</span>
                )}
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* Claude Profiles */}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-xs">
                <Cloud className="h-3 w-3" />
                Claude (Cloud)
              </SelectLabel>
              {DEFAULT_AGENT_PROFILES.map((profile) => {
                const ProfileIcon = iconMap[profile.icon || 'Scale'] || Scale;
                const modelLabel = CLAUDE_MODELS.find(m => m.value === profile.model)?.label;
                return (
                  <SelectItem 
                    key={profile.id} 
                    value={profile.id}
                    disabled={!claudeAvailable && executionMode !== 'automatic'}
                  >
                    <div className="flex items-center gap-2">
                      <ProfileIcon className="h-4 w-4 shrink-0" />
                      <div>
                        <span className="font-medium">{profile.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {profile.isAutoProfile
                            ? '(per-phase optimization)'
                            : `(${modelLabel} + ${profile.thinkingLevel})`
                          }
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
            
            <SelectSeparator />
            
            {/* Ollama Profiles */}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 text-xs">
                <Server className="h-3 w-3" />
                Ollama (Local)
                {!ollamaAvailable && (
                  <span className="text-destructive">(unavailable)</span>
                )}
              </SelectLabel>
              {OLLAMA_AGENT_PROFILES.map((profile) => {
                const ProfileIcon = iconMap[profile.icon || 'Server'] || Server;
                return (
                  <SelectItem 
                    key={profile.id} 
                    value={profile.id}
                    disabled={!ollamaAvailable}
                  >
                    <div className="flex items-center gap-2">
                      <ProfileIcon className="h-4 w-4 shrink-0" />
                      <div>
                        <span className="font-medium">{profile.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({profile.description})
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
            
            <SelectSeparator />
            
            {/* Custom Option */}
            <SelectItem value="custom">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium">{t('agentProfile.custom')}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({t('agentProfile.customDescription')})
                  </span>
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {display.description}
        </p>
      </div>

      {/* Auto Profile - Phase Configuration */}
      {isAuto && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          {/* Clickable Header */}
          <button
            type="button"
            onClick={() => setShowPhaseDetails(!showPhaseDetails)}
            className={cn(
              'flex w-full items-center justify-between p-4 text-left',
              'hover:bg-muted/50 transition-colors',
              !disabled && 'cursor-pointer'
            )}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{t('agentProfile.phaseConfiguration')}</span>
              {!showPhaseDetails && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Pencil className="h-3 w-3" />
                  <span>{t('agentProfile.clickToCustomize')}</span>
                </span>
              )}
            </div>
            {showPhaseDetails ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Compact summary when collapsed */}
          {!showPhaseDetails && (
            <div className="px-4 pb-4 -mt-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(Object.keys(PHASE_LABEL_KEYS) as Array<keyof PhaseModelConfig>).map((phase) => {
                  const modelValue = currentPhaseModels[phase];
                  const modelInfo = AVAILABLE_MODELS.find(m => m.value === modelValue);
                  const modelLabel = modelInfo?.label?.replace('Claude ', '') || modelValue;
                  const isLocal = isOllamaModel(modelValue);
                  return (
                    <div key={phase} className="flex items-center justify-between rounded bg-background/50 px-2 py-1">
                      <span className="text-muted-foreground">{t(PHASE_LABEL_KEYS[phase].label)}:</span>
                      <span className="font-medium flex items-center gap-1">
                        {isLocal && <Server className="h-3 w-3 text-blue-400" />}
                        {modelLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Phase Configuration */}
          {showPhaseDetails && (
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
              {(Object.keys(PHASE_LABEL_KEYS) as Array<keyof PhaseModelConfig>).map((phase) => (
                <div key={phase} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground">
                      {t(PHASE_LABEL_KEYS[phase].label)}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {t(PHASE_LABEL_KEYS[phase].description)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{t('agentProfile.model')}</Label>
                      <Select
                        value={currentPhaseModels[phase]}
                        onValueChange={(value) => handlePhaseModelChange(phase, value as ModelType)}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Claude Models */}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] flex items-center gap-1">
                              <Cloud className="h-3 w-3" /> Claude
                            </SelectLabel>
                            {CLAUDE_MODELS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                          {/* Ollama Models */}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] flex items-center gap-1">
                              <Server className="h-3 w-3" /> Ollama (Local)
                            </SelectLabel>
                            {OLLAMA_MODELS.map((m) => (
                              <SelectItem key={m.value} value={m.value} disabled={!ollamaAvailable}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{t('agentProfile.thinking')}</Label>
                      <Select
                        value={currentPhaseThinking[phase]}
                        onValueChange={(value) => handlePhaseThinkingChange(phase, value as ThinkingLevel)}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {THINKING_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Configuration (shown only when custom is selected) */}
      {isCustom && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="custom-model" className="text-xs font-medium text-muted-foreground">
              {t('agentProfile.model')}
            </Label>
            <Select
              value={model}
              onValueChange={(value) => onModelChange(value as ModelType)}
              disabled={disabled}
            >
              <SelectTrigger id="custom-model" className="h-9">
                <SelectValue placeholder={t('agentProfile.selectModel')} />
              </SelectTrigger>
              <SelectContent>
                {/* Claude Models */}
                <SelectGroup>
                  <SelectLabel className="text-xs flex items-center gap-1">
                    <Cloud className="h-3 w-3" /> Claude (Cloud)
                  </SelectLabel>
                  {CLAUDE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                {/* Ollama Models */}
                <SelectGroup>
                  <SelectLabel className="text-xs flex items-center gap-1">
                    <Server className="h-3 w-3" /> Ollama (Local)
                  </SelectLabel>
                  {OLLAMA_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value} disabled={!ollamaAvailable}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Thinking Level Selection */}
          <div className="space-y-2">
            <Label htmlFor="custom-thinking" className="text-xs font-medium text-muted-foreground">
              {t('agentProfile.thinking')}
            </Label>
            <Select
              value={thinkingLevel}
              onValueChange={(value) => onThinkingLevelChange(value as ThinkingLevel)}
              disabled={disabled}
            >
              <SelectTrigger id="custom-thinking" className="h-9">
                <SelectValue placeholder={t('agentProfile.selectThinkingLevel')} />
              </SelectTrigger>
              <SelectContent>
                {THINKING_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    <div className="flex items-center gap-2">
                      <span>{level.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {level.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Ollama Profile Info */}
      {isOllamaProfile && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <Server className="h-5 w-5 text-blue-400 mt-0.5" />
            <div>
              <div className="font-medium text-sm text-foreground">Local Execution</div>
              <p className="text-xs text-muted-foreground mt-1">
                This task will run entirely on your local Ollama instance. 
                No data will be sent to external APIs.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
