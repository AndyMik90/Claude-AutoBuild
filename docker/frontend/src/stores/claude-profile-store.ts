import { create } from 'zustand';
import type { ClaudeProfile, ClaudeProfileSettings } from '../../shared/types';

interface ClaudeProfileState {
  profiles: ClaudeProfile[];
  activeProfileId: string;
  isLoading: boolean;
  isSwitching: boolean;

  // Actions
  setProfiles: (settings: ClaudeProfileSettings) => void;
  setActiveProfile: (profileId: string) => void;
  addProfile: (profile: ClaudeProfile) => void;
  updateProfile: (profile: ClaudeProfile) => void;
  removeProfile: (profileId: string) => void;
  setLoading: (loading: boolean) => void;
  setSwitching: (switching: boolean) => void;
}

export const useClaudeProfileStore = create<ClaudeProfileState>((set) => ({
  profiles: [],
  activeProfileId: 'default',
  isLoading: false,
  isSwitching: false,

  setProfiles: (settings: ClaudeProfileSettings) => {
    set({
      profiles: settings.profiles,
      activeProfileId: settings.activeProfileId
    });
  },

  setActiveProfile: (profileId: string) => {
    set({ activeProfileId: profileId });
  },

  addProfile: (profile: ClaudeProfile) => {
    set((state) => ({
      profiles: [...state.profiles, profile]
    }));
  },

  updateProfile: (profile: ClaudeProfile) => {
    set((state) => ({
      profiles: state.profiles.map((p) =>
        p.id === profile.id ? profile : p
      )
    }));
  },

  removeProfile: (profileId: string) => {
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== profileId)
    }));
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setSwitching: (switching: boolean) => {
    set({ isSwitching: switching });
  },
}));

/**
 * Load Claude profiles from the main process
 */
export async function loadClaudeProfiles(): Promise<void> {
  const store = useClaudeProfileStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.getClaudeProfiles();
    if (result.success && result.data) {
      store.setProfiles(result.data);
    }
  } catch (error) {
    console.error('[ClaudeProfileStore] Error loading profiles:', error);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Switch to a different Claude profile in a terminal
 */
export async function switchTerminalToProfile(
  terminalId: string,
  profileId: string
): Promise<boolean> {
  const store = useClaudeProfileStore.getState();
  store.setSwitching(true);

  try {
    const result = await window.electronAPI.switchClaudeProfile(terminalId, profileId);
    if (result.success) {
      store.setActiveProfile(profileId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[ClaudeProfileStore] Error switching profile:', error);
    return false;
  } finally {
    store.setSwitching(false);
  }
}
