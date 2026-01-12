/**
 * Profile Service - Barrel Export
 *
 * Re-exports all profile-related functionality for convenient importing.
 * Main process code should import from this index file.
 */

// Profile Manager utilities
export {
  loadProfilesFile,
  saveProfilesFile,
  generateProfileId,
  validateFilePermissions,
  getProfilesFilePath,
  withProfilesLock,
  atomicModifyProfiles
} from './profile-manager';

// Profile Service
export {
  validateBaseUrl,
  validateApiKey,
  validateProfileNameUnique,
  createProfile,
  updateProfile,
  deleteProfile,
  getAPIProfileEnv,
  testConnection,
  discoverModels
} from './profile-service';

export type { CreateProfileInput, UpdateProfileInput } from './profile-service';

// Profile Usage Service
export {
  detectProvider,
  fetchZaiUsage,
  fetchAnthropicOAuthUsage,
  fetchUsageForProfile,
  formatMonthlyResetTime
} from './profile-usage';

export type { UsageProvider } from './profile-usage';

// Re-export types from shared for convenience
export type {
  APIProfile,
  ProfilesFile,
  ProfileFormData,
  TestConnectionResult,
  ModelInfo,
  DiscoverModelsResult,
  DiscoverModelsError
} from '@shared/types/profile';
