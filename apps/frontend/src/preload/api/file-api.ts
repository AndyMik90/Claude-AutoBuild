import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';

interface CodeEditorFileNode {
  name: string;
  relPath: string;
  isDir: boolean;
}

export interface FileAPI {
  // File Explorer Operations
  listDirectory: (dirPath: string) => Promise<IPCResult<import('../../shared/types').FileNode[]>>;

  // Code Editor Operations
  codeEditorListDir: (workspaceRoot: string, relPath: string) => Promise<IPCResult<CodeEditorFileNode[]>>;
  codeEditorReadFile: (workspaceRoot: string, relPath: string) => Promise<IPCResult<string>>;
  codeEditorWriteFile: (workspaceRoot: string, relPath: string, content: string) => Promise<IPCResult<void>>;
}

export const createFileAPI = (): FileAPI => ({
  // File Explorer Operations
  listDirectory: (dirPath: string): Promise<IPCResult<import('../../shared/types').FileNode[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPLORER_LIST, dirPath),

  // Code Editor Operations
  codeEditorListDir: (workspaceRoot: string, relPath: string): Promise<IPCResult<CodeEditorFileNode[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_LIST_DIR, workspaceRoot, relPath),
  codeEditorReadFile: (workspaceRoot: string, relPath: string): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_READ_FILE, workspaceRoot, relPath),
  codeEditorWriteFile: (workspaceRoot: string, relPath: string, content: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CODE_EDITOR_WRITE_FILE, workspaceRoot, relPath, content)
});
