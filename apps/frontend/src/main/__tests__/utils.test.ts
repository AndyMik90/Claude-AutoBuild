/**
 * IPC Utils Tests
 * ==================
 * Tests for safeSendToRenderer helper function that prevents
 * "Render frame was disposed" errors when sending IPC messages
 * from main process to renderer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BrowserWindow } from "electron";

describe("safeSendToRenderer", () => {
  let mockWindow: BrowserWindow | null;
  let getMainWindow: () => BrowserWindow | null;
  let mockSend: ReturnType<typeof vi.fn>;
  let safeSendToRenderer: typeof import("../ipc-handlers/utils").safeSendToRenderer;

  beforeEach(async () => {
    mockSend = vi.fn();

    // Create a mock window with valid webContents
    mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: mockSend,
      },
    } as unknown as BrowserWindow;

    getMainWindow = () => mockWindow;

    // Dynamic import to get fresh module state for each test
    const utilsModule = await import("../ipc-handlers/utils");
    safeSendToRenderer = utilsModule.safeSendToRenderer;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("when mainWindow is null", () => {
    it("returns false and does not send", () => {
      getMainWindow = () => null;

      const result = safeSendToRenderer(getMainWindow, "test-channel", "arg1", "arg2");

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when window is destroyed", () => {
    it("returns false and does not send", () => {
      mockWindow = {
        isDestroyed: vi.fn(() => true),
        webContents: {
          isDestroyed: vi.fn(() => false),
          send: mockSend,
        },
      } as unknown as BrowserWindow;
      getMainWindow = () => mockWindow;

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when webContents is destroyed", () => {
    it("returns false and does not send", () => {
      mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: {
          isDestroyed: vi.fn(() => true),
          send: mockSend,
        },
      } as unknown as BrowserWindow;
      getMainWindow = () => mockWindow;

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when webContents is null", () => {
    it("returns false and does not send", () => {
      mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: null,
      } as unknown as BrowserWindow;
      getMainWindow = () => mockWindow;

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when window and webContents are valid", () => {
    it("returns true and sends message with correct arguments", () => {
      const result = safeSendToRenderer(
        getMainWindow,
        "test-channel",
        "arg1",
        { key: "value" },
        42
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith("test-channel", "arg1", { key: "value" }, 42);
    });

    it("sends message with no arguments", () => {
      const result = safeSendToRenderer(getMainWindow, "test-channel");

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith("test-channel");
    });

    it("sends multiple messages successfully", () => {
      const result1 = safeSendToRenderer(getMainWindow, "channel-1", "data1");
      const result2 = safeSendToRenderer(getMainWindow, "channel-2", "data2");

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, "channel-1", "data1");
      expect(mockSend).toHaveBeenNthCalledWith(2, "channel-2", "data2");
    });
  });

  describe("error handling - disposal errors", () => {
    it("catches disposal errors and returns false", () => {
      // Mock send to throw a disposal error
      mockSend.mockImplementation(() => {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      });

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('catches generic "disposed" errors and returns false', () => {
      mockSend.mockImplementation(() => {
        throw new Error("Object has been destroyed");
      });

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('catches "destroyed" errors and returns false', () => {
      mockSend.mockImplementation(() => {
        throw new Error("WebContents was destroyed");
      });

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling - non-disposal errors", () => {
    it("catches other errors and returns false", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockSend.mockImplementation(() => {
        throw new Error("Some other IPC error");
      });

      const result = safeSendToRenderer(getMainWindow, "test-channel", "data");

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("warning cooldown behavior", () => {
    it("returns false for multiple consecutive calls to destroyed windows", () => {
      mockWindow = {
        isDestroyed: vi.fn(() => true),
        webContents: {
          isDestroyed: vi.fn(() => false),
          send: mockSend,
        },
      } as unknown as BrowserWindow;
      getMainWindow = () => mockWindow;

      // Multiple calls should all return false without throwing
      const result1 = safeSendToRenderer(getMainWindow, "test-channel", "data1");
      const result2 = safeSendToRenderer(getMainWindow, "test-channel", "data2");
      const result3 = safeSendToRenderer(getMainWindow, "test-channel", "data3");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("handles different channels independently", () => {
      mockWindow = {
        isDestroyed: vi.fn(() => true),
        webContents: {
          isDestroyed: vi.fn(() => false),
          send: mockSend,
        },
      } as unknown as BrowserWindow;
      getMainWindow = () => mockWindow;

      // Different channels should all return false
      const result1 = safeSendToRenderer(getMainWindow, "channel-a", "data");
      const result2 = safeSendToRenderer(getMainWindow, "channel-b", "data");
      const result3 = safeSendToRenderer(getMainWindow, "channel-c", "data");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });
  });

  describe("race condition - frame disposal between check and send", () => {
    it("handles disposal that occurs after validation but before send", () => {
      // First call succeeds
      let callCount = 0;
      mockSend.mockImplementation(() => {
        callCount++;
        if (callCount > 1) {
          throw new Error("Render frame was disposed");
        }
      });

      const result1 = safeSendToRenderer(getMainWindow, "test-channel", "data1");
      expect(result1).toBe(true);

      // Second call throws disposal error but is caught
      const result2 = safeSendToRenderer(getMainWindow, "test-channel", "data2");
      expect(result2).toBe(false);
    });
  });
});
