/**
 * Unit tests for code editor file IPC handlers
 * Tests workspace-scoped file operations with security validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, mkdtempSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import os from 'os';

// Test data directory
const TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'file-handlers-test-'));
const TEST_WORKSPACE = path.join(TEST_DIR, 'workspace');

// Mock electron before importing
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
    ipcMain: mockIpcMain
  };
});

// Setup test workspace structure
function setupTestWorkspace(): void {
  mkdirSync(TEST_WORKSPACE, { recursive: true });
  
  // Create test files
  writeFileSync(path.join(TEST_WORKSPACE, 'file.txt'), 'test content');
  writeFileSync(path.join(TEST_WORKSPACE, 'file.test.ts'), 'export const test = true;');
  writeFileSync(path.join(TEST_WORKSPACE, 'Makefile'), 'all:\n\techo "test"');
  
  // Create subdirectory
  mkdirSync(path.join(TEST_WORKSPACE, 'src'), { recursive: true });
  writeFileSync(path.join(TEST_WORKSPACE, 'src', 'index.ts'), 'console.log("hello");');
  
  // Create hidden file
  writeFileSync(path.join(TEST_WORKSPACE, '.hidden'), 'hidden content');
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Code Editor File Handlers', () => {
  let ipcMain: EventEmitter & {
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
  };

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestWorkspace();

    // Get mocked ipcMain
    const electron = await import('electron');
    ipcMain = electron.ipcMain as unknown as typeof ipcMain;

    // Need to reset modules to re-register handlers
    vi.resetModules();
    
    // Register file handlers
    const { registerFileHandlers } = await import('../file-handlers');
    registerFileHandlers();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('codeEditorListDir handler', () => {
    it('should list root directory contents', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        ''
      );

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: Array<{ name: string; isDir: boolean }> }).data;
      
      // Should have src directory and files (but not hidden files)
      expect(data.find(n => n.name === 'src')).toBeDefined();
      expect(data.find(n => n.name === 'file.txt')).toBeDefined();
      expect(data.find(n => n.name === 'file.test.ts')).toBeDefined();
      expect(data.find(n => n.name === 'Makefile')).toBeDefined();
      expect(data.find(n => n.name === '.hidden')).toBeUndefined();
    });

    it('should list subdirectory contents', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        'src'
      );

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: Array<{ name: string }> }).data;
      expect(data.find(n => n.name === 'index.ts')).toBeDefined();
    });

    it('should sort directories first, then files alphabetically', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        ''
      );

      const data = (result as { data: Array<{ name: string; isDir: boolean }> }).data;
      
      // Find index of first file
      const firstFileIndex = data.findIndex(n => !n.isDir);
      const firstDirIndex = data.findIndex(n => n.isDir);
      
      // All directories should come before files
      if (firstFileIndex !== -1 && firstDirIndex !== -1) {
        expect(firstDirIndex).toBeLessThan(firstFileIndex);
      }
    });

    it('should reject directory traversal attempts', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        '../'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('workspace root');
    });

    it('should reject absolute paths outside workspace', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        '/tmp'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('workspace root');
    });

    it('should return error for non-existent directory', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        'nonexistent'
      );

      expect(result).toHaveProperty('success', false);
    });

    it('should skip ignored directories', async () => {
      // Create ignored directories
      mkdirSync(path.join(TEST_WORKSPACE, 'node_modules'), { recursive: true });
      mkdirSync(path.join(TEST_WORKSPACE, '.git'), { recursive: true });

      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        ''
      );

      const data = (result as { data: Array<{ name: string }> }).data;
      expect(data.find(n => n.name === 'node_modules')).toBeUndefined();
      expect(data.find(n => n.name === '.git')).toBeUndefined();
    });

    it('should handle symlinks correctly', async () => {
      // Create a directory outside workspace
      const outsideDir = path.join(TEST_DIR, 'outside');
      mkdirSync(outsideDir, { recursive: true });
      writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret data');

      // Create symlink pointing outside workspace
      const symlinkPath = path.join(TEST_WORKSPACE, 'outside-link');
      try {
        symlinkSync(outsideDir, symlinkPath, 'dir');
      } catch (e) {
        // Skip test if symlinks not supported
        if ((e as NodeJS.ErrnoException).code === 'EPERM') {
          return;
        }
        throw e;
      }

      const result = await ipcMain.invokeHandler(
        'codeEditor:listDir',
        {},
        TEST_WORKSPACE,
        ''
      );

      const data = (result as { data: Array<{ name: string }> }).data;
      // Symlink pointing outside workspace should be filtered out
      expect(data.find(n => n.name === 'outside-link')).toBeUndefined();
    });
  });

  describe('codeEditorReadFile handler', () => {
    it('should read file contents', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'file.txt'
      );

      expect(result).toHaveProperty('success', true);
      expect((result as { data: string }).data).toBe('test content');
    });

    it('should read file in subdirectory', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'src/index.ts'
      );

      expect(result).toHaveProperty('success', true);
      expect((result as { data: string }).data).toBe('console.log("hello");');
    });

    it('should reject directory traversal attempts', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        '../../../etc/passwd'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('workspace root');
    });

    it('should return error for non-existent file', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'nonexistent.txt'
      );

      expect(result).toHaveProperty('success', false);
    });

    it('should return error when trying to read directory', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'src'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('Not a file');
    });

    it('should handle symlinks pointing outside workspace', async () => {
      // Create a file outside workspace
      const outsideFile = path.join(TEST_DIR, 'secret.txt');
      writeFileSync(outsideFile, 'secret data');

      // Create symlink pointing outside workspace
      const symlinkPath = path.join(TEST_WORKSPACE, 'secret-link.txt');
      try {
        symlinkSync(outsideFile, symlinkPath, 'file');
      } catch (e) {
        // Skip test if symlinks not supported
        if ((e as NodeJS.ErrnoException).code === 'EPERM') {
          return;
        }
        throw e;
      }

      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'secret-link.txt'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('outside workspace root');
    });
  });

  describe('codeEditorWriteFile handler', () => {
    it('should write file contents', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'newfile.txt',
        'new content'
      );

      expect(result).toHaveProperty('success', true);

      // Verify file was written
      const readResult = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'newfile.txt'
      );
      expect((readResult as { data: string }).data).toBe('new content');
    });

    it('should overwrite existing file', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'file.txt',
        'updated content'
      );

      expect(result).toHaveProperty('success', true);

      // Verify file was updated
      const readResult = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'file.txt'
      );
      expect((readResult as { data: string }).data).toBe('updated content');
    });

    it('should write file in subdirectory', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'src/new.ts',
        'export const foo = 42;'
      );

      expect(result).toHaveProperty('success', true);

      // Verify file was written
      const readResult = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        'src/new.ts'
      );
      expect((readResult as { data: string }).data).toBe('export const foo = 42;');
    });

    it('should reject directory traversal attempts', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        '../../../tmp/evil.txt',
        'evil content'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('workspace root');
    });

    it('should return error when parent directory does not exist', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'nonexistent/file.txt',
        'content'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('Parent directory');
    });

    it('should return error when trying to write to directory', async () => {
      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'src',
        'content'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('Not a file');
    });

    it('should handle symlinks pointing outside workspace', async () => {
      // Create a file outside workspace
      const outsideFile = path.join(TEST_DIR, 'target.txt');
      writeFileSync(outsideFile, 'original');

      // Create symlink pointing outside workspace
      const symlinkPath = path.join(TEST_WORKSPACE, 'target-link.txt');
      try {
        symlinkSync(outsideFile, symlinkPath, 'file');
      } catch (e) {
        // Skip test if symlinks not supported
        if ((e as NodeJS.ErrnoException).code === 'EPERM') {
          return;
        }
        throw e;
      }

      const result = await ipcMain.invokeHandler(
        'codeEditor:writeFile',
        {},
        TEST_WORKSPACE,
        'target-link.txt',
        'hacked'
      );

      expect(result).toHaveProperty('success', false);
      expect((result as { error: string }).error).toContain('outside workspace root');
    });
  });

  describe('Path validation on case-insensitive file systems', () => {
    it('should handle case variations on case-insensitive systems', async () => {
      if (process.platform !== 'win32' && process.platform !== 'darwin') {
        // Skip this test on case-sensitive file systems
        return;
      }

      // Try to escape using case variation
      const result = await ipcMain.invokeHandler(
        'codeEditor:readFile',
        {},
        TEST_WORKSPACE,
        '../WORKSPACE/../../../etc/passwd'
      );

      expect(result).toHaveProperty('success', false);
    });
  });
});
