/**
 * Unit tests for agent-queue.ts
 * Tests that ideation and roadmap spawning use pythonEnvManager.getPythonPath()
 * instead of system Python (findPythonCommand)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Test directories - use os.tmpdir() for portability
const TEST_DIR = path.join(tmpdir(), 'agent-queue-test');
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const AUTO_CLAUDE_SOURCE = path.join(TEST_DIR, 'auto-claude-source');

// Mock spawn to capture calls
const mockStdout = new EventEmitter();
const mockStderr = new EventEmitter();
const mockProcess = Object.assign(new EventEmitter(), {
  stdout: mockStdout,
  stderr: mockStderr,
  pid: 12345,
  killed: false,
  kill: vi.fn(() => {
    mockProcess.killed = true;
    return true;
  })
});

const mockSpawn = vi.fn(() => mockProcess);

vi.mock('child_process', () => ({
  spawn: mockSpawn
}));

// Mock pythonEnvManager singleton - this is the key fix we're testing
const mockGetPythonPath = vi.fn();
vi.mock('../../python-env-manager', () => ({
  pythonEnvManager: {
    getPythonPath: mockGetPythonPath
  }
}));

// Mock rate-limit-detector
vi.mock('../../rate-limit-detector', () => ({
  detectRateLimit: vi.fn(() => ({ isRateLimited: false })),
  createSDKRateLimitInfo: vi.fn(),
  getProfileEnv: vi.fn(() => ({}))
}));

// Mock debug logger
vi.mock('../../../shared/utils/debug-logger', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn()
}));

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(AUTO_CLAUDE_SOURCE, 'runners'), { recursive: true });

  // Create mock runner files
  writeFileSync(
    path.join(AUTO_CLAUDE_SOURCE, 'runners', 'ideation_runner.py'),
    '# Mock ideation runner'
  );
  writeFileSync(
    path.join(AUTO_CLAUDE_SOURCE, 'runners', 'roadmap_runner.py'),
    '# Mock roadmap runner'
  );
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('AgentQueueManager', () => {
  let queueManager: InstanceType<typeof import('../agent-queue').AgentQueueManager>;
  let mockEmitter: EventEmitter;
  let mockState: {
    generateSpawnId: () => string;
    addProcess: (id: string, info: unknown) => void;
  };
  let mockEvents: {
    parseIdeationProgress: () => { phase: string; progress: number };
    parseRoadmapProgress: () => { phase: string; progress: number };
  };
  let mockProcessManager: {
    getAutoBuildSourcePath: () => string | null;
    getCombinedEnv: () => Record<string, string>;
    killProcess: () => boolean;
  };

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();

    // Reset mock process state
    mockProcess.killed = false;
    mockProcess.removeAllListeners();
    mockStdout.removeAllListeners();
    mockStderr.removeAllListeners();

    // Create mock dependencies
    mockEmitter = new EventEmitter();
    mockState = {
      generateSpawnId: vi.fn(() => 'spawn-123'),
      addProcess: vi.fn()
    };
    mockEvents = {
      parseIdeationProgress: vi.fn(() => ({ phase: 'generating', progress: 50 })),
      parseRoadmapProgress: vi.fn(() => ({ phase: 'generating', progress: 50 }))
    };
    mockProcessManager = {
      getAutoBuildSourcePath: vi.fn(() => AUTO_CLAUDE_SOURCE),
      getCombinedEnv: vi.fn(() => ({})),
      killProcess: vi.fn(() => false)
    };

    // Reset modules to get fresh instance
    vi.resetModules();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('startIdeationGeneration', () => {
    it('should use pythonEnvManager.getPythonPath() for spawning ideation process', async () => {
      // Setup: Mock pythonEnvManager to return a specific venv path
      const expectedPythonPath = '/path/to/venv/bin/python';
      mockGetPythonPath.mockReturnValue(expectedPythonPath);

      // Import and create the queue manager
      const { AgentQueueManager } = await import('../agent-queue');
      queueManager = new AgentQueueManager(
        mockState as never,
        mockEvents as never,
        mockProcessManager as never,
        mockEmitter
      );

      // Start ideation generation
      queueManager.startIdeationGeneration(
        'test-project-id',
        TEST_PROJECT_PATH,
        {
          enabledTypes: ['code_improvements'],
          maxIdeasPerType: 5,
          includeRoadmapContext: false,
          includeKanbanContext: false
        },
        false
      );

      // Verify: spawn was called with the venv Python path
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe(expectedPythonPath);
      expect(spawnCall[0]).not.toBe('python');
      expect(spawnCall[0]).not.toBe('python3');
    });

    it('should emit error when Python environment is not ready', async () => {
      // Setup: Mock pythonEnvManager to return null (not initialized)
      mockGetPythonPath.mockReturnValue(null);

      // Listen for error event
      const errorHandler = vi.fn();
      mockEmitter.on('ideation-error', errorHandler);

      // Import and create the queue manager
      const { AgentQueueManager } = await import('../agent-queue');
      queueManager = new AgentQueueManager(
        mockState as never,
        mockEvents as never,
        mockProcessManager as never,
        mockEmitter
      );

      // Start ideation generation
      queueManager.startIdeationGeneration(
        'test-project-id',
        TEST_PROJECT_PATH,
        {
          enabledTypes: ['code_improvements'],
          maxIdeasPerType: 5,
          includeRoadmapContext: false,
          includeKanbanContext: false
        },
        false
      );

      // Verify: error was emitted
      expect(errorHandler).toHaveBeenCalledWith(
        'test-project-id',
        'Python environment not ready. Please wait for initialization.'
      );

      // Verify: spawn was NOT called
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('startRoadmapGeneration', () => {
    it('should use pythonEnvManager.getPythonPath() for spawning roadmap process', async () => {
      // Setup: Mock pythonEnvManager to return a specific venv path
      const expectedPythonPath = '/path/to/venv/bin/python';
      mockGetPythonPath.mockReturnValue(expectedPythonPath);

      // Import and create the queue manager
      const { AgentQueueManager } = await import('../agent-queue');
      queueManager = new AgentQueueManager(
        mockState as never,
        mockEvents as never,
        mockProcessManager as never,
        mockEmitter
      );

      // Start roadmap generation
      queueManager.startRoadmapGeneration(
        'test-project-id',
        TEST_PROJECT_PATH,
        false,
        false,
        false
      );

      // Verify: spawn was called with the venv Python path
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe(expectedPythonPath);
      expect(spawnCall[0]).not.toBe('python');
      expect(spawnCall[0]).not.toBe('python3');
    });

    it('should emit error when Python environment is not ready', async () => {
      // Setup: Mock pythonEnvManager to return null (not initialized)
      mockGetPythonPath.mockReturnValue(null);

      // Listen for error event
      const errorHandler = vi.fn();
      mockEmitter.on('roadmap-error', errorHandler);

      // Import and create the queue manager
      const { AgentQueueManager } = await import('../agent-queue');
      queueManager = new AgentQueueManager(
        mockState as never,
        mockEvents as never,
        mockProcessManager as never,
        mockEmitter
      );

      // Start roadmap generation
      queueManager.startRoadmapGeneration(
        'test-project-id',
        TEST_PROJECT_PATH,
        false,
        false,
        false
      );

      // Verify: error was emitted
      expect(errorHandler).toHaveBeenCalledWith(
        'test-project-id',
        'Python environment not ready. Please wait for initialization.'
      );

      // Verify: spawn was NOT called
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
