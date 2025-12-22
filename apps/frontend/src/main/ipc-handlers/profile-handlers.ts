/**
 * Profile IPC Handlers
 *
 * IPC handlers for API profile management:
 * - profiles:get - Get all profiles
 * - profiles:save - Save/create a profile
 * - profiles:update - Update an existing profile
 * - profiles:delete - Delete a profile
 * - profiles:setActive - Set active profile
 * - profiles:test-connection - Test API profile connection
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { APIProfile, ProfileFormData, ProfilesFile, TestConnectionResult } from '../../shared/types/profile';
import {
  loadProfilesFile,
  saveProfilesFile,
  generateProfileId,
  validateFilePermissions,
  getProfilesFilePath
} from '../utils/profile-manager';
import { createProfile, updateProfile, testConnection } from '../services/profile-service';

/**
 * Register all profile-related IPC handlers
 */
export function registerProfileHandlers(): void {
  /**
   * Get all profiles
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_GET,
    async (): Promise<IPCResult<ProfilesFile>> => {
      try {
        const profiles = await loadProfilesFile();
        return { success: true, data: profiles };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load profiles'
        };
      }
    }
  );

  /**
   * Save/create a profile
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_SAVE,
    async (
      _,
      profileData: ProfileFormData
    ): Promise<IPCResult<APIProfile>> => {
      try {
        // Use createProfile from service layer (handles validation)
        const newProfile = await createProfile(profileData);

        // Set file permissions to user-readable only
        await validateFilePermissions(getProfilesFilePath());

        return { success: true, data: newProfile };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save profile'
        };
      }
    }
  );

  /**
   * Update an existing profile
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_UPDATE,
    async (_, profileData: APIProfile): Promise<IPCResult<APIProfile>> => {
      try {
        // Use updateProfile from service layer (handles validation)
        const updatedProfile = await updateProfile({
          id: profileData.id,
          name: profileData.name,
          baseUrl: profileData.baseUrl,
          apiKey: profileData.apiKey,
          models: profileData.models
        });

        // Set file permissions to user-readable only
        await validateFilePermissions(getProfilesFilePath());

        return { success: true, data: updatedProfile };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update profile'
        };
      }
    }
  );

  /**
   * Delete a profile
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_DELETE,
    async (_, profileId: string): Promise<IPCResult> => {
      try {
        const file = await loadProfilesFile();

        // Check if profile exists
        const profileIndex = file.profiles.findIndex((p) => p.id === profileId);
        if (profileIndex === -1) {
          return {
            success: false,
            error: 'Profile not found'
          };
        }

        // Active Profile Check: Cannot delete active profile (AC3)
        if (file.activeProfileId === profileId) {
          return {
            success: false,
            error: 'Cannot delete active profile. Please switch to another profile or OAuth first.'
          };
        }

        // Remove profile
        file.profiles.splice(profileIndex, 1);

        // Last Profile Fallback: If no profiles remain, set activeProfileId to null (AC4)
        if (file.profiles.length === 0) {
          file.activeProfileId = null;
        }

        // Save to disk
        await saveProfilesFile(file);

        // Set file permissions to user-readable only
        await validateFilePermissions(getProfilesFilePath());

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete profile'
        };
      }
    }
  );

  /**
   * Set active profile
   * - If profileId is provided, set that profile as active
   * - If profileId is null, clear active profile (switch to OAuth)
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_SET_ACTIVE,
    async (_, profileId: string | null): Promise<IPCResult> => {
      try {
        const file = await loadProfilesFile();

        // If switching to OAuth (null), clear active profile
        if (profileId === null) {
          file.activeProfileId = null;
          await saveProfilesFile(file);
          await validateFilePermissions(getProfilesFilePath());
          return { success: true };
        }

        // Check if profile exists
        const profileExists = file.profiles.some((p) => p.id === profileId);
        if (!profileExists) {
          return {
            success: false,
            error: 'Profile not found'
          };
        }

        // Set active profile
        file.activeProfileId = profileId;

        // Save to disk
        await saveProfilesFile(file);

        // Set file permissions to user-readable only
        await validateFilePermissions(getProfilesFilePath());

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set active profile'
        };
      }
    }
  );

  /**
   * Test API profile connection
   * - Tests credentials by making a minimal API request
   * - Returns detailed error information for different failure types
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_TEST_CONNECTION,
    async (_event, baseUrl: string, apiKey: string): Promise<IPCResult<TestConnectionResult>> => {
      try {
        // Validate inputs (null/empty checks)
        if (!baseUrl || baseUrl.trim() === '') {
          return {
            success: false,
            error: 'Base URL is required'
          };
        }

        if (!apiKey || apiKey.trim() === '') {
          return {
            success: false,
            error: 'API key is required'
          };
        }

        // Call testConnection from service layer
        const result = await testConnection(baseUrl, apiKey);

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test connection'
        };
      }
    }
  );
}
