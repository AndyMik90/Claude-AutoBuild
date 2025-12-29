import { ipcMain, BrowserWindow } from 'electron';
import { realpathSync, existsSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { CSharpLspServerManager } from '../csharp-lsp/lsp-server-manager';

// Global LSP server manager instance
let lspManager: CSharpLspServerManager | null = null;

/**
 * Register all C# LSP-related IPC handlers
 */
export function registerCSharpLspHandlers(mainWindow: BrowserWindow): void {
  // ============================================
  // C# LSP Server Lifecycle
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_START,
    async (_, workspaceRoot: string): Promise<IPCResult<{ ok: true }>> => {
      try {
        // Stop existing server if running
        if (lspManager) {
          await lspManager.stop();
          lspManager = null;
        }

        // Create and start new server
        lspManager = new CSharpLspServerManager(mainWindow);
        await lspManager.start(workspaceRoot);

        return { success: true, data: { ok: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start LSP server'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_STOP,
    async (): Promise<IPCResult<{ ok: true }>> => {
      try {
        if (lspManager) {
          await lspManager.stop();
          lspManager = null;
        }
        return { success: true, data: { ok: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop LSP server'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_STATUS,
    async (): Promise<IPCResult<{ state: string; message?: string }>> => {
      try {
        const status = lspManager?.getStatus() || { state: 'stopped' };
        return { success: true, data: status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get status'
        };
      }
    }
  );

  // ============================================
  // Document Lifecycle
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_DID_OPEN,
    async (_, relPath: string, text: string): Promise<IPCResult<void>> => {
      try {
        if (!lspManager) {
          return { success: false, error: 'LSP server not started' };
        }

        // Validate path (get workspace root from manager)
        // For now, we trust the relPath since it's already validated in the renderer
        await lspManager.didOpen(relPath, text);

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open document'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_DID_CHANGE,
    async (_, relPath: string, text: string, version: number): Promise<IPCResult<void>> => {
      try {
        if (!lspManager) {
          return { success: false, error: 'LSP server not started' };
        }

        await lspManager.didChange(relPath, text, version);

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update document'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_DID_SAVE,
    async (_, relPath: string, text?: string): Promise<IPCResult<void>> => {
      try {
        if (!lspManager) {
          return { success: false, error: 'LSP server not started' };
        }

        await lspManager.didSave(relPath, text);

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save document'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_DID_CLOSE,
    async (_, relPath: string): Promise<IPCResult<void>> => {
      try {
        if (!lspManager) {
          return { success: false, error: 'LSP server not started' };
        }

        await lspManager.didClose(relPath);

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to close document'
        };
      }
    }
  );

  // ============================================
  // Language Features
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_COMPLETION,
    async (_, relPath: string, line: number, column: number): Promise<IPCResult<unknown>> => {
      try {
        if (!lspManager) {
          return {
            success: true,
            data: { isIncomplete: false, items: [] }
          };
        }

        const result = await lspManager.completion(relPath, line, column);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get completions'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_HOVER,
    async (_, relPath: string, line: number, column: number): Promise<IPCResult<unknown>> => {
      try {
        if (!lspManager) {
          return { success: true, data: null };
        }

        const result = await lspManager.hover(relPath, line, column);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get hover info'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_DEFINITION,
    async (_, relPath: string, line: number, column: number): Promise<IPCResult<unknown>> => {
      try {
        if (!lspManager) {
          return { success: true, data: null };
        }

        const result = await lspManager.definition(relPath, line, column);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get definition'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CSHARP_LSP_FORMAT_DOCUMENT,
    async (_, relPath: string, text: string): Promise<IPCResult<unknown>> => {
      try {
        if (!lspManager) {
          return { success: true, data: [] };
        }

        const result = await lspManager.formatDocument(relPath);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to format document'
        };
      }
    }
  );
}

/**
 * Cleanup function to stop LSP server on app quit
 */
export async function cleanupCSharpLsp(): Promise<void> {
  if (lspManager) {
    await lspManager.stop();
    lspManager = null;
  }
}
