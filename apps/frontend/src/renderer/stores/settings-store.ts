import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSettings: (settings: AppSettings) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_APP_SETTINGS as AppSettings,
  isLoading: true,  // Start as true since we load settings on app init
  error: null,

  setSettings: (settings) => set({ settings }),

  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates }
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error })
}));

/**
 * Check if settings need migration for onboardingCompleted flag.
 * Existing users (with tokens or projects configured) should have
 * onboardingCompleted set to true to skip the onboarding wizard.
 */
function migrateOnboardingCompleted(settings: AppSettings): AppSettings {
  // Only migrate if onboardingCompleted is undefined (not explicitly set)
  if (settings.onboardingCompleted !== undefined) {
    return settings;
  }

  // Check for signs of an existing user:
  // - Has a Claude OAuth token configured
  // - Has the auto-build source path configured
  const hasOAuthToken = Boolean(settings.globalClaudeOAuthToken);
  const hasAutoBuildPath = Boolean(settings.autoBuildPath);

  const isExistingUser = hasOAuthToken || hasAutoBuildPath;

  if (isExistingUser) {
    // Mark onboarding as completed for existing users
    return { ...settings, onboardingCompleted: true };
  }

  // New user - set to false to trigger onboarding wizard
  return { ...settings, onboardingCompleted: false };
}

/**
 * Auto-detect Unity paths on first run
 */
async function autoDetectUnityPaths(settings: AppSettings): Promise<Partial<AppSettings>> {
  const updates: Partial<AppSettings> = {};

  // Auto-detect Unity Hub path if not set
  if (!settings.unityHubPath) {
    try {
      const hubResult = await window.electronAPI.autoDetectUnityHub();
      if (hubResult.success && hubResult.data?.path) {
        updates.unityHubPath = hubResult.data.path;
      }
    } catch (error) {
      console.error('Failed to auto-detect Unity Hub:', error);
    }
  }

  // Auto-detect Unity Editors folder if not set
  if (!settings.unityEditorsFolder) {
    try {
      const folderResult = await window.electronAPI.autoDetectUnityEditorsFolder();
      if (folderResult.success && folderResult.data?.path) {
        updates.unityEditorsFolder = folderResult.data.path;
      }
    } catch (error) {
      console.error('Failed to auto-detect Unity Editors folder:', error);
    }
  }

  return updates;
}

/**
 * Load settings from main process
 */
export async function loadSettings(): Promise<void> {
  const store = useSettingsStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.getSettings();
    if (result.success && result.data) {
      // Apply migration for onboardingCompleted flag
      let migratedSettings = migrateOnboardingCompleted(result.data);

      // Auto-detect Unity paths if not already set (first run only)
      const unityUpdates = await autoDetectUnityPaths(migratedSettings);
      if (Object.keys(unityUpdates).length > 0) {
        migratedSettings = { ...migratedSettings, ...unityUpdates };
        // Persist auto-detected paths
        await window.electronAPI.saveSettings(unityUpdates);
      }

      store.setSettings(migratedSettings);

      // If migration changed the settings, persist them
      if (migratedSettings.onboardingCompleted !== result.data.onboardingCompleted) {
        await window.electronAPI.saveSettings({
          onboardingCompleted: migratedSettings.onboardingCompleted
        });
      }
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load settings');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Save settings to main process
 */
export async function saveSettings(updates: Partial<AppSettings>): Promise<boolean> {
  const store = useSettingsStore.getState();

  try {
    const result = await window.electronAPI.saveSettings(updates);
    if (result.success) {
      store.updateSettings(updates);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
