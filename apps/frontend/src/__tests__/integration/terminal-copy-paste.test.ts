/**
 * @vitest-environment jsdom
 */

/**
 * Integration tests for terminal copy/paste functionality
 * Tests xterm.js selection API integration with clipboard operations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';

// Mock xterm.js and its addons
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    loadAddon: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelection: vi.fn(() => ''),
    paste: vi.fn(),
    input: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    cols: 80,
    rows: 24
  }))
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn()
  }))
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn()
}));

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: vi.fn().mockImplementation(() => ({
    serialize: vi.fn(() => ''),
    dispose: vi.fn()
  }))
}));

describe('Terminal copy/paste integration', () => {
  let mockClipboard: {
    writeText: ReturnType<typeof vi.fn>;
    readText: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.clipboard
    mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue('clipboard content')
    };

    Object.defineProperty(global.navigator, 'clipboard', {
      value: mockClipboard,
      writable: true
    });

    // Mock window.electronAPI
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      sendTerminalInput: vi.fn()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('xterm.js selection API integration with clipboard write', () => {
    it('should integrate xterm.hasSelection() with clipboard write', async () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let mockHasSelection = vi.fn();
      let mockGetSelection = vi.fn();

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: mockHasSelection,
        getSelection: mockGetSelection,
        paste: vi.fn(),
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      // Import useXterm hook to trigger initialization
      const { useXterm } = await import('../../renderer/components/terminal/useXterm');
      const { renderHook } = await import('@testing-library/react');

      mockHasSelection.mockReturnValue(true);
      mockGetSelection.mockReturnValue('selected terminal text');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate copy operation
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(event);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Verify integration: hasSelection() called
      expect(mockHasSelection).toHaveBeenCalled();

      // Verify integration: getSelection() called when hasSelection returns true
      expect(mockGetSelection).toHaveBeenCalled();

      // Verify integration: clipboard.writeText() called with selection
      expect(mockClipboard.writeText).toHaveBeenCalledWith('selected terminal text');
    });

    it('should not call getSelection when hasSelection returns false', async () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let mockHasSelection = vi.fn();
      let mockGetSelection = vi.fn();

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: mockHasSelection,
        getSelection: mockGetSelection,
        paste: vi.fn(),
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = await import('../../renderer/components/terminal/useXterm');
      const { renderHook } = await import('@testing-library/react');

      mockHasSelection.mockReturnValue(false);

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(event);
      }

      // Verify hasSelection was called
      expect(mockHasSelection).toHaveBeenCalled();

      // Verify getSelection was NOT called (no selection)
      expect(mockGetSelection).not.toHaveBeenCalled();

      // Verify clipboard was NOT written to
      expect(mockClipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe('clipboard read with xterm paste integration', () => {
    it('should integrate clipboard.readText() with xterm.paste()', async () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let mockPaste = vi.fn();

      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true
      });

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(),
        getSelection: vi.fn(),
        paste: mockPaste,
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = await import('../../renderer/components/terminal/useXterm');
      const { renderHook } = await import('@testing-library/react');

      mockClipboard.readText.mockResolvedValue('pasted text');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const event = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(event);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Verify integration: clipboard.readText() called
      expect(mockClipboard.readText).toHaveBeenCalled();

      // Verify integration: xterm.paste() called with clipboard content
      expect(mockPaste).toHaveBeenCalledWith('pasted text');
    });

    it('should not paste when clipboard is empty', async () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let mockPaste = vi.fn();

      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true
      });

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(),
        getSelection: vi.fn(),
        paste: mockPaste,
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = await import('../../renderer/components/terminal/useXterm');
      const { renderHook } = await import('@testing-library/react');

      // Mock empty clipboard
      mockClipboard.readText.mockResolvedValue('');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const event = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(event);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Verify clipboard was read
      expect(mockClipboard.readText).toHaveBeenCalled();

      // Verify paste was NOT called for empty clipboard
      expect(mockPaste).not.toHaveBeenCalled();
    });
  });

  describe('keyboard event propagation', () => {
    it('should prevent copy/paste events from interfering with other shortcuts', () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let eventCallOrder: string[] = [];

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(() => true),
        getSelection: vi.fn(() => 'selection'),
        paste: vi.fn(),
        input: vi.fn((data: string) => {
          eventCallOrder.push(`input:${data}`);
        }),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = require('../../renderer/components/terminal/useXterm');
      const { renderHook } = require('@testing-library/react');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      // Test SHIFT+Enter (should work independently of copy/paste)
      const shiftEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false
      });

      if (keyEventHandler) {
        keyEventHandler(shiftEnterEvent);
      }

      // Verify SHIFT+Enter still works (sends newline)
      expect(eventCallOrder).toContain('\x1b\n');

      // Test CTRL+C with selection (should not interfere)
      eventCallOrder = [];
      const copyEvent = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(copyEvent);
      }

      // Copy should not send input to terminal
      expect(eventCallOrder).toHaveLength(0);

      // Test CTRL+V (should not interfere)
      const pasteEvent = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(pasteEvent);
      }

      // Paste should use xterm.paste(), not xterm.input()
      // The input() should not be called directly
      expect(eventCallOrder).toHaveLength(0);
    });

    it('should maintain correct handler ordering for existing shortcuts', () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let handlerResults: { key: string; handled: boolean }[] = [];

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(),
        getSelection: vi.fn(),
        paste: vi.fn(),
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = require('../../renderer/components/terminal/useXterm');
      const { renderHook } = require('@testing-library/react');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      // Helper to test key handling
      const testKey = (key: string, ctrl: boolean, meta: boolean, shift: boolean) => {
        const event = new KeyboardEvent('keydown', {
          key,
          ctrlKey: ctrl,
          metaKey: meta,
          shiftKey: shift
        });

        if (keyEventHandler) {
          const handled = keyEventHandler(event);
          handlerResults.push({ key, handled });
        }
      };

      // Test existing shortcuts (should return false to bubble up)
      testKey('1', true, false, false); // Ctrl+1
      testKey('Tab', true, false, false); // Ctrl+Tab
      testKey('t', true, false, false); // Ctrl+T
      testKey('w', true, false, false); // Ctrl+W

      // Verify these return false (bubble to window handler)
      expect(handlerResults.filter(r => !r.handled)).toHaveLength(4);

      // Test copy/paste with selection
      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(() => true),
        getSelection: vi.fn(() => 'selected'),
        paste: vi.fn(),
        input: vi.fn(),
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      handlerResults = [];
      testKey('c', true, false, false); // Ctrl+C with selection

      // Should return false (prevent xterm handling)
      expect(handlerResults[0].handled).toBe(false);
    });
  });

  describe('clipboard error handling without breaking terminal', () => {
    it('should continue terminal operation after clipboard error', async () => {
      let keyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
      let mockPaste = vi.fn();
      let mockInput = vi.fn();
      let errorLogged = false;

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        if (args[0]?.toString().includes('[useXterm]')) {
          errorLogged = true;
        }
      });

      // Mock clipboard error
      mockClipboard.readText = vi.fn().mockRejectedValue(new Error('Clipboard denied'));

      (XTerm as unknown as vi.Mock).mockImplementation(() => ({
        open: vi.fn(),
        loadAddon: vi.fn(),
        attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
          keyEventHandler = handler;
        }),
        hasSelection: vi.fn(),
        getSelection: vi.fn(),
        paste: mockPaste,
        input: mockInput,
        onData: vi.fn(),
        onResize: vi.fn(),
        dispose: vi.fn(),
        write: vi.fn(),
        cols: 80,
        rows: 24
      }));

      const { useXterm } = await import('../../renderer/components/terminal/useXterm');
      const { renderHook } = await import('@testing-library/react');

      const { result } = renderHook(() =>
        useXterm({ terminalId: 'test-terminal' })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      // Try to paste (will fail)
      const pasteEvent = new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true
      });

      if (keyEventHandler) {
        keyEventHandler(pasteEvent);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Verify error was logged
      expect(errorLogged).toBe(true);

      // Verify terminal still works (can accept input)
      const inputEvent = { data: 'test command' };
      const xtermInstance = (XTerm as unknown as vi.Mock).mock.results[0].value;
      const onDataCallback = xtermInstance.onData.mock.calls[0]?.[0];

      if (onDataCallback) {
        onDataCallback(inputEvent.data);
      }

      // Verify input was processed (terminal still functional)
      expect(mockInput).toHaveBeenCalledWith('test command');

      consoleErrorSpy.mockRestore();
    });
  });
});
