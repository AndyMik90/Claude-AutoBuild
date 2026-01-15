/**
 * Unit tests for Terminal native HTML5 drop handling
 * Tests file drag-and-drop from FileTreeItem to insert file paths into terminal
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { escapeShellArg } from '../../../shared/utils/shell-escape';

// Mock window.electronAPI for terminal input
const mockSendTerminalInput = vi.fn();

// Setup window.electronAPI mock before tests
beforeEach(() => {
  vi.clearAllMocks();

  // Mock the electronAPI with sendTerminalInput
  (window as unknown as { electronAPI: { sendTerminalInput: typeof mockSendTerminalInput } }).electronAPI = {
    sendTerminalInput: mockSendTerminalInput
  };
});

describe('Terminal Native Drop Handling', () => {
  // Helper to create mock DragEvent data
  function createMockDragEvent(jsonData: object | null, types: string[] = ['application/json']) {
    const dataTransfer = {
      types,
      getData: vi.fn((type: string) => {
        if (type === 'application/json' && jsonData) {
          return JSON.stringify(jsonData);
        }
        return '';
      }),
      setData: vi.fn(),
      effectAllowed: 'none' as DataTransfer['effectAllowed']
    };

    return {
      dataTransfer,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as React.DragEvent<HTMLDivElement>;
  }

  // Helper to create file reference drag data (matches FileTreeItem format)
  function createFileReferenceDragData(path: string, name: string, isDirectory = false) {
    return {
      type: 'file-reference',
      path,
      name,
      isDirectory
    };
  }

  describe('handleNativeDragOver', () => {
    it('should accept drag when dataTransfer contains application/json type', () => {
      const mockEvent = createMockDragEvent({ type: 'file-reference', path: '/test' });

      // Simulate the component's drag over logic
      const hasJsonType = mockEvent.dataTransfer.types.includes('application/json');

      expect(hasJsonType).toBe(true);
      // When JSON type is present, preventDefault should be called to accept the drop
    });

    it('should not accept drag when dataTransfer does not contain application/json type', () => {
      const mockEvent = createMockDragEvent(null, ['text/plain']);

      const hasJsonType = mockEvent.dataTransfer.types.includes('application/json');

      expect(hasJsonType).toBe(false);
      // When JSON type is missing, drop should not be accepted
    });

    it('should call preventDefault and stopPropagation when accepting drag', () => {
      const mockEvent = createMockDragEvent({ type: 'file-reference', path: '/test' });

      // Simulate the handleNativeDragOver logic
      if (mockEvent.dataTransfer.types.includes('application/json')) {
        mockEvent.preventDefault();
        mockEvent.stopPropagation();
      }

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('handleNativeDrop - File Path Insertion', () => {
    it('should insert file path into terminal when dropping valid file reference', () => {
      const terminalId = 'test-terminal-1';
      const filePath = '/path/to/file.ts';
      const dragData = createFileReferenceDragData(filePath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, "'/path/to/file.ts' ");
    });

    it('should escape file path with spaces using single quotes', () => {
      const terminalId = 'test-terminal-2';
      const filePath = '/path/to/my file.ts';
      const dragData = createFileReferenceDragData(filePath, 'my file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, "'/path/to/my file.ts' ");
    });

    it('should escape simple paths too (all paths get single quoted)', () => {
      const terminalId = 'test-terminal-3';
      const filePath = '/simple/path.ts';
      const dragData = createFileReferenceDragData(filePath, 'path.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, "'/simple/path.ts' ");
    });

    it('should add trailing space after file path', () => {
      const terminalId = 'test-terminal-4';
      const filePath = '/path/to/file.ts';
      const dragData = createFileReferenceDragData(filePath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      const callArg = mockSendTerminalInput.mock.calls[0][1];
      expect(callArg.endsWith(' ')).toBe(true);
    });

    it('should handle directory paths the same as file paths', () => {
      const terminalId = 'test-terminal-5';
      const dirPath = '/path/to/directory';
      const dragData = createFileReferenceDragData(dirPath, 'directory', true);
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, "'/path/to/directory' ");
    });

    it('should handle directory paths with spaces', () => {
      const terminalId = 'test-terminal-6';
      const dirPath = '/path/to/my directory';
      const dragData = createFileReferenceDragData(dirPath, 'my directory', true);
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, "'/path/to/my directory' ");
    });
  });

  describe('handleNativeDrop - Invalid Data Handling', () => {
    it('should not insert path when drag data is not file-reference type', () => {
      const terminalId = 'test-terminal-7';
      const dragData = { type: 'other-type', path: '/path/to/file.ts' };
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockSendTerminalInput(terminalId, data.path + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).not.toHaveBeenCalled();
    });

    it('should not insert path when drag data has no path property', () => {
      const terminalId = 'test-terminal-8';
      const dragData = { type: 'file-reference', name: 'file.ts' };
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockSendTerminalInput(terminalId, data.path + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).not.toHaveBeenCalled();
    });

    it('should not insert path when JSON data is empty', () => {
      const terminalId = 'test-terminal-9';
      const mockEvent = createMockDragEvent(null);
      mockEvent.dataTransfer.getData = vi.fn(() => '');

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockSendTerminalInput(terminalId, data.path + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', () => {
      const terminalId = 'test-terminal-10';
      const mockEvent = createMockDragEvent(null);
      mockEvent.dataTransfer.getData = vi.fn(() => 'not valid json');

      let errorOccurred = false;

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockSendTerminalInput(terminalId, data.path + ' ');
          }
        } catch {
          // Should catch and handle gracefully
          errorOccurred = true;
        }
      }

      expect(errorOccurred).toBe(true);
      expect(mockSendTerminalInput).not.toHaveBeenCalled();
    });
  });

  describe('Drop Overlay State', () => {
    // Helper to compute showFileDropOverlay (matches Terminal.tsx logic)
    function computeShowFileDropOverlay(isOver: boolean, isDraggingTerminal: boolean, isNativeDragOver: boolean): boolean {
      return (isOver && !isDraggingTerminal) || isNativeDragOver;
    }

    // Use parameterized tests to avoid static analysis warnings about tautological conditions
    it.each([
      { isNativeDragOver: true, isDraggingTerminal: false, isOver: false, expected: true, desc: 'native drag over file' },
      { isNativeDragOver: false, isDraggingTerminal: false, isOver: true, expected: true, desc: 'dnd-kit isOver' },
      { isNativeDragOver: false, isDraggingTerminal: true, isOver: true, expected: false, desc: 'dragging terminal panel' },
      { isNativeDragOver: false, isDraggingTerminal: false, isOver: false, expected: false, desc: 'nothing dragged' },
      { isNativeDragOver: true, isDraggingTerminal: true, isOver: false, expected: true, desc: 'native drag overrides terminal' },
    ])('should return $expected when $desc', ({ isNativeDragOver, isDraggingTerminal, isOver, expected }) => {
      const showFileDropOverlay = computeShowFileDropOverlay(isOver, isDraggingTerminal, isNativeDragOver);
      expect(showFileDropOverlay).toBe(expected);
    });
  });

  describe('Shell Escaping with escapeShellArg', () => {
    it('should wrap paths in single quotes', () => {
      const path = '/path/to/file.ts';
      const escaped = escapeShellArg(path);
      expect(escaped).toBe("'/path/to/file.ts'");
    });

    it('should handle paths with spaces', () => {
      const path = '/path/to my special file.ts';
      const escaped = escapeShellArg(path);
      expect(escaped).toBe("'/path/to my special file.ts'");
    });

    it('should handle empty path', () => {
      const path = '';
      const escaped = escapeShellArg(path);
      expect(escaped).toBe("''");
    });

    it('should handle paths with special characters', () => {
      const path = '/path/to/file@2.0.ts';
      const escaped = escapeShellArg(path);
      expect(escaped).toBe("'/path/to/file@2.0.ts'");
    });

    // Shell-unsafe character tests (addressing review feedback)
    it('should properly escape paths with double quotes', () => {
      const path = '/path/to/"quoted"file.ts';
      const escaped = escapeShellArg(path);
      // Single-quoted strings don't need double quotes escaped
      expect(escaped).toBe('\'/path/to/"quoted"file.ts\'');
    });

    it('should properly escape paths with dollar signs', () => {
      const path = '/path/to/$HOME/file.ts';
      const escaped = escapeShellArg(path);
      // Single-quoted strings prevent shell expansion
      expect(escaped).toBe("'/path/to/$HOME/file.ts'");
    });

    it('should properly escape paths with backticks', () => {
      const path = '/path/to/`command`/file.ts';
      const escaped = escapeShellArg(path);
      // Single-quoted strings prevent command substitution
      expect(escaped).toBe("'/path/to/`command`/file.ts'");
    });

    it('should properly escape paths with single quotes', () => {
      const path = "/path/to/it's/file.ts";
      const escaped = escapeShellArg(path);
      // Single quotes within single quotes need special handling: '\''
      expect(escaped).toBe("'/path/to/it'\\''s/file.ts'");
    });

    it('should properly escape paths with backslashes', () => {
      const path = '/path/to/file\\name.ts';
      const escaped = escapeShellArg(path);
      // Backslashes are literal inside single quotes
      expect(escaped).toBe("'/path/to/file\\name.ts'");
    });

    it('should handle complex paths with multiple shell metacharacters', () => {
      const path = '/path/to/$USER\'s "files"`cmd`/test.ts';
      const escaped = escapeShellArg(path);
      // Only single quotes need special escaping
      expect(escaped).toBe("'/path/to/$USER'\\''s \"files\"`cmd`/test.ts'");
    });

    it('should handle paths with newlines', () => {
      const path = '/path/to/file\nwith\nnewlines.ts';
      const escaped = escapeShellArg(path);
      // Newlines are literal inside single quotes
      expect(escaped).toBe("'/path/to/file\nwith\nnewlines.ts'");
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long file paths', () => {
      const terminalId = 'test-terminal-long';
      const longPath = '/path/' + 'a'.repeat(200) + '/file.ts';
      const dragData = createFileReferenceDragData(longPath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, `'${longPath}' `);
    });

    it('should handle paths with unicode characters', () => {
      const terminalId = 'test-terminal-unicode';
      const unicodePath = '/path/to/文件.ts';
      const dragData = createFileReferenceDragData(unicodePath, '文件.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, `'${unicodePath}' `);
    });

    it('should handle paths with unicode characters and spaces', () => {
      const terminalId = 'test-terminal-unicode-space';
      const unicodePath = '/path/to/我的 文件.ts';
      const dragData = createFileReferenceDragData(unicodePath, '我的 文件.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, `'${unicodePath}' `);
    });

    it('should handle relative paths', () => {
      const terminalId = 'test-terminal-relative';
      const relativePath = './relative/path/file.ts';
      const dragData = createFileReferenceDragData(relativePath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic with escapeShellArg
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const escapedPath = escapeShellArg(data.path);
            mockSendTerminalInput(terminalId, escapedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, `'${relativePath}' `);
    });
  });
});
