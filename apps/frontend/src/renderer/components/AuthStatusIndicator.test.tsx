/**
 * @vitest-environment jsdom
 */
/**
 * Tests for AuthStatusIndicator component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { AuthStatusIndicator } from './AuthStatusIndicator';
import { useSettingsStore } from '../stores/settings-store';
import type { APIProfile } from '@shared/types/profile';

// Mock the settings store
vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn()
}));

/**
 * Creates a mock settings store with optional overrides
 * @param overrides - Partial store state to override defaults
 * @returns Complete mock settings store object
 */
function createUseSettingsStoreMock(overrides?: Partial<ReturnType<typeof useSettingsStore>>) {
  return {
    profiles: testProfiles,
    activeProfileId: null,
    deleteProfile: vi.fn().mockResolvedValue(true),
    setActiveProfile: vi.fn().mockResolvedValue(true),
    profilesLoading: false,
    settings: {} as any,
    isLoading: false,
    error: null,
    setSettings: vi.fn(),
    updateSettings: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    setProfiles: vi.fn(),
    setProfilesLoading: vi.fn(),
    setProfilesError: vi.fn(),
    saveProfile: vi.fn().mockResolvedValue(true),
    updateProfile: vi.fn().mockResolvedValue(true),
    profilesError: null,
    ...overrides
  };
}

// Test profile data
const testProfiles: APIProfile[] = [
  {
    id: 'profile-1',
    name: 'Production API',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-prod-key-1234',
    models: { default: 'claude-3-5-sonnet-20241022' },
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'profile-2',
    name: 'Development API',
    baseUrl: 'https://dev-api.example.com/v1',
    apiKey: 'sk-ant-test-key-5678',
    models: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

describe('AuthStatusIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when using OAuth (no active profile)', () => {
    beforeEach(() => {
      vi.mocked(useSettingsStore).mockReturnValue(
        createUseSettingsStoreMock({ activeProfileId: null })
      );
    });

    it('should display OAuth with Lock icon', () => {
      render(<AuthStatusIndicator />);

      expect(screen.getByText('OAuth')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /authentication method: oauth/i })).toBeInTheDocument();
    });

    it('should have correct aria-label for OAuth', () => {
      render(<AuthStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Authentication method: OAuth');
    });
  });

  describe('when using API profile', () => {
    beforeEach(() => {
      vi.mocked(useSettingsStore).mockReturnValue(
        createUseSettingsStoreMock({ activeProfileId: 'profile-1' })
      );
    });

    it('should display profile name with Key icon', () => {
      render(<AuthStatusIndicator />);

      expect(screen.getByText('Production API')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /authentication method: production api/i })).toBeInTheDocument();
    });

    it('should have correct aria-label for profile', () => {
      render(<AuthStatusIndicator />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Authentication method: Production API');
    });
  });

  describe('when active profile ID references non-existent profile', () => {
    beforeEach(() => {
      vi.mocked(useSettingsStore).mockReturnValue(
        createUseSettingsStoreMock({ activeProfileId: 'non-existent-id' })
      );
    });

    it('should fallback to OAuth display', () => {
      render(<AuthStatusIndicator />);

      expect(screen.getByText('OAuth')).toBeInTheDocument();
    });
  });

  describe('component structure', () => {
    beforeEach(() => {
      vi.mocked(useSettingsStore).mockReturnValue(
        createUseSettingsStoreMock()
      );
    });

    it('should be a valid React component', () => {
      expect(() => render(<AuthStatusIndicator />)).not.toThrow();
    });
  });
});
