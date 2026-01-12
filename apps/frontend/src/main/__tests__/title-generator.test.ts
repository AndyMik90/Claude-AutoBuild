/**
 * Unit tests for TitleGenerator
 * Tests API profile authentication and rate limit detection logic
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock setup - define reusable mock functions
const mockLoadProfilesFile = vi.fn();

// Mock dependencies before importing
vi.mock('../services/profile/profile-manager', () => ({
  loadProfilesFile: () => mockLoadProfilesFile()
}));

vi.mock('../claude-profile-manager', () => ({
  getClaudeProfileManager: vi.fn(() => ({
    getActiveProfile: vi.fn(() => ({
      id: 'test-profile-id',
      name: 'Test Profile',
      isDefault: true
    })),
    getProfile: vi.fn((id: string) => ({
      id,
      name: 'Test Profile',
      isDefault: true
    })),
    getBestAvailableProfile: vi.fn(() => null),
    recordRateLimitEvent: vi.fn()
  }))
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) }
    }))
  };
});

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/test/path'),
    getPath: vi.fn(() => '/test/user-data')
  }
}));

vi.mock('../python-detector', () => ({
  parsePythonCommand: vi.fn(() => ['python', []]),
  getValidatedPythonPath: vi.fn((path: string) => path)
}));

vi.mock('../python-env-manager', () => ({
  getConfiguredPythonPath: vi.fn(() => 'python')
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '')
}));

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('TitleGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default behavior
    mockLoadProfilesFile.mockResolvedValue({
      profiles: [],
      activeProfileId: null,
      version: 1
    });
  });

  afterEach(() => {
    // Reset environment variables
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  });

  describe('getActiveAPIProfile', () => {
    it('should return null when no active profile is set', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [],
        activeProfileId: null,
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      // Access the private method via prototype
      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<unknown> }).getActiveAPIProfile();
      expect(result).toBeNull();
    });

    it('should return null when activeProfileId is empty string', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [],
        activeProfileId: '',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<unknown> }).getActiveAPIProfile();
      expect(result).toBeNull();
    });

    it('should return null when profile is not found', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [
          { id: 'other-profile', name: 'Other', apiKey: 'key', baseUrl: 'url' }
        ],
        activeProfileId: 'missing-profile',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<unknown> }).getActiveAPIProfile();
      expect(result).toBeNull();
    });

    it('should return null when profile has no API key', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [
          { id: 'test-profile', name: 'Test', apiKey: '', baseUrl: 'url' }
        ],
        activeProfileId: 'test-profile',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<unknown> }).getActiveAPIProfile();
      expect(result).toBeNull();
    });

    it('should return profile config when active profile exists with API key', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [
          {
            id: 'test-profile',
            name: 'Test Profile',
            apiKey: 'test-api-key',
            baseUrl: 'https://custom.api.com',
            models: { haiku: 'claude-haiku-custom' }
          }
        ],
        activeProfileId: 'test-profile',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<{ apiKey: string; baseUrl: string; haikuModel: string } | null> }).getActiveAPIProfile();
      
      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe('test-api-key');
      expect(result?.baseUrl).toBe('https://custom.api.com');
      expect(result?.haikuModel).toBe('claude-haiku-custom');
    });

    it('should use default base URL when profile has no baseUrl', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [
          {
            id: 'test-profile',
            name: 'Test Profile',
            apiKey: 'test-api-key',
            baseUrl: '',
            models: { haiku: 'claude-haiku-custom' }
          }
        ],
        activeProfileId: 'test-profile',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<{ apiKey: string; baseUrl: string; haikuModel: string } | null> }).getActiveAPIProfile();
      
      expect(result).not.toBeNull();
      expect(result?.baseUrl).toBe('https://api.anthropic.com');
    });

    it('should use default haiku model when profile has no haiku model', async () => {
      mockLoadProfilesFile.mockResolvedValue({
        profiles: [
          {
            id: 'test-profile',
            name: 'Test Profile',
            apiKey: 'test-api-key',
            baseUrl: 'https://api.anthropic.com',
            models: {}
          }
        ],
        activeProfileId: 'test-profile',
        version: 1
      });

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<{ apiKey: string; baseUrl: string; haikuModel: string } | null> }).getActiveAPIProfile();
      
      expect(result).not.toBeNull();
      // Should use default haiku model from MODEL_ID_MAP
      expect(result?.haikuModel).toBeDefined();
    });

    it('should return null on file load error', async () => {
      mockLoadProfilesFile.mockRejectedValue(new Error('File read error'));

      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const result = await (generator as unknown as { getActiveAPIProfile: () => Promise<unknown> }).getActiveAPIProfile();
      expect(result).toBeNull();
    });
  });

  describe('cleanTitle', () => {
    it('should remove quotes from title', async () => {
      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const cleanTitle = (generator as unknown as { cleanTitle: (title: string) => string }).cleanTitle;
      
      expect(cleanTitle.call(generator, '"Hello World"')).toBe('Hello World');
      expect(cleanTitle.call(generator, "'Hello World'")).toBe('Hello World');
    });

    it('should remove title prefixes', async () => {
      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const cleanTitle = (generator as unknown as { cleanTitle: (title: string) => string }).cleanTitle;
      
      expect(cleanTitle.call(generator, 'Title: Add Feature')).toBe('Add Feature');
      expect(cleanTitle.call(generator, 'Task: Fix Bug')).toBe('Fix Bug');
    });

    it('should capitalize first letter', async () => {
      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const cleanTitle = (generator as unknown as { cleanTitle: (title: string) => string }).cleanTitle;
      
      expect(cleanTitle.call(generator, 'add feature')).toBe('Add feature');
    });

    it('should truncate long titles', async () => {
      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const cleanTitle = (generator as unknown as { cleanTitle: (title: string) => string }).cleanTitle;
      
      const longTitle = 'A'.repeat(150);
      const result = cleanTitle.call(generator, longTitle);
      
      expect(result.length).toBe(100);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('createTitlePrompt', () => {
    it('should create prompt with description', async () => {
      const { TitleGenerator } = await import('../title-generator');
      const generator = new TitleGenerator();

      const createPrompt = (generator as unknown as { createTitlePrompt: (desc: string) => string }).createTitlePrompt;
      
      const prompt = createPrompt.call(generator, 'Add user authentication');
      
      expect(prompt).toContain('Add user authentication');
      expect(prompt).toContain('3-7 words');
      expect(prompt).toContain('Title:');
    });
  });
});
