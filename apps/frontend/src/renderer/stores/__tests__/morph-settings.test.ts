/**
 * Unit tests for Morph Settings State Management
 * Tests Zustand settings store for morph-specific settings
 *
 * Note: Settings persistence is handled via IPC (saveSettings/getSettings).
 * These tests focus on the store's state management logic.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSettingsStore } from '../settings-store';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';

// Helper to create test settings
function createTestSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...overrides
  } as AppSettings;
}

describe('Morph Settings State Management', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSettingsStore.setState({
      settings: DEFAULT_APP_SETTINGS as AppSettings,
      isLoading: false,
      error: null
    });
  });

  afterEach(() => {
    // Clean up after each test
    useSettingsStore.setState({
      settings: DEFAULT_APP_SETTINGS as AppSettings,
      isLoading: false,
      error: null
    });
  });

  describe('Initial State', () => {
    it('should have morph disabled by default', () => {
      const { settings } = useSettingsStore.getState();

      expect(settings.morphEnabled).toBe(false);
      expect(settings.morphApiKey).toBeUndefined();
    });

    it('should start with loading state when not explicitly set', () => {
      // Reset to default initial state (which has isLoading: true)
      useSettingsStore.setState({
        settings: DEFAULT_APP_SETTINGS as AppSettings,
        isLoading: true,
        error: null
      });

      const { isLoading } = useSettingsStore.getState();
      expect(isLoading).toBe(true);
    });

    it('should have no error by default', () => {
      const { error } = useSettingsStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('setSettings', () => {
    it('should set entire settings object', () => {
      const newSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'test-api-key-123'
      });

      useSettingsStore.getState().setSettings(newSettings);

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('test-api-key-123');
    });

    it('should replace existing settings completely', () => {
      // Set initial settings
      useSettingsStore.getState().setSettings(createTestSettings({
        morphEnabled: true,
        morphApiKey: 'old-key'
      }));

      // Replace with new settings
      const newSettings = createTestSettings({
        morphEnabled: false,
        morphApiKey: 'new-key'
      });
      useSettingsStore.getState().setSettings(newSettings);

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(false);
      expect(settings.morphApiKey).toBe('new-key');
    });

    it('should handle undefined morph fields', () => {
      const newSettings = createTestSettings({
        morphEnabled: undefined,
        morphApiKey: undefined
      });

      useSettingsStore.getState().setSettings(newSettings);

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBeUndefined();
      expect(settings.morphApiKey).toBeUndefined();
    });
  });

  describe('updateSettings', () => {
    it('should update only morphEnabled', () => {
      const initialSettings = createTestSettings({
        morphEnabled: false,
        morphApiKey: 'existing-key',
        theme: 'dark'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({ morphEnabled: true });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('existing-key'); // Should remain unchanged
      expect(settings.theme).toBe('dark'); // Other settings should remain unchanged
    });

    it('should update only morphApiKey', () => {
      const initialSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'old-key'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({ morphApiKey: 'new-key-456' });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true); // Should remain unchanged
      expect(settings.morphApiKey).toBe('new-key-456');
    });

    it('should update both morph settings simultaneously', () => {
      const initialSettings = createTestSettings({
        morphEnabled: false,
        morphApiKey: undefined
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: 'new-api-key'
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('new-api-key');
    });

    it('should clear morphApiKey when set to undefined', () => {
      const initialSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'existing-key'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({ morphApiKey: undefined });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true); // Should remain unchanged
      expect(settings.morphApiKey).toBeUndefined();
    });

    it('should disable morph while preserving API key', () => {
      const initialSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({ morphEnabled: false });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(false);
      expect(settings.morphApiKey).toBe('test-key'); // API key should be preserved
    });

    it('should not affect other settings when updating morph settings', () => {
      const initialSettings = createTestSettings({
        theme: 'light',
        defaultModel: 'opus',
        morphEnabled: false,
        morphApiKey: undefined
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('light');
      expect(settings.defaultModel).toBe('opus');
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('test-key');
    });
  });

  describe('setLoading', () => {
    it('should set loading to true', () => {
      useSettingsStore.getState().setLoading(true);

      const { isLoading } = useSettingsStore.getState();
      expect(isLoading).toBe(true);
    });

    it('should set loading to false', () => {
      useSettingsStore.getState().setLoading(true);
      useSettingsStore.getState().setLoading(false);

      const { isLoading } = useSettingsStore.getState();
      expect(isLoading).toBe(false);
    });

    it('should not affect settings when changing loading state', () => {
      const initialSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().setLoading(true);

      const { settings, isLoading } = useSettingsStore.getState();
      expect(isLoading).toBe(true);
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('test-key');
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useSettingsStore.getState().setError('Failed to load settings');

      const { error } = useSettingsStore.getState();
      expect(error).toBe('Failed to load settings');
    });

    it('should clear error when set to null', () => {
      useSettingsStore.getState().setError('Some error');
      useSettingsStore.getState().setError(null);

      const { error } = useSettingsStore.getState();
      expect(error).toBeNull();
    });

    it('should not affect settings when setting error', () => {
      const initialSettings = createTestSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      });
      useSettingsStore.getState().setSettings(initialSettings);

      useSettingsStore.getState().setError('Test error');

      const { settings, error } = useSettingsStore.getState();
      expect(error).toBe('Test error');
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('test-key');
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle empty string API key', () => {
      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: ''
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('');
    });

    it('should handle very long API key', () => {
      const longKey = 'a'.repeat(500);
      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: longKey
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphApiKey).toBe(longKey);
    });

    it('should handle special characters in API key', () => {
      const specialKey = 'sk-test_123!@#$%^&*()_+-=[]{}|;:,.<>?';
      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: specialKey
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphApiKey).toBe(specialKey);
    });

    it('should handle rapid setting updates', () => {
      useSettingsStore.getState().updateSettings({ morphEnabled: true });
      useSettingsStore.getState().updateSettings({ morphApiKey: 'key1' });
      useSettingsStore.getState().updateSettings({ morphApiKey: 'key2' });
      useSettingsStore.getState().updateSettings({ morphEnabled: false });
      useSettingsStore.getState().updateSettings({ morphApiKey: 'key3' });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(false);
      expect(settings.morphApiKey).toBe('key3');
    });
  });

  describe('Integration Scenarios', () => {
    it('should support typical enable workflow', () => {
      // User enables morph
      useSettingsStore.getState().updateSettings({ morphEnabled: true });
      expect(useSettingsStore.getState().settings.morphEnabled).toBe(true);
      expect(useSettingsStore.getState().settings.morphApiKey).toBeUndefined();

      // User enters API key
      useSettingsStore.getState().updateSettings({ morphApiKey: 'sk-test-123' });
      expect(useSettingsStore.getState().settings.morphApiKey).toBe('sk-test-123');
    });

    it('should support typical disable workflow', () => {
      // Start with morph enabled and key configured
      useSettingsStore.getState().setSettings(createTestSettings({
        morphEnabled: true,
        morphApiKey: 'sk-test-123'
      }));

      // User disables morph (key should be preserved)
      useSettingsStore.getState().updateSettings({ morphEnabled: false });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(false);
      expect(settings.morphApiKey).toBe('sk-test-123'); // Key preserved for re-enabling
    });

    it('should support API key update workflow', () => {
      // Start with morph enabled and key configured
      useSettingsStore.getState().setSettings(createTestSettings({
        morphEnabled: true,
        morphApiKey: 'old-key'
      }));

      // User updates API key
      useSettingsStore.getState().updateSettings({ morphApiKey: 'new-key' });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('new-key');
    });

    it('should support clearing API key workflow', () => {
      // Start with morph enabled and key configured
      useSettingsStore.getState().setSettings(createTestSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      }));

      // User clears API key
      useSettingsStore.getState().updateSettings({ morphApiKey: undefined });

      const { settings } = useSettingsStore.getState();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBeUndefined();
    });

    it('should handle loading state during settings fetch', () => {
      // Simulate loading state
      useSettingsStore.getState().setLoading(true);
      expect(useSettingsStore.getState().isLoading).toBe(true);

      // Simulate successful load
      useSettingsStore.getState().setSettings(createTestSettings({
        morphEnabled: true,
        morphApiKey: 'loaded-key'
      }));
      useSettingsStore.getState().setLoading(false);

      const { settings, isLoading, error } = useSettingsStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('loaded-key');
    });

    it('should handle error state during settings fetch', () => {
      // Simulate loading state
      useSettingsStore.getState().setLoading(true);

      // Simulate error
      useSettingsStore.getState().setError('Failed to connect to settings service');
      useSettingsStore.getState().setLoading(false);

      const { error, isLoading } = useSettingsStore.getState();
      expect(isLoading).toBe(false);
      expect(error).toBe('Failed to connect to settings service');
    });
  });

  describe('State Immutability', () => {
    it('should not mutate original settings when updating', () => {
      const originalSettings = createTestSettings({
        morphEnabled: false,
        morphApiKey: undefined
      });
      useSettingsStore.getState().setSettings(originalSettings);

      // Get reference to current settings
      const settingsBefore = useSettingsStore.getState().settings;

      // Update settings
      useSettingsStore.getState().updateSettings({ morphEnabled: true });

      // Check that we got a new object
      const settingsAfter = useSettingsStore.getState().settings;
      expect(settingsAfter).not.toBe(settingsBefore);
      expect(settingsAfter.morphEnabled).toBe(true);
    });

    it('should preserve other settings when updating morph settings', () => {
      const complexSettings = createTestSettings({
        theme: 'dark',
        defaultModel: 'sonnet',
        morphEnabled: false,
        morphApiKey: undefined,
        notifications: {
          onTaskComplete: true,
          onTaskFailed: false,
          onReviewNeeded: true,
          sound: true
        }
      });
      useSettingsStore.getState().setSettings(complexSettings);

      useSettingsStore.getState().updateSettings({
        morphEnabled: true,
        morphApiKey: 'test-key'
      });

      const { settings } = useSettingsStore.getState();
      expect(settings.theme).toBe('dark');
      expect(settings.defaultModel).toBe('sonnet');
      expect(settings.notifications.onTaskComplete).toBe(true);
      expect(settings.notifications.sound).toBe(true);
      expect(settings.morphEnabled).toBe(true);
      expect(settings.morphApiKey).toBe('test-key');
    });
  });
});
