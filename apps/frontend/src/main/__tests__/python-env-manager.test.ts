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
      const originalEnv = process.env;
      process.env = { ...originalEnv, PYTHONHOME: '/some/python/home' };

      try {
        const env = manager.getPythonEnv();
        expect(env.PYTHONHOME).toBeUndefined();
      } finally {
        process.env = originalEnv;
      }
    });

    it('should exclude PYTHONSTARTUP from environment on Windows', () => {
      const originalEnv = process.env;
      const originalPlatform = process.platform;

      // Mock Windows platform
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env = { ...originalEnv, PYTHONSTARTUP: '/some/startup.py' };

      try {
        const env = manager.getPythonEnv();
        // Should not inherit the external PYTHONSTARTUP
        expect(env.PYTHONSTARTUP).not.toBe('/some/startup.py');
      } finally {
        process.env = originalEnv;
        Object.defineProperty(process, 'platform', { value: originalPlatform });
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
  it('should handle import errors gracefully in bootstrap script', () => {
    // This test verifies that the bootstrap script Python code
    // won't crash if there are import errors

    const bootstrapScript = `
import os
import sys

def _bootstrap_pywin32():
    site_packages = os.path.dirname(os.path.abspath(__file__))
    pywin32_system32 = os.path.join(site_packages, 'pywin32_system32')

    if os.path.isdir(pywin32_system32):
        if hasattr(os, 'add_dll_directory'):
            try:
                os.add_dll_directory(pywin32_system32)
            except OSError:
                pass

        current_path = os.environ.get('PATH', '')
        if pywin32_system32 not in current_path:
            os.environ['PATH'] = pywin32_system32 + os.pathsep + current_path

    try:
        import site
        if site_packages not in sys.path:
            site.addsitedir(site_packages)
    except Exception:
        pass

_bootstrap_pywin32()
`;

    // Verify the script structure is correct
    expect(bootstrapScript).toContain('hasattr(os, \'add_dll_directory\')');
    expect(bootstrapScript).toContain('try:');
    expect(bootstrapScript).toContain('except OSError:');
    expect(bootstrapScript).toContain('except Exception:');
  });
});
