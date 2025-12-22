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
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
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

  /**
   * Integration tests for subtask-5-4: Ollama Local Configuration
   * Verifies Ollama configuration flow with no API key required
   */
  describe('buildMemoryStatus - Ollama Local Configuration (subtask-5-4)', () => {
    it('should return available:true for Ollama without any API key or base URL', async () => {
      // Arrange: Ollama doesn't require an API key (local deployment)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Ollama local deployment should be available without any credentials
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:true for Ollama with custom base URL (no API key)', async () => {
      // Arrange: Ollama with custom base URL, still no API key required
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
OLLAMA_BASE_URL=http://192.168.1.100:11434
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Custom base URL should still work without API key
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:true for Ollama LLM with any other embedding provider when both credentials satisfied', async () => {
      // Arrange: Ollama LLM (no key needed) + Voyage embeddings (needs key)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=voyage
VOYAGE_API_KEY=test-voyage-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Ollama doesn't need key, Voyage key is present
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:false when Ollama LLM but embedding provider key is missing', async () => {
      // Arrange: Ollama LLM (no key needed) + Voyage embeddings (missing key)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=voyage
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should fail for missing Voyage key, not Ollama
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('VOYAGE_API_KEY');
      expect(status.reason).toContain('voyage');
      // Should NOT mention Ollama since it doesn't need credentials
      expect(status.reason).not.toContain('OLLAMA');
    });

    it('should return available:true for any LLM provider with Ollama embeddings when LLM key is present', async () => {
      // Arrange: Google LLM (needs key) + Ollama embeddings (no key needed)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=ollama
GOOGLE_API_KEY=test-google-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Google key present, Ollama doesn't need key
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:false when using LLM provider that needs key with Ollama embeddings but missing LLM key', async () => {
      // Arrange: Google LLM (missing key) + Ollama embeddings (no key needed)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=ollama
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should fail for missing Google key
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('GOOGLE_API_KEY');
      expect(status.reason).toContain('google');
    });

    it('should return available:true for Groq LLM with Ollama embeddings', async () => {
      // Arrange: Groq LLM + Ollama embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=groq
GRAPHITI_EMBEDDER_PROVIDER=ollama
GROQ_API_KEY=test-groq-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Groq key present, Ollama doesn't need key
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:true with Ollama using default localhost base URL', async () => {
      // Arrange: Ollama without explicit base URL (uses default localhost:11434)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Default localhost:11434 should be used
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
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

  /**
   * Integration tests for subtask-5-2: Mixed Provider Configuration
   * Verifies Anthropic LLM + OpenAI embeddings configuration flow
   */
  describe('buildMemoryStatus - Mixed Provider Configuration (Anthropic LLM + OpenAI embeddings)', () => {
    it('should return available:true when both Anthropic and OpenAI API keys are set', async () => {
      // Arrange: Anthropic for LLM, OpenAI for embeddings - need both keys
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
ANTHROPIC_API_KEY=test-anthropic-api-key
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Both credentials present, should be available
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:false with ANTHROPIC_API_KEY error when only OpenAI key is set', async () => {
      // Arrange: Anthropic for LLM, OpenAI for embeddings - missing Anthropic key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Missing Anthropic key, should fail with specific error
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('ANTHROPIC_API_KEY');
      expect(status.reason).toContain('anthropic');
      // Should NOT mention OpenAI since it's set
      expect(status.reason).not.toContain('OPENAI_API_KEY');
    });

    it('should return available:false with OPENAI_API_KEY error when only Anthropic key is set', async () => {
      // Arrange: Anthropic for LLM, OpenAI for embeddings - missing OpenAI key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
ANTHROPIC_API_KEY=test-anthropic-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Missing OpenAI key for embeddings, should fail with specific error
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('OPENAI_API_KEY');
      expect(status.reason).toContain('openai');
      // Should NOT mention Anthropic since it's set
      expect(status.reason).not.toContain('ANTHROPIC_API_KEY');
    });

    it('should use global OpenAI key for embeddings when project key is missing', async () => {
      // Arrange: Anthropic for LLM with project key, OpenAI for embeddings with global key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
ANTHROPIC_API_KEY=test-anthropic-api-key
      `.trim());

      writeGlobalSettings({
        globalOpenAIApiKey: 'global-openai-key'
      });

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Global OpenAI key should satisfy embedding requirement
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:false when both API keys are missing', async () => {
      // Arrange: Anthropic for LLM, OpenAI for embeddings - both keys missing
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should fail with one of the missing keys
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      // Should mention either ANTHROPIC_API_KEY or OPENAI_API_KEY
      expect(
        status.reason?.includes('ANTHROPIC_API_KEY') ||
        status.reason?.includes('OPENAI_API_KEY')
      ).toBe(true);
    });
  });

  /**
   * Additional mixed provider scenarios for comprehensive coverage
   */
  describe('buildMemoryStatus - Mixed Provider Additional Scenarios', () => {
    it('should return available:true for Anthropic LLM + Voyage embeddings with both keys', async () => {
      // Arrange: Anthropic for LLM, Voyage for embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
ANTHROPIC_API_KEY=test-anthropic-api-key
VOYAGE_API_KEY=test-voyage-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:false for Anthropic + Voyage when missing Voyage key', async () => {
      // Arrange: Anthropic for LLM, Voyage for embeddings - missing Voyage key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
ANTHROPIC_API_KEY=test-anthropic-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('VOYAGE_API_KEY');
      expect(status.reason).toContain('voyage');
    });

    it('should return available:true for Anthropic LLM + Ollama embeddings with only Anthropic key', async () => {
      // Arrange: Anthropic for LLM, Ollama for embeddings (no API key required for Ollama)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=ollama
ANTHROPIC_API_KEY=test-anthropic-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Ollama doesn't need API key, only Anthropic key required
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:true for Ollama LLM + OpenAI embeddings with only OpenAI key', async () => {
      // Arrange: Ollama for LLM (no API key), OpenAI for embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Ollama doesn't need API key, only OpenAI key required for embeddings
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });
  });

  /**
   * Integration tests for subtask-5-3: Azure OpenAI Configuration
   * Verifies Azure OpenAI configuration with all required fields (API Key, Base URL, Deployment names)
   */
  describe('buildMemoryStatus - Azure OpenAI Provider (subtask-5-3)', () => {
    it('should return available:true for Azure OpenAI with AZURE_OPENAI_API_KEY set', async () => {
      // Arrange: Azure OpenAI as both LLM and embedding provider with API key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=azure_openai
AZURE_OPENAI_API_KEY=test-azure-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Azure OpenAI credentials present, should be available
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:false with correct error when AZURE_OPENAI_API_KEY is missing', async () => {
      // Arrange: Azure OpenAI as both LLM and embedding provider WITHOUT API key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=azure_openai
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Missing Azure OpenAI key, should fail with specific error
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('AZURE_OPENAI_API_KEY');
      expect(status.reason).toContain('azure_openai');
      // Verify it's specifically about Azure, not generic OpenAI
      expect(status.reason).toMatch(/AZURE_OPENAI_API_KEY.*azure_openai/);
    });

    it('should return available:true for Azure OpenAI LLM with OpenAI embeddings when both keys set', async () => {
      // Arrange: Azure OpenAI for LLM, OpenAI for embeddings - need both keys
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=openai
AZURE_OPENAI_API_KEY=test-azure-openai-api-key
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Both credentials present, should be available
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should return available:false when Azure OpenAI LLM key is missing but OpenAI embedding key is set', async () => {
      // Arrange: Azure OpenAI for LLM, OpenAI for embeddings - missing Azure key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Missing Azure OpenAI key for LLM
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('AZURE_OPENAI_API_KEY');
      expect(status.reason).toContain('azure_openai');
    });

    it('should return available:true for Anthropic LLM with Azure OpenAI embeddings when both keys set', async () => {
      // Arrange: Anthropic for LLM, Azure OpenAI for embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=azure_openai
ANTHROPIC_API_KEY=test-anthropic-api-key
AZURE_OPENAI_API_KEY=test-azure-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Both credentials present
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:false when Anthropic LLM key is set but Azure OpenAI embedding key is missing', async () => {
      // Arrange: Anthropic for LLM, Azure OpenAI for embeddings - missing Azure key
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=azure_openai
ANTHROPIC_API_KEY=test-anthropic-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Missing Azure OpenAI key for embeddings
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('AZURE_OPENAI_API_KEY');
      expect(status.reason).toContain('azure_openai');
      // Should NOT mention Anthropic since it's set
      expect(status.reason).not.toContain('ANTHROPIC_API_KEY');
    });

    it('should return available:true for Azure OpenAI LLM with Voyage embeddings when both keys set', async () => {
      // Arrange: Azure OpenAI for LLM, Voyage for embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=voyage
AZURE_OPENAI_API_KEY=test-azure-openai-api-key
VOYAGE_API_KEY=test-voyage-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Both credentials present
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return available:true for Azure OpenAI LLM with Ollama embeddings (only Azure key needed)', async () => {
      // Arrange: Azure OpenAI for LLM, Ollama for embeddings (no API key required)
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=ollama
AZURE_OPENAI_API_KEY=test-azure-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Ollama doesn't need key, only Azure key required
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });
  });

  /**
   * Integration tests for subtask-5-5: Backward Compatibility with OpenAI-Only Configurations
   * Verifies that existing OpenAI-only configurations continue to work without regressions
   */
  describe('buildMemoryStatus - Backward Compatibility with OpenAI-Only (subtask-5-5)', () => {
    /**
     * Scenario: Fresh project enables Graphiti, OpenAI should be the default for both LLM and embeddings
     */
    it('should default to OpenAI provider when no explicit LLM provider is set', async () => {
      // Arrange: Fresh project with GRAPHITI_ENABLED but no provider specified
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should work with default OpenAI provider
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should default to OpenAI provider when no explicit embedding provider is set', async () => {
      // Arrange: Fresh project with GRAPHITI_ENABLED and LLM specified but no embedding provider
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should work - embedding defaults to OpenAI
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should work with explicit openai for both providers', async () => {
      // Arrange: Explicit OpenAI for both LLM and embeddings
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Explicit OpenAI configuration works
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should show correct error message when OPENAI_API_KEY is missing (default provider)', async () => {
      // Arrange: Fresh project with GRAPHITI_ENABLED but no OPENAI_API_KEY
      writeEnvFile(`
GRAPHITI_ENABLED=true
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should fail with clear OPENAI_API_KEY error
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('OPENAI_API_KEY');
      expect(status.reason).toContain('openai');
    });

    it('should use global OpenAI key when project-level key is missing (backward compatible)', async () => {
      // Arrange: Fresh project with GRAPHITI_ENABLED and global OpenAI key only
      writeEnvFile(`
GRAPHITI_ENABLED=true
      `.trim());

      writeGlobalSettings({
        globalOpenAIApiKey: 'sk-global-openai-key'
      });

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Global key fallback works
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
    });

    it('should prefer project-level OpenAI key over global key', async () => {
      // Arrange: Both project and global OpenAI keys set
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-project-specific-key
      `.trim());

      writeGlobalSettings({
        globalOpenAIApiKey: 'sk-global-openai-key'
      });

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should be available (using project key)
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should return correct host/port/database for OpenAI-only configuration', async () => {
      // Arrange: OpenAI-only configuration with default connection settings
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Default connection details are returned
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.host).toBe('localhost');
      expect(status.port).toBe(6380);
      expect(status.database).toBe('auto_claude_memory');
    });

    it('should return custom host/port/database when configured with OpenAI', async () => {
      // Arrange: OpenAI configuration with custom FalkorDB settings
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-test-openai-api-key
GRAPHITI_FALKORDB_HOST=custom-host.example.com
GRAPHITI_FALKORDB_PORT=6381
GRAPHITI_DATABASE=custom_memory_db
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Custom connection details are returned
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.host).toBe('custom-host.example.com');
      expect(status.port).toBe(6381);
      expect(status.database).toBe('custom_memory_db');
    });

    it('should handle OpenAI key with special characters correctly', async () => {
      // Arrange: OpenAI key with special characters in .env
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY="sk-proj-ABC123_XYZ789-testkey"
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Key with special chars is handled correctly
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
    });

    it('should not require other provider keys when using OpenAI (no key pollution)', async () => {
      // Arrange: OpenAI-only config should NOT fail if other providers' keys are missing
      writeEnvFile(`
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());
      // Note: No GOOGLE_API_KEY, ANTHROPIC_API_KEY, etc.

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Should work without other provider keys
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      // Should NOT mention any other provider
      expect(status.reason).toBeUndefined();
    });

    it('should return enabled:false when GRAPHITI_ENABLED is not set (even with OpenAI key)', async () => {
      // Arrange: OpenAI key present but Graphiti not enabled
      writeEnvFile(`
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Graphiti is not enabled
      expect(status.enabled).toBe(false);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('not configured');
    });

    it('should return enabled:false when GRAPHITI_ENABLED is false', async () => {
      // Arrange: GRAPHITI_ENABLED explicitly set to false
      writeEnvFile(`
GRAPHITI_ENABLED=false
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Graphiti is disabled
      expect(status.enabled).toBe(false);
      expect(status.available).toBe(false);
    });

    it('should handle empty OPENAI_API_KEY as missing', async () => {
      // Arrange: Empty OPENAI_API_KEY should be treated as missing
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Empty key should fail
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(false);
      expect(status.reason).toContain('OPENAI_API_KEY');
    });

    /**
     * Regression test: Ensure the original hardcoded OpenAI behavior works
     * This was the pre-multi-provider implementation that should still work
     */
    it('should work identically to pre-multi-provider implementation for OpenAI-only', async () => {
      // Arrange: Simulate the original minimal configuration
      writeEnvFile(`
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-test-openai-api-key
      `.trim());

      // Import after mocking
      const { buildMemoryStatus } = await import('../memory-status-handlers');

      // Act
      const status = buildMemoryStatus(TEST_PROJECT_PATH, AUTO_BUILD_PATH);

      // Assert: Original behavior is preserved
      expect(status.enabled).toBe(true);
      expect(status.available).toBe(true);
      expect(status.reason).toBeUndefined();
      // Connection defaults are preserved
      expect(status.host).toBe('localhost');
      expect(status.port).toBe(6380);
    });
  });
});
