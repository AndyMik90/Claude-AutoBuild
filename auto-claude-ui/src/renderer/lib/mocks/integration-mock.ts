/**
 * Mock implementation for environment configuration and integration operations
 */

export const integrationMock = {
  // Environment Configuration Operations
  getProjectEnv: async () => ({
    success: true,
    data: {
      claudeAuthStatus: 'not_configured' as const,
      linearEnabled: false,
      planeEnabled: false,
      githubEnabled: false,
      graphitiEnabled: false,
      enableFancyUi: true
    }
  }),

  updateProjectEnv: async () => ({
    success: true
  }),

  // Auto-Build Source Environment Operations
  getSourceEnv: async () => ({
    success: true,
    data: {
      hasClaudeToken: true,
      envExists: true,
      sourcePath: '/mock/auto-claude'
    }
  }),

  updateSourceEnv: async () => ({
    success: true
  }),

  checkSourceToken: async () => ({
    success: true,
    data: {
      hasToken: true,
      sourcePath: '/mock/auto-claude'
    }
  }),

  // Claude Authentication
  checkClaudeAuth: async () => ({
    success: true,
    data: {
      success: false,
      authenticated: false,
      error: 'Not available in browser mock'
    }
  }),

  invokeClaudeSetup: async () => ({
    success: true,
    data: {
      success: false,
      authenticated: false,
      error: 'Not available in browser mock'
    }
  }),

  // Linear Integration Operations
  getLinearTeams: async () => ({
    success: true,
    data: []
  }),

  getLinearProjects: async () => ({
    success: true,
    data: []
  }),

  getLinearIssues: async () => ({
    success: true,
    data: []
  }),

  importLinearIssues: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  checkLinearConnection: async () => ({
    success: true,
    data: {
      connected: false,
      error: 'Not available in browser mock'
    }
  }),

  // Plane.so Integration Operations
  checkPlaneConnection: async () => ({
    success: true,
    data: {
      connected: false,
      error: 'Not available in browser mock'
    }
  }),

  getPlaneProjects: async () => ({
    success: true,
    data: []
  }),

  getPlaneWorkItems: async () => ({
    success: true,
    data: []
  }),

  getPlaneStates: async () => ({
    success: true,
    data: []
  }),

  getPlaneConfiguredProjects: async () => ({
    success: true,
    data: []
  }),

  copyPlaneConfigFromProject: async (_targetProjectId: string, _sourceProjectId: string) => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  importPlaneWorkItems: async (_projectId: string, _workItemIds: string[], _workspaceSlug: string, _planeProjectId: string, _planeProjectIdentifier: string) => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  // GitHub Integration Operations
  getGitHubRepositories: async () => ({
    success: true,
    data: []
  }),

  getGitHubIssues: async () => ({
    success: true,
    data: []
  }),

  getGitHubIssue: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  checkGitHubConnection: async () => ({
    success: true,
    data: {
      connected: false,
      error: 'Not available in browser mock'
    }
  }),

  investigateGitHubIssue: () => {
    console.warn('[Browser Mock] investigateGitHubIssue called');
  },

  getIssueComments: async () => ({
    success: true,
    data: []
  }),

  importGitHubIssues: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  createGitHubRelease: async () => ({
    success: true,
    data: {
      url: 'https://github.com/example/repo/releases/tag/v1.0.0'
    }
  }),

  onGitHubInvestigationProgress: () => () => {},
  onGitHubInvestigationComplete: () => () => {},
  onGitHubInvestigationError: () => () => {},

  // GitHub OAuth Operations (gh CLI)
  checkGitHubCli: async () => ({
    success: true,
    data: {
      installed: false,
      version: undefined
    }
  }),

  checkGitHubAuth: async () => ({
    success: true,
    data: {
      authenticated: false,
      username: undefined
    }
  }),

  startGitHubAuth: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  getGitHubToken: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  getGitHubUser: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  listGitHubUserRepos: async () => ({
    success: true,
    data: {
      repos: [
        { fullName: 'user/example-repo', description: 'An example repository', isPrivate: false },
        { fullName: 'user/private-repo', description: 'A private repository', isPrivate: true }
      ]
    }
  }),

  detectGitHubRepo: async () => ({
    success: true,
    data: 'user/example-repo'
  }),

  getGitHubBranches: async () => ({
    success: true,
    data: ['main', 'develop', 'feature/example']
  })
};
