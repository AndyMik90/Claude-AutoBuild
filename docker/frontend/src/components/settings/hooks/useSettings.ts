import { useState, useEffect } from 'react';
import { useSettingsStore, saveSettings as saveSettingsToStore, loadSettings as loadSettingsFromStore } from '../../../stores/settings-store';
import type { AppSettings } from '../../../../shared/types';

/**
 * Custom hook for managing application settings
 * Provides state management and save/load functionality
 */
export function useSettings() {
  const currentSettings = useSettingsStore((state) => state.settings);
  const [settings, setSettings] = useState<AppSettings>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with store
  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  // Load settings on mount
  useEffect(() => {
    loadSettingsFromStore();
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const success = await saveSettingsToStore(settings);
      if (success) {
        // Apply theme immediately
        applyTheme(settings.theme);
        return true;
      } else {
        setError('Failed to save settings');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return {
    settings,
    setSettings,
    updateSettings,
    isSaving,
    error,
    saveSettings,
    applyTheme
  };
}
