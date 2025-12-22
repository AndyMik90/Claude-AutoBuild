/**
 * Tests for profile IPC handlers
 *
 * Tests profiles:set-active handler with support for:
 * - Setting valid profile as active
 * - Switching to OAuth (null profileId)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIProfile, ProfilesFile } from '../../shared/types/profile';

// Mock electron before importing
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

// Mock profile-manager
vi.mock('../utils/profile-manager', () => ({
  loadProfilesFile: vi.fn(),
  saveProfilesFile: vi.fn(),
  validateFilePermissions: vi.fn(),
  getProfilesFilePath: vi.fn(() => '/test/profiles.json')
}));

// Mock profile-service
vi.mock('../services/profile-service', () => ({
  createProfile: vi.fn(),
  updateProfile: vi.fn()
}));

import { registerProfileHandlers } from './profile-handlers';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import {
  loadProfilesFile,
  saveProfilesFile,
  validateFilePermissions
} from '../utils/profile-manager';

// Get the handler function for testing
function getSetActiveHandler() {
  // Register handlers first to populate ipcMain.handle mock
  registerProfileHandlers();

  const calls = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const setActiveCall = calls.find(
    (call) => call[0] === IPC_CHANNELS.PROFILES_SET_ACTIVE
  );
  return setActiveCall?.[1];
}

describe('profile-handlers - setActiveProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProfiles: APIProfile[] = [
    {
      id: 'profile-1',
      name: 'Test Profile 1',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test-key-1',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'profile-2',
      name: 'Test Profile 2',
      baseUrl: 'https://custom.api.com',
      apiKey: 'sk-custom-key-2',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];

  describe('setting valid profile as active', () => {
    it('should set active profile with valid profileId', async () => {
      const mockFile: ProfilesFile = {
        profiles: mockProfiles,
        activeProfileId: null,
        version: 1
      };

      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);
      vi.mocked(saveProfilesFile).mockResolvedValue(undefined);
      vi.mocked(validateFilePermissions).mockResolvedValue(undefined);

      const handler = getSetActiveHandler();
      const result = await handler({}, 'profile-1');

      expect(result).toEqual({ success: true });
      expect(saveProfilesFile).toHaveBeenCalledWith(
        expect.objectContaining({
          activeProfileId: 'profile-1'
        })
      );
    });

    it('should return error for non-existent profile', async () => {
      const mockFile: ProfilesFile = {
        profiles: mockProfiles,
        activeProfileId: null,
        version: 1
      };

      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const handler = getSetActiveHandler();
      const result = await handler({}, 'non-existent-id');

      expect(result).toEqual({
        success: false,
        error: 'Profile not found'
      });
    });
  });

  describe('switching to OAuth (null profileId)', () => {
    it('should accept null profileId to switch to OAuth', async () => {
      const mockFile: ProfilesFile = {
        profiles: mockProfiles,
        activeProfileId: 'profile-1',
        version: 1
      };

      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);
      vi.mocked(saveProfilesFile).mockResolvedValue(undefined);
      vi.mocked(validateFilePermissions).mockResolvedValue(undefined);

      const handler = getSetActiveHandler();
      const result = await handler({}, null);

      // Should succeed and clear activeProfileId
      expect(result).toEqual({ success: true });
      expect(saveProfilesFile).toHaveBeenCalledWith(
        expect.objectContaining({
          activeProfileId: null
        })
      );
    });

    it('should handle null when no profile was active', async () => {
      const mockFile: ProfilesFile = {
        profiles: mockProfiles,
        activeProfileId: null,
        version: 1
      };

      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);
      vi.mocked(saveProfilesFile).mockResolvedValue(undefined);
      vi.mocked(validateFilePermissions).mockResolvedValue(undefined);

      const handler = getSetActiveHandler();
      const result = await handler({}, null);

      // Should succeed (idempotent operation)
      expect(result).toEqual({ success: true });
      expect(saveProfilesFile).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle loadProfilesFile errors', async () => {
      vi.mocked(loadProfilesFile).mockRejectedValue(
        new Error('Failed to load profiles')
      );

      const handler = getSetActiveHandler();
      const result = await handler({}, 'profile-1');

      expect(result).toEqual({
        success: false,
        error: 'Failed to load profiles'
      });
    });

    it('should handle saveProfilesFile errors', async () => {
      const mockFile: ProfilesFile = {
        profiles: mockProfiles,
        activeProfileId: null,
        version: 1
      };

      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);
      vi.mocked(saveProfilesFile).mockRejectedValue(
        new Error('Failed to save')
      );

      const handler = getSetActiveHandler();
      const result = await handler({}, 'profile-1');

      expect(result).toEqual({
        success: false,
        error: 'Failed to save'
      });
    });
  });
});
