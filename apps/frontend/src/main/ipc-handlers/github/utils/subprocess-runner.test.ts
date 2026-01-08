
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPythonSubprocess } from './subprocess-runner';
import * as childProcess from 'child_process';
import EventEmitter from 'events';

// Mock child_process with importOriginal to preserve all exports
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    exec: vi.fn(),
  };
});

// Mock parsePythonCommand
vi.mock('../../../python-detector', () => ({
  parsePythonCommand: vi.fn((path) => {
    // specific behavior for spaced paths can be mocked here or overwridden in tests
    if (path.includes(' ')) {
        return [path, []]; // Simple pass-through for test
    }
    return [path, []];
  }),
}));

import { parsePythonCommand } from '../../../python-detector';

describe('runPythonSubprocess', () => {
  let mockSpawn: any;
  let mockChildProcess: any;

  beforeEach(() => {
    mockSpawn = vi.mocked(childProcess.spawn);
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockChildProcess);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle python path with spaces', async () => {
    // Arrange
    const pythonPath = '/path/with spaces/python';
    const mockArgs = ['-c', 'print("hello")'];
    
    // Mock parsePythonCommand to return the path split logic if needed, 
    // or just rely on the mock above. 
    // Let's make sure our mock enables the scenario we want.
    vi.mocked(parsePythonCommand).mockReturnValue(['/path/with spaces/python', []]);
    
    // Act
    runPythonSubprocess({
      pythonPath,
      args: mockArgs,
      cwd: '/tmp',
    });

    // Assert
    expect(parsePythonCommand).toHaveBeenCalledWith(pythonPath);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/path/with spaces/python',
      expect.arrayContaining(mockArgs),
      expect.any(Object)
    );
  });

  it('should pass user arguments AFTER python arguments', async () => {
    // Arrange
    const pythonPath = 'python';
    const pythonBaseArgs = ['-u', '-X', 'utf8'];
    const userArgs = ['script.py', '--verbose'];
    
    // Setup mock to simulate what parsePythonCommand would return for a standard python path
    vi.mocked(parsePythonCommand).mockReturnValue(['python', pythonBaseArgs]);

    // Act
    runPythonSubprocess({
      pythonPath,
      args: userArgs,
      cwd: '/tmp',
    });

    // Assert
    // The critical check: verify the ORDER of arguments in the second parameter of spawn
    // expect call to be: spawn('python', ['-u', '-X', 'utf8', 'script.py', '--verbose'], ...)
    const expectedArgs = [...pythonBaseArgs, ...userArgs];
    
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expectedArgs, // Exact array match verifies order
      expect.any(Object)
    );
  });
});
