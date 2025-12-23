/**
 * API Profile Management Types
 *
 * @deprecated Import from '@auto-claude/profile-service' instead.
 * This file re-exports types from the shared profile-service library for backwards compatibility.
 *
 * Users can configure custom Anthropic-compatible API endpoints with profiles.
 * Each profile contains name, base URL, API key, and optional model mappings.
 */

// Re-export all types from the shared library
export type {
  APIProfile,
  ProfilesFile,
  ProfileFormData,
  TestConnectionResult
} from '@auto-claude/profile-service';
