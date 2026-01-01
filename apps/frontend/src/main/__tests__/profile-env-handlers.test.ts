/**
 * Unit tests for profile env IPC handlers
 * Tests IPC communication for profile environment variable management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Test data directory
const TEST_DIR = mkdtempSync(path.join(tmpdir(), 'profile-env-handlers-test-'));
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');

// Mock electron-updater before importing
vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn()
  }
}));

// Mock @electron-toolkit/utils before importing
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: true,
    windows: process.platform === 'win32',
    macos: process.platform === 'darwin',
    linux: process.platform === 'linux'
  },
  electronApp: {
    setAppUserModelId: vi.fn()
  },
  optimizer: {
    watchWindowShortcuts: vi.fn()
  }
}));

// Mock version-manager to return a predictable version
vi.mock('../updater/version-manager', () => ({
  getEffectiveVersion: vi.fn(() => '0.1.0'),
  getBundledVersion: vi.fn(() => '0.1.0'),
  parseVersionFromTag: vi.fn((tag: string) => tag.replace('v', '')),
  compareVersions: vi.fn(() => 0)
}));

vi.mock('../notification-service', () => ({
  notificationService: {
    initialize: vi.fn(),
    notifyReviewNeeded: vi.fn(),
    notifyTaskFailed: vi.fn()
  }
}));

// Mock electron-log to prevent Electron binary dependency
vi.mock('electron-log/main.js', () => ({
  default: {
    initialize: vi.fn(),
    transports: {
      file: {
        maxSize: 10 * 1024 * 1024,
        format: '',
        fileName: 'main.log',
        level: 'info',
        getFile: vi.fn(() => ({ path: '/tmp/test.log' }))
      },
      console: {
        level: 'warn',
        format: ''
      }
    },
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock modules before importing
vi.mock('electron', () => {
  const mockIpcMain = new (class extends EventEmitter {
    private handlers: Map<string, Function> = new Map();

    handle(channel: string, handler: Function): void {
      this.handlers.set(channel, handler);
    }

    removeHandler(channel: string): void {
      this.handlers.delete(channel);
    }

    async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
      const handler = this.handlers.get(channel);
      if (handler) {
        return handler(event, ...args);
      }
      throw new Error(`No handler for channel: ${channel}`);
    }

    getHandler(channel: string): Function | undefined {
      return this.handlers.get(channel);
    }
  })();

  return {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return path.join(TEST_DIR, 'userData');
        return TEST_DIR;
      }),
      getAppPath: vi.fn(() => TEST_DIR),
      getVersion: vi.fn(() => '0.1.0'),
      isPackaged: false
    },
    ipcMain: mockIpcMain,
    dialog: {
      showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: [TEST_PROJECT_PATH] }))
    },
    BrowserWindow: class {
      webContents = { send: vi.fn() };
    }
  };
});

// Mock agent manager
const mockAgentManager = Object.assign(new EventEmitter(), {
  startSpecCreation: vi.fn(),
  startTaskExecution: vi.fn(),
  startQAProcess: vi.fn(),
  killTask: vi.fn(),
  configure: vi.fn()
});

// Mock profile manager
const mockProfileManager = {
  getProfile: vi.fn(),
  getSettings: vi.fn(),
  getAutoSwitchSettings: vi.fn(),
  updateAutoSwitchSettings: vi.fn(),
  saveProfile: vi.fn(),
  deleteProfile: vi.fn(),
  renameProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  markProfileUsed: vi.fn(),
  getActiveProfile: vi.fn(),
  getActiveProfileToken: vi.fn(),
  getProfileToken: vi.fn(),
  setProfileToken: vi.fn(),
  hasValidToken: vi.fn(),
  getActiveProfileEnv: vi.fn(),
  updateProfileUsage: vi.fn(),
  recordRateLimitEvent: vi.fn(),
  isProfileRateLimited: vi.fn(),
  getBestAvailableProfile: vi.fn(),
  shouldProactivelySwitch: vi.fn(),
  generateProfileId: vi.fn(),
  createProfileDirectory: vi.fn(),
  isProfileAuthenticated: vi.fn(),
  hasValidAuth: vi.fn(),
  getProfileEnv: vi.fn(),
  clearRateLimitEvents: vi.fn(),
  getProfilesSortedByAvailability: vi.fn()
};

// Mock the profile manager module
vi.mock('../claude-profile-manager', () => ({
  getClaudeProfileManager: () => mockProfileManager
}));

// Mock settings-utils
vi.mock('../settings-utils', () => ({
  getSettingsPath: vi.fn(() => path.join(TEST_DIR, 'settings.json')),
  readSettingsFile: vi.fn(() => ({}))
}));

// Mock CLI tool manager
vi.mock('../cli-tool-manager', () => ({
  configureTools: vi.fn(),
  getToolPath: vi.fn(() => 'mock-tool-path'),
  getToolInfo: vi.fn(() => ({ installed: true, version: '1.0.0' }))
}));

// Mock auto-updater
vi.mock('../auto-claude-updater', () => ({
  getEffectiveVersion: vi.fn(() => '0.1.0')
}));

vi.mock('../app-updater', () => ({
  setUpdateChannel: vi.fn()
}));

// Mock token encryption
vi.mock('../claude-profile/token-encryption', () => ({
  encryptToken: vi.fn((token: string) => `enc:${token}`),
  decryptToken: vi.fn((token: string) => token.startsWith('enc:') ? token.substring(4) : token)
}));

// Setup test project structure
function setupTestProject(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, 'auto-claude', 'specs'), { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Profile Env IPC Handlers', () => {
  let ipcMain: EventEmitter & {
    handlers: Map<string, Function>;
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
    getHandler: (channel: string) => Function | undefined;
  };
  let mockMainWindow: { webContents: { send: ReturnType<typeof vi.fn> } };
  let profileEnvHandler: any;
  let parseEnvFile: (content: string) => Record<string, string>;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestProject();
    mkdirSync(path.join(TEST_DIR, 'userData', 'store'), { recursive: true });

    // Get mocked ipcMain
    const electron = await import('electron');
    ipcMain = electron.ipcMain as unknown as typeof ipcMain;

    // Create mock window
    mockMainWindow = {
      webContents: { send: vi.fn() }
    };

    // Reset all mocks
    vi.clearAllMocks();

    // Import the settings handlers
    const settingsHandlers = await import('../ipc-handlers/settings-handlers');
    profileEnvHandler = settingsHandlers.registerSettingsHandlers;

    // Get parseEnvFile from utils
    const utils = await import('../ipc-handlers/utils');
    parseEnvFile = utils.parseEnvFile;

    // Register handlers
    profileEnvHandler(mockAgentManager, () => mockMainWindow);
  });

  afterEach(() => {
    cleanupTestDirs();
  });

  describe('PROFILE_ENV_GET', () => {
    it('should return error when profile does not exist', async () => {
      const channel = 'profileEnv:get';

      // Setup mock to return undefined (profile not found)
      mockProfileManager.getProfile.mockReturnValue(undefined);

      const handler = ipcMain.getHandler(channel);
      expect(handler).toBeDefined();

      const result = await handler(null, 'non-existent-profile');
      expect(result).toEqual({
        success: false,
        error: 'Profile not found'
      });
    });

    it('should return profile env config with all fields', async () => {
      const channel = 'profileEnv:get';

      // Create a mock profile with config directory
      const mockProfile = {
        id: 'test-profile',
        name: 'Test Profile',
        configDir: path.join(TEST_DIR, 'test-config'),
        isDefault: false,
        description: 'Test profile for unit tests',
        createdAt: new Date(),
        email: 'test@example.com'
      };

      // Setup profile directory and .env file
      mkdirSync(mockProfile.configDir, { recursive: true });
      const envPath = path.join(mockProfile.configDir, '.env');
      writeFileSync(envPath, `
# Test environment variables
CLAUDE_CODE_OAUTH_TOKEN=test-token
AUTO_BUILD_MODEL=claude-opus-4-5-20251101
LINEAR_API_KEY=test-linear-key
LINEAR_TEAM_ID=test-team
LINEAR_PROJECT_ID=test-project
LINEAR_REALTIME_SYNC=true
GITHUB_TOKEN=test-github-token
GITHUB_REPO=test/repo
GITHUB_AUTO_SYNC=true
GITLAB_ENABLED=true
GITLAB_TOKEN=test-gitlab-token
GITLAB_INSTANCE_URL=https://gitlab.example.com
GITLAB_PROJECT=test/project
GITLAB_AUTO_SYNC=true
DEFAULT_BRANCH=develop
GRAPHITI_ENABLED=true
OPENAI_API_KEY=test-openai-key
GRAPHITI_DATABASE=test_db
GRAPHITI_DB_PATH=/test/path
ENABLE_FANCY_UI=false
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
CONTEXT7_ENABLED=true
LINEAR_MCP_ENABLED=true
ELECTRON_MCP_ENABLED=true
PUPPETEER_MCP_ENABLED=false
AGENT_MCP_planner_ADD=server1,server2
AGENT_MCP_planner_REMOVE=server3
CUSTOM_MCP_SERVERS=[{"id":"test-server","name":"Test Server","type":"command"}]
`.trim());

      // Setup mock
      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      expect(handler).toBeDefined();

      const result = await handler(null, 'test-profile');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const config = result.data;
      expect(config.claudeOAuthToken).toBe('test-token-123');
      expect(config.claudeAuthStatus).toBe('token_set');
      expect(config.claudeTokenIsGlobal).toBe(false);
      expect(config.autoBuildModel).toBe('claude-opus-4-5-20251101');
      expect(config.linearEnabled).toBe(true);
      expect(config.linearApiKey).toBe('test-linear-key');
      expect(config.linearTeamId).toBe('test-team');
      expect(config.linearProjectId).toBe('test-project');
      expect(config.linearRealtimeSync).toBe(true);
      expect(config.githubEnabled).toBe(true);
      expect(config.githubToken).toBe('test-github-token');
      expect(config.githubRepo).toBe('test/repo');
      expect(config.githubAutoSync).toBe(true);
      expect(config.gitlabEnabled).toBe(true);
      expect(config.gitlabToken).toBe('test-gitlab-token');
      expect(config.gitlabInstanceUrl).toBe('https://gitlab.example.com');
      expect(config.gitlabProject).toBe('test/project');
      expect(config.gitlabAutoSync).toBe(true);
      expect(config.defaultBranch).toBe('develop');
      expect(config.graphitiEnabled).toBe(true);
      expect(config.openaiApiKey).toBe('test-openai-key');
      expect(config.openaiKeyIsGlobal).toBe(false);
      expect(config.graphitiDatabase).toBe('test_db');
      expect(config.graphitiDbPath).toBe('/test/path');
      expect(config.enableFancyUi).toBe(false);

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers?.context7Enabled).toBe(true);
      expect(config.mcpServers?.linearMcpEnabled).toBe(true);
      expect(config.mcpServers?.electronEnabled).toBe(true);
      expect(config.mcpServers?.puppeteerEnabled).toBe(false);

      expect(config.agentMcpOverrides).toBeDefined();
      expect(config.agentMcpOverrides?.planner?.add).toEqual(['server1', 'server2']);
      expect(config.agentMcpOverrides?.planner?.remove).toEqual(['server3']);

      expect(config.customMcpServers).toBeDefined();
      expect(config.customMcpServers?.length).toBe(1);
      expect(config.customMcpServers?.[0].id).toBe('test-server');

      expect(config.graphitiProviderConfig).toBeDefined();
      expect(config.graphitiProviderConfig?.embeddingProvider).toBe('openai');
      expect(config.graphitiProviderConfig?.openaiApiKey).toBe('test-openai-key');
      expect(config.graphitiProviderConfig?.openaiEmbeddingModel).toBe('text-embedding-3-small');
    });

    it('should handle profile without config directory', async () => {
      const channel = 'profileEnv:get';

      const mockProfile = {
        id: 'default',
        name: 'Default',
        configDir: undefined,
        isDefault: true,
        description: 'Default profile',
        createdAt: new Date()
      };

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'default');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.claudeOAuthToken).toBeUndefined();
      expect(result.data.claudeAuthStatus).toBe('not_configured');
    });

    it('should handle profile with OAuth token', async () => {
      const channel = 'profileEnv:get';

      const mockProfile = {
        id: 'oauth-profile',
        name: 'OAuth Profile',
        configDir: path.join(TEST_DIR, 'oauth-config'),
        isDefault: false,
        description: 'Profile with OAuth token',
        createdAt: new Date(),
        oauthToken: 'enc:decrypted-token-123'
      };

      mkdirSync(mockProfile.configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'oauth-profile');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.claudeOAuthToken).toBe('decrypted-token-123');
      expect(result.data.claudeAuthStatus).toBe('token_set');
      expect(result.data.claudeTokenIsGlobal).toBe(false);
    });

    it('should use default values when .env file does not exist', async () => {
      const channel = 'profileEnv:get';

      const mockProfile = {
        id: 'empty-profile',
        name: 'Empty Profile',
        configDir: path.join(TEST_DIR, 'empty-config'),
        isDefault: false,
        description: 'Profile without .env',
        createdAt: new Date()
      };

      mkdirSync(mockProfile.configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'empty-profile');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.claudeAuthStatus).toBe('not_configured');
      expect(result.data.linearEnabled).toBe(false);
      expect(result.data.githubEnabled).toBe(false);
      expect(result.data.gitlabEnabled).toBe(false);
      expect(result.data.graphitiEnabled).toBe(false);
      expect(result.data.enableFancyUi).toBe(true);
    });

    it('should handle GitLab disabled explicitly', async () => {
      const channel = 'profileEnv:get';

      const mockProfile = {
        id: 'gitlab-disabled',
        name: 'GitLab Disabled',
        configDir: path.join(TEST_DIR, 'gitlab-disabled-config'),
        isDefault: false,
        description: 'Profile with GitLab disabled',
        createdAt: new Date()
      };

      mkdirSync(mockProfile.configDir, { recursive: true });
      const envPath = path.join(mockProfile.configDir, '.env');
      writeFileSync(envPath, `
GITLAB_ENABLED=false
GITLAB_TOKEN=test-token
`.trim());

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'gitlab-disabled');

      expect(result.success).toBe(true);
      expect(result.data.gitlabEnabled).toBe(false);
      expect(result.data.gitlabToken).toBe('test-token');
    });
  });

  describe('PROFILE_ENV_UPDATE', () => {
    it('should return error when profile does not exist', async () => {
      const channel = 'profileEnv:update';

      mockProfileManager.getProfile.mockReturnValue(undefined);

      const handler = ipcMain.getHandler(channel);
      expect(handler).toBeDefined();

      const result = await handler(null, 'non-existent-profile', { claudeOAuthToken: 'test' });
      expect(result).toEqual({
        success: false,
        error: 'Profile not found'
      });
    });

    it('should return error when profile has no config directory', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'no-config',
        name: 'No Config',
        configDir: undefined,
        isDefault: false,
        description: 'Profile without config dir',
        createdAt: new Date()
      };

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'no-config', { claudeOAuthToken: 'test' });

      expect(result).toEqual({
        success: false,
        error: 'Profile config directory not set'
      });
    });

    it('should update profile environment variables', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'test-profile',
        name: 'Test Profile',
        configDir: path.join(TEST_DIR, 'test-config'),
        isDefault: false,
        description: 'Test profile',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'test-config');
      mkdirSync(configDir, { recursive: true });
      const envPath = path.join(configDir, '.env');
      writeFileSync(envPath, 'CLAUDE_CODE_OAUTH_TOKEN=old-token\n');

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'test-profile', {
        claudeOAuthToken: 'new-token',
        autoBuildModel: 'claude-opus-4-5-20251101',
        linearEnabled: true,
        linearApiKey: 'linear-key-123'
      });

      expect(result.success).toBe(true);

      // Verify the file was written
      expect(existsSync(envPath)).toBe(true);
      const content = readFileSync(envPath, 'utf-8');
      expect(content).toContain('CLAUDE_CODE_OAUTH_TOKEN=new-token');
      expect(content).toContain('AUTO_BUILD_MODEL=claude-opus-4-5-20251101');
      expect(content).toContain('LINEAR_API_KEY=linear-key-123');
    });

    it('should preserve existing variables when updating', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'test-profile',
        name: 'Test Profile',
        configDir: path.join(TEST_DIR, 'test-config'),
        isDefault: false,
        description: 'Test profile',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'test-config');
      mkdirSync(configDir, { recursive: true });
      const envPath = path.join(configDir, '.env');
      writeFileSync(envPath, `
CLAUDE_CODE_OAUTH_TOKEN=existing-token
GITHUB_TOKEN=existing-github-token
DEFAULT_BRANCH=main
`.trim());

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'test-profile', {
        linearEnabled: true,
        linearApiKey: 'new-linear-key'
      });

      expect(result.success).toBe(true);

      const content = readFileSync(envPath, 'utf-8');
      expect(content).toContain('CLAUDE_CODE_OAUTH_TOKEN=existing-token');
      expect(content).toContain('GITHUB_TOKEN=existing-github-token');
      expect(content).toContain('DEFAULT_BRANCH=main');
      expect(content).toContain('LINEAR_API_KEY=new-linear-key');
    });

    it('should create .env file when it does not exist', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'new-profile',
        name: 'New Profile',
        configDir: path.join(TEST_DIR, 'new-config'),
        isDefault: false,
        description: 'New profile',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'new-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'new-profile', {
        claudeOAuthToken: 'test-token',
        autoBuildModel: 'claude-opus-4-5-20251101'
      });

      expect(result.success).toBe(true);
      expect(existsSync(path.join(configDir, '.env'))).toBe(true);
    });

    it('should handle boolean values correctly', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'bool-profile',
        name: 'Bool Profile',
        configDir: path.join(TEST_DIR, 'bool-config'),
        isDefault: false,
        description: 'Profile with boolean values',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'bool-config');
      mkdirSync(configDir, { recursive: true });
      const envPath = path.join(configDir, '.env');
      writeFileSync(envPath, 'CLAUDE_CODE_OAUTH_TOKEN=test\n');

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'bool-profile', {
        linearRealtimeSync: true,
        githubAutoSync: false,
        gitlabAutoSync: true,
        enableFancyUi: false
      });

      expect(result.success).toBe(true);

      const content = readFileSync(envPath, 'utf-8');
      expect(content).toContain('LINEAR_REALTIME_SYNC=true');
      expect(content).toContain('GITHUB_AUTO_SYNC=false');
      expect(content).toContain('GITLAB_AUTO_SYNC=true');
      expect(content).toContain('ENABLE_FANCY_UI=false');
    });

    it('should handle GitLab integration fields', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'gitlab-profile',
        name: 'GitLab Profile',
        configDir: path.join(TEST_DIR, 'gitlab-config'),
        isDefault: false,
        description: 'Profile with GitLab',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'gitlab-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'gitlab-profile', {
        gitlabEnabled: true,
        gitlabToken: 'gitlab-token-123',
        gitlabInstanceUrl: 'https://gitlab.example.com',
        gitlabProject: 'group/project',
        gitlabAutoSync: true
      });

      expect(result.success).toBe(true);

      const content = readFileSync(path.join(configDir, '.env'), 'utf-8');
      expect(content).toContain('GITLAB_ENABLED=true');
      expect(content).toContain('GITLAB_TOKEN=gitlab-token-123');
      expect(content).toContain('GITLAB_INSTANCE_URL=https://gitlab.example.com');
      expect(content).toContain('GITLAB_PROJECT=group/project');
      expect(content).toContain('GITLAB_AUTO_SYNC=true');
    });

    it('should handle graphiti provider configuration', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'graphiti-profile',
        name: 'Graphiti Profile',
        configDir: path.join(TEST_DIR, 'graphiti-config'),
        isDefault: false,
        description: 'Profile with Graphiti',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'graphiti-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'graphiti-profile', {
        graphitiEnabled: true,
        graphitiProviderConfig: {
          embeddingProvider: 'openai',
          openaiApiKey: 'openai-key-123',
          openaiEmbeddingModel: 'text-embedding-3-large',
          database: 'custom_db',
          dbPath: '/custom/path'
        }
      });

      expect(result.success).toBe(true);

      const content = readFileSync(path.join(configDir, '.env'), 'utf-8');
      expect(content).toContain('GRAPHITI_ENABLED=true');
      expect(content).toContain('GRAPHITI_EMBEDDER_PROVIDER=openai');
      expect(content).toContain('OPENAI_API_KEY=openai-key-123');
      expect(content).toContain('OPENAI_EMBEDDING_MODEL=text-embedding-3-large');
      expect(content).toContain('GRAPHITI_DATABASE=custom_db');
      expect(content).toContain('GRAPHITI_DB_PATH=/custom/path');
    });

    it('should handle MCP server configuration', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'mcp-profile',
        name: 'MCP Profile',
        configDir: path.join(TEST_DIR, 'mcp-config'),
        isDefault: false,
        description: 'Profile with MCP servers',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'mcp-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'mcp-profile', {
        mcpServers: {
          context7Enabled: true,
          linearMcpEnabled: false,
          electronEnabled: true,
          puppeteerEnabled: true
        }
      });

      expect(result.success).toBe(true);

      const content = readFileSync(path.join(configDir, '.env'), 'utf-8');
      expect(content).toContain('CONTEXT7_ENABLED=true');
      expect(content).toContain('LINEAR_MCP_ENABLED=false');
      expect(content).toContain('ELECTRON_MCP_ENABLED=true');
      expect(content).toContain('PUPPETEER_MCP_ENABLED=true');
    });

    it('should handle per-agent MCP overrides', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'agent-mcp-profile',
        name: 'Agent MCP Profile',
        configDir: path.join(TEST_DIR, 'agent-mcp-config'),
        isDefault: false,
        description: 'Profile with agent MCP overrides',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'agent-mcp-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'agent-mcp-profile', {
        agentMcpOverrides: {
          planner: { add: ['server1', 'server2'], remove: ['server3'] },
          coder: { add: ['server4'] },
          qa_reviewer: { remove: ['server5', 'server6'] }
        }
      });

      expect(result.success).toBe(true);

      const content = readFileSync(path.join(configDir, '.env'), 'utf-8');
      expect(content).toContain('AGENT_MCP_planner_ADD=server1,server2');
      expect(content).toContain('AGENT_MCP_planner_REMOVE=server3');
      expect(content).toContain('AGENT_MCP_coder_ADD=server4');
      expect(content).toContain('AGENT_MCP_qa_reviewer_REMOVE=server5,server6');
    });

    it('should handle custom MCP servers', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'custom-mcp-profile',
        name: 'Custom MCP Profile',
        configDir: path.join(TEST_DIR, 'custom-mcp-config'),
        isDefault: false,
        description: 'Profile with custom MCP servers',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'custom-mcp-config');
      mkdirSync(configDir, { recursive: true });

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const customServers = [
        { id: 'server1', name: 'Server 1', type: 'command' },
        { id: 'server2', name: 'Server 2', type: 'http', url: 'http://localhost:3000' }
      ];

      const result = await handler(null, 'custom-mcp-profile', {
        customMcpServers: customServers
      });

      expect(result.success).toBe(true);

      const content = readFileSync(path.join(configDir, '.env'), 'utf-8');
      expect(content).toContain('CUSTOM_MCP_SERVERS=');
      expect(content).toContain('"id":"server1"');
      expect(content).toContain('"id":"server2"');
    });

    it('should handle empty custom MCP servers array', async () => {
      const channel = 'profileEnv:update';

      const mockProfile = {
        id: 'empty-custom-mcp-profile',
        name: 'Empty Custom MCP Profile',
        configDir: path.join(TEST_DIR, 'empty-custom-mcp-config'),
        isDefault: false,
        description: 'Profile with empty custom MCP servers',
        createdAt: new Date()
      };

      const configDir = path.join(TEST_DIR, 'empty-custom-mcp-config');
      mkdirSync(configDir, { recursive: true });
      const envPath = path.join(configDir, '.env');
      writeFileSync(envPath, 'CLAUDE_CODE_OAUTH_TOKEN=test\nCUSTOM_MCP_SERVERS=[{"id":"old"}]\n');

      mockProfileManager.getProfile.mockReturnValue(mockProfile);

      const handler = ipcMain.getHandler(channel);
      const result = await handler(null, 'empty-custom-mcp-profile', {
        customMcpServers: []
      });

      expect(result.success).toBe(true);

      const content = readFileSync(envPath, 'utf-8');
      expect(content).not.toContain('CUSTOM_MCP_SERVERS=[{"id":"old"}]');
    });
  });
});
