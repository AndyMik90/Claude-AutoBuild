import { useState } from 'react';
import { Brain, Scale, Zap, Check, Sparkles, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DEFAULT_AGENT_PROFILES,
  AVAILABLE_MODELS,
  THINKING_LEVELS,
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING
} from '../../../shared/constants';
import { useSettingsStore, saveSettings } from '../../stores/settings-store';
import { SettingsSection } from './SettingsSection';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import type { AgentProfile, PhaseModelConfig, PhaseThinkingConfig, ModelTypeShort, ThinkingLevel } from '../../../shared/types/settings';

/**
 * Icon mapping for agent profile icons
 */
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

/**
 * Agent Profile Settings component
 * Displays preset agent profiles for quick model/thinking level configuration
 * Used in the Settings page under Agent Settings
 */
export function AgentProfileSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const selectedProfileId = settings.selectedAgentProfile || 'auto';
  const [showPhaseConfig, setShowPhaseConfig] = useState(selectedProfileId === 'auto');

  // Get current phase config from settings or defaults
  const currentPhaseModels: PhaseModelConfig = settings.customPhaseModels || DEFAULT_PHASE_MODELS;
  const currentPhaseThinking: PhaseThinkingConfig = settings.customPhaseThinking || DEFAULT_PHASE_THINKING;

  const handleSelectProfile = async (profileId: string) => {
    const success = await saveSettings({ selectedAgentProfile: profileId });
    if (!success) {
      // Log error for debugging - in future could show user toast notification
      console.error('Failed to save agent profile selection');
      return;
    }
    // Auto-expand phase config when Auto profile is selected
    if (profileId === 'auto') {
      setShowPhaseConfig(true);
    }
  };

  const handlePhaseModelChange = async (phase: keyof PhaseModelConfig, value: ModelTypeShort) => {
    const newPhaseModels = { ...currentPhaseModels, [phase]: value };
    await saveSettings({ customPhaseModels: newPhaseModels });
  };

  const handlePhaseThinkingChange = async (phase: keyof PhaseThinkingConfig, value: ThinkingLevel) => {
    const newPhaseThinking = { ...currentPhaseThinking, [phase]: value };
    await saveSettings({ customPhaseThinking: newPhaseThinking });
  };

  const handleResetToDefaults = async () => {
    await saveSettings({
      customPhaseModels: DEFAULT_PHASE_MODELS,
      customPhaseThinking: DEFAULT_PHASE_THINKING
    });
  };

  /**
   * Get human-readable model label
   */
  const getModelLabel = (modelValue: string): string => {
    const model = AVAILABLE_MODELS.find((m) => m.value === modelValue);
    return model?.label || modelValue;
  };

  /**
   * Get human-readable thinking level label
   */
  const getThinkingLabel = (thinkingValue: string): string => {
    const level = THINKING_LEVELS.find((l) => l.value === thinkingValue);
    return level?.label || thinkingValue;
  };

  /**
   * Check if current phase config differs from defaults
   */
  const hasCustomConfig = (): boolean => {
    const phases: Array<keyof PhaseModelConfig> = ['spec', 'planning', 'coding', 'qa'];
    return phases.some(
      phase =>
        currentPhaseModels[phase] !== DEFAULT_PHASE_MODELS[phase] ||
        currentPhaseThinking[phase] !== DEFAULT_PHASE_THINKING[phase]
    );
  };

  /**
   * Render a single profile card
   */
  const renderProfileCard = (profile: AgentProfile) => {
    const isSelected = selectedProfileId === profile.id;
    const Icon = iconMap[profile.icon || 'Brain'] || Brain;

    return (
      <button
        key={profile.id}
        onClick={() => handleSelectProfile(profile.id)}
        className={cn(
          'relative w-full rounded-lg border p-4 text-left transition-all duration-200',
          'hover:border-primary/50 hover:shadow-sm',
          isSelected
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card'
        )}
      >
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}

        {/* Profile content */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
              isSelected ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-medium text-sm text-foreground">{profile.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {profile.description}
            </p>

            {/* Model and thinking level badges */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getModelLabel(profile.model)}
              </span>
              <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getThinkingLabel(profile.thinkingLevel)} Thinking
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <SettingsSection
      title="Default Agent Profile"
      description="Select a preset configuration for model and thinking level"
    >
      <div className="space-y-4">
        {/* Description */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            Agent profiles provide preset configurations for Claude model and thinking level.
            When you create a new task, these settings will be used as defaults. You can always
            override them in the task creation wizard.
          </p>
        </div>

        {/* Profile cards - 2 column grid on larger screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {DEFAULT_AGENT_PROFILES.map(renderProfileCard)}
        </div>

        {/* Phase Configuration (only for Auto profile) */}
        {selectedProfileId === 'auto' && (
          <div className="mt-6 rounded-lg border border-border bg-card">
            {/* Header - Collapsible */}
            <button
              type="button"
              onClick={() => setShowPhaseConfig(!showPhaseConfig)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            >
              <div>
                <h4 className="font-medium text-sm text-foreground">Phase Configuration</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customize model and thinking level for each phase
                </p>
              </div>
              {showPhaseConfig ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Phase Configuration Content */}
            {showPhaseConfig && (
              <div className="border-t border-border p-4 space-y-4">
                {/* Reset button */}
                {hasCustomConfig() && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetToDefaults}
                      className="text-xs h-7"
                    >
                      <RotateCcw className="h-3 w-3 mr-1.5" />
                      Reset to defaults
                    </Button>
                  </div>
                )}

                {/* Phase Configuration Grid */}
                <div className="space-y-4">
                  {(Object.keys(PHASE_LABELS) as Array<keyof PhaseModelConfig>).map((phase) => (
                    <div key={phase} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-foreground">
                          {PHASE_LABELS[phase].label}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {PHASE_LABELS[phase].description}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Model Select */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Model</Label>
                          <Select
                            value={currentPhaseModels[phase]}
                            onValueChange={(value) => handlePhaseModelChange(phase, value as ModelTypeShort)}
                          >
                            <SelectTrigger className="h-9">
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
                        </div>
                        {/* Thinking Level Select */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Thinking Level</Label>
                          <Select
                            value={currentPhaseThinking[phase]}
                            onValueChange={(value) => handlePhaseThinkingChange(phase, value as ThinkingLevel)}
                          >
                            <SelectTrigger className="h-9">
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

                {/* Info note */}
                <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border">
                  These settings will be used as defaults when creating new tasks with the Auto profile.
                  You can override them per-task in the task creation wizard.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </SettingsSection>
  );
}
