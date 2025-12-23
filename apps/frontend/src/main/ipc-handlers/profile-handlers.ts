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
import type { APIProfile, ProfileFormData, ProfilesFile, TestConnectionResult } from '@auto-claude/profile-service';
import {
  loadProfilesFile,
  saveProfilesFile,
  validateFilePermissions,
  getProfilesFilePath
} from '@auto-claude/profile-service';
import { createProfile, updateProfile, deleteProfile, testConnection } from '@auto-claude/profile-service';

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
        await validateFilePermissions(getProfilesFilePath()).catch((err) => {
          console.warn('[profile-handlers] Failed to set secure file permissions:', err);
        });

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
        await validateFilePermissions(getProfilesFilePath()).catch((err) => {
          console.warn('[profile-handlers] Failed to set secure file permissions:', err);
        });

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
        // Use deleteProfile from service layer (handles validation)
        await deleteProfile(profileId);

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
          await validateFilePermissions(getProfilesFilePath()).catch((err) => {
            console.warn('[profile-handlers] Failed to set secure file permissions:', err);
          });
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
        await validateFilePermissions(getProfilesFilePath()).catch((err) => {
          console.warn('[profile-handlers] Failed to set secure file permissions:', err);
        });

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
   * - Includes configurable timeout (defaults to 15 seconds)
   * - Note: AbortSignal from renderer is not serializable through IPC;
   *   timeout is managed internally by the handler
   */
  ipcMain.handle(
    IPC_CHANNELS.PROFILES_TEST_CONNECTION,
    async (_event, baseUrl: string, apiKey: string, _signal?: AbortSignal): Promise<IPCResult<TestConnectionResult>> => {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutMs = 15000; // 15 seconds

      // Set timeout to abort the request
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        // Validate inputs (null/empty checks)
        if (!baseUrl || baseUrl.trim() === '') {
          clearTimeout(timeoutId);
          return {
            success: false,
            error: 'Base URL is required'
          };
        }

        if (!apiKey || apiKey.trim() === '') {
          clearTimeout(timeoutId);
          return {
            success: false,
            error: 'API key is required'
          };
        }

        // Call testConnection from service layer with abort signal
        const result = await testConnection(baseUrl, apiKey, controller.signal);

        // Clear timeout on success
        clearTimeout(timeoutId);

        return { success: true, data: result };
      } catch (error) {
        // Clear timeout on error
        clearTimeout(timeoutId);

        // Handle abort errors (timeout or explicit cancellation)
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            error: 'Connection timeout. The request took too long to complete.'
          };
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to test connection'
        };
      }
    }
  );
}
