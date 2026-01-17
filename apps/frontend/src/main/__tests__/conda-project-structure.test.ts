/**
 * Tests for conda-project-structure.ts
 *
 * Tests project structure detection with cross-platform support.
 * Uses platform mocking and describe.each for OS matrix testing.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

// Import mocked modules
import { existsSync, readdirSync, statSync } from 'fs';

// Import module under test after mocks are set up
import {
  detectProjectStructure,
  getPythonEnvPath,
  getScriptsPath,
  getWorkspaceFilePath,
} from '../conda-project-structure';

/**
 * Platform configuration for parameterized tests
 */
interface PlatformConfig {
  name: string;
  platform: NodeJS.Platform;
  pathSep: string;
  projectRoot: string;
}

/**
 * Platform configurations for OS matrix testing
 */
const platforms: PlatformConfig[] = [
  {
    name: 'Windows',
    platform: 'win32',
    pathSep: '\\',
    projectRoot: 'C:\\Users\\test\\project',
  },
  {
    name: 'macOS',
    platform: 'darwin',
    pathSep: '/',
    projectRoot: '/Users/test/project',
  },
  {
    name: 'Linux',
    platform: 'linux',
    pathSep: '/',
    projectRoot: '/home/test/project',
  },
];

/**
 * Normalize path to forward slashes for platform-agnostic comparison.
 * This allows tests to use consistent path separators regardless of OS.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Helper to check if current platform is Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Helper to check if current platform is macOS
 */
function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Helper to check if current platform is Linux
 */
function isLinux(): boolean {
  return process.platform === 'linux';
}

describe('conda-project-structure', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original platform after each test
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Helper to set the platform for a test
   */
  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', {
      value: platform,
      writable: true,
      configurable: true,
    });
  }

  /**
   * Helper to create a file existence mock based on existing files array.
   * All paths are normalized to forward slashes for platform-agnostic comparison.
   */
  function mockFileSystem(
    existingFiles: string[],
    directories: string[] = [],
    directoryContents: Record<string, string[]> = {}
  ): void {
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      const normalized = normalizePath(filePath.toString());
      return (
        existingFiles.some((f) => normalizePath(f) === normalized) ||
        directories.some((d) => normalizePath(d) === normalized)
      );
    });

    vi.mocked(readdirSync).mockImplementation((dirPath: string) => {
      const normalized = normalizePath(dirPath.toString());
      return (directoryContents[normalized] || []) as any;
    });

    vi.mocked(statSync).mockImplementation((filePath: string) => {
      const normalized = normalizePath(filePath.toString());
      return {
        isDirectory: () => directories.some((d) => normalizePath(d) === normalized),
        isFile: () => existingFiles.some((f) => normalizePath(f) === normalized),
      } as any;
    });
  }

  describe.each(platforms)('Platform: $name', ({ platform, projectRoot }) => {
    beforeEach(() => {
      setPlatform(platform);
    });

    describe('detectProjectStructure', () => {
      it('should detect pure Python project with pyproject.toml at root', () => {
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectRoot)]: ['pyproject.toml'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.pythonRoot).toBe(projectRoot);
        expect(result.hasDotnet).toBe(false);
        expect(result.pyprojectPath).toBe(pyprojectPath);
      });

      it('should detect pure Python project with requirements.txt at root', () => {
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([requirementsPath], [], {
          [normalizePath(projectRoot)]: ['requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.pythonRoot).toBe(projectRoot);
        expect(result.requirementsFiles).toContain(requirementsPath);
      });

      it('should detect pure Python project with setup.py at root', () => {
        const setupPyPath = path.join(projectRoot, 'setup.py');

        mockFileSystem([setupPyPath], [], {
          [normalizePath(projectRoot)]: ['setup.py'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.pythonRoot).toBe(projectRoot);
      });

      it('should detect mixed project with .NET at root', () => {
        const csprojPath = path.join(projectRoot, 'MyApp.csproj');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([csprojPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['MyApp.csproj', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('mixed');
        expect(result.hasDotnet).toBe(true);
        expect(result.pythonRoot).toBe(projectRoot);
      });

      it('should detect mixed project with .sln file', () => {
        const slnPath = path.join(projectRoot, 'MySolution.sln');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([slnPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['MySolution.sln', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('mixed');
        expect(result.hasDotnet).toBe(true);
      });

      it('should detect mixed project with src/python structure', () => {
        const srcDir = path.join(projectRoot, 'src');
        const srcPythonDir = path.join(srcDir, 'python');
        const pyprojectPath = path.join(srcPythonDir, 'pyproject.toml');

        mockFileSystem(
          [pyprojectPath],
          [srcDir, srcPythonDir],
          {
            [normalizePath(srcPythonDir)]: ['pyproject.toml'],
          }
        );

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('mixed');
        expect(result.pythonRoot).toBe(srcPythonDir);
        expect(result.pyprojectPath).toBe(pyprojectPath);
      });

      it('should detect Node.js in hasOtherLanguages when package.json present with Python', () => {
        // Note: When Python indicators are present at root, the project is still
        // considered "pure-python" even with other languages. The other languages
        // are tracked in hasOtherLanguages array.
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([packageJsonPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['package.json', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        // Project with Python at root is considered "pure-python" but tracks other languages
        expect(result.type).toBe('pure-python');
        expect(result.hasOtherLanguages).toContain('node');
      });

      it('should detect multiple requirements files', () => {
        const reqPath = path.join(projectRoot, 'requirements.txt');
        const reqDevPath = path.join(projectRoot, 'requirements-dev.txt');

        mockFileSystem([reqPath, reqDevPath], [], {
          [normalizePath(projectRoot)]: ['requirements.txt', 'requirements-dev.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.requirementsFiles).toContain(reqPath);
        expect(result.requirementsFiles).toContain(reqDevPath);
      });

      it('should detect requirements in requirements/ subdirectory', () => {
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
        const reqDir = path.join(projectRoot, 'requirements');
        const baseReqPath = path.join(reqDir, 'base.txt');
        const devReqPath = path.join(reqDir, 'dev.txt');

        mockFileSystem(
          [pyprojectPath, baseReqPath, devReqPath],
          [reqDir],
          {
            [normalizePath(projectRoot)]: ['pyproject.toml', 'requirements'],
            [normalizePath(reqDir)]: ['base.txt', 'dev.txt'],
          }
        );

        const result = detectProjectStructure(projectRoot);

        expect(result.requirementsFiles).toContain(baseReqPath);
        expect(result.requirementsFiles).toContain(devReqPath);
      });

      it('should detect .NET projects in src/ subdirectory', () => {
        const srcDir = path.join(projectRoot, 'src');
        const appDir = path.join(srcDir, 'MyApp');
        const csprojPath = path.join(appDir, 'MyApp.csproj');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem(
          [csprojPath, requirementsPath],
          [srcDir, appDir],
          {
            [normalizePath(projectRoot)]: ['requirements.txt', 'src'],
            [normalizePath(srcDir)]: ['MyApp'],
            [normalizePath(appDir)]: ['MyApp.csproj'],
          }
        );

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('mixed');
        expect(result.hasDotnet).toBe(true);
      });

      it('should handle empty/non-existent project directory gracefully', () => {
        mockFileSystem([], [], {
          [normalizePath(projectRoot)]: [],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.pythonRoot).toBe(projectRoot);
        expect(result.hasDotnet).toBe(false);
        expect(result.hasOtherLanguages).toEqual([]);
      });

      it('should detect Go in hasOtherLanguages when go.mod present with Python', () => {
        // Note: When Python indicators are present at root, the project is still
        // considered "pure-python" even with other languages.
        const goModPath = path.join(projectRoot, 'go.mod');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([goModPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['go.mod', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.hasOtherLanguages).toContain('go');
      });

      it('should detect Rust in hasOtherLanguages when Cargo.toml present with Python', () => {
        // Note: When Python indicators are present at root, the project is still
        // considered "pure-python" even with other languages.
        const cargoPath = path.join(projectRoot, 'Cargo.toml');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([cargoPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['Cargo.toml', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.hasOtherLanguages).toContain('rust');
      });

      it('should detect Java in hasOtherLanguages when pom.xml present with Python', () => {
        // Note: When Python indicators are present at root, the project is still
        // considered "pure-python" even with other languages.
        const pomPath = path.join(projectRoot, 'pom.xml');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([pomPath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['pom.xml', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.hasOtherLanguages).toContain('java');
      });

      it('should detect Ruby in hasOtherLanguages when Gemfile present with Python', () => {
        // Note: When Python indicators are present at root, the project is still
        // considered "pure-python" even with other languages.
        const gemfilePath = path.join(projectRoot, 'Gemfile');
        const requirementsPath = path.join(projectRoot, 'requirements.txt');

        mockFileSystem([gemfilePath, requirementsPath], [], {
          [normalizePath(projectRoot)]: ['Gemfile', 'requirements.txt'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('pure-python');
        expect(result.hasOtherLanguages).toContain('ruby');
      });

      it('should detect mixed project when only other language (no Python) is present', () => {
        // When no Python indicators are present at root, but other languages are,
        // it should be marked as "mixed"
        const packageJsonPath = path.join(projectRoot, 'package.json');

        mockFileSystem([packageJsonPath], [], {
          [normalizePath(projectRoot)]: ['package.json'],
        });

        const result = detectProjectStructure(projectRoot);

        expect(result.type).toBe('mixed');
        expect(result.hasOtherLanguages).toContain('node');
      });
    });

    describe('getPythonEnvPath', () => {
      it('should return correct env path for pure Python project', () => {
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectRoot)]: ['pyproject.toml'],
        });

        const result = getPythonEnvPath(projectRoot, 'myproject');

        expect(result).toBe(path.join(projectRoot, '.envs', 'myproject'));
      });

      it('should return correct env path for mixed project with src/python', () => {
        const srcDir = path.join(projectRoot, 'src');
        const srcPythonDir = path.join(srcDir, 'python');
        const pyprojectPath = path.join(srcPythonDir, 'pyproject.toml');

        mockFileSystem(
          [pyprojectPath],
          [srcDir, srcPythonDir],
          {
            [normalizePath(srcPythonDir)]: ['pyproject.toml'],
          }
        );

        const result = getPythonEnvPath(projectRoot, 'myproject');

        expect(result).toBe(path.join(srcPythonDir, '.envs', 'myproject'));
      });
    });

    describe('getScriptsPath', () => {
      it('should return correct scripts path for pure Python project', () => {
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectRoot)]: ['pyproject.toml'],
        });

        const result = getScriptsPath(projectRoot);

        expect(result).toBe(path.join(projectRoot, '.envs', 'scripts'));
      });

      it('should return correct scripts path for mixed project with src/python', () => {
        const srcDir = path.join(projectRoot, 'src');
        const srcPythonDir = path.join(srcDir, 'python');
        const pyprojectPath = path.join(srcPythonDir, 'pyproject.toml');

        mockFileSystem(
          [pyprojectPath],
          [srcDir, srcPythonDir],
          {
            [normalizePath(srcPythonDir)]: ['pyproject.toml'],
          }
        );

        const result = getScriptsPath(projectRoot);

        expect(result).toBe(path.join(srcPythonDir, '.envs', 'scripts'));
      });
    });

    describe('getWorkspaceFilePath', () => {
      it('should return correct workspace path for pure Python project', () => {
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectRoot)]: ['pyproject.toml'],
        });

        const result = getWorkspaceFilePath(projectRoot, 'myproject');

        expect(result).toBe(path.join(projectRoot, 'myproject.code-workspace'));
      });

      it('should return correct workspace path for mixed project with src/python', () => {
        const srcDir = path.join(projectRoot, 'src');
        const srcPythonDir = path.join(srcDir, 'python');
        const pyprojectPath = path.join(srcPythonDir, 'pyproject.toml');

        mockFileSystem(
          [pyprojectPath],
          [srcDir, srcPythonDir],
          {
            [normalizePath(srcPythonDir)]: ['pyproject.toml'],
          }
        );

        const result = getWorkspaceFilePath(projectRoot, 'myproject');

        expect(result).toBe(path.join(srcPythonDir, 'myproject.code-workspace'));
      });
    });
  });

  describe('Platform helper functions', () => {
    describe('isWindows', () => {
      it('should return true on Windows', () => {
        setPlatform('win32');
        expect(isWindows()).toBe(true);
        expect(isMacOS()).toBe(false);
        expect(isLinux()).toBe(false);
      });
    });

    describe('isMacOS', () => {
      it('should return true on macOS', () => {
        setPlatform('darwin');
        expect(isWindows()).toBe(false);
        expect(isMacOS()).toBe(true);
        expect(isLinux()).toBe(false);
      });
    });

    describe('isLinux', () => {
      it('should return true on Linux', () => {
        setPlatform('linux');
        expect(isWindows()).toBe(false);
        expect(isMacOS()).toBe(false);
        expect(isLinux()).toBe(true);
      });
    });
  });

  describe('Path handling edge cases', () => {
    describe.each(platforms)('Platform: $name', ({ platform, projectRoot }) => {
      beforeEach(() => {
        setPlatform(platform);
      });

      it('should handle paths with spaces', () => {
        const projectWithSpaces = platform === 'win32'
          ? 'C:\\Users\\My User\\My Project'
          : '/home/my user/my project';
        const pyprojectPath = path.join(projectWithSpaces, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectWithSpaces)]: ['pyproject.toml'],
        });

        const result = detectProjectStructure(projectWithSpaces);

        expect(result.pythonRoot).toBe(projectWithSpaces);
      });

      it('should handle special characters in paths', () => {
        const projectWithSpecial = platform === 'win32'
          ? 'C:\\Users\\test\\project-with-dashes_and_underscores'
          : '/home/test/project-with-dashes_and_underscores';
        const pyprojectPath = path.join(projectWithSpecial, 'pyproject.toml');

        mockFileSystem([pyprojectPath], [], {
          [normalizePath(projectWithSpecial)]: ['pyproject.toml'],
        });

        const result = detectProjectStructure(projectWithSpecial);

        expect(result.pythonRoot).toBe(projectWithSpecial);
      });
    });
  });
});
