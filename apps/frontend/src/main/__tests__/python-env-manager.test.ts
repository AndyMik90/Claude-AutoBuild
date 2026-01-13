import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock fs module before importing the module under test
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import * as fs from 'fs';

// Mock electron's app module
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
    getAppPath: vi.fn().mockReturnValue('/mock/app'),
    on: vi.fn(),
  },
}));

// Mock python-detector
vi.mock('../python-detector', () => ({
  findPythonCommand: vi.fn().mockReturnValue('python'),
  getBundledPythonPath: vi.fn().mockReturnValue(null),
}));

// Import after mocking
import { PythonEnvManager } from '../python-env-manager';

describe('PythonEnvManager', () => {
  let manager: PythonEnvManager;

  beforeEach(() => {
    manager = new PythonEnvManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPythonEnv', () => {
    it('should return basic Python environment variables', () => {
      const env = manager.getPythonEnv();

      expect(env.PYTHONDONTWRITEBYTECODE).toBe('1');
      expect(env.PYTHONIOENCODING).toBe('utf-8');
      expect(env.PYTHONNOUSERSITE).toBe('1');
    });

    it('should exclude PYTHONHOME from environment', () => {
      // Use vi.stubEnv for cleaner environment variable mocking
      vi.stubEnv('PYTHONHOME', '/some/python/home');

      const env = manager.getPythonEnv();
      expect(env.PYTHONHOME).toBeUndefined();

      vi.unstubAllEnvs();
    });

    it('should exclude PYTHONSTARTUP from environment on Windows', () => {
      const originalPlatform = process.platform;

      // Mock Windows platform
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Use vi.stubEnv for cleaner environment variable mocking
      vi.stubEnv('PYTHONSTARTUP', '/some/external/startup.py');

      try {
        const env = manager.getPythonEnv();
        // Should not inherit the external PYTHONSTARTUP value
        // It should either be undefined (no sitePackagesPath) or our bootstrap script path
        expect(env.PYTHONSTARTUP).not.toBe('/some/external/startup.py');

        // More explicit: without sitePackagesPath, PYTHONSTARTUP should be undefined
        // (because Windows-specific env vars are only set when sitePackagesPath exists)
        expect(env.PYTHONSTARTUP).toBeUndefined();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        vi.unstubAllEnvs();
      }
    });
  });

  describe('Windows pywin32 DLL loading fix', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should add pywin32_system32 to PATH on Windows when sitePackagesPath is set', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private property for testing
      (manager as any).sitePackagesPath = sitePackagesPath;

      // Mock existsSync to return true for the startup script
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const env = manager.getPythonEnv();

      // Should include pywin32_system32 in PATH
      const expectedPath = path.join(sitePackagesPath, 'pywin32_system32');
      expect(env.PATH).toContain(expectedPath);
    });

    it('should set PYTHONSTARTUP to bootstrap script on Windows', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private property for testing
      (manager as any).sitePackagesPath = sitePackagesPath;

      // Mock existsSync to return true for the startup script
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const env = manager.getPythonEnv();

      // Should set PYTHONSTARTUP to our bootstrap script
      expect(env.PYTHONSTARTUP).toBe(
        path.join(sitePackagesPath, '_auto_claude_startup.py')
      );
    });

    it('should include win32 and win32/lib in PYTHONPATH on Windows', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private property for testing
      (manager as any).sitePackagesPath = sitePackagesPath;

      // Mock existsSync to return true
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const env = manager.getPythonEnv();

      // PYTHONPATH should include site-packages, win32, and win32/lib
      expect(env.PYTHONPATH).toContain(sitePackagesPath);
      expect(env.PYTHONPATH).toContain(path.join(sitePackagesPath, 'win32'));
      expect(env.PYTHONPATH).toContain(
        path.join(sitePackagesPath, 'win32', 'lib')
      );
    });

    it('should create bootstrap script if it does not exist', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private property for testing
      (manager as any).sitePackagesPath = sitePackagesPath;

      // Mock existsSync:
      // - First call (in getPythonEnv to check if script exists): false
      // - Second call (in ensurePywin32StartupScript to check before writing): false
      // - Third call (in getPythonEnv after creation): true
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)  // getPythonEnv check
        .mockReturnValueOnce(false)  // ensurePywin32StartupScript check
        .mockReturnValue(true);      // after creation check

      const env = manager.getPythonEnv();

      // Should have tried to create the script
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(sitePackagesPath, '_auto_claude_startup.py'),
        expect.stringContaining('_bootstrap_pywin32'),
        'utf-8'
      );

      // Should have set PYTHONSTARTUP after creating the script
      expect(env.PYTHONSTARTUP).toBe(
        path.join(sitePackagesPath, '_auto_claude_startup.py')
      );
    });

    it('should not add Windows-specific env vars on non-Windows platforms', () => {
      // Restore non-Windows platform
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const sitePackagesPath = '/test/site-packages';

      // Access private property for testing
      (manager as any).sitePackagesPath = sitePackagesPath;

      const env = manager.getPythonEnv();

      // Should not have PYTHONSTARTUP set
      expect(env.PYTHONSTARTUP).toBeUndefined();

      // PYTHONPATH should just be the site-packages (no win32 additions)
      expect(env.PYTHONPATH).toBe(sitePackagesPath);
    });
  });

  describe('Bootstrap script content', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.clearAllMocks();
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should generate bootstrap script with os.add_dll_directory call', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private method for testing
      const ensureScript = (manager as any).ensurePywin32StartupScript.bind(
        manager
      );

      let writtenContent = '';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(
        (filePath: any, content: any) => {
          writtenContent = content as string;
        }
      );

      ensureScript(sitePackagesPath);

      // Verify the script contains critical elements
      expect(writtenContent).toContain('os.add_dll_directory');
      expect(writtenContent).toContain('pywin32_system32');
      expect(writtenContent).toContain('site.addsitedir');
      expect(writtenContent).toContain('_bootstrap_pywin32');
    });

    it('should not overwrite existing bootstrap script', () => {
      const sitePackagesPath = 'C:\\test\\site-packages';

      // Access private method for testing
      const ensureScript = (manager as any).ensurePywin32StartupScript.bind(
        manager
      );

      vi.mocked(fs.existsSync).mockReturnValue(true);

      ensureScript(sitePackagesPath);

      // Should not write if file exists
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});

describe('pywin32 bootstrap script integration', () => {
  it('should generate bootstrap script with proper error handling', () => {
    // This test verifies that the generated bootstrap script contains
    // critical elements for safe pywin32 initialization.
    // We test the actual generated content rather than duplicating the script,
    // ensuring tests stay in sync with implementation.

    const manager = new PythonEnvManager();
    const sitePackagesPath = 'C:\\test\\site-packages';

    // Mock fs to capture written content
    let writtenContent = '';
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(
      (filePath: any, content: any) => {
        writtenContent = content as string;
      }
    );

    // Trigger script generation
    (manager as any).ensurePywin32StartupScript(sitePackagesPath);

    // Verify critical safety markers in the generated script:
    // 1. Check for add_dll_directory availability (Python 3.8+ only)
    expect(writtenContent).toContain("hasattr(os, 'add_dll_directory')");

    // 2. Proper error handling for DLL directory addition
    expect(writtenContent).toContain('except OSError:');

    // 3. Proper error handling for site module operations
    expect(writtenContent).toContain('except Exception:');

    // 4. Uses site.addsitedir for .pth file processing
    expect(writtenContent).toContain('site.addsitedir');

    // 5. References pywin32_system32 directory
    expect(writtenContent).toContain('pywin32_system32');
  });
});
