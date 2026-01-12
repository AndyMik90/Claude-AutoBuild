/**
 * TaskConfiguration - Per-task configuration for model and thinking levels
 *
 * Allows users to override the default agent profile settings on a per-task basis.
 * Changes are saved to the task's task_metadata.json file.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { ScrollArea } from '../ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { cn } from '../../lib/utils';
import {
  DEFAULT_AGENT_PROFILES,
  THINKING_LEVELS,
  THINKING_BUDGET_MAP,
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING
} from '../../../shared/constants';
import type { Task } from '../../../shared/types';
import type { PhaseModelConfig, PhaseThinkingConfig, ThinkingLevel } from '../../../shared/types/settings';

interface TaskConfigurationProps {
  task: Task;
}

const PHASE_KEYS: Array<keyof PhaseModelConfig> = ['spec', 'planning', 'coding', 'qa'];

// Map thinking level to slider position (0-4)
const THINKING_LEVEL_TO_INDEX: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  ultrathink: 4
};

// Map slider position to thinking level
const INDEX_TO_THINKING_LEVEL: Record<number, ThinkingLevel> = {
  0: 'none',
  1: 'low',
  2: 'medium',
  3: 'high',
  4: 'ultrathink'
};

export function TaskConfiguration({ task }: TaskConfigurationProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [phaseThinking, setPhaseThinking] = useState<PhaseThinkingConfig>(DEFAULT_PHASE_THINKING);
  const [hasChanges, setHasChanges] = useState(false);

  // Load task metadata
  useEffect(() => {
    loadMetadata();
  }, [task.id]);

  const loadMetadata = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getTaskMetadata(task.id);
      if (result.success && result.data) {
        setMetadata(result.data);
        // Load phase thinking config if it exists, otherwise use defaults
        if (result.data.phaseThinking) {
          setPhaseThinking(result.data.phaseThinking);
        } else {
          setPhaseThinking(DEFAULT_PHASE_THINKING);
        }
      }
    } catch (error) {
      console.error('Failed to load task metadata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhaseThinkingChange = async (phase: keyof PhaseThinkingConfig, value: ThinkingLevel) => {
    const newPhaseThinking = { ...phaseThinking, [phase]: value };
    setPhaseThinking(newPhaseThinking);
    setHasChanges(true);

    // Auto-save after a short delay
    setIsSaving(true);
    try {
      await window.electronAPI.updateTaskMetadata(task.id, {
        ...metadata,
        phaseThinking: newPhaseThinking,
        isAutoProfile: true // Mark as using phase-specific config
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save task metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    setIsSaving(true);
    try {
      // Reset to profile defaults by removing custom phase config
      const resetMetadata = { ...metadata };
      delete resetMetadata.phaseThinking;
      delete resetMetadata.phaseModels;
      delete resetMetadata.isAutoProfile;

      await window.electronAPI.updateTaskMetadata(task.id, resetMetadata);
      setPhaseThinking(DEFAULT_PHASE_THINKING);
      setMetadata(resetMetadata);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to reset task metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getProfileInfo = () => {
    if (metadata?.isAutoProfile && metadata?.phaseThinking) {
      return { name: 'Custom', description: 'Per-phase configuration' };
    }
    // Try to match with a default profile
    const matchingProfile = DEFAULT_AGENT_PROFILES.find(p =>
      PHASE_KEYS.every(phase =>
        p.phaseThinking?.[phase] === phaseThinking[phase]
      )
    );
    return matchingProfile
      ? { name: matchingProfile.name, description: matchingProfile.description }
      : { name: 'Default', description: 'Using system defaults' };
  };

  const getThinkingLabel = (level: string): string => {
    const thinking = THINKING_LEVELS.find(t => t.value === level);
    return thinking?.label || level;
  };

  const getThinkingTokens = (level: string): string => {
    const tokens = THINKING_BUDGET_MAP[level];
    if (tokens === null) return '0 tokens';
    if (tokens >= 1024) return `${(tokens / 1024).toFixed(0)}K tokens`;
    return `${tokens} tokens`;
  };

  const isUsingDefault = (phase: keyof PhaseThinkingConfig): boolean => {
    return phaseThinking[phase] === DEFAULT_PHASE_THINKING[phase];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profileInfo = getProfileInfo();

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Task Configuration</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Customize thinking levels for each phase of this task. Changes are saved automatically.
          </p>
        </div>

        {/* Current Profile Info */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Profile: {profileInfo.name}</p>
              <p className="text-xs text-muted-foreground">{profileInfo.description}</p>
            </div>
            {(metadata?.isAutoProfile || hasChanges) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetToDefaults}
                disabled={isSaving}
                className="text-xs h-8"
              >
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset to Defaults
              </Button>
            )}
          </div>
        </div>

        {/* Phase Configuration */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Phase Configuration</h4>
            <p className="text-xs text-muted-foreground">
              Adjust thinking effort for each phase. Higher levels use more tokens but provide deeper analysis.
            </p>
          </div>

          {/* Phase Controls */}
          <div className="space-y-6">
            {PHASE_KEYS.map((phase) => {
              const currentLevel = phaseThinking[phase];
              const currentIndex = THINKING_LEVEL_TO_INDEX[currentLevel] || 0;
              const isDefault = isUsingDefault(phase);

              return (
                <div key={phase} className="space-y-3">
                  {/* Phase Header */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium capitalize">
                        {phase} Phase
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {isDefault ? `Default: ${getThinkingLabel(currentLevel)}` : 'Custom'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{getThinkingLabel(currentLevel)}</p>
                      <p className="text-xs text-muted-foreground">{getThinkingTokens(currentLevel)}</p>
                    </div>
                  </div>

                  {/* Slider */}
                  <div className="space-y-2">
                    <Slider
                      value={[currentIndex]}
                      min={0}
                      max={4}
                      step={1}
                      onValueChange={(values) => {
                        const newLevel = INDEX_TO_THINKING_LEVEL[values[0]];
                        if (newLevel) {
                          handlePhaseThinkingChange(phase, newLevel);
                        }
                      }}
                      className="w-full"
                      disabled={isSaving}
                    />
                    {/* Labels */}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>None</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                      <span>Ultra</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground">
                    {THINKING_LEVELS.find(t => t.value === currentLevel)?.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save indicator */}
        {isSaving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Saving...</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
