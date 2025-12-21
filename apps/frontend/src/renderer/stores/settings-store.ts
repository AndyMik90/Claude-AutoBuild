import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import type { APIProfile, ProfileFormData } from '../../shared/types/profile';
import { DEFAULT_APP_SETTINGS } from '../../shared/constants';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // API Profile state
  profiles: APIProfile[];
  activeProfileId: string | null;
  profilesLoading: boolean;
  profilesError: string | null;

  // Actions
  setSettings: (settings: AppSettings) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Profile actions
  setProfiles: (profiles: APIProfile[], activeProfileId: string | null) => void;
  setProfilesLoading: (loading: boolean) => void;
  setProfilesError: (error: string | null) => void;
  saveProfile: (profile: ProfileFormData) => Promise<boolean>;
  updateProfile: (profile: APIProfile) => Promise<boolean>;
  deleteProfile: (profileId: string) => Promise<boolean>;
  setActiveProfile: (profileId: string) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_APP_SETTINGS as AppSettings,
  isLoading: true,  // Start as true since we load settings on app init
  error: null,

  // API Profile state
  profiles: [],
  activeProfileId: null,
  profilesLoading: false,
  profilesError: null,

  setSettings: (settings) => set({ settings }),

  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates }
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  // Profile actions
  setProfiles: (profiles, activeProfileId) => set({ profiles, activeProfileId }),

  setProfilesLoading: (profilesLoading) => set({ profilesLoading }),

  setProfilesError: (profilesError) => set({ profilesError }),

  saveProfile: async (profile: ProfileFormData): Promise<boolean> => {
    set({ profilesLoading: true, profilesError: null });
    try {
      const result = await window.electronAPI.saveAPIProfile(profile);
      if (result.success && result.data) {
        set((state) => ({
          profiles: [...state.profiles, result.data!],
          activeProfileId: result.data!.id,
          profilesLoading: false
        }));
        return true;
      }
      set({
        profilesError: result.error || 'Failed to save profile',
        profilesLoading: false
      });
      return false;
    } catch (error) {
      set({
        profilesError: error instanceof Error ? error.message : 'Failed to save profile',
        profilesLoading: false
      });
      return false;
    }
  },

  updateProfile: async (profile: APIProfile): Promise<boolean> => {
    set({ profilesLoading: true, profilesError: null });
    try {
      const result = await window.electronAPI.updateAPIProfile(profile);
      if (result.success && result.data) {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === result.data!.id ? result.data! : p
          ),
          profilesLoading: false
        }));
        return true;
      }
      set({
        profilesError: result.error || 'Failed to update profile',
        profilesLoading: false
      });
      return false;
    } catch (error) {
      set({
        profilesError: error instanceof Error ? error.message : 'Failed to update profile',
        profilesLoading: false
      });
      return false;
    }
  },

  deleteProfile: async (profileId: string): Promise<boolean> => {
    set({ profilesLoading: true, profilesError: null });
    try {
      const result = await window.electronAPI.deleteAPIProfile(profileId);
      if (result.success) {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== profileId),
          activeProfileId: state.activeProfileId === profileId ? null : state.activeProfileId,
          profilesLoading: false
        }));
        return true;
      }
      set({
        profilesError: result.error || 'Failed to delete profile',
        profilesLoading: false
      });
      return false;
    } catch (error) {
      set({
        profilesError: error instanceof Error ? error.message : 'Failed to delete profile',
        profilesLoading: false
      });
      return false;
    }
  },

  setActiveProfile: async (profileId: string): Promise<boolean> => {
    set({ profilesLoading: true, profilesError: null });
    try {
      const result = await window.electronAPI.setActiveAPIProfile(profileId);
      if (result.success) {
        set({ activeProfileId: profileId, profilesLoading: false });
        return true;
      }
      set({
        profilesError: result.error || 'Failed to set active profile',
        profilesLoading: false
      });
      return false;
    } catch (error) {
      set({
        profilesError: error instanceof Error ? error.message : 'Failed to set active profile',
        profilesLoading: false
      });
      return false;
    }
  }
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
 * Load settings from main process
 */
export async function loadSettings(): Promise<void> {
  const store = useSettingsStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.getSettings();
    if (result.success && result.data) {
      // Apply migration for onboardingCompleted flag
      const migratedSettings = migrateOnboardingCompleted(result.data);
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

/**
 * Load API profiles from main process
 */
export async function loadProfiles(): Promise<void> {
  const store = useSettingsStore.getState();
  store.setProfilesLoading(true);

  try {
    const result = await window.electronAPI.getAPIProfiles();
    if (result.success && result.data) {
      store.setProfiles(result.data.profiles, result.data.activeProfileId);
    }
  } catch (error) {
    store.setProfilesError(error instanceof Error ? error.message : 'Failed to load profiles');
  } finally {
    store.setProfilesLoading(false);
  }
}
