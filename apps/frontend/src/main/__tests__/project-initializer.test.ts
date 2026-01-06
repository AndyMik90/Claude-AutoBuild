import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { initializeProject } from '../project-initializer';

vi.mock('child_process', () => ({
  execFileSync: vi.fn()
}));

describe('project-initializer', () => {
  const tempDirs: string[] = [];
  const execFileSyncMock = vi.mocked(execFileSync);

  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('initializes without git when requireGit is false', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'auto-claude-init-'));
    tempDirs.push(projectPath);

    const result = initializeProject(projectPath, { requireGit: false });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(existsSync(path.join(projectPath, '.auto-claude'))).toBe(true);
    expect(existsSync(path.join(projectPath, '.auto-claude', 'specs'))).toBe(true);
  });

  it('does not invoke git commands when requireGit is false', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'auto-claude-init-'));
    tempDirs.push(projectPath);

    initializeProject(projectPath, { requireGit: false });

    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('requires git by default when options are omitted', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'auto-claude-init-'));
    tempDirs.push(projectPath);
    execFileSyncMock.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = initializeProject(projectPath);

    expect(execFileSyncMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('requires git when requireGit is undefined', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'auto-claude-init-'));
    tempDirs.push(projectPath);
    execFileSyncMock.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = initializeProject(projectPath, { requireGit: undefined });

    expect(execFileSyncMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('invokes git commands when requireGit is true', () => {
    const projectPath = mkdtempSync(path.join(tmpdir(), 'auto-claude-init-'));
    tempDirs.push(projectPath);
    execFileSyncMock.mockImplementation(() => '');

    initializeProject(projectPath, { requireGit: true });

    expect(execFileSyncMock).toHaveBeenCalled();
  });
});
