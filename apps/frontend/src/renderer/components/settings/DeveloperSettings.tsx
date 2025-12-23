/**
 * Developer/Debug Settings Component
 * Tools for development and debugging
 */

import { useEffect } from 'react';
import { SettingsSection } from './SettingsSection';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import type { AppSettings } from '../../../shared/types';

interface DeveloperSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export function DeveloperSettings({ settings, onSettingsChange }: DeveloperSettingsProps) {
  const enableBackendLogging = settings.enableBackendLogging ?? false;

  // Sync with main process when setting changes
  useEffect(() => {
    window.electronAPI?.setBackendLogging?.(enableBackendLogging);
  }, [enableBackendLogging]);

  const handleBackendLoggingChange = (checked: boolean) => {
    onSettingsChange({
      ...settings,
      enableBackendLogging: checked
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Debug Tools"
        description="Development and debugging features"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="backend-logging">Enable Backend Logging</Label>
              <p className="text-sm text-muted-foreground">
                Show backend (main process) logs in DevTools console with [MAIN] prefix.
                Useful for debugging IPC calls and backend operations.
              </p>
            </div>
            <Switch
              id="backend-logging"
              checked={enableBackendLogging}
              onCheckedChange={handleBackendLoggingChange}
            />
          </div>

          {enableBackendLogging && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">How to view backend logs:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Open DevTools: <kbd className="rounded bg-background px-1.5 py-0.5 text-xs">View → Toggle Developer Tools</kbd></li>
                <li>Go to the Console tab</li>
                <li>Look for logs prefixed with <code className="rounded bg-background px-1.5 py-0.5">[MAIN]</code></li>
              </ol>
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
