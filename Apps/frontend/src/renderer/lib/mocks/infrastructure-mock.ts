/**
 * Mock implementation for infrastructure and system operations
 * Updated for LadybugDB (embedded database, no Docker required)
 */

export const infrastructureMock = {
  // Memory Infrastructure Operations (LadybugDB)
  getMemoryInfrastructureStatus: async () => ({
    success: true,
    data: {
      memory: {
        kuzuInstalled: true,
        databasePath: '~/.auto-claude/graphs',
        databaseExists: true,
        databases: ['auto_claude_memory']
      },
      ready: true
    }
  }),

  listMemoryDatabases: async () => ({
    success: true,
    data: ['auto_claude_memory', 'project_memory']
  }),

  testMemoryConnection: async () => ({
    success: true,
    data: {
      success: true,
      message: 'Connected to LadybugDB database (mock)',
      details: { latencyMs: 5 }
    }
  }),

  // LLM API Validation Operations
  validateLLMApiKey: async () => ({
    success: true,
    data: {
      success: true,
      message: 'API key is valid (mock)',
      details: { provider: 'openai', latencyMs: 100 }
    }
  }),

  testGraphitiConnection: async () => ({
    success: true,
    data: {
      database: {
        success: true,
        message: 'Connected to LadybugDB database (mock)',
        details: { latencyMs: 5 }
      },
      llmProvider: {
        success: true,
        message: 'LLM API key is valid (mock)',
        details: { provider: 'openai', latencyMs: 100 }
      },
      ready: true
    }
  }),

  // Ollama Model Detection Operations
  checkOllamaStatus: async () => ({
    success: true,
    data: {
      running: true,
      url: 'http://localhost:11434',
      version: '0.1.0',
    }
  }),

  listOllamaModels: async () => ({
    success: true,
    data: {
      models: [
        { name: 'llama2', size_bytes: 4000000000, size_gb: 3.73, modified_at: '2024-01-01', is_embedding: false },
        { name: 'nomic-embed-text', size_bytes: 500000000, size_gb: 0.47, modified_at: '2024-01-01', is_embedding: true, embedding_dim: 768, description: 'Nomic AI text embeddings' },
      ],
      count: 2
    }
  }),

  listOllamaEmbeddingModels: async () => ({
    success: true,
    data: {
      embedding_models: [
        { name: 'nomic-embed-text', embedding_dim: 768, description: 'Nomic AI text embeddings', size_bytes: 500000000, size_gb: 0.47 },
      ],
      count: 1
    }
  }),

  pullOllamaModel: async (modelName: string) => ({
    success: true,
    data: {
      model: modelName,
      status: 'completed' as const,
      output: [`Pulling ${modelName}...`, 'Pull complete']
    }
  }),

  // Ideation Operations
  getIdeation: async () => ({
    success: true,
    data: null
  }),

  generateIdeation: () => {
    console.warn('[Browser Mock] generateIdeation called');
  },

  refreshIdeation: () => {
    console.warn('[Browser Mock] refreshIdeation called');
  },

  stopIdeation: async () => ({ success: true }),

  updateIdeaStatus: async () => ({ success: true }),

  convertIdeaToTask: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  dismissIdea: async () => ({ success: true }),

  dismissAllIdeas: async () => ({ success: true }),

  archiveIdea: async () => ({ success: true }),

  deleteIdea: async () => ({ success: true }),

  deleteMultipleIdeas: async () => ({ success: true }),

  onIdeationProgress: () => () => {},
  onIdeationLog: () => () => {},
  onIdeationComplete: () => () => {},
  onIdeationError: () => () => {},
  onIdeationStopped: () => () => {},
  onIdeationTypeComplete: () => () => {},
  onIdeationTypeFailed: () => () => {},

  // Auto-Build Source Update Operations
  checkAutoBuildSourceUpdate: async () => ({
    success: true,
    data: {
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: '## v1.1.0\n\n- New feature: Enhanced spec creation\n- Bug fix: Improved error handling\n- Performance improvements'
    }
  }),

  downloadAutoBuildSourceUpdate: () => {
    console.warn('[Browser Mock] downloadAutoBuildSourceUpdate called');
  },

  getAutoBuildSourceVersion: async () => ({
    success: true,
    data: '1.0.0'
  }),

  onAutoBuildSourceUpdateProgress: () => () => {},

  // Shell Operations
  openExternal: async (url: string) => {
    console.warn('[Browser Mock] openExternal:', url);
    window.open(url, '_blank');
  }
};
