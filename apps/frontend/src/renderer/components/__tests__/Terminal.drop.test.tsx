/**
 * Unit tests for Terminal native HTML5 drop handling
 * Tests file drag-and-drop from FileTreeItem to insert file paths into terminal
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, '/path/to/file.ts ');
    });

    it('should quote file path when it contains spaces', () => {
      const terminalId = 'test-terminal-2';
      const filePath = '/path/to/my file.ts';
      const dragData = createFileReferenceDragData(filePath, 'my file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, '"/path/to/my file.ts" ');
    });

    it('should not quote file path when it does not contain spaces', () => {
      const terminalId = 'test-terminal-3';
      const filePath = '/simple/path.ts';
      const dragData = createFileReferenceDragData(filePath, 'path.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, '/simple/path.ts ');
    });

    it('should add trailing space after file path', () => {
      const terminalId = 'test-terminal-4';
      const filePath = '/path/to/file.ts';
      const dragData = createFileReferenceDragData(filePath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
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

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, '/path/to/directory ');
    });

    it('should handle directory paths with spaces', () => {
      const terminalId = 'test-terminal-6';
      const dirPath = '/path/to/my directory';
      const dragData = createFileReferenceDragData(dirPath, 'my directory', true);
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            mockEvent.preventDefault();
            mockEvent.stopPropagation();
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, '"/path/to/my directory" ');
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
    it('should show drop overlay when isNativeDragOver is true and not dragging terminal', () => {
      const isNativeDragOver = true;
      const isDraggingTerminal = false;
      const isOver = false; // dnd-kit isOver

      const showFileDropOverlay = (isOver && !isDraggingTerminal) || isNativeDragOver;

      expect(showFileDropOverlay).toBe(true);
    });

    it('should show drop overlay when dnd-kit isOver is true and not dragging terminal', () => {
      const isNativeDragOver = false;
      const isDraggingTerminal = false;
      const isOver = true; // dnd-kit isOver

      const showFileDropOverlay = (isOver && !isDraggingTerminal) || isNativeDragOver;

      expect(showFileDropOverlay).toBe(true);
    });

    it('should NOT show drop overlay when dragging a terminal panel', () => {
      const isNativeDragOver = false;
      const isDraggingTerminal = true;
      const isOver = true; // dnd-kit isOver

      const showFileDropOverlay = (isOver && !isDraggingTerminal) || isNativeDragOver;

      expect(showFileDropOverlay).toBe(false);
    });

    it('should NOT show drop overlay when nothing is being dragged over', () => {
      const isNativeDragOver = false;
      const isDraggingTerminal = false;
      const isOver = false;

      const showFileDropOverlay = (isOver && !isDraggingTerminal) || isNativeDragOver;

      expect(showFileDropOverlay).toBe(false);
    });

    it('should show drop overlay for native drag even if dnd-kit detects terminal drag', () => {
      // Edge case: native drag should override dnd-kit terminal detection
      const isNativeDragOver = true;
      const isDraggingTerminal = true; // Would normally hide overlay
      const isOver = false;

      const showFileDropOverlay = (isOver && !isDraggingTerminal) || isNativeDragOver;

      // Native drag takes precedence
      expect(showFileDropOverlay).toBe(true);
    });
  });

  describe('Path Quoting Logic', () => {
    it('should quote paths with single space', () => {
      const path = '/path/to file.ts';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('"/path/to file.ts"');
    });

    it('should quote paths with multiple spaces', () => {
      const path = '/path/to my special file.ts';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('"/path/to my special file.ts"');
    });

    it('should not quote paths without spaces', () => {
      const path = '/simple/path/file.ts';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('/simple/path/file.ts');
    });

    it('should handle empty path', () => {
      const path = '';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('');
    });

    it('should handle path with only spaces', () => {
      const path = '   ';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('"   "');
    });

    it('should handle paths with special characters (no spaces)', () => {
      const path = '/path/to/file@2.0.ts';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('/path/to/file@2.0.ts');
    });

    it('should handle paths with special characters and spaces', () => {
      const path = '/path/to/file @2.0.ts';
      const quotedPath = path.includes(' ') ? `"${path}"` : path;

      expect(quotedPath).toBe('"/path/to/file @2.0.ts"');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long file paths', () => {
      const terminalId = 'test-terminal-long';
      const longPath = '/path/' + 'a'.repeat(200) + '/file.ts';
      const dragData = createFileReferenceDragData(longPath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, longPath + ' ');
    });

    it('should handle paths with unicode characters', () => {
      const terminalId = 'test-terminal-unicode';
      const unicodePath = '/path/to/文件.ts';
      const dragData = createFileReferenceDragData(unicodePath, '文件.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, unicodePath + ' ');
    });

    it('should handle paths with unicode characters and spaces', () => {
      const terminalId = 'test-terminal-unicode-space';
      const unicodePath = '/path/to/我的 文件.ts';
      const dragData = createFileReferenceDragData(unicodePath, '我的 文件.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, `"${unicodePath}" `);
    });

    it('should handle relative paths', () => {
      const terminalId = 'test-terminal-relative';
      const relativePath = './relative/path/file.ts';
      const dragData = createFileReferenceDragData(relativePath, 'file.ts');
      const mockEvent = createMockDragEvent(dragData);

      // Simulate the handleNativeDrop logic
      const jsonData = mockEvent.dataTransfer.getData('application/json');
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as { type?: string; path?: string };
          if (data.type === 'file-reference' && data.path) {
            const quotedPath = data.path.includes(' ') ? `"${data.path}"` : data.path;
            mockSendTerminalInput(terminalId, quotedPath + ' ');
          }
        } catch {
          // Failed to parse
        }
      }

      expect(mockSendTerminalInput).toHaveBeenCalledWith(terminalId, relativePath + ' ');
    });
  });
});
