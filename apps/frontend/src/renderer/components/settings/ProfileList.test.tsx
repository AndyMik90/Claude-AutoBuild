/**
 * Component and utility tests for ProfileList
 * Tests utility functions and verifies component structure
 */
import { describe, it, expect } from 'vitest';
import { maskApiKey } from '../../lib/profile-utils';
import type { APIProfile } from '@shared/types/profile';

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

describe('ProfileList - maskApiKey Utility', () => {
  it('should mask API key showing only last 4 characters', () => {
    const apiKey = 'sk-ant-prod-key-1234';
    const masked = maskApiKey(apiKey);
    expect(masked).toBe('••••1234');
  });

  it('should return dots for keys with 4 or fewer characters', () => {
    expect(maskApiKey('key')).toBe('••••');
    expect(maskApiKey('1234')).toBe('••••');
    expect(maskApiKey('')).toBe('••••');
  });

  it('should handle undefined or null keys', () => {
    expect(maskApiKey(undefined as unknown as string)).toBe('••••');
    expect(maskApiKey(null as unknown as string)).toBe('••••');
  });

  it('should mask long API keys correctly', () => {
    const longKey = 'sk-ant-api03-very-long-key-abc123xyz789';
    const masked = maskApiKey(longKey);
    expect(masked).toBe('••••z789'); // Last 4 chars
    expect(masked.length).toBe(8); // 4 dots + 4 chars
  });

  it('should mask keys with exactly 5 characters', () => {
    const key = 'abcde';
    const masked = maskApiKey(key);
    expect(masked).toBe('••••bcde'); // Last 4 chars when length > 4
  });
});

describe('ProfileList - Profile Data Structure', () => {
  it('should have valid API profile structure', () => {
    expect(testProfiles[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      baseUrl: expect.any(String),
      apiKey: expect.any(String),
      models: expect.any(Object)
    });
  });

  it('should support profiles without optional models field', () => {
    expect(testProfiles[1].models).toBeUndefined();
  });

  it('should have non-empty required fields', () => {
    testProfiles.forEach(profile => {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.baseUrl).toBeTruthy();
      expect(profile.apiKey).toBeTruthy();
    });
  });
});

describe('ProfileList - Component Export', () => {
  it('should be able to import ProfileList component', async () => {
    const { ProfileList } = await import('./ProfileList');
    expect(ProfileList).toBeDefined();
    expect(typeof ProfileList).toBe('function');
  });

  it('should be a named export', async () => {
    const module = await import('./ProfileList');
    expect(Object.keys(module)).toContain('ProfileList');
  });
});

describe('ProfileList - URL Extraction', () => {
  it('should extract host from valid URLs', () => {
    const url1 = new URL(testProfiles[0].baseUrl);
    expect(url1.host).toBe('api.anthropic.com');

    const url2 = new URL(testProfiles[1].baseUrl);
    expect(url2.host).toBe('dev-api.example.com');
  });

  it('should handle URLs with paths', () => {
    const url = new URL('https://api.example.com/v1/messages');
    expect(url.host).toBe('api.example.com');
    expect(url.pathname).toBe('/v1/messages');
  });

  it('should handle URLs with ports', () => {
    const url = new URL('https://localhost:8080/api');
    expect(url.host).toBe('localhost:8080');
  });
});

describe('ProfileList - Active Profile Logic', () => {
  it('should identify active profile correctly', () => {
    const activeProfileId = 'profile-1';
    const activeProfile = testProfiles.find(p => p.id === activeProfileId);
    expect(activeProfile?.id).toBe('profile-1');
    expect(activeProfile?.name).toBe('Production API');
  });

  it('should return undefined for non-matching profile', () => {
    const activeProfileId = 'non-existent';
    const activeProfile = testProfiles.find(p => p.id === activeProfileId);
    expect(activeProfile).toBeUndefined();
  });

  it('should handle null active profile ID', () => {
    const activeProfileId = null;
    const activeProfile = testProfiles.find(p => p.id === activeProfileId);
    expect(activeProfile).toBeUndefined();
  });
});
