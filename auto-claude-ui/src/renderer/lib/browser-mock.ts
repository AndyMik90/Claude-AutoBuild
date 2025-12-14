/**
 * Browser mock for window.electronAPI
 * This allows the app to run in a regular browser for UI development/testing
 */

import type { ElectronAPI } from '../../shared/types';
import { DEFAULT_APP_SETTINGS, DEFAULT_PROJECT_SETTINGS } from '../../shared/constants';

// Check if we're in a browser (not Electron)
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

// Sample mock data for UI preview
const mockProjects = [
  {
    id: 'mock-project-1',
    name: 'sample-project',
    path: '/Users/demo/projects/sample-project',
    autoBuildPath: '/Users/demo/projects/sample-project/auto-claude',
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: 'mock-project-2',
    name: 'another-project',
    path: '/Users/demo/projects/another-project',
    autoBuildPath: '/Users/demo/projects/another-project/auto-claude',
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Mock insights sessions for browser preview
const mockInsightsSessions = [
  {
    id: 'session-1',
    projectId: 'mock-project-1',
    title: 'Architecture discussion',
    messageCount: 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 30)
  },
  {
    id: 'session-2',
    projectId: 'mock-project-1',
    title: 'Code review suggestions',
    messageCount: 12,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2)
  },
  {
    id: 'session-3',
    projectId: 'mock-project-1',
    title: 'Security analysis',
    messageCount: 8,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24)
  },
  {
    id: 'session-4',
    projectId: 'mock-project-1',
    title: 'Performance optimization',
    messageCount: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3)
  }
];

const mockTasks = [
  {
    id: 'task-1',
    projectId: 'mock-project-1',
    specId: '001-add-auth',
    title: 'Add user authentication',
    description: 'Implement JWT-based user authentication with login/logout functionality',
    status: 'backlog' as const,
    subtasks: [],
    logs: [],
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000)
  },
  {
    id: 'task-2',
    projectId: 'mock-project-1',
    specId: '002-dashboard',
    title: 'Build analytics dashboard',
    description: 'Create a real-time analytics dashboard with charts and metrics',
    status: 'in_progress' as const,
    subtasks: [
      { id: 'subtask-1', title: 'Setup chart library', description: 'Install and configure Chart.js', status: 'completed' as const, files: ['src/lib/charts.ts'] },
      { id: 'subtask-2', title: 'Create dashboard layout', description: 'Build responsive grid layout', status: 'in_progress' as const, files: ['src/components/Dashboard.tsx'] },
      { id: 'subtask-3', title: 'Add data fetching', description: 'Implement API calls for metrics', status: 'pending' as const, files: [] }
    ],
    logs: ['[INFO] Starting task...', '[INFO] Subtask 1 completed', '[INFO] Working on subtask 2...'],
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date()
  },
  {
    id: 'task-3',
    projectId: 'mock-project-1',
    specId: '003-fix-bug',
    title: 'Fix pagination bug',
    description: 'Fix off-by-one error in table pagination',
    status: 'human_review' as const,
    subtasks: [
      { id: 'subtask-1', title: 'Fix pagination logic', description: 'Correct the offset calculation', status: 'completed' as const, files: ['src/utils/pagination.ts'] }
    ],
    logs: ['[INFO] Task completed, awaiting review'],
    createdAt: new Date(Date.now() - 7200000),
    updatedAt: new Date(Date.now() - 1800000)
  },
  {
    id: 'task-4',
    projectId: 'mock-project-1',
    specId: '004-refactor',
    title: 'Refactor API layer',
    description: 'Consolidate API calls into a single service',
    status: 'done' as const,
    subtasks: [
      { id: 'subtask-1', title: 'Create API service', description: 'Build centralized API client', status: 'completed' as const, files: ['src/services/api.ts'] },
      { id: 'subtask-2', title: 'Migrate endpoints', description: 'Update all components to use new service', status: 'completed' as const, files: ['src/components/*.tsx'] }
    ],
    logs: ['[INFO] Task completed successfully'],
    createdAt: new Date(Date.now() - 172800000),
    updatedAt: new Date(Date.now() - 86400000)
  }
];

// Create mock electronAPI for browser
const browserMockAPI: ElectronAPI = {
  // Project Operations
  addProject: async (projectPath: string) => ({
    success: true,
    data: {
      id: `mock-${Date.now()}`,
      name: projectPath.split('/').pop() || 'new-project',
      path: projectPath,
      autoBuildPath: `${projectPath}/auto-claude`,
      settings: DEFAULT_PROJECT_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  removeProject: async () => ({ success: true }),

  getProjects: async () => ({
    success: true,
    data: mockProjects
  }),

  updateProjectSettings: async () => ({ success: true }),

  initializeProject: async () => ({
    success: true,
    data: { success: true, version: '1.0.0', wasUpdate: false }
  }),

  updateProjectAutoBuild: async () => ({
    success: true,
    data: { success: true, version: '1.0.0', wasUpdate: true }
  }),

  checkProjectVersion: async () => ({
    success: true,
    data: {
      isInitialized: true,
      currentVersion: '1.0.0',
      sourceVersion: '1.0.0',
      updateAvailable: false
    }
  }),

  // Task Operations
  getTasks: async (projectId: string) => ({
    success: true,
    data: mockTasks.filter(t => t.projectId === projectId)
  }),

  createTask: async (projectId: string, title: string, description: string) => ({
    success: true,
    data: {
      id: `task-${Date.now()}`,
      projectId,
      specId: `00${mockTasks.length + 1}-new-task`,
      title,
      description,
      status: 'backlog' as const,
      subtasks: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  startTask: () => {
    console.log('[Browser Mock] startTask called');
  },

  stopTask: () => {
    console.log('[Browser Mock] stopTask called');
  },

  submitReview: async () => ({ success: true }),

  // Event Listeners (no-op in browser)
  onTaskProgress: () => () => {},
  onTaskError: () => () => {},
  onTaskLog: () => () => {},
  onTaskStatusChange: () => () => {},

  // Terminal Operations (browser mock)
  createTerminal: async () => {
    console.log('[Browser Mock] createTerminal called');
    return { success: true };
  },

  destroyTerminal: async () => {
    console.log('[Browser Mock] destroyTerminal called');
    return { success: true };
  },

  sendTerminalInput: () => {
    console.log('[Browser Mock] sendTerminalInput called');
  },

  resizeTerminal: () => {
    console.log('[Browser Mock] resizeTerminal called');
  },

  invokeClaudeInTerminal: () => {
    console.log('[Browser Mock] invokeClaudeInTerminal called');
  },

  // Terminal Event Listeners (no-op in browser)
  onTerminalOutput: () => () => {},
  onTerminalExit: () => () => {},
  onTerminalTitleChange: () => () => {},

  // Settings
  getSettings: async () => ({
    success: true,
    data: DEFAULT_APP_SETTINGS
  }),

  saveSettings: async () => ({ success: true }),

  // Dialog (mock with prompt)
  selectDirectory: async () => {
    return prompt('Enter project path (browser mock):', '/Users/demo/projects/new-project');
  },

  // App Info
  getAppVersion: async () => '0.1.0-browser',

  // Roadmap Operations
  getRoadmap: async () => ({
    success: true,
    data: null
  }),

  generateRoadmap: () => {
    console.log('[Browser Mock] generateRoadmap called');
  },

  refreshRoadmap: () => {
    console.log('[Browser Mock] refreshRoadmap called');
  },

  updateFeatureStatus: async () => ({ success: true }),

  convertFeatureToSpec: async (projectId: string, featureId: string) => ({
    success: true,
    data: {
      id: `task-${Date.now()}`,
      specId: '',
      projectId,
      title: 'Converted Feature',
      description: 'Feature converted from roadmap',
      status: 'backlog' as const,
      subtasks: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  // Roadmap Event Listeners
  onRoadmapProgress: () => () => {},
  onRoadmapComplete: () => () => {},
  onRoadmapError: () => () => {},

  // Context Operations
  getProjectContext: async () => ({
    success: true,
    data: {
      projectIndex: null,
      memoryStatus: null,
      memoryState: null,
      recentMemories: [],
      isLoading: false
    }
  }),

  refreshProjectIndex: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  getMemoryStatus: async () => ({
    success: true,
    data: {
      enabled: false,
      available: false,
      reason: 'Browser mock environment'
    }
  }),

  searchMemories: async () => ({
    success: true,
    data: []
  }),

  getRecentMemories: async () => ({
    success: true,
    data: []
  }),

  // Environment Configuration Operations
  getProjectEnv: async () => ({
    success: true,
    data: {
      claudeAuthStatus: 'not_configured' as const,
      linearEnabled: false,
      githubEnabled: false,
      graphitiEnabled: false,
      enableFancyUi: true
    }
  }),

  updateProjectEnv: async () => ({
    success: true
  }),

  // Linear Integration Operations (browser mock)
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

  // GitHub Integration Operations (browser mock)
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
    console.log('[Browser Mock] investigateGitHubIssue called');
  },

  importGitHubIssues: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  onGitHubInvestigationProgress: () => () => {},
  onGitHubInvestigationComplete: () => () => {},
  onGitHubInvestigationError: () => () => {},

  // Ideation Operations (browser mock)
  getIdeation: async () => ({
    success: true,
    data: null
  }),

  generateIdeation: () => {
    console.log('[Browser Mock] generateIdeation called');
  },

  refreshIdeation: () => {
    console.log('[Browser Mock] refreshIdeation called');
  },

  updateIdeaStatus: async () => ({ success: true }),

  convertIdeaToTask: async () => ({
    success: false,
    error: 'Not available in browser mock'
  }),

  dismissIdea: async () => ({ success: true }),

  onIdeationProgress: () => () => {},
  onIdeationLog: () => () => {},
  onIdeationComplete: () => () => {},
  onIdeationError: () => () => {},

  // Auto-Build Source Update Operations (browser mock)
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
    console.log('[Browser Mock] downloadAutoBuildSourceUpdate called');
  },

  getAutoBuildSourceVersion: async () => ({
    success: true,
    data: '1.0.0'
  }),

  onAutoBuildSourceUpdateProgress: () => () => {},

  // Auto-Build Source Environment Operations (browser mock)
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

  // Changelog Operations (browser mock)
  getChangelogDoneTasks: async (_projectId: string, tasks?: import('../../shared/types').Task[]) => ({
    success: true,
    data: (tasks || mockTasks)
      .filter(t => t.status === 'done')
      .map(t => ({
        id: t.id,
        specId: t.specId,
        title: t.title,
        description: t.description,
        completedAt: t.updatedAt,
        hasSpecs: true
      }))
  }),

  loadTaskSpecs: async () => ({
    success: true,
    data: []
  }),

  generateChangelog: () => {
    console.log('[Browser Mock] generateChangelog called');
  },

  saveChangelog: async () => ({
    success: true,
    data: {
      filePath: 'CHANGELOG.md',
      bytesWritten: 1024
    }
  }),

  readExistingChangelog: async () => ({
    success: true,
    data: {
      exists: false
    }
  }),

  onChangelogGenerationProgress: () => () => {},
  onChangelogGenerationComplete: () => () => {},
  onChangelogGenerationError: () => () => {},

  // GitHub Release Operations (browser mock)
  getReleaseableVersions: async () => ({
    success: true,
    data: [
      {
        version: '1.0.0',
        tagName: 'v1.0.0',
        date: '2025-12-13',
        content: '### Added\n- Initial release\n- User authentication\n- Dashboard',
        taskSpecIds: ['001-auth', '002-dashboard'],
        isReleased: false
      },
      {
        version: '0.9.0',
        tagName: 'v0.9.0',
        date: '2025-12-01',
        content: '### Added\n- Beta features',
        taskSpecIds: [],
        isReleased: true,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v0.9.0'
      }
    ]
  }),

  runReleasePreflightCheck: async (_projectId: string, version: string) => ({
    success: true,
    data: {
      canRelease: true,
      checks: {
        gitClean: { passed: true, message: 'Working directory is clean' },
        commitsPushed: { passed: true, message: 'All commits pushed to remote' },
        tagAvailable: { passed: true, message: `Tag v${version} is available` },
        githubConnected: { passed: true, message: 'GitHub CLI authenticated' },
        worktreesMerged: { passed: true, message: 'All features in this release are merged', unmergedWorktrees: [] }
      },
      blockers: []
    }
  }),

  createRelease: () => {
    console.log('[Browser Mock] createRelease called');
  },

  onReleaseProgress: () => () => {},
  onReleaseComplete: () => () => {},
  onReleaseError: () => () => {},

  // Insights Operations (browser mock)
  getInsightsSession: async () => ({
    success: true,
    data: mockInsightsSessions.length > 0 ? {
      id: mockInsightsSessions[0].id,
      projectId: mockInsightsSessions[0].projectId,
      messages: [],
      createdAt: mockInsightsSessions[0].createdAt,
      updatedAt: mockInsightsSessions[0].updatedAt
    } : null
  }),

  listInsightsSessions: async () => ({
    success: true,
    data: mockInsightsSessions
  }),

  newInsightsSession: async (projectId: string) => {
    const newSession = {
      id: `session-${Date.now()}`,
      projectId,
      title: 'New conversation',
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockInsightsSessions.unshift(newSession);
    return {
      success: true,
      data: {
        id: newSession.id,
        projectId: newSession.projectId,
        messages: [],
        createdAt: newSession.createdAt,
        updatedAt: newSession.updatedAt
      }
    };
  },

  switchInsightsSession: async (_projectId: string, sessionId: string) => {
    const session = mockInsightsSessions.find(s => s.id === sessionId);
    if (session) {
      return {
        success: true,
        data: {
          id: session.id,
          projectId: session.projectId,
          messages: [],
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }
      };
    }
    return { success: false, error: 'Session not found' };
  },

  deleteInsightsSession: async (_projectId: string, sessionId: string) => {
    const index = mockInsightsSessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      mockInsightsSessions.splice(index, 1);
      console.log('[Browser Mock] Session deleted:', sessionId);
    }
    return { success: true };
  },

  renameInsightsSession: async (_projectId: string, sessionId: string, newTitle: string) => {
    const session = mockInsightsSessions.find(s => s.id === sessionId);
    if (session) {
      session.title = newTitle;
      console.log('[Browser Mock] Session renamed:', sessionId, 'to', newTitle);
    }
    return { success: true };
  },

  sendInsightsMessage: () => {
    console.log('[Browser Mock] sendInsightsMessage called');
  },

  clearInsightsSession: async () => ({ success: true }),

  createTaskFromInsights: async (_projectId: string, title: string, description: string) => ({
    success: true,
    data: {
      id: `task-${Date.now()}`,
      projectId: _projectId,
      specId: `00${mockTasks.length + 1}-insights-task`,
      title,
      description,
      status: 'backlog' as const,
      subtasks: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  onInsightsStreamChunk: () => () => {},
  onInsightsStatus: () => () => {},
  onInsightsError: () => () => {},

  // Task Status Operations (browser mock)
  updateTaskStatus: async () => ({ success: true }),
  recoverStuckTask: async (taskId: string, targetStatus = 'backlog') => ({
    success: true,
    data: {
      taskId,
      recovered: true,
      newStatus: targetStatus as 'backlog',
      message: '[Browser Mock] Task recovered successfully'
    }
  }),
  checkTaskRunning: async () => ({ success: true, data: false }),
  onTaskExecutionProgress: () => () => {},

  // Ideation Event Listeners (browser mock)
  onIdeationTypeComplete: () => () => {},
  onIdeationTypeFailed: () => () => {}
};

/**
 * Initialize browser mock if not running in Electron
 */
export function initBrowserMock(): void {
  if (!isElectron) {
    console.log('%c[Browser Mock] Initializing mock electronAPI for browser preview', 'color: #f0ad4e; font-weight: bold;');
    (window as Window & { electronAPI: ElectronAPI }).electronAPI = browserMockAPI;
  }
}

// Auto-initialize
initBrowserMock();

