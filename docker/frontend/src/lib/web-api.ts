/**
 * Web API Adapter
 *
 * This module provides a drop-in replacement for window.electronAPI
 * that translates Electron IPC calls to HTTP REST and WebSocket calls.
 *
 * This allows us to reuse the React frontend from the Electron app
 * without modifications to the components.
 */

import type {
  Project,
  ProjectSettings,
  IPCResult,
  InitializationResult,
  AutoBuildVersionInfo,
  ProjectEnvConfig,
  ClaudeAuthResult,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
  GitStatus,
  Task,
  TaskStatus,
  ImplementationPlan,
  ExecutionProgress,
  WorktreeListItem,
  AppSettings,
  RoadmapGenerationStatus,
  Roadmap,
  TerminalSession,
  TerminalCreateOptions,
} from '../../shared/types';

// Local type aliases for types not in shared/types
type TaskCreatePayload = Partial<Task>;
type Worktree = WorktreeListItem;
type WorktreeAction = 'merge' | 'discard' | 'open';
type Settings = AppSettings;

// API configuration
const API_BASE = '/api';
const WS_BASE = `ws://${window.location.host}/ws`;

// WebSocket connection for real-time events
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const eventListeners = new Map<string, Set<Function>>();

// Get auth token from storage (used by apiCall)
function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.accessToken || null;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Helper to make API calls with authentication
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<IPCResult<T>> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - trigger auth refresh
    if (response.status === 401) {
      // Try to refresh the token
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Retry the request with the new token
        const newToken = getAuthToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
          });
          if (retryResponse.ok) {
            const data = await retryResponse.json();
            return { success: true, data };
          }
        }
      }
      // Token refresh failed, user needs to login again
      return { success: false, error: 'Authentication required' };
    }

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Try to refresh the access token
async function tryRefreshToken(): Promise<boolean> {
  try {
    const stored = localStorage.getItem('auth-storage');
    if (!stored) return false;

    const parsed = JSON.parse(stored);
    const refreshToken = parsed.state?.refreshToken;
    if (!refreshToken) return false;

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      // Update stored tokens
      parsed.state.accessToken = data.access_token;
      parsed.state.refreshToken = data.refresh_token;
      localStorage.setItem('auth-storage', JSON.stringify(parsed));
      return true;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

// WebSocket connection management
function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_BASE);

  ws.onopen = () => {
    console.log('[WebSocket] Connected');
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const { type, ...payload } = message;

      const listeners = eventListeners.get(type);
      if (listeners) {
        listeners.forEach((fn) => {
          try {
            fn(payload);
          } catch (e) {
            console.error(`[WebSocket] Error in listener for ${type}:`, e);
          }
        });
      }
    } catch (e) {
      console.error('[WebSocket] Error parsing message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[WebSocket] Disconnected, reconnecting in 3s...');
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('[WebSocket] Error:', error);
  };
}

// Helper to subscribe to WebSocket events
function subscribeToEvent(eventType: string, callback: Function): () => void {
  if (!eventListeners.has(eventType)) {
    eventListeners.set(eventType, new Set());
  }
  eventListeners.get(eventType)!.add(callback);

  // Return cleanup function
  return () => {
    const listeners = eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  };
}

// Initialize WebSocket connection
connectWebSocket();

// ============================================================================
// Project API
// ============================================================================

const projectAPI = {
  addProject: (projectPath: string): Promise<IPCResult<Project>> =>
    apiCall('/projects', {
      method: 'POST',
      body: JSON.stringify({ path: projectPath }),
    }),

  removeProject: (projectId: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}`, { method: 'DELETE' }),

  getProjects: (): Promise<IPCResult<Project[]>> =>
    apiCall('/projects'),

  updateProjectSettings: (
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  initializeProject: (projectId: string): Promise<IPCResult<InitializationResult>> =>
    apiCall(`/projects/${projectId}/init`, { method: 'POST' }),

  updateProjectAutoBuild: (projectId: string): Promise<IPCResult<InitializationResult>> =>
    apiCall(`/projects/${projectId}/update-autobuild`, { method: 'POST' }),

  checkProjectVersion: (projectId: string): Promise<IPCResult<AutoBuildVersionInfo>> =>
    apiCall(`/projects/${projectId}/version`),

  // Context Operations
  getProjectContext: (projectId: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/context`),

  refreshProjectIndex: (projectId: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/context/refresh`, { method: 'POST' }),

  getMemoryStatus: (projectId: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/memory/status`),

  searchMemories: (projectId: string, query: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/memory/search?q=${encodeURIComponent(query)}`),

  getRecentMemories: (projectId: string, limit?: number): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/memory/recent${limit ? `?limit=${limit}` : ''}`),

  // Environment Configuration
  getProjectEnv: (projectId: string): Promise<IPCResult<ProjectEnvConfig>> =>
    apiCall(`/projects/${projectId}/env`),

  updateProjectEnv: (
    projectId: string,
    config: Partial<ProjectEnvConfig>
  ): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/env`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),

  checkClaudeAuth: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    apiCall(`/projects/${projectId}/auth/check`),

  invokeClaudeSetup: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    apiCall(`/projects/${projectId}/auth/setup`, { method: 'POST' }),

  // Dialog Operations (Web alternatives)
  selectDirectory: async (): Promise<string | null> => {
    // In web, we'll use a different approach - show a modal to enter path
    // or use the File System Access API if available
    console.warn('[Web API] selectDirectory: Use web file picker or manual input');
    return null;
  },

  createProjectFolder: async (
    location: string,
    name: string,
    initGit: boolean
  ): Promise<IPCResult<{ path: string }>> =>
    apiCall('/projects/create-folder', {
      method: 'POST',
      body: JSON.stringify({ location, name, initGit }),
    }),

  getDefaultProjectLocation: async (): Promise<string | null> => {
    const result = await apiCall<{ path: string }>('/settings/default-project-location');
    return result.success ? result.data?.path ?? null : null;
  },

  // Infrastructure Operations (container already has these)
  getInfrastructureStatus: (port?: number): Promise<IPCResult<InfrastructureStatus>> =>
    apiCall(`/infrastructure/status${port ? `?port=${port}` : ''}`),

  startFalkorDB: (port?: number): Promise<IPCResult<{ success: boolean; error?: string }>> =>
    apiCall('/infrastructure/falkordb/start', {
      method: 'POST',
      body: JSON.stringify({ port }),
    }),

  stopFalkorDB: (): Promise<IPCResult<{ success: boolean; error?: string }>> =>
    apiCall('/infrastructure/falkordb/stop', { method: 'POST' }),

  openDockerDesktop: async (): Promise<IPCResult<{ success: boolean; error?: string }>> => {
    // Not applicable in container
    return { success: false, error: 'Not applicable in container environment' };
  },

  getDockerDownloadUrl: async (): Promise<string> => {
    return 'https://www.docker.com/products/docker-desktop/';
  },

  // Graphiti Operations
  validateFalkorDBConnection: (uri: string): Promise<IPCResult<GraphitiValidationResult>> =>
    apiCall('/infrastructure/graphiti/validate-falkordb', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    }),

  validateOpenAIApiKey: (apiKey: string): Promise<IPCResult<GraphitiValidationResult>> =>
    apiCall('/infrastructure/graphiti/validate-openai', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),

  testGraphitiConnection: (
    falkorDbUri: string,
    openAiApiKey: string
  ): Promise<IPCResult<GraphitiConnectionTestResult>> =>
    apiCall('/infrastructure/graphiti/test', {
      method: 'POST',
      body: JSON.stringify({ falkorDbUri, openAiApiKey }),
    }),

  // Git Operations
  getGitBranches: (projectPath: string): Promise<IPCResult<string[]>> =>
    apiCall(`/git/branches?path=${encodeURIComponent(projectPath)}`),

  getCurrentGitBranch: (projectPath: string): Promise<IPCResult<string | null>> =>
    apiCall(`/git/current-branch?path=${encodeURIComponent(projectPath)}`),

  detectMainBranch: (projectPath: string): Promise<IPCResult<string | null>> =>
    apiCall(`/git/main-branch?path=${encodeURIComponent(projectPath)}`),

  checkGitStatus: (projectPath: string): Promise<IPCResult<GitStatus>> =>
    apiCall(`/git/status?path=${encodeURIComponent(projectPath)}`),

  initializeGit: (projectPath: string): Promise<IPCResult<InitializationResult>> =>
    apiCall('/git/init', {
      method: 'POST',
      body: JSON.stringify({ path: projectPath }),
    }),
};

// ============================================================================
// Task API
// ============================================================================

const taskAPI = {
  getTasks: (projectId: string): Promise<IPCResult<Task[]>> =>
    apiCall(`/projects/${projectId}/tasks`),

  getTask: (taskId: string): Promise<IPCResult<Task>> =>
    apiCall(`/tasks/${taskId}`),

  createTask: (
    projectId: string,
    title: string,
    description: string,
    metadata?: unknown
  ): Promise<IPCResult<Task>> =>
    apiCall(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ title, description, metadata }),
    }),

  updateTask: (taskId: string, updates: Partial<Task>): Promise<IPCResult<Task>> =>
    apiCall(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}`, { method: 'DELETE' }),

  startTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/start`, { method: 'POST' }),

  stopTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/stop`, { method: 'POST' }),

  retryTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/retry`, { method: 'POST' }),

  getTaskLogs: (taskId: string): Promise<IPCResult<string[]>> =>
    apiCall(`/tasks/${taskId}/logs`),

  getImplementationPlan: (taskId: string): Promise<IPCResult<ImplementationPlan>> =>
    apiCall(`/tasks/${taskId}/plan`),

  approveTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/approve`, { method: 'POST' }),

  rejectTask: (taskId: string, reason: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  archiveTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/archive`, { method: 'POST' }),

  unarchiveTask: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/unarchive`, { method: 'POST' }),

  getArchivedTasks: (projectId: string): Promise<IPCResult<Task[]>> =>
    apiCall(`/projects/${projectId}/tasks/archived`),

  // Worktree operations
  getWorktrees: (projectId: string): Promise<IPCResult<Worktree[]>> =>
    apiCall(`/projects/${projectId}/worktrees`),

  worktreeAction: (
    taskId: string,
    action: WorktreeAction
  ): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/worktree/${action}`, { method: 'POST' }),

  openWorktreeInEditor: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/worktree/open`, { method: 'POST' }),

  openWorktreeInTerminal: (taskId: string): Promise<IPCResult<void>> =>
    apiCall(`/tasks/${taskId}/worktree/terminal`, { method: 'POST' }),

  // Event subscriptions (WebSocket)
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) =>
    subscribeToEvent('task:progress', (data: { taskId: string; plan: ImplementationPlan }) =>
      callback(data.taskId, data.plan)
    ),

  onTaskLog: (callback: (taskId: string, log: string) => void) =>
    subscribeToEvent('task:log', (data: { taskId: string; log: string }) =>
      callback(data.taskId, data.log)
    ),

  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) =>
    subscribeToEvent('task:status', (data: { taskId: string; status: TaskStatus }) =>
      callback(data.taskId, data.status)
    ),

  onTaskError: (callback: (taskId: string, error: string) => void) =>
    subscribeToEvent('task:error', (data: { taskId: string; error: string }) =>
      callback(data.taskId, data.error)
    ),

  onTaskExecutionProgress: (callback: (taskId: string, progress: ExecutionProgress) => void) =>
    subscribeToEvent('task:execution', (data: { taskId: string; progress: ExecutionProgress }) =>
      callback(data.taskId, data.progress)
    ),
};

// ============================================================================
// Terminal API
// ============================================================================

const terminalAPI = {
  createTerminal: (
    options: TerminalCreateOptions
  ): Promise<IPCResult<TerminalSession>> => {
    // Map frontend TerminalCreateOptions to backend TerminalCreate format
    // Backend expects: { projectId: str, name?: str, cwd?: str }
    // Frontend sends: { id, cwd, cols, rows, projectPath, projectId }
    return apiCall('/terminals', {
      method: 'POST',
      body: JSON.stringify({
        projectId: options.projectId,
        name: options.id,  // Use terminal id as the name
        cwd: options.cwd || options.projectPath,
      }),
    });
  },

  closeTerminal: (terminalId: string): Promise<IPCResult<void>> =>
    apiCall(`/terminals/${terminalId}`, { method: 'DELETE' }),

  writeTerminal: (terminalId: string, data: string): Promise<IPCResult<void>> =>
    apiCall(`/terminals/${terminalId}/write`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),

  // Fire-and-forget version of writeTerminal (matches ElectronAPI interface)
  sendTerminalInput: (terminalId: string, data: string): void => {
    apiCall(`/terminals/${terminalId}/write`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }).catch(err => console.error('[Terminal] Failed to send input:', err));
  },

  resizeTerminal: (
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<IPCResult<void>> =>
    apiCall(`/terminals/${terminalId}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols, rows }),
    }),

  getTerminals: (projectId?: string): Promise<IPCResult<TerminalSession[]>> =>
    apiCall(projectId ? `/terminals?projectId=${encodeURIComponent(projectId)}` : '/terminals'),

  renameTerminal: (terminalId: string, name: string): Promise<IPCResult<void>> =>
    apiCall(`/terminals/${terminalId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // Terminal events - using names that match ElectronAPI interface
  onTerminalOutput: (callback: (terminalId: string, data: string) => void) =>
    subscribeToEvent('terminal:data', (payload: { terminalId: string; data: string }) =>
      callback(payload.terminalId, payload.data)
    ),

  onTerminalExit: (callback: (terminalId: string, code: number) => void) =>
    subscribeToEvent('terminal:exit', (payload: { terminalId: string; code: number }) =>
      callback(payload.terminalId, payload.code)
    ),

  onTerminalTitleChange: (callback: (terminalId: string, title: string) => void) =>
    subscribeToEvent('terminal:title', (payload: { terminalId: string; title: string }) =>
      callback(payload.terminalId, payload.title)
    ),

  onTerminalClaudeSession: (callback: (terminalId: string, sessionId: string) => void) =>
    subscribeToEvent('terminal:claude-session', (payload: { terminalId: string; sessionId: string }) =>
      callback(payload.terminalId, payload.sessionId)
    ),
};

// ============================================================================
// Settings API
// ============================================================================

const settingsAPI = {
  getSettings: (): Promise<IPCResult<Settings>> =>
    apiCall('/settings'),

  updateSettings: (settings: Partial<Settings>): Promise<IPCResult<void>> =>
    apiCall('/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  getAppVersion: async (): Promise<string> => {
    const result = await apiCall<{ version: string }>('/settings/version');
    return result.success ? result.data?.version ?? 'unknown' : 'unknown';
  },

  openExternal: async (url: string): Promise<void> => {
    window.open(url, '_blank');
  },

  showItemInFolder: async (path: string): Promise<void> => {
    console.warn('[Web API] showItemInFolder: Not available in web', path);
  },
};

// ============================================================================
// File API
// ============================================================================

// FileNode type for file explorer
interface FileNodeResponse {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNodeResponse[];
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: FileNode[];
}

// Transform backend tree response to FileNode format
function transformTreeToFileNodes(node: FileNodeResponse): FileNode[] {
  if (!node.children) return [];
  return node.children.map(child => ({
    name: child.name,
    path: child.path,
    isDirectory: child.type === 'directory',
    size: child.size,
    children: child.children ? transformTreeToFileNodes(child) : undefined,
  }));
}

const fileAPI = {
  readFile: async (filePath: string): Promise<IPCResult<string>> =>
    apiCall(`/files/read?path=${encodeURIComponent(filePath)}`),

  writeFile: async (filePath: string, content: string): Promise<IPCResult<void>> =>
    apiCall('/files/write', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    }),

  // Returns FileNode[] for file explorer compatibility
  listDirectory: async (dirPath: string): Promise<IPCResult<FileNode[]>> => {
    // Use /files/tree with depth=1 to get immediate children with metadata
    const result = await apiCall<FileNodeResponse>(`/files/tree?path=${encodeURIComponent(dirPath)}&depth=1`);
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to list directory' };
    }
    // Transform to FileNode[] format expected by file-explorer-store
    const fileNodes = transformTreeToFileNodes(result.data);
    return { success: true, data: fileNodes };
  },

  fileExists: async (filePath: string): Promise<IPCResult<boolean>> =>
    apiCall(`/files/exists?path=${encodeURIComponent(filePath)}`),

  getFileTree: async (rootPath: string): Promise<IPCResult<unknown>> =>
    apiCall(`/files/tree?path=${encodeURIComponent(rootPath)}`),
};

// ============================================================================
// Agent API (Events)
// ============================================================================

const agentAPI = {
  onAgentStarted: (callback: (taskId: string, agentType: string) => void) =>
    subscribeToEvent('agent:started', (data: { taskId: string; agentType: string }) =>
      callback(data.taskId, data.agentType)
    ),

  onAgentComplete: (callback: (taskId: string, agentType: string) => void) =>
    subscribeToEvent('agent:complete', (data: { taskId: string; agentType: string }) =>
      callback(data.taskId, data.agentType)
    ),

  onAgentError: (callback: (taskId: string, error: string) => void) =>
    subscribeToEvent('agent:error', (data: { taskId: string; error: string }) =>
      callback(data.taskId, data.error)
    ),
};

// ============================================================================
// Insights API
// ============================================================================

const insightsAPI = {
  runInsights: (projectId: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/insights/run`, { method: 'POST' }),

  getInsights: (projectId: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/insights`),

  onInsightsProgress: (callback: (projectId: string, status: unknown) => void) =>
    subscribeToEvent('insights:progress', (data: { projectId: string; status: unknown }) =>
      callback(data.projectId, data.status)
    ),

  onInsightsComplete: (callback: (projectId: string, result: unknown) => void) =>
    subscribeToEvent('insights:complete', (data: { projectId: string; result: unknown }) =>
      callback(data.projectId, data.result)
    ),

  onInsightsError: (callback: (projectId: string, error: string) => void) =>
    subscribeToEvent('insights:error', (data: { projectId: string; error: string }) =>
      callback(data.projectId, data.error)
    ),
};

// ============================================================================
// Roadmap API
// ============================================================================

const roadmapAPI = {
  generateRoadmap: (projectId: string, options?: unknown): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/roadmap/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  getRoadmap: (projectId: string): Promise<IPCResult<Roadmap>> =>
    apiCall(`/projects/${projectId}/roadmap`),

  updateRoadmap: (projectId: string, roadmap: Partial<Roadmap>): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/roadmap`, {
      method: 'PATCH',
      body: JSON.stringify(roadmap),
    }),

  onRoadmapProgress: (callback: (projectId: string, status: RoadmapGenerationStatus) => void) =>
    subscribeToEvent('roadmap:progress', (data: { projectId: string; status: RoadmapGenerationStatus }) =>
      callback(data.projectId, data.status)
    ),

  onRoadmapComplete: (callback: (projectId: string, roadmap: Roadmap) => void) =>
    subscribeToEvent('roadmap:complete', (data: { projectId: string; roadmap: Roadmap }) =>
      callback(data.projectId, data.roadmap)
    ),

  onRoadmapError: (callback: (projectId: string, error: string) => void) =>
    subscribeToEvent('roadmap:error', (data: { projectId: string; error: string }) =>
      callback(data.projectId, data.error)
    ),
};

// ============================================================================
// Ideation API
// ============================================================================

const ideationAPI = {
  generateIdeas: (projectId: string, prompt?: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/ideation/generate`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  getIdeas: (projectId: string): Promise<IPCResult<unknown[]>> =>
    apiCall(`/projects/${projectId}/ideation`),

  convertIdeaToTask: (projectId: string, ideaId: string): Promise<IPCResult<Task>> =>
    apiCall(`/projects/${projectId}/ideation/${ideaId}/convert`, { method: 'POST' }),

  deleteIdea: (projectId: string, ideaId: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/ideation/${ideaId}`, { method: 'DELETE' }),

  onIdeationProgress: (callback: (projectId: string, status: unknown) => void) =>
    subscribeToEvent('ideation:progress', (data: { projectId: string; status: unknown }) =>
      callback(data.projectId, data.status)
    ),

  onIdeationComplete: (callback: (projectId: string, ideas: unknown[]) => void) =>
    subscribeToEvent('ideation:complete', (data: { projectId: string; ideas: unknown[] }) =>
      callback(data.projectId, data.ideas)
    ),
};

// ============================================================================
// App Update API (minimal for web)
// ============================================================================

const appUpdateAPI = {
  checkForUpdates: async (): Promise<IPCResult<unknown>> => {
    // Container updates are handled differently
    return { success: true, data: { updateAvailable: false } };
  },

  downloadUpdate: async (): Promise<IPCResult<void>> => {
    return { success: false, error: 'Updates handled via container rebuild' };
  },

  installUpdate: async (): Promise<IPCResult<void>> => {
    return { success: false, error: 'Updates handled via container rebuild' };
  },

  onUpdateAvailable: (callback: (info: unknown) => void) =>
    subscribeToEvent('update:available', callback),

  onUpdateDownloaded: (callback: (info: unknown) => void) =>
    subscribeToEvent('update:downloaded', callback),

  onUpdateError: (callback: (error: string) => void) =>
    subscribeToEvent('update:error', (data: { error: string }) => callback(data.error)),
};

// ============================================================================
// GitHub API
// ============================================================================

const githubAPI = {
  getGitHubStatus: (projectId: string): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/github/status`),

  connectGitHub: (projectId: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/github/connect`, { method: 'POST' }),

  disconnectGitHub: (projectId: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/github/disconnect`, { method: 'POST' }),

  getGitHubIssues: (projectId: string): Promise<IPCResult<unknown[]>> =>
    apiCall(`/projects/${projectId}/github/issues`),

  createGitHubIssue: (projectId: string, issue: unknown): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/github/issues`, {
      method: 'POST',
      body: JSON.stringify(issue),
    }),

  importGitHubIssue: (projectId: string, issueNumber: number): Promise<IPCResult<Task>> =>
    apiCall(`/projects/${projectId}/github/issues/${issueNumber}/import`, { method: 'POST' }),

  createGitHubRelease: (projectId: string, release: unknown): Promise<IPCResult<unknown>> =>
    apiCall(`/projects/${projectId}/github/releases`, {
      method: 'POST',
      body: JSON.stringify(release),
    }),
};

// ============================================================================
// Changelog API
// ============================================================================

const changelogAPI = {
  generateChangelog: (projectId: string, options?: unknown): Promise<IPCResult<string>> =>
    apiCall(`/projects/${projectId}/changelog/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  getChangelog: (projectId: string): Promise<IPCResult<string>> =>
    apiCall(`/projects/${projectId}/changelog`),

  saveChangelog: (projectId: string, content: string): Promise<IPCResult<void>> =>
    apiCall(`/projects/${projectId}/changelog`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
};

// ============================================================================
// Event Listener Stubs (no-op for web, actual events come via WebSocket)
// ============================================================================

// Helper to create a no-op event listener that returns a cleanup function
const createEventStub = () => (_callback: Function) => () => {};

// Helper to create a stub API call that returns success with empty/default data
const createApiStub = <T>(defaultValue: T) => (): Promise<IPCResult<T>> =>
  Promise.resolve({ success: true, data: defaultValue });

const eventListenerStubs = {
  // Task events
  onTaskProgress: createEventStub(),
  onTaskError: createEventStub(),
  onTaskLog: createEventStub(),
  onTaskStatusChange: createEventStub(),
  onTaskExecutionProgress: createEventStub(),
  onTaskLogsChanged: createEventStub(),

  // Roadmap events
  onRoadmapProgress: createEventStub(),
  onRoadmapComplete: createEventStub(),
  onRoadmapError: createEventStub(),
  onRoadmapStopped: createEventStub(),

  // Terminal events - these are implemented in terminalAPI above
  // onTerminalOutput, onTerminalExit, onTerminalTitleChange, onTerminalClaudeSession are in terminalAPI
  onTerminalRateLimit: createEventStub(),
  onTerminalOAuthToken: createEventStub(),

  // Insights events
  onInsightsStreamChunk: createEventStub(),
  onInsightsStatus: createEventStub(),
  onInsightsError: createEventStub(),

  // Ideation events
  onIdeationProgress: createEventStub(),
  onIdeationLog: createEventStub(),
  onIdeationTypeComplete: createEventStub(),
  onIdeationTypeFailed: createEventStub(),
  onIdeationComplete: createEventStub(),
  onIdeationError: createEventStub(),
  onIdeationStopped: createEventStub(),

  // App update events
  onAppUpdateAvailable: createEventStub(),
  onAppUpdateDownloaded: createEventStub(),
  onAppUpdateProgress: createEventStub(),
  onAutoBuildSourceUpdateProgress: createEventStub(),

  // Changelog events
  onChangelogGenerationProgress: createEventStub(),
  onChangelogGenerationComplete: createEventStub(),
  onChangelogGenerationError: createEventStub(),

  // GitHub events
  onGitHubInvestigationProgress: createEventStub(),
  onGitHubInvestigationComplete: createEventStub(),
  onGitHubInvestigationError: createEventStub(),

  // Proactive swap and usage events
  onProactiveSwapNotification: createEventStub(),
  onUsageUpdated: createEventStub(),
  onSDKRateLimit: createEventStub(),
};

// ============================================================================
// Additional API Stubs (methods not yet implemented)
// ============================================================================

const additionalStubs = {
  // Terminal session methods
  getTerminalSessionDates: createApiStub([]),
  getTerminalSessionsForDate: createApiStub([]),
  restoreTerminalSession: createApiStub(null),
  restoreTerminalSessionsFromDate: createApiStub([]),
  saveTerminalBuffer: createApiStub(undefined),
  generateTerminalName: createApiStub('Terminal'),

  // Usage and profile methods
  requestUsageUpdate: createApiStub(null),
  getAutoSwitchSettings: createApiStub({ enabled: false }),
  updateAutoSwitchSettings: createApiStub(undefined),
  retryWithProfile: createApiStub(undefined),

  // Check methods
  checkTaskRunning: createApiStub(false),
  checkProjectVersion: createApiStub({ needsUpdate: false }),
  checkSourceToken: createApiStub({ valid: false }),
  checkGitHubAuth: createApiStub({ authenticated: false }),
  checkGitHubCli: createApiStub({ installed: false }),
  checkLinearConnection: createApiStub({ connected: false }),
  checkAppUpdate: createApiStub(null),
  checkAutoBuildSourceUpdate: createApiStub(null),

  // Git methods
  checkGitStatus: createApiStub({ clean: true, branch: 'main' }),
  getGitBranches: createApiStub([]),
  detectMainBranch: createApiStub('main'),
  initializeGit: createApiStub(undefined),

  // App update methods
  downloadAppUpdate: createApiStub(undefined),
  installAppUpdate: createApiStub(undefined),
  downloadAutoBuildSourceUpdate: createApiStub(undefined),

  // Directory/file methods
  getDefaultProjectLocation: createApiStub('/projects'),
  selectDirectory: createApiStub(null),
  // listDirectory is implemented in fileAPI - don't override with stub
  createProjectFolder: createApiStub(undefined),
  openExternal: createApiStub(undefined),

  // Infrastructure methods
  getDockerDownloadUrl: createApiStub(''),
  openDockerDesktop: createApiStub(undefined),
  startFalkorDB: createApiStub(undefined),
  testGraphitiConnection: createApiStub({ success: false }),

  // Linear integration
  getLinearTeams: createApiStub([]),
  getLinearProjects: createApiStub([]),
  getLinearIssues: createApiStub([]),
  importLinearIssues: createApiStub([]),

  // GitHub additional methods
  getGitHubToken: createApiStub(null),
  listGitHubUserRepos: createApiStub([]),
  getGitHubBranches: createApiStub([]),
  detectGitHubRepo: createApiStub(null),
  getIssueComments: createApiStub([]),
  importGitHubIssues: createApiStub([]),
  investigateGitHubIssue: createApiStub(undefined),
  createGitHubRelease: createApiStub(undefined),

  // Worktree methods
  getWorktreeStatus: createApiStub(null),
  getWorktreeDiff: createApiStub(null),
  listWorktrees: createApiStub([]),
  mergeWorktree: createApiStub({ success: true }),
  mergeWorktreePreview: createApiStub({ canMerge: true }),
  discardWorktree: createApiStub({ success: true }),

  // Claude profile methods
  initializeClaudeProfile: createApiStub(undefined),
  deleteClaudeProfile: createApiStub(undefined),
  renameClaudeProfile: createApiStub(undefined),
  saveClaudeProfile: createApiStub(undefined),
  setClaudeProfileToken: createApiStub(undefined),
  setActiveClaudeProfile: createApiStub(undefined),
  switchClaudeProfile: createApiStub(undefined),

  // Insights additional methods
  newInsightsSession: createApiStub(null),
  switchInsightsSession: createApiStub(undefined),
  deleteInsightsSession: createApiStub(undefined),
  renameInsightsSession: createApiStub(undefined),
  listInsightsSessions: createApiStub([]),
  clearInsightsSession: createApiStub(undefined),
  updateInsightsModelConfig: createApiStub(undefined),

  // Ideation additional methods
  refreshIdeation: createApiStub(undefined),
  archiveIdea: createApiStub(undefined),
  deleteIdea: createApiStub(undefined),
  deleteMultipleIdeas: createApiStub(undefined),
  dismissIdea: createApiStub(undefined),
  dismissAllIdeas: createApiStub(undefined),
  convertIdeaToTask: createApiStub(undefined),
  convertFeatureToSpec: createApiStub(undefined),

  // Roadmap additional methods
  refreshRoadmap: createApiStub(undefined),
  saveRoadmap: createApiStub(undefined),

  // Task additional methods
  loadTaskSpecs: createApiStub([]),
  recoverStuckTask: createApiStub({ success: true }),
  watchTaskLogs: createApiStub(undefined),
  unwatchTaskLogs: createApiStub(undefined),
  submitReview: createApiStub(undefined),
  updateTaskStatus: createApiStub(undefined),
  createTaskFromInsights: createApiStub(undefined),

  // Release methods
  runReleasePreflightCheck: createApiStub({ ready: true }),

  // Changelog additional methods
  readExistingChangelog: createApiStub(''),
  saveChangelogImage: createApiStub(''),
  suggestChangelogVersion: createApiStub('1.0.0'),
  suggestChangelogVersionFromCommits: createApiStub('1.0.0'),

  // Environment methods
  updateSourceEnv: createApiStub(undefined),

  // Context methods
  refreshProjectIndex: createApiStub(undefined),
  searchMemories: createApiStub([]),

  // Terminal Claude methods
  invokeClaudeInTerminal: (terminalId: string, cwd?: string): void => {
    // Send the claude command to the terminal
    // The --dangerously-skip-permissions flag is needed for non-interactive mode
    const claudeCommand = 'claude --dangerously-skip-permissions\r';
    apiCall(`/terminals/${terminalId}/write`, {
      method: 'POST',
      body: JSON.stringify({ data: claudeCommand }),
    }).catch(err => console.error('[Terminal] Failed to invoke Claude:', err));
  },
  invokeClaudeSetup: createApiStub(undefined),

  // Archive methods
  archiveTasks: createApiStub(undefined),
};

// ============================================================================
// Combined API (matches window.electronAPI interface)
// ============================================================================

export const webAPI = {
  ...projectAPI,
  ...taskAPI,
  ...terminalAPI,
  ...settingsAPI,
  ...fileAPI,
  ...agentAPI,
  ...insightsAPI,
  ...roadmapAPI,
  ...ideationAPI,
  ...appUpdateAPI,
  ...githubAPI,
  ...changelogAPI,
  ...eventListenerStubs,
  ...additionalStubs,
};

// Type assertion to handle partial API implementation
// The full ElectronAPI has more methods, but we implement the core ones needed for web
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).electronAPI = webAPI;
(window as any).DEBUG = import.meta.env.DEV;

export default webAPI;
