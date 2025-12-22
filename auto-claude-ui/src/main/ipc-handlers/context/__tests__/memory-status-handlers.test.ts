/**
 * Integration tests for Memory Status Handlers
 * Tests provider-aware credential validation (Bug D fix)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';

// Test directories
const TEST_DIR = '/tmp/memory-status-test';
const USER_DATA_PATH = path.join(TEST_DIR, 'userData');
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const AUTO_BUILD_PATH = '.auto-claude';

// Mock Electron before importing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return USER_DATA_PATH;
      return TEST_DIR;
    })
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(USER_DATA_PATH, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, AUTO_BUILD_PATH), { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Write .env file with given content
function writeEnvFile(content: string): void {
  const envPath = path.join(TEST_PROJECT_PATH, AUTO_BUILD_PATH, '.env');
  writeFileSync(envPath, content);
}

// Write settings.json for global settings
function writeGlobalSettings(settings: Record<string, unknown>): void {
  const settingsPath = path.join(USER_DATA_PATH, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings));
}

describe('Memory Status Handlers', () => {
  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.resetModules();
    // Clear any cached env vars
    delete process.env.GRAPHITI_ENABLED;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GRAPHITI_LLM_PROVIDER;
    delete process.env.GRAPHITI_EMBEDDER_PROVIDER;
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('buildMemoryStatus - Google Provider Flow (subtask-5-1)', () => {
    it('should return available:true for Google provider with GOOGLE_API_KEY set', async () => {
      // Arrange: Configure Google as LLM provider with API key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=google
GOOGLE_API_KEY=test-google-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:false with correct error when GOOGLE_API_KEY is missing', async () => {
      // Arrange: Configure Google as LLM provider WITHOUT API key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=google
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('GOOGLE_API_KEY');
      expect(status.reason).toContain('google');
      // Verify it does NOT say OPENAI_API_KEY (the bug we fixed)
      expect(status.reason).not.toContain('OPENAI_API_KEY');
    });

    it('should support mixed providers: Google LLM + OpenAI embeddings', async () => {
      // Arrange: Google for LLM, OpenAI for embeddings - need both keys
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=openai
GOOGLE_API_KEY=test-google-api-key
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should fail when mixed providers and one key is missing', async () => {
      // Arrange: Google for LLM, OpenAI for embeddings - missing OpenAI key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=openai
GOOGLE_API_KEY=test-google-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('OPENAI_API_KEY');
      expect(status.reason).toContain('openai');
    });

    it('should default to OpenAI when no provider specified (backward compatibility)', async () => {
      // Arrange: Graphiti enabled but no provider specified
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should work with OpenAI key (backward compatibility)
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should use global OpenAI key when available', async () => {
      // Arrange: Graphiti enabled with global OpenAI key
      writeEnvFile(`
GRAPHITI_ENABLED=true
      `.trim());

      writeGlobalSettings({
        globalOpenAIApiKey: 'global-openai-key'
      });

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });
  });

  describe('buildMemoryStatus - Ollama Provider (no API key required)', () => {
    it('should return available:true for Ollama without any API key', async () => {
      // Arrange: Ollama doesn't require an API key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });
  });

  describe('buildMemoryStatus - Anthropic Provider', () => {
    it('should return available:true for Anthropic with ANTHROPIC_API_KEY set', async () => {
      // Arrange
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
ANTHROPIC_API_KEY=test-anthropic-key
OPENAI_API_KEY=test-openai-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });
  });
});
