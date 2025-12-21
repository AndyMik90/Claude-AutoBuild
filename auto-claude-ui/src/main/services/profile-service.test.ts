/**
 * Tests for profile-service.ts
 *
 * Red phase - write failing tests first
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateBaseUrl,
  validateApiKey,
  validateProfileNameUnique,
  createProfile
} from './profile-service';
import type { APIProfile, ProfilesFile } from '../../shared/types/profile';

// Mock profile-manager
vi.mock('../utils/profile-manager', () => ({
  loadProfilesFile: vi.fn(),
  saveProfilesFile: vi.fn(),
  generateProfileId: vi.fn(() => 'mock-uuid-1234')
}));

describe('profile-service', () => {
  describe('validateBaseUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(validateBaseUrl('https://api.anthropic.com')).toBe(true);
      expect(validateBaseUrl('https://custom-api.example.com')).toBe(true);
      expect(validateBaseUrl('https://api.example.com/v1')).toBe(true);
    });

    it('should accept valid HTTP URLs', () => {
      expect(validateBaseUrl('http://localhost:8080')).toBe(true);
      expect(validateBaseUrl('http://127.0.0.1:8000')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateBaseUrl('not-a-url')).toBe(false);
      expect(validateBaseUrl('ftp://example.com')).toBe(false);
      expect(validateBaseUrl('')).toBe(false);
      expect(validateBaseUrl('https://')).toBe(false);
    });

    it('should reject URLs without valid format', () => {
      expect(validateBaseUrl('anthropic.com')).toBe(false);
      expect(validateBaseUrl('://api.anthropic.com')).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    it('should accept Anthropic API key format (sk-ant-...)', () => {
      expect(validateApiKey('sk-ant-api03-12345')).toBe(true);
      expect(validateApiKey('sk-ant-test-key')).toBe(true);
    });

    it('should accept OpenAI API key format (sk-...)', () => {
      expect(validateApiKey('sk-proj-12345')).toBe(true);
      expect(validateApiKey('sk-test-key-12345')).toBe(true);
    });

    it('should accept custom API keys with reasonable length', () => {
      expect(validateApiKey('custom-key-12345678')).toBe(true);
      expect(validateApiKey('x-api-key-abcdefghij')).toBe(true);
    });

    it('should reject empty or too short keys', () => {
      expect(validateApiKey('')).toBe(false);
      expect(validateApiKey('sk-')).toBe(false);
      expect(validateApiKey('abc')).toBe(false);
    });

    it('should reject keys with only whitespace', () => {
      expect(validateApiKey('   ')).toBe(false);
      expect(validateApiKey('\t\n')).toBe(false);
    });
  });

  describe('validateProfileNameUnique', () => {
    it('should return true when name is unique', async () => {
      const mockFile: ProfilesFile = {
        profiles: [
          {
            id: '1',
            name: 'Existing Profile',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-test',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const result = await validateProfileNameUnique('New Profile');
      expect(result).toBe(true);
    });

    it('should return false when name already exists', async () => {
      const mockFile: ProfilesFile = {
        profiles: [
          {
            id: '1',
            name: 'Existing Profile',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-test',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const result = await validateProfileNameUnique('Existing Profile');
      expect(result).toBe(false);
    });

    it('should be case-insensitive for duplicate detection', async () => {
      const mockFile: ProfilesFile = {
        profiles: [
          {
            id: '1',
            name: 'My Profile',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-test',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const result1 = await validateProfileNameUnique('my profile');
      const result2 = await validateProfileNameUnique('MY PROFILE');
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should trim whitespace before checking', async () => {
      const mockFile: ProfilesFile = {
        profiles: [
          {
            id: '1',
            name: 'My Profile',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-test',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const result = await validateProfileNameUnique('  My Profile  ');
      expect(result).toBe(false);
    });
  });

  describe('createProfile', () => {
    it('should create profile with valid data and save', async () => {
      const mockFile: ProfilesFile = {
        profiles: [],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile, saveProfilesFile, generateProfileId } =
        await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);
      vi.mocked(saveProfilesFile).mockResolvedValue(undefined);
      vi.mocked(generateProfileId).mockReturnValue('generated-id-123');

      const input = {
        name: 'Test Profile',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test-key',
        models: {
          default: 'claude-3-5-sonnet-20241022'
        }
      };

      const result = await createProfile(input);

      expect(result).toMatchObject({
        id: 'generated-id-123',
        name: 'Test Profile',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test-key',
        models: {
          default: 'claude-3-5-sonnet-20241022'
        }
      });
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
      expect(saveProfilesFile).toHaveBeenCalled();
    });

    it('should throw error for invalid base URL', async () => {
      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue({
        profiles: [],
        activeProfileId: null,
        version: 1
      });

      const input = {
        name: 'Test Profile',
        baseUrl: 'not-a-url',
        apiKey: 'sk-ant-test-key'
      };

      await expect(createProfile(input)).rejects.toThrow('Invalid base URL');
    });

    it('should throw error for invalid API key', async () => {
      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue({
        profiles: [],
        activeProfileId: null,
        version: 1
      });

      const input = {
        name: 'Test Profile',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'too-short'
      };

      await expect(createProfile(input)).rejects.toThrow('Invalid API key');
    });

    it('should throw error for duplicate profile name', async () => {
      const mockFile: ProfilesFile = {
        profiles: [
          {
            id: '1',
            name: 'Existing Profile',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-test',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ],
        activeProfileId: null,
        version: 1
      };

      const { loadProfilesFile } = await import('../utils/profile-manager');
      vi.mocked(loadProfilesFile).mockResolvedValue(mockFile);

      const input = {
        name: 'Existing Profile',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test-key'
      };

      await expect(createProfile(input)).rejects.toThrow(
        'A profile with this name already exists'
      );
    });
  });
});
