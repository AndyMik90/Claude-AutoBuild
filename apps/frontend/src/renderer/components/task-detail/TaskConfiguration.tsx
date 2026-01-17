/**
 * TaskConfiguration - Per-task configuration for model and thinking levels
 *
 * Allows users to override the default agent profile settings on a per-task basis.
 * Changes are saved to the task's task_metadata.json file.
 *
 * For running tasks, changes are pending until applied and take effect on next phase.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, RotateCcw, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import debounce from 'lodash/debounce';
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

// Debounce delay for auto-save (ms)
const AUTO_SAVE_DEBOUNCE_MS = 500;

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
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [savedPhaseModels, setSavedPhaseModels] = useState<PhaseModelConfig>(DEFAULT_PHASE_MODELS);
  const [savedPhaseThinking, setSavedPhaseThinking] = useState<PhaseThinkingConfig>(DEFAULT_PHASE_THINKING);
  const [pendingPhaseModels, setPendingPhaseModels] = useState<PhaseModelConfig>(DEFAULT_PHASE_MODELS);
  const [pendingPhaseThinking, setPendingPhaseThinking] = useState<PhaseThinkingConfig>(DEFAULT_PHASE_THINKING);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Refs to track latest state for debounced saves
  const latestPendingModels = useRef<PhaseModelConfig>(pendingPhaseModels);
  const latestPendingThinking = useRef<PhaseThinkingConfig>(pendingPhaseThinking);
  const latestMetadata = useRef<Record<string, unknown> | null>(metadata);

  // Keep refs in sync
  useEffect(() => {
    latestPendingModels.current = pendingPhaseModels;
    latestPendingThinking.current = pendingPhaseThinking;
    latestMetadata.current = metadata;
  }, [pendingPhaseModels, pendingPhaseThinking, metadata]);

  const isTaskRunning = task.status === 'in_progress' || task.status === 'planning';

  // Helper function to get phase label using i18n
  const getPhaseLabel = useCallback((phase: keyof PhaseModelConfig): string => {
    return t(`tasks:configuration.phases.${phase}`);
  }, [t]);

  // Determine current phase from task
  const getCurrentPhase = (): keyof PhaseModelConfig | null => {
    if (task.status === 'planning' || task.planStatus === 'in_progress') {
      return 'planning';
    }
    if (task.status === 'in_progress') {
      // Check if we're in coding or qa based on subtasks
      const hasCompletedSubtasks = task.subtasks?.some(s => s.status === 'completed');
      const allSubtasksComplete = task.subtasks?.every(s => s.status === 'completed');
      if (allSubtasksComplete && task.qaStatus) {
        return 'qa';
      }
      if (hasCompletedSubtasks) {
        return 'coding';
      }
      return 'coding';
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

  // Core save function with null guard for metadata
  const saveChangesCore = useCallback(async (models: PhaseModelConfig, thinking: PhaseThinkingConfig) => {
    setIsSaving(true);
    try {
      // Use latest metadata from ref to prevent stale state issues
      const currentMetadata = latestMetadata.current ?? {};
      const updatedMetadata = {
        ...currentMetadata,
        phaseModels: models,
        phaseThinking: thinking,
        isAutoProfile: true // Mark as using phase-specific config
      };
      await window.electronAPI.updateTaskMetadata(task.id, updatedMetadata);
      setSavedPhaseModels(models);
      setSavedPhaseThinking(thinking);
      setMetadata(updatedMetadata);
    } catch (error) {
      console.error('Failed to save task metadata:', error);
    } finally {
      setIsSaving(false);
    }
  }, [task.id]);

  // Debounced auto-save function that uses latest state from refs
  const debouncedAutoSave = useMemo(
    () =>
      debounce(() => {
        saveChangesCore(latestPendingModels.current, latestPendingThinking.current);
      }, AUTO_SAVE_DEBOUNCE_MS),
    [saveChangesCore]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedAutoSave.cancel();
    };
  }, [debouncedAutoSave]);

  const handlePhaseModelChange = useCallback((phase: keyof PhaseModelConfig, value: ModelTypeShort) => {
    setPendingPhaseModels(prev => ({ ...prev, [phase]: value }));

    // If task is not running, trigger debounced auto-save
    if (!isTaskRunning) {
      debouncedAutoSave();
    }
  }, [isTaskRunning, debouncedAutoSave]);

  const handlePhaseThinkingChange = useCallback((phase: keyof PhaseThinkingConfig, value: ThinkingLevel) => {
    setPendingPhaseThinking(prev => ({ ...prev, [phase]: value }));

    // If task is not running, trigger debounced auto-save
    if (!isTaskRunning) {
      debouncedAutoSave();
    }
  }, [isTaskRunning, debouncedAutoSave]);

  const handleApplyChanges = useCallback(async () => {
    // Cancel any pending debounced save
    debouncedAutoSave.cancel();
    await saveChangesCore(pendingPhaseModels, pendingPhaseThinking);
  }, [debouncedAutoSave, saveChangesCore, pendingPhaseModels, pendingPhaseThinking]);

  const handleCancelChanges = useCallback(() => {
    // Cancel any pending debounced save
    debouncedAutoSave.cancel();
    setPendingPhaseModels(savedPhaseModels);
    setPendingPhaseThinking(savedPhaseThinking);
  }, [debouncedAutoSave, savedPhaseModels, savedPhaseThinking]);

  const handleResetToDefaults = useCallback(async () => {
    const resetModels = DEFAULT_PHASE_MODELS;
    const resetThinking = DEFAULT_PHASE_THINKING;

    // Cancel any pending debounced save
    debouncedAutoSave.cancel();

    setPendingPhaseModels(resetModels);
    setPendingPhaseThinking(resetThinking);

    if (!isTaskRunning) {
      setIsSaving(true);
      try {
        // Guard against null metadata
        const currentMetadata = metadata ?? {};
        // Reset to profile defaults by removing custom phase config
        const resetMetadata = { ...currentMetadata };
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
  }, [debouncedAutoSave, isTaskRunning, metadata, task.id]);

  const getProfileInfo = useCallback(() => {
    if (metadata?.isAutoProfile && (metadata?.phaseThinking || metadata?.phaseModels)) {
      return {
        name: t('tasks:configuration.customProfile'),
        description: t('tasks:configuration.customProfileDescription')
      };
    }
    const matchingProfile = DEFAULT_AGENT_PROFILES.find(p =>
      PHASE_KEYS.every(phase =>
        p.phaseThinking?.[phase] === savedPhaseThinking[phase] &&
        p.phaseModels?.[phase] === savedPhaseModels[phase]
      )
    );
    return matchingProfile
      ? { name: matchingProfile.name, description: matchingProfile.description }
      : {
          name: t('tasks:configuration.defaultProfile'),
          description: t('tasks:configuration.defaultProfileDescription')
        };
  }, [metadata, savedPhaseModels, savedPhaseThinking, t]);

  const getThinkingLabel = useCallback((level: string): string => {
    const thinking = THINKING_LEVELS.find(t => t.value === level);
    return thinking?.label || level;
  }, []);

  const getThinkingTokens = useCallback((level: string): string => {
    const tokens = THINKING_BUDGET_MAP[level];
    if (tokens === null) return t('tasks:configuration.tokens', { count: 0 });
    if (tokens >= 1024) return t('tasks:configuration.tokensK', { count: (tokens / 1024).toFixed(0) });
    return t('tasks:configuration.tokens', { count: tokens });
  }, [t]);

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
            <h3 className="text-lg font-semibold">{t('tasks:configuration.title')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {isTaskRunning
              ? t('tasks:configuration.descriptionRunning')
              : t('tasks:configuration.descriptionNotRunning')}
          </p>
        </div>

        {/* Running Task Warning */}
        {isTaskRunning && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  {t('tasks:configuration.taskRunningWarning', { phase: currentPhase ? getPhaseLabel(currentPhase) : '' })}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {nextPhase
                    ? t('tasks:configuration.changesApplyFrom', { phase: getPhaseLabel(nextPhase) })
                    : t('tasks:configuration.currentPhaseComplete')}
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
                  {t('tasks:configuration.pendingChanges')}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {t('tasks:configuration.pendingChangesHint')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Profile Info */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('tasks:configuration.profile', { name: profileInfo.name })}</p>
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
              {t('tasks:configuration.resetToDefaults')}
            </Button>
          </div>
        </div>

        {/* Phase Configuration */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">{t('tasks:configuration.phaseConfiguration')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('tasks:configuration.phaseConfigurationHint')}
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
                          {t('tasks:configuration.phaseLabel', { phase: getPhaseLabel(phase) })}
                        </Label>
                        {isCurrentPhase && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                            {t('tasks:configuration.currentPhase')}
                          </span>
                        )}
                        {!isCurrentPhase && willReceiveChanges && hasPendingChanges && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                            {t('tasks:configuration.willApplyChanges')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('tasks:configuration.model')}</Label>
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
                      <Label className="text-xs text-muted-foreground">{t('tasks:configuration.thinkingLevel')}</Label>
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
                        <span>{t('tasks:configuration.thinkingLabels.none')}</span>
                        <span>{t('tasks:configuration.thinkingLabels.low')}</span>
                        <span>{t('tasks:configuration.thinkingLabels.medium')}</span>
                        <span>{t('tasks:configuration.thinkingLabels.high')}</span>
                        <span>{t('tasks:configuration.thinkingLabels.ultra')}</span>
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
                  {t('common:buttons.saving')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('tasks:configuration.applyChanges')}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancelChanges}
              disabled={isSaving}
            >
              {t('tasks:configuration.cancel')}
            </Button>
          </div>
        )}

        {/* Save indicator for non-running tasks */}
        {!isTaskRunning && isSaving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('common:buttons.saving')}</span>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
