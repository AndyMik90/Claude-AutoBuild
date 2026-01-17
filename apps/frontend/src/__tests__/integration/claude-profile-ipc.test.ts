/**
 * Integration tests for Claude Profile IPC handlers
 * Tests CLAUDE_PROFILE_SAVE and CLAUDE_PROFILE_INITIALIZE IPC handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { ClaudeProfile, IPCResult, TerminalCreateOptions } from '../../shared/types';

// Test directories - use secure temp directory with random suffix
let TEST_DIR: string;
let TEST_CONFIG_DIR: string;

function initTestDirectories(): void {
  TEST_DIR = mkdtempSync(path.join(tmpdir(), 'claude-profile-ipc-test-'));
  TEST_CONFIG_DIR = path.join(TEST_DIR, 'claude-config');
}

// Mock electron
const mockIpcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  send: vi.fn()
};

const mockBrowserWindow = {
  webContents: {
    send: vi.fn()
  }
};

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  BrowserWindow: vi.fn()
}));

// Mock ClaudeProfileManager
const mockProfileManager = {
  generateProfileId: vi.fn((name: string) => `profile-${name.toLowerCase().replace(/\s+/g, '-')}`),
  saveProfile: vi.fn((profile: ClaudeProfile) => profile),
  getProfile: vi.fn(),
  setProfileToken: vi.fn(() => true),
  getSettings: vi.fn(),
  getActiveProfile: vi.fn(),
  setActiveProfile: vi.fn(() => true),
  deleteProfile: vi.fn(() => true),
  renameProfile: vi.fn(() => true),
  getAutoSwitchSettings: vi.fn(),
  updateAutoSwitchSettings: vi.fn(() => true),
  isInitialized: vi.fn(() => true)
};

vi.mock('../../main/claude-profile-manager', () => ({
  getClaudeProfileManager: () => mockProfileManager
}));

// Mock TerminalManager
const mockTerminalManager = {
  create: vi.fn(),
  write: vi.fn(),
  destroy: vi.fn(),
  isClaudeMode: vi.fn(() => false),
  getActiveTerminalIds: vi.fn(() => []),
  switchClaudeProfile: vi.fn(),
  setTitle: vi.fn(),
  setWorktreeConfig: vi.fn()
};

// Mock projectStore
vi.mock('../../main/project-store', () => ({
  projectStore: {}
}));

// Mock terminalNameGenerator
vi.mock('../../main/terminal-name-generator', () => ({
  terminalNameGenerator: {
    generateName: vi.fn()
  }
}));

// Mock shell escape utilities
vi.mock('../../shared/utils/shell-escape', () => ({
  escapeShellArg: (arg: string) => `'${arg}'`,
  escapeShellArgWindows: (arg: string) => `"${arg}"`
}));

// Mock claude CLI utils
vi.mock('../../main/claude-cli-utils', () => ({
  getClaudeCliInvocationAsync: vi.fn(async () => ({
    command: '/usr/local/bin/claude'
  }))
}));

// Mock settings utils
vi.mock('../../main/settings-utils', () => ({
  readSettingsFileAsync: vi.fn(async () => ({}))
}));

// Mock usage monitor
vi.mock('../../main/claude-profile/usage-monitor', () => ({
  getUsageMonitor: vi.fn(() => ({}))
}));

// Sample profile
function createTestProfile(overrides: Partial<ClaudeProfile> = {}): ClaudeProfile {
  return {
    id: 'test-profile-id',
    name: 'Test Profile',
    isDefault: false,
    configDir: path.join(TEST_CONFIG_DIR, 'test-profile'),
    createdAt: new Date(),
    ...overrides
  };
}

// Setup test directories
function setupTestDirs(): void {
  initTestDirectories();
  mkdirSync(TEST_CONFIG_DIR, { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (TEST_DIR && existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Claude Profile IPC Integration', () => {
  let handlers: Map<string, Function>;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    handlers = new Map();

    // Capture IPC handlers
    mockIpcMain.handle.mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    });

    mockIpcMain.on.mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    });

    // Import and call the registration function
    const { registerTerminalHandlers } = await import('../../main/ipc-handlers/terminal-handlers');
    registerTerminalHandlers(mockTerminalManager as any, () => mockBrowserWindow as any);
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('CLAUDE_PROFILE_SAVE', () => {
    it('should save a new profile with generated ID', async () => {
      // Get the handler
      const handleProfileSave = handlers.get('claude:profileSave');
      expect(handleProfileSave).toBeDefined();

      const newProfile = createTestProfile({
        id: '', // No ID - should be generated
        name: 'New Account'
      });

      const result = await handleProfileSave!(null, newProfile) as IPCResult<ClaudeProfile>;

      expect(result.success).toBe(true);
      expect(mockProfileManager.generateProfileId).toHaveBeenCalledWith('New Account');
      expect(mockProfileManager.saveProfile).toHaveBeenCalled();

      const savedProfile = mockProfileManager.saveProfile.mock.calls[0][0];
      expect(savedProfile.id).toBe('profile-new-account');
    });

    it('should save profile with existing ID', async () => {
      const handleProfileSave = handlers.get('claude:profileSave');
      expect(handleProfileSave).toBeDefined();

      const existingProfile = createTestProfile({
        id: 'existing-id',
        name: 'Existing Account'
      });

      const result = await handleProfileSave!(null, existingProfile) as IPCResult<ClaudeProfile>;

      expect(result.success).toBe(true);
      expect(mockProfileManager.generateProfileId).not.toHaveBeenCalled();
      expect(mockProfileManager.saveProfile).toHaveBeenCalledWith(existingProfile);
    });

    it('should create config directory for non-default profiles', async () => {
      const handleProfileSave = handlers.get('claude:profileSave');
      expect(handleProfileSave).toBeDefined();

      const profile = createTestProfile({
        isDefault: false,
        configDir: path.join(TEST_DIR, 'new-profile-config')
      });

      await handleProfileSave!(null, profile);

      expect(existsSync(profile.configDir!)).toBe(true);
    });

    it('should not create config directory for default profile', async () => {
      const handleProfileSave = handlers.get('claude:profileSave');
      expect(handleProfileSave).toBeDefined();

      const profile = createTestProfile({
        isDefault: true,
        configDir: path.join(TEST_DIR, 'should-not-exist')
      });

      await handleProfileSave!(null, profile);

      expect(existsSync(profile.configDir!)).toBe(false);
    });

    it('should handle save errors gracefully', async () => {
      const handleProfileSave = handlers.get('claude:profileSave');
      expect(handleProfileSave).toBeDefined();

      mockProfileManager.saveProfile.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const profile = createTestProfile();
      const result = await handleProfileSave!(null, profile) as IPCResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('CLAUDE_PROFILE_INITIALIZE', () => {
    beforeEach(() => {
      // Reset terminal manager mock
      mockTerminalManager.create.mockResolvedValue({ success: true });
      mockTerminalManager.write.mockReturnValue(undefined);
    });

    it('should create terminal and run claude setup-token for non-default profile', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile({
        id: 'test-profile',
        name: 'Test Profile',
        isDefault: false,
        configDir: path.join(TEST_DIR, 'test-config')
      });

      mockProfileManager.getProfile.mockReturnValue(profile);

      const result = await handleProfileInit!(null, 'test-profile') as IPCResult;

      expect(result.success).toBe(true);
      expect(mockProfileManager.getProfile).toHaveBeenCalledWith('test-profile');
      expect(mockTerminalManager.create).toHaveBeenCalled();

      const createCall = mockTerminalManager.create.mock.calls[0][0] as TerminalCreateOptions;
      expect(createCall.id).toMatch(/^claude-login-test-profile-/);
    });

    it('should write claude setup-token command with CLAUDE_CONFIG_DIR for non-default profile', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile({
        id: 'test-profile',
        name: 'Test Profile',
        isDefault: false,
        configDir: path.join(TEST_DIR, 'test-config')
      });

      mockProfileManager.getProfile.mockReturnValue(profile);

      await handleProfileInit!(null, 'test-profile');

      expect(mockTerminalManager.write).toHaveBeenCalled();

      const writeCall = mockTerminalManager.write.mock.calls[0];
      const command = writeCall[1] as string;

      expect(command).toContain('CLAUDE_CONFIG_DIR');
      expect(command).toContain('setup-token');
    });

    it('should write simple claude setup-token command for default profile', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile({
        id: 'default',
        name: 'Default',
        isDefault: true
      });

      mockProfileManager.getProfile.mockReturnValue(profile);

      await handleProfileInit!(null, 'default');

      expect(mockTerminalManager.write).toHaveBeenCalled();

      const writeCall = mockTerminalManager.write.mock.calls[0];
      const command = writeCall[1] as string;

      expect(command).not.toContain('CLAUDE_CONFIG_DIR');
      expect(command).toContain('setup-token');
    });

    it('should send TERMINAL_AUTH_CREATED event after creating terminal', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile({
        id: 'test-profile',
        name: 'Test Profile'
      });

      mockProfileManager.getProfile.mockReturnValue(profile);

      await handleProfileInit!(null, 'test-profile');

      expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith(
        'terminal:authCreated',
        expect.objectContaining({
          profileId: 'test-profile',
          profileName: 'Test Profile',
          terminalId: expect.stringMatching(/^claude-login-test-profile-/)
        })
      );
    });

    it('should return error if profile not found', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      mockProfileManager.getProfile.mockReturnValue(null);

      const result = await handleProfileInit!(null, 'nonexistent') as IPCResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Profile not found');
      expect(mockTerminalManager.create).not.toHaveBeenCalled();
    });

    it('should return error if terminal creation fails', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile();
      mockProfileManager.getProfile.mockReturnValue(profile);

      mockTerminalManager.create.mockResolvedValueOnce({
        success: false,
        error: 'Max terminals reached'
      });

      const result = await handleProfileInit!(null, 'test-profile') as IPCResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max terminals reached');
      expect(mockTerminalManager.write).not.toHaveBeenCalled();
    });

    it('should create config directory for non-default profile before terminal creation', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      const profile = createTestProfile({
        isDefault: false,
        configDir: path.join(TEST_DIR, 'init-config')
      });

      mockProfileManager.getProfile.mockReturnValue(profile);

      await handleProfileInit!(null, 'test-profile');

      expect(existsSync(profile.configDir!)).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      const handleProfileInit = handlers.get('claude:profileInitialize');
      expect(handleProfileInit).toBeDefined();

      mockProfileManager.getProfile.mockImplementationOnce(() => {
        throw new Error('Internal error');
      });

      const result = await handleProfileInit!(null, 'test-profile') as IPCResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal error');
    });
  });

  describe('IPC handler registration', () => {
    it('should register CLAUDE_PROFILE_SAVE handler', () => {
      expect(handlers.has('claude:profileSave')).toBe(true);
    });

    it('should register CLAUDE_PROFILE_INITIALIZE handler', () => {
      expect(handlers.has('claude:profileInitialize')).toBe(true);
    });
  });
});
