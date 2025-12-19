/**
 * AgentProfileSelector - Reusable component for selecting agent profile in forms
 *
 * Provides a dropdown for quick profile selection (Auto, Complex, Balanced, Quick)
 * with an inline "Custom" option that reveals model and thinking level selects.
 * The "Auto" profile shows per-phase model configuration.
 *
 * Used in TaskCreationWizard and TaskEditDialog.
 */
import { useState } from 'react';
import { Brain, Scale, Zap, Sliders, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import {
  DEFAULT_AGENT_PROFILES,
  AVAILABLE_MODELS,
  THINKING_LEVELS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING
} from '../../shared/constants';
import type { ModelType, ThinkingLevel } from '../../shared/types';
import type { PhaseModelConfig, PhaseThinkingConfig } from '../../shared/types/settings';
import { cn } from '../lib/utils';

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
  /** Whether the selector is disabled */
  disabled?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  Brain,
  Scale,
  Zap,
  Sparkles
};

const PHASE_LABELS: Record<keyof PhaseModelConfig, { label: string; description: string }> = {
  spec: { label: 'Spec Creation', description: 'Discovery, requirements, context gathering' },
  planning: { label: 'Planning', description: 'Implementation planning and architecture' },
  coding: { label: 'Coding', description: 'Actual code implementation' },
  qa: { label: 'QA Review', description: 'Quality assurance and validation' }
};

export function AgentProfileSelector({
  profileId,
  model,
  thinkingLevel,
  phaseModels,
  phaseThinking,
  onProfileChange,
  onModelChange,
  onThinkingLevelChange,
  onPhaseModelsChange,
  onPhaseThinkingChange,
  disabled
}: AgentProfileSelectorProps) {
  const [showPhaseDetails, setShowPhaseDetails] = useState(false);

  const isCustom = profileId === 'custom';
  const isAuto = profileId === 'auto';

  // Use provided phase configs or defaults
  const currentPhaseModels = phaseModels || DEFAULT_PHASE_MODELS;
  const currentPhaseThinking = phaseThinking || DEFAULT_PHASE_THINKING;

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
        label: 'Custom Configuration',
        description: 'Choose model & thinking level'
      };
    }
    const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === profileId);
    if (profile) {
      return {
        icon: iconMap[profile.icon || 'Scale'] || Scale,
        label: profile.name,
        description: profile.description
      };
    }
    // Default to balanced
    return {
      icon: Scale,
      label: 'Balanced',
      description: 'Good balance of speed and quality'
    };
  };

  const display = getProfileDisplay();

  return (
    <div className="space-y-4">
      {/* Agent Profile Selection */}
      <div className="space-y-2">
        <Label htmlFor="agent-profile" className="text-sm font-medium text-foreground">
          Agent Profile
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
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_AGENT_PROFILES.map((profile) => {
              const ProfileIcon = iconMap[profile.icon || 'Scale'] || Scale;
              const modelLabel = AVAILABLE_MODELS.find(m => m.value === profile.model)?.label;
              return (
                <SelectItem key={profile.id} value={profile.id}>
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
            <SelectItem value="custom">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 shrink-0" />
                <div>
                  <span className="font-medium">Custom</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Choose model & thinking level)
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
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          {/* Phase Summary */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowPhaseDetails(!showPhaseDetails)}
              className={cn(
                'flex w-full items-center justify-between text-sm',
                'text-muted-foreground hover:text-foreground transition-colors'
              )}
              disabled={disabled}
            >
              <span className="font-medium text-foreground">Phase Configuration</span>
              {showPhaseDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {/* Compact summary when collapsed */}
            {!showPhaseDetails && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(Object.keys(PHASE_LABELS) as Array<keyof PhaseModelConfig>).map((phase) => {
                  const modelLabel = AVAILABLE_MODELS.find(m => m.value === currentPhaseModels[phase])?.label?.replace('Claude ', '') || currentPhaseModels[phase];
                  return (
                    <div key={phase} className="flex items-center justify-between rounded bg-background/50 px-2 py-1">
                      <span className="text-muted-foreground">{PHASE_LABELS[phase].label}:</span>
                      <span className="font-medium">{modelLabel}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detailed Phase Configuration */}
          {showPhaseDetails && (
            <div className="space-y-4 pt-2">
              {(Object.keys(PHASE_LABELS) as Array<keyof PhaseModelConfig>).map((phase) => (
                <div key={phase} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {PHASE_LABELS[phase].label}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {PHASE_LABELS[phase].description}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={currentPhaseModels[phase]}
                      onValueChange={(value) => handlePhaseModelChange(phase, value as ModelType)}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              Model
            </Label>
            <Select
              value={model}
              onValueChange={(value) => onModelChange(value as ModelType)}
              disabled={disabled}
            >
              <SelectTrigger id="custom-model" className="h-9">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Thinking Level Selection */}
          <div className="space-y-2">
            <Label htmlFor="custom-thinking" className="text-xs font-medium text-muted-foreground">
              Thinking Level
            </Label>
            <Select
              value={thinkingLevel}
              onValueChange={(value) => onThinkingLevelChange(value as ThinkingLevel)}
              disabled={disabled}
            >
              <SelectTrigger id="custom-thinking" className="h-9">
                <SelectValue placeholder="Select thinking level" />
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
    </div>
  );
}
