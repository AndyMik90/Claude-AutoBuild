/**
 * TaskConfiguration - Per-task configuration for model and thinking levels
 *
 * Allows users to override the default agent profile settings on a per-task basis.
 * Changes are saved to the task's task_metadata.json file.
 *
 * For running tasks, changes are pending until applied and take effect on next phase.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, RotateCcw, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
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
  DEFAULT_PHASE_THINKING,
  AVAILABLE_MODELS
} from '../../../shared/constants';
import type { Task } from '../../../shared/types';
import type { PhaseModelConfig, PhaseThinkingConfig, ThinkingLevel, ModelTypeShort } from '../../../shared/types/settings';

interface TaskConfigurationProps {
  task: Task;
}

const PHASE_KEYS: Array<keyof PhaseModelConfig> = ['spec', 'planning', 'coding', 'qa'];

const PHASE_LABELS: Record<keyof PhaseModelConfig, string> = {
  spec: 'Spec',
  planning: 'Planning',
  coding: 'Coding',
  qa: 'QA'
};

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
  const [savedPhaseModels, setSavedPhaseModels] = useState<PhaseModelConfig>(DEFAULT_PHASE_MODELS);
  const [savedPhaseThinking, setSavedPhaseThinking] = useState<PhaseThinkingConfig>(DEFAULT_PHASE_THINKING);
  const [pendingPhaseModels, setPendingPhaseModels] = useState<PhaseModelConfig>(DEFAULT_PHASE_MODELS);
  const [pendingPhaseThinking, setPendingPhaseThinking] = useState<PhaseThinkingConfig>(DEFAULT_PHASE_THINKING);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const isTaskRunning = task.status === 'in_progress';

  const getCurrentPhase = (): keyof PhaseModelConfig | null => {
    if (task.status === 'in_progress' && task.executionProgress) {
      const phase = task.executionProgress.phase;
      if (phase === 'planning') return 'planning';
      if (phase === 'coding') return 'coding';
      if (phase === 'qa_review' || phase === 'qa_fixing') return 'qa';
    }
    return null;
  };

  const currentPhase = getCurrentPhase();

  // Get next phase that will receive changes
  const getNextPhase = (): keyof PhaseModelConfig | null => {
    if (!currentPhase) return null;
    const currentIndex = PHASE_KEYS.indexOf(currentPhase);
    if (currentIndex < PHASE_KEYS.length - 1) {
      return PHASE_KEYS[currentIndex + 1];
    }
    return null;
  };

  const nextPhase = getNextPhase();

  // Load task metadata
  useEffect(() => {
    loadMetadata();
  }, [task.id]);

  // Check for pending changes
  useEffect(() => {
    const hasModelChanges = PHASE_KEYS.some(
      phase => pendingPhaseModels[phase] !== savedPhaseModels[phase]
    );
    const hasThinkingChanges = PHASE_KEYS.some(
      phase => pendingPhaseThinking[phase] !== savedPhaseThinking[phase]
    );
    setHasPendingChanges(hasModelChanges || hasThinkingChanges);
  }, [pendingPhaseModels, pendingPhaseThinking, savedPhaseModels, savedPhaseThinking]);

  const loadMetadata = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getTaskMetadata(task.id);
      if (result.success && result.data) {
        setMetadata(result.data);
        // Load phase configs if they exist, otherwise use defaults
        const models = result.data.phaseModels || DEFAULT_PHASE_MODELS;
        const thinking = result.data.phaseThinking || DEFAULT_PHASE_THINKING;

        setSavedPhaseModels(models);
        setSavedPhaseThinking(thinking);
        setPendingPhaseModels(models);
        setPendingPhaseThinking(thinking);
      }
    } catch (error) {
      console.error('Failed to load task metadata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhaseModelChange = (phase: keyof PhaseModelConfig, value: ModelTypeShort) => {
    const newPhaseModels = { ...pendingPhaseModels, [phase]: value };
    setPendingPhaseModels(newPhaseModels);

    // If task is not running, auto-save
    if (!isTaskRunning) {
      saveChanges(newPhaseModels, pendingPhaseThinking);
    }
  };

  const handlePhaseThinkingChange = (phase: keyof PhaseThinkingConfig, value: ThinkingLevel) => {
    const newPhaseThinking = { ...pendingPhaseThinking, [phase]: value };
    setPendingPhaseThinking(newPhaseThinking);

    // If task is not running, auto-save
    if (!isTaskRunning) {
      saveChanges(pendingPhaseModels, newPhaseThinking);
    }
  };

  const saveChanges = async (models: PhaseModelConfig, thinking: PhaseThinkingConfig) => {
    setIsSaving(true);
    try {
      await window.electronAPI.updateTaskMetadata(task.id, {
        ...metadata,
        phaseModels: models,
        phaseThinking: thinking,
        isAutoProfile: true // Mark as using phase-specific config
      });
      setSavedPhaseModels(models);
      setSavedPhaseThinking(thinking);
      setMetadata({ ...metadata, phaseModels: models, phaseThinking: thinking, isAutoProfile: true });
    } catch (error) {
      console.error('Failed to save task metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyChanges = async () => {
    await saveChanges(pendingPhaseModels, pendingPhaseThinking);
  };

  const handleCancelChanges = () => {
    setPendingPhaseModels(savedPhaseModels);
    setPendingPhaseThinking(savedPhaseThinking);
  };

  const handleResetToDefaults = async () => {
    const resetModels = DEFAULT_PHASE_MODELS;
    const resetThinking = DEFAULT_PHASE_THINKING;

    setPendingPhaseModels(resetModels);
    setPendingPhaseThinking(resetThinking);

    if (!isTaskRunning) {
      setIsSaving(true);
      try {
        // Reset to profile defaults by removing custom phase config
        const resetMetadata = { ...metadata };
        delete resetMetadata.phaseThinking;
        delete resetMetadata.phaseModels;
        delete resetMetadata.isAutoProfile;

        await window.electronAPI.updateTaskMetadata(task.id, resetMetadata);
        setSavedPhaseModels(resetModels);
        setSavedPhaseThinking(resetThinking);
        setMetadata(resetMetadata);
      } catch (error) {
        console.error('Failed to reset task metadata:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const getProfileInfo = () => {
    if (metadata?.isAutoProfile && (metadata?.phaseThinking || metadata?.phaseModels)) {
      return { name: 'Custom', description: 'Per-phase configuration' };
    }
    const matchingProfile = DEFAULT_AGENT_PROFILES.find(p =>
      PHASE_KEYS.every(phase =>
        p.phaseThinking?.[phase] === savedPhaseThinking[phase] &&
        p.phaseModels?.[phase] === savedPhaseModels[phase]
      )
    );
    return matchingProfile
      ? { name: matchingProfile.name, description: matchingProfile.description }
      : { name: 'Default', description: 'Using system defaults' };
  };

  const getModelLabel = (model: string): string => {
    const modelInfo = AVAILABLE_MODELS.find(m => m.value === model);
    return modelInfo?.label || model;
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
            {isTaskRunning
              ? 'Configure model and thinking levels per phase. Changes will apply to upcoming phases.'
              : 'Configure model and thinking levels per phase. Changes are saved automatically.'}
          </p>
        </div>

        {/* Running Task Warning */}
        {isTaskRunning && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Task is Running ({currentPhase && PHASE_LABELS[currentPhase]} phase)
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {nextPhase
                    ? `Changes will apply starting from the ${PHASE_LABELS[nextPhase]} phase`
                    : 'Current phase will complete with original settings'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Changes Indicator */}
        {hasPendingChanges && isTaskRunning && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Pending Changes
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Click "Apply Changes" to save. Changes will take effect on the next phase.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Profile Info */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Profile: {profileInfo.name}</p>
              <p className="text-xs text-muted-foreground">{profileInfo.description}</p>
            </div>
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
          </div>
        </div>

        {/* Phase Configuration */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Phase Configuration</h4>
            <p className="text-xs text-muted-foreground">
              Adjust model and thinking effort for each phase. Higher thinking levels use more tokens but provide deeper analysis.
            </p>
          </div>

          {/* Phase Controls */}
          <div className="space-y-6">
            {PHASE_KEYS.map((phase) => {
              const currentModel = pendingPhaseModels[phase];
              const currentLevel = pendingPhaseThinking[phase];
              const currentIndex = THINKING_LEVEL_TO_INDEX[currentLevel] || 0;
              const isCurrentPhase = currentPhase === phase;
              const willReceiveChanges = nextPhase && PHASE_KEYS.indexOf(phase) >= PHASE_KEYS.indexOf(nextPhase);

              return (
                <div
                  key={phase}
                  className={cn(
                    'space-y-3 p-4 rounded-lg border',
                    isCurrentPhase && 'border-primary bg-primary/5',
                    !isCurrentPhase && 'border-border'
                  )}
                >
                  {/* Phase Header */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium capitalize">
                          {PHASE_LABELS[phase]} Phase
                        </Label>
                        {isCurrentPhase && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                            Current
                          </span>
                        )}
                        {!isCurrentPhase && willReceiveChanges && hasPendingChanges && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                            Will apply changes
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    <Select
                      value={currentModel}
                      onValueChange={(value) => handlePhaseModelChange(phase, value as ModelTypeShort)}
                      disabled={isSaving}
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

                  {/* Thinking Level */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Thinking Level</Label>
                      <div className="text-right">
                        <p className="text-xs font-medium">{getThinkingLabel(currentLevel)}</p>
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
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons for Running Tasks */}
        {isTaskRunning && hasPendingChanges && (
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button
              onClick={handleApplyChanges}
              disabled={isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply Changes
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelChanges}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Save indicator for non-running tasks */}
        {!isTaskRunning && isSaving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Saving...</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
