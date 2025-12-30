import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  CSharpLspStatusResponse,
  CSharpLspCompletionList,
  CSharpLspHover,
  CSharpLspLocation,
  CSharpLspTextEdit,
  CSharpLspPublishDiagnosticsParams,
  CSharpLspLogMessage,
  CSharpLspProgressMessage
} from '../../shared/types';

export interface CSharpLspAPI {
  // C# LSP Operations
  csharpLspStart: (workspaceRoot: string) => Promise<IPCResult<{ ok: true }>>;
  csharpLspStop: () => Promise<IPCResult<{ ok: true }>>;
  csharpLspStatus: () => Promise<IPCResult<CSharpLspStatusResponse>>;
  csharpLspDidOpen: (relPath: string, text: string) => Promise<IPCResult<void>>;
  csharpLspDidChange: (relPath: string, text: string, version: number) => Promise<IPCResult<void>>;
  csharpLspDidSave: (relPath: string, text?: string) => Promise<IPCResult<void>>;
  csharpLspDidClose: (relPath: string) => Promise<IPCResult<void>>;
  csharpLspCompletion: (relPath: string, line: number, column: number) => Promise<IPCResult<CSharpLspCompletionList>>;
  csharpLspHover: (relPath: string, line: number, column: number) => Promise<IPCResult<CSharpLspHover | null>>;
  csharpLspDefinition: (relPath: string, line: number, column: number) => Promise<IPCResult<CSharpLspLocation | null>>;
  csharpLspFormatDocument: (relPath: string, text: string) => Promise<IPCResult<CSharpLspTextEdit[]>>;

  // C# LSP Event Listeners
  onCSharpLspPublishDiagnostics: (callback: (params: CSharpLspPublishDiagnosticsParams) => void) => () => void;
  onCSharpLspLog: (callback: (message: CSharpLspLogMessage) => void) => () => void;
  onCSharpLspProgress: (callback: (message: CSharpLspProgressMessage) => void) => () => void;
}

export const createCSharpLspAPI = (): CSharpLspAPI => ({
  // C# LSP Operations
  csharpLspStart: (workspaceRoot: string): Promise<IPCResult<{ ok: true }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_START, workspaceRoot),

  csharpLspStop: (): Promise<IPCResult<{ ok: true }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_STOP),

  csharpLspStatus: (): Promise<IPCResult<CSharpLspStatusResponse>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_STATUS),

  csharpLspDidOpen: (relPath: string, text: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_DID_OPEN, relPath, text),

  csharpLspDidChange: (relPath: string, text: string, version: number): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_DID_CHANGE, relPath, text, version),

  csharpLspDidSave: (relPath: string, text?: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_DID_SAVE, relPath, text),

  csharpLspDidClose: (relPath: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_DID_CLOSE, relPath),

  csharpLspCompletion: (relPath: string, line: number, column: number): Promise<IPCResult<CSharpLspCompletionList>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_COMPLETION, relPath, line, column),

  csharpLspHover: (relPath: string, line: number, column: number): Promise<IPCResult<CSharpLspHover | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_HOVER, relPath, line, column),

  csharpLspDefinition: (relPath: string, line: number, column: number): Promise<IPCResult<CSharpLspLocation | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_DEFINITION, relPath, line, column),

  csharpLspFormatDocument: (relPath: string, text: string): Promise<IPCResult<CSharpLspTextEdit[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CSHARP_LSP_FORMAT_DOCUMENT, relPath, text),

  // C# LSP Event Listeners
  onCSharpLspPublishDiagnostics: (
    callback: (params: CSharpLspPublishDiagnosticsParams) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      params: CSharpLspPublishDiagnosticsParams
    ): void => {
      callback(params);
    };
    ipcRenderer.on(IPC_CHANNELS.CSHARP_LSP_PUBLISH_DIAGNOSTICS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CSHARP_LSP_PUBLISH_DIAGNOSTICS, handler);
    };
  },

  onCSharpLspLog: (
    callback: (message: CSharpLspLogMessage) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      message: CSharpLspLogMessage
    ): void => {
      callback(message);
    };
    ipcRenderer.on(IPC_CHANNELS.CSHARP_LSP_LOG, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CSHARP_LSP_LOG, handler);
    };
  },

  onCSharpLspProgress: (
    callback: (message: CSharpLspProgressMessage) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      message: CSharpLspProgressMessage
    ): void => {
      callback(message);
    };
    ipcRenderer.on(IPC_CHANNELS.CSHARP_LSP_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CSHARP_LSP_PROGRESS, handler);
    };
  }
});
