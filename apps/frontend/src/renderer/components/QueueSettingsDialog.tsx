/**
 * QueueSettingsDialog - Dialog for configuring task queue settings
 *
 * Allows users to enable/disable automatic task queueing and configure
 * the maximum number of concurrent tasks.
 *
 * Features:
 * - Toggle switch to enable/disable queue
 * - Preset buttons for max concurrent tasks (1-3)
 * - Live status display (running / max)
 * - Saves settings via IPC to project config
 *
 * Uses shared components:
 * - Dialog components from ui/dialog
 * - Switch from ui/switch
 * - Button from ui/button
 * - Label from ui/label
 *
 * @example
 * ```tsx
 * <QueueSettingsDialog
 *   projectId={project.id}
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   currentConfig={{ enabled: true, maxConcurrent: 2 }}
 *   runningCount={1}
 *   onSaved={() => console.log('Settings saved')}
 * />
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, List, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { saveQueueConfig } from '../stores/queue-store';
import type { QueueConfig } from '../../shared/types';
import { QUEUE_MIN_CONCURRENT, QUEUE_MAX_CONCURRENT } from '../../shared/constants/task';
import { cn } from '../lib/utils';

interface QueueSettingsDialogProps {
  /** Project ID for the queue settings */
  projectId: string;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Current queue configuration */
  currentConfig: QueueConfig;
  /** Current number of running tasks (for status display) */
  runningCount: number;
  /** Optional callback when settings are saved */
  onSaved?: () => void;
}

/** Preset values for max concurrent tasks - derived from min/max constants */
const CONCURRENT_PRESETS = [
  QUEUE_MIN_CONCURRENT,
  QUEUE_MIN_CONCURRENT + 1,
  QUEUE_MAX_CONCURRENT,
] as const;

/** Derived union type of valid max concurrent values */
type MaxConcurrentValue = typeof CONCURRENT_PRESETS[number];

export function QueueSettingsDialog({
  projectId,
  open,
  onOpenChange,
  currentConfig,
  runningCount,
  onSaved,
}: QueueSettingsDialogProps) {
  const { t } = useTranslation(['tasks', 'common']);

  // Local state for form (synced with currentConfig when dialog opens)
  const [enabled, setEnabled] = useState(currentConfig.enabled);
  const [maxConcurrent, setMaxConcurrent] = useState(currentConfig.maxConcurrent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track previous open state to only reset when dialog transitions from closed to open
  const prevOpenRef = useRef(false);

  // Reset form only when dialog transitions from closed to open
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setEnabled(currentConfig.enabled);
      setMaxConcurrent(currentConfig.maxConcurrent);
      setSaveError(null);
    }
    prevOpenRef.current = open;
  }, [open, currentConfig.enabled, currentConfig.maxConcurrent]);

  const handleSave = async () => {
    const config: QueueConfig = { enabled, maxConcurrent };
    setIsSaving(true);
    setSaveError(null);

    try {
      const success = await saveQueueConfig(projectId, config);

      if (success) {
        onOpenChange(false);
        onSaved?.();
      } else {
        setSaveError(t('tasks:queue.settings.saveFailed'));
      }
    } catch (error) {
      setSaveError(t('tasks:queue.settings.saveFailed'));
      console.error('[QueueSettingsDialog] Unexpected error saving queue config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate if there would be issues with the new settings
  const wouldExceedLimit = enabled && runningCount > maxConcurrent;
  const isFormValid = maxConcurrent >= QUEUE_MIN_CONCURRENT && maxConcurrent <= QUEUE_MAX_CONCURRENT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <List className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle>{t('tasks:queue.settings.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('tasks:queue.settings.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error message */}
          {saveError && (
            <div role="alert" aria-live="assertive" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-xs text-destructive">{saveError}</p>
            </div>
          )}
          {/* Enable Queue Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-normal text-foreground">
                {t('tasks:queue.settings.enableQueue')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('tasks:queue.settings.enableQueueDescription')}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isSaving}
            />
          </div>

          {enabled && (
            <>
              {/* Status Badge */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                <span className="text-sm text-muted-foreground">
                  {t('tasks:queue.settings.currentStatus')}
                </span>
                <Badge
                  variant={wouldExceedLimit ? 'warning' : 'success'}
                  className="gap-1"
                >
                  {runningCount} / {maxConcurrent}
                  {wouldExceedLimit && (
                    <span className="ml-1">
                      ({t('tasks:queue.settings.exceedsLimit')})
                    </span>
                  )}
                </Badge>
              </div>

              {/* Max Concurrent Preset Buttons */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground">
                    {t('tasks:queue.settings.maxConcurrent')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-muted-foreground">
                      {maxConcurrent}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('tasks:queue.settings.maxConcurrentDescription')}
                </p>

                {/* Preset buttons for max concurrent tasks */}
                <div className="space-y-3 pt-1">
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${CONCURRENT_PRESETS.length}, minmax(0, 1fr))` }}>
                    {CONCURRENT_PRESETS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMaxConcurrent(value as QueueConfig['maxConcurrent'])}
                        className={cn(
                          'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          maxConcurrent === value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        )}
                        disabled={isSaving}
                      >
                        <span className="text-lg font-semibold">{value}</span>
                        <span className="text-xs text-muted-foreground">
                          {value === 1
                            ? t('tasks:queue.settings.single')
                            : t('tasks:queue.settings.multiple')}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Min/max labels for presets */}
                  <div className="flex justify-between text-xs text-muted-foreground px-2">
                    <span>{QUEUE_MIN_CONCURRENT}</span>
                    <span>{QUEUE_MAX_CONCURRENT}</span>
                  </div>
                </div>
              </div>

              {/* Warning if current running exceeds new max */}
              {wouldExceedLimit && (
                <div role="alert" aria-live="polite" className="rounded-md bg-warning/10 border border-warning/20 p-3">
                  <p className="text-xs text-warning">
                    {t('tasks:queue.settings.exceedsWarning', {
                      running: runningCount,
                      max: maxConcurrent,
                    })}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Info box when disabled */}
          {!enabled && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                {t('tasks:queue.settings.disabledInfo')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !isFormValid}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common:buttons.saving')}
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                {t('tasks:queue.settings.save')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
