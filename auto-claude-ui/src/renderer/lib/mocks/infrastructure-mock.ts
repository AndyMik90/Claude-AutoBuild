/**
 * Mock implementation for infrastructure, Docker, and system operations
 */

export const infrastructureMock = {
  // Docker & Infrastructure Operations
  getInfrastructureStatus: async () => ({
    success: true,
    data: {
      docker: {
        installed: true,
        running: true,
        version: 'Docker version 24.0.0 (mock)'
      },
      falkordb: {
        containerExists: true,
        containerRunning: true,
        containerName: 'auto-claude-falkordb',
        port: 6380,
        healthy: true
      },
      ready: true
    }
  }),

  startFalkorDB: async () => ({
    success: true,
    data: { success: true }
  }),

  stopFalkorDB: async () => ({
    success: true,
    data: { success: true }
  }),

  openDockerDesktop: async () => ({
    success: true,
    data: { success: true }
  }),

  getDockerDownloadUrl: async () => 'https://www.docker.com/products/docker-desktop/',

  // Graphiti Validation Operations
  validateFalkorDBConnection: async () => ({
    success: true,
    data: {
      success: true,
      message: 'Connected to FalkorDB at localhost:6380 (mock)',
      details: { latencyMs: 15 }
    }
  }),

  validateOpenAIApiKey: async () => ({
    success: true,
    data: {
      success: true,
      message: 'OpenAI API key is valid (mock)',
      details: { provider: 'openai', latencyMs: 100 }
    }
  }),

   testGraphitiConnection: async () => ({
     success: true,
     data: {
       falkordb: {
         success: true,
         message: 'Connected to FalkorDB at localhost:6380 (mock)',
         details: { latencyMs: 15 }
       },
       openai: {
         success: true,
         message: 'OpenAI API key is valid (mock)',
         details: { provider: 'openai', latencyMs: 100 }
       },
       ready: true
     }
   }),

   // Ollama Model Management Operations
   scanOllamaModels: async () => ({
     success: true,
     data: {
       models: [
         {
           name: 'llama2',
           size: 3826087936,
           modified_at: '2024-01-15T10:30:00Z',
           digest: 'abc123def456'
         },
         {
           name: 'mistral',
           size: 4069519360,
           modified_at: '2024-01-14T15:45:00Z',
           digest: 'xyz789uvw456'
         },
         {
           name: 'nomic-embed-text',
           size: 274997760,
           modified_at: '2024-01-13T08:20:00Z',
           digest: 'emb123emb456'
         }
       ]
     }
   }),

   downloadOllamaModel: async (_baseUrl: string, _modelName: string) => ({
     success: true,
     data: { message: 'Model downloaded successfully (mock)' }
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
