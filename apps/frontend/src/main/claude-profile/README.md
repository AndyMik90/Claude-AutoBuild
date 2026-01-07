# Claude Profile Module

This directory contains the refactored Claude profile management system, broken down into logical, maintainable modules.

## Architecture

The profile management system is organized using separation of concerns, with each module handling a specific responsibility:

```
claude-profile/
├── index.ts                 # Central export point
├── types.ts                 # Type definitions
├── token-encryption.ts      # OAuth token encryption/decryption
├── usage-parser.ts          # Usage data parsing and reset time calculations
├── rate-limit-manager.ts    # Rate limit event tracking
├── profile-storage.ts       # Disk persistence
├── profile-scorer.ts        # Profile availability scoring and auto-switch logic
└── profile-utils.ts         # Helper utilities
```

## Modules

### 1. **token-encryption.ts**
Handles OAuth token encryption and decryption using the OS keychain (Electron's safeStorage API).

**Key Functions:**
- `encryptToken(token: string): string` - Encrypts a token using OS keychain
- `decryptToken(storedToken: string): string` - Decrypts a token, handles legacy plain tokens
- `isTokenEncrypted(storedToken: string): boolean` - Checks if token is encrypted

### 2. **usage-parser.ts**
Parses Claude `/usage` command output and calculates reset times.

**Key Functions:**
- `parseUsageOutput(usageOutput: string): ClaudeUsageData` - Parses full usage output
- `parseResetTime(resetTimeStr: string): Date` - Converts reset time strings to Date objects
- `classifyRateLimitType(resetTimeStr: string): 'session' | 'weekly'` - Determines rate limit type

### 3. **rate-limit-manager.ts**
Manages rate limit events and status tracking.

**Key Functions:**
- `recordRateLimitEvent(profile, resetTimeStr): ClaudeRateLimitEvent` - Records a rate limit hit
- `isProfileRateLimited(profile): {limited, type?, resetAt?}` - Checks current rate limit status
- `clearRateLimitEvents(profile): void` - Clears rate limit history

### 4. **profile-storage.ts**
Handles persistence of profile data to disk with version migration.

**Key Functions:**
- `loadProfileStore(storePath: string): ProfileStoreData | null` - Loads profiles from disk
- `saveProfileStore(storePath: string, data: ProfileStoreData): void` - Saves profiles to disk

**Constants:**
- `STORE_VERSION` - Current storage format version
- `DEFAULT_AUTO_SWITCH_SETTINGS` - Default auto-switch configuration

### 5. **profile-scorer.ts**
Implements intelligent profile scoring and auto-switch logic.

**Key Functions:**
- `getBestAvailableProfile(profiles, settings, excludeProfileId?): ClaudeProfile | null` - Finds best profile based on usage/limits
- `shouldProactivelySwitch(profile, allProfiles, settings): {shouldSwitch, reason?, suggestedProfile?}` - Determines if proactive switch is needed
- `getProfilesSortedByAvailability(profiles): ClaudeProfile[]` - Sorts profiles by availability

**Scoring Criteria:**
1. Not rate-limited (highest priority)
2. Lower weekly usage (more important than session)
3. Lower session usage
4. Authenticated profiles

### 6. **profile-utils.ts**
Helper utilities for profile operations.

**Key Functions:**
- `generateProfileId(name, existingProfiles): string` - Generates unique profile IDs
- `createProfileDirectory(profileName): Promise<string>` - Creates profile directory
- `isProfileAuthenticated(profile): boolean` - Checks if profile has valid auth
- `hasValidToken(profile): boolean` - Validates OAuth token (1 year expiry)
- `expandHomePath(path): string` - Expands ~ in paths

**Constants:**
- `DEFAULT_CLAUDE_CONFIG_DIR` - Default Claude config location (~/.claude)
- `CLAUDE_PROFILES_DIR` - Additional profiles directory (~/.claude-profiles)

### 7. **types.ts**
Re-exports shared types for convenience and future extensibility.

### 8. **index.ts**
Central export point providing a clean public API for all profile functionality.

## Main Manager

The `claude-profile-manager.ts` (parent directory) serves as the high-level coordinator that:
- Delegates to specialized modules
- Manages the overall profile lifecycle
- Coordinates between different subsystems
- Provides the singleton instance

**Original size:** 903 lines
**Refactored size:** 509 lines (44% reduction)
**Total with modules:** 1197 lines (organized and maintainable)

## Usage

### Using the Main Manager
```typescript
import { getClaudeProfileManager } from './claude-profile-manager';

const manager = getClaudeProfileManager();
const profile = manager.getActiveProfile();
const usage = manager.updateProfileUsage(profileId, usageOutput);
```

### Using Individual Modules (Advanced)
```typescript
import { parseUsageOutput, isProfileRateLimited } from './claude-profile';

const usage = parseUsageOutput(output);
const status = isProfileRateLimited(profile);
```

## Benefits of Refactoring

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Testability** - Modules can be unit tested independently
3. **Maintainability** - Easier to understand and modify specific functionality
4. **Reusability** - Modules can be imported individually when needed
5. **Readability** - Smaller files are easier to navigate and understand
6. **Type Safety** - Clear module boundaries with explicit TypeScript types

## Backward Compatibility

All existing imports continue to work without modification:
```typescript
import { getClaudeProfileManager } from './claude-profile-manager';
```

The public API of `ClaudeProfileManager` remains unchanged, ensuring zero breaking changes for existing code.

## Future Enhancements

Potential areas for future improvement:
- Add comprehensive unit tests for each module
- Implement profile import/export functionality
- Add profile usage analytics and reporting
- Enhance auto-switch algorithms with machine learning
- Add profile backup and restore capabilities
