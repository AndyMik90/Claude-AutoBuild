/**
 * @auto-claude/profile-service
 *
 * Shared profile service for API credential management.
 * Provides validation, file I/O, and connection testing for API profiles.
 */

// Types
export type {
  APIProfile,
  ProfilesFile,
  ProfileFormData,
  TestConnectionResult
} from './types/profile.js';

// Profile Manager utilities
export {
  loadProfilesFile,
  saveProfilesFile,
  generateProfileId,
  validateFilePermissions,
  getProfilesFilePath,
  withProfilesLock,
  atomicModifyProfiles
} from './utils/profile-manager.js';

// Profile Service
export {
  validateBaseUrl,
  validateApiKey,
  validateProfileNameUnique,
  createProfile,
  updateProfile,
  deleteProfile,
  getAPIProfileEnv,
  testConnection
} from './services/profile-service.js';

export type { CreateProfileInput, UpdateProfileInput } from './services/profile-service.js';
