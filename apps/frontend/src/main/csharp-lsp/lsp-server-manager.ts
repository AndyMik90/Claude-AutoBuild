import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import { realpathSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  CSharpLspStatus,
  CSharpLspCompletionList,
  CSharpLspHover,
  CSharpLspLocation,
  CSharpLspTextEdit,
  CSharpLspDiagnostic
} from '../../shared/types';

interface LSPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface DocumentInfo {
  uri: string;
  version: number;
  text: string;
}

export class CSharpLspServerManager {
  private process: ChildProcess | null = null;
  private workspaceRoot: string | null = null;
  private status: CSharpLspStatus = 'stopped';
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private initialized = false;
  private documents = new Map<string, DocumentInfo>();
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Start the C# LSP server for the given workspace
   */
  async start(workspaceRoot: string): Promise<void> {
    if (this.process) {
      throw new Error('LSP server is already running');
    }

    // Validate workspace root
    if (!existsSync(workspaceRoot)) {
      throw new Error('Workspace root does not exist');
    }

    this.workspaceRoot = realpathSync(workspaceRoot);
    this.status = 'starting';

    try {
      // Find OmniSharp server binary
      const omnisharpPath = this.findOmniSharpPath();
      if (!omnisharpPath) {
        throw new Error(
          'OmniSharp server not found. Please install OmniSharp or set OMNISHARP_PATH environment variable.'
        );
      }

      // Detect project file
      const projectInfo = this.detectProject();

      // Spawn OmniSharp process
      this.process = spawn(omnisharpPath, [
        '--languageserver',
        '--stdio',
        '-s', this.workspaceRoot,
        ...(projectInfo.solution ? ['--solution', projectInfo.solution] : [])
      ], {
        cwd: this.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Set up process event handlers
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.sendLog('error', `OmniSharp stderr: ${data.toString()}`);
      });

      this.process.on('error', (error: Error) => {
        this.status = 'error';
        this.sendLog('error', `OmniSharp process error: ${error.message}`);
      });

      this.process.on('exit', (code: number | null) => {
        this.status = code === 0 ? 'stopped' : 'error';
        this.sendLog('info', `OmniSharp process exited with code ${code}`);
        this.cleanup();
      });

      // Initialize LSP
      await this.initialize();

      this.status = 'ready';
      this.sendLog('info', 'C# Language Server ready');
    } catch (error) {
      this.status = 'error';
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the LSP server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      // Send shutdown request
      await this.sendRequest('shutdown', {});
      // Send exit notification
      this.sendNotification('exit', {});
    } catch (error) {
      // Ignore errors during shutdown
    }

    this.cleanup();
  }

  /**
   * Get current server status
   */
  getStatus(): { state: CSharpLspStatus; message?: string } {
    return { state: this.status };
  }

  /**
   * Get the workspace root path
   */
  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  /**
   * Document lifecycle: didOpen
   */
  async didOpen(relPath: string, text: string): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('LSP server not started');
    }

    const uri = this.pathToUri(relPath);
    const doc: DocumentInfo = { uri, version: 0, text };
    this.documents.set(relPath, doc);

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'csharp',
        version: doc.version,
        text
      }
    });
  }

  /**
   * Document lifecycle: didChange
   */
  async didChange(relPath: string, text: string, version: number): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('LSP server not started');
    }

    const doc = this.documents.get(relPath);
    if (!doc) {
      // If not opened, open it first
      await this.didOpen(relPath, text);
      return;
    }

    doc.version = version;
    doc.text = text;

    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: doc.uri,
        version
      },
      contentChanges: [{ text }]
    });
  }

  /**
   * Document lifecycle: didSave
   */
  async didSave(relPath: string, text?: string): Promise<void> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return;
    }

    this.sendNotification('textDocument/didSave', {
      textDocument: { uri: doc.uri },
      text
    });
  }

  /**
   * Document lifecycle: didClose
   */
  async didClose(relPath: string): Promise<void> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return;
    }

    this.sendNotification('textDocument/didClose', {
      textDocument: { uri: doc.uri }
    });

    this.documents.delete(relPath);
  }

  /**
   * Language feature: completion
   */
  async completion(relPath: string, line: number, column: number): Promise<CSharpLspCompletionList> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return { isIncomplete: false, items: [] };
    }

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri: doc.uri },
      position: { line, character: column }
    }) as { isIncomplete?: boolean; items: unknown[] } | unknown[] | null;

    if (!result) {
      return { isIncomplete: false, items: [] };
    }

    // Handle both CompletionList and CompletionItem[] formats
    if (Array.isArray(result)) {
      return { isIncomplete: false, items: result as never[] };
    }

    return result as CSharpLspCompletionList;
  }

  /**
   * Language feature: hover
   */
  async hover(relPath: string, line: number, column: number): Promise<CSharpLspHover | null> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return null;
    }

    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri: doc.uri },
      position: { line, character: column }
    });

    return result as CSharpLspHover | null;
  }

  /**
   * Language feature: definition
   */
  async definition(relPath: string, line: number, column: number): Promise<CSharpLspLocation | null> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return null;
    }

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: doc.uri },
      position: { line, character: column }
    }) as CSharpLspLocation | CSharpLspLocation[] | null;

    if (!result) {
      return null;
    }

    // Return first location if array
    return Array.isArray(result) ? result[0] || null : result;
  }

  /**
   * Language feature: formatting
   */
  async formatDocument(relPath: string): Promise<CSharpLspTextEdit[]> {
    const doc = this.documents.get(relPath);
    if (!doc) {
      return [];
    }

    const result = await this.sendRequest('textDocument/formatting', {
      textDocument: { uri: doc.uri },
      options: {
        tabSize: 4,
        insertSpaces: true
      }
    });

    return (result as CSharpLspTextEdit[]) || [];
  }

  // ============================================
  // Private methods
  // ============================================

  private findOmniSharpPath(): string | null {
    // Check environment variable
    if (process.env.OMNISHARP_PATH && existsSync(process.env.OMNISHARP_PATH)) {
      return process.env.OMNISHARP_PATH;
    }

    // Try common installation paths
    const commonPaths = [
      '/usr/local/bin/omnisharp',
      '/usr/bin/omnisharp',
      'C:\\Program Files\\OmniSharp\\OmniSharp.exe',
      path.join(process.env.HOME || '', '.omnisharp', 'OmniSharp.exe')
    ];

    for (const p of commonPaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  private detectProject(): { solution?: string; project?: string } {
    if (!this.workspaceRoot) {
      return {};
    }

    // Look for .sln file
    const files = readdirSync(this.workspaceRoot);
    const slnFile = files.find((f: string) => f.endsWith('.sln'));
    if (slnFile) {
      return { solution: path.join(this.workspaceRoot, slnFile) };
    }

    // Look for .csproj file
    const csprojFile = files.find((f: string) => f.endsWith('.csproj'));
    if (csprojFile) {
      return { project: path.join(this.workspaceRoot, csprojFile) };
    }

    return {};
  }

  private async initialize(): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('Workspace root not set');
    }

    // Create properly formatted file URI
    const workspaceUri = this.createFileUri(this.workspaceRoot);

    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      clientInfo: {
        name: 'jungle-assistant',
        version: '1.0.0'
      },
      rootUri: workspaceUri,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['plaintext', 'markdown']
            }
          },
          hover: {
            contentFormat: ['plaintext', 'markdown']
          },
          definition: {
            linkSupport: true
          },
          formatting: {},
          publishDiagnostics: {}
        },
        workspace: {
          workspaceFolders: true
        }
      },
      workspaceFolders: [
        {
          uri: workspaceUri,
          name: path.basename(this.workspaceRoot)
        }
      ]
    });

    this.initialized = true;
    this.sendNotification('initialized', {});
  }

  /**
   * Create a properly formatted file URI from an absolute path
   */
  private createFileUri(absPath: string): string {
    // Convert to forward slashes
    let uriPath = absPath.replace(/\\/g, '/');
    
    // For Windows, ensure proper file URI format: file:///C:/path
    if (process.platform === 'win32') {
      // If path starts with drive letter, ensure three slashes
      if (/^[a-zA-Z]:/.test(uriPath)) {
        return `file:///${uriPath}`;
      }
    }
    
    // For Unix-like systems: file:///path (with three slashes)
    return uriPath.startsWith('/') ? `file://${uriPath}` : `file:///${uriPath}`;
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP server not running'));
        return;
      }

      const id = ++this.messageId;
      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.writeMessage(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) {
      return;
    }

    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.writeMessage(message);
  }

  private writeMessage(message: LSPMessage): void {
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.process?.stdin?.write(header + content);
  }

  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();

    while (true) {
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1], 10);
      const messageStart = headerMatch.index! + headerMatch[0].length;

      if (this.buffer.length < messageStart + contentLength) {
        // Wait for more data
        break;
      }

      const messageContent = this.buffer.slice(messageStart, messageStart + contentLength);
      this.buffer = this.buffer.slice(messageStart + contentLength);

      try {
        const message = JSON.parse(messageContent) as LSPMessage;
        this.handleMessage(message);
      } catch (error) {
        this.sendLog('error', `Failed to parse LSP message: ${error}`);
      }
    }
  }

  private handleMessage(message: LSPMessage): void {
    // Handle responses
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pendingRequests.get(message.id as number);
      if (pending) {
        this.pendingRequests.delete(message.id as number);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle notifications
    if (message.method) {
      this.handleNotification(message.method, message.params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'textDocument/publishDiagnostics':
        this.handleDiagnostics(params as { uri: string; diagnostics: CSharpLspDiagnostic[] });
        break;
      case 'window/logMessage':
        this.handleLogMessage(params as { type: number; message: string });
        break;
      case '$/progress':
        this.handleProgress(params as { token: string; value: { kind: string; message?: string; percentage?: number } });
        break;
    }
  }

  private handleDiagnostics(params: { uri: string; diagnostics: CSharpLspDiagnostic[] }): void {
    if (!this.mainWindow || !this.workspaceRoot) return;

    // Convert file URI to relPath
    const relPath = this.uriToPath(params.uri);
    if (!relPath) return;

    this.mainWindow.webContents.send(IPC_CHANNELS.CSHARP_LSP_PUBLISH_DIAGNOSTICS, {
      relPath,
      diagnostics: params.diagnostics
    });
  }

  private handleLogMessage(params: { type: number; message: string }): void {
    const levelMap: Record<number, 'error' | 'warn' | 'info' | 'log'> = {
      1: 'error',
      2: 'warn',
      3: 'info',
      4: 'log'
    };
    this.sendLog(levelMap[params.type] || 'info', params.message);
  }

  private handleProgress(params: { token: string; value: { kind: string; message?: string; percentage?: number } }): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send(IPC_CHANNELS.CSHARP_LSP_PROGRESS, {
      message: params.value.message || 'Processing...',
      percent: params.value.percentage
    });
  }

  private sendLog(level: 'error' | 'warn' | 'info' | 'log', message: string): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send(IPC_CHANNELS.CSHARP_LSP_LOG, {
      level,
      message
    });
  }

  private pathToUri(relPath: string): string {
    if (!this.workspaceRoot) {
      throw new Error('Workspace root not set');
    }
    const absPath = path.resolve(this.workspaceRoot, relPath);
    
    // Convert to forward slashes for URI
    let uriPath = absPath.replace(/\\/g, '/');
    
    // For Windows, ensure proper file URI format: file:///C:/path
    if (process.platform === 'win32') {
      // If path starts with drive letter, ensure three slashes
      if (/^[a-zA-Z]:/.test(uriPath)) {
        return `file:///${uriPath}`;
      }
    }
    
    // For Unix-like systems: file:///path
    return `file://${uriPath}`;
  }

  private uriToPath(uri: string): string | null {
    if (!this.workspaceRoot) return null;

    // Remove file:// prefix
    let filePath = uri.replace(/^file:\/\//, '');

    // Convert to platform path
    if (process.platform === 'win32') {
      filePath = filePath.replace(/^\/([a-zA-Z]):/, '$1:');
    }

    filePath = filePath.replace(/\//g, path.sep);

    // Get relative path
    const workspaceRootResolved = realpathSync(this.workspaceRoot);
    if (!filePath.startsWith(workspaceRootResolved)) {
      return null;
    }

    return path.relative(workspaceRootResolved, filePath);
  }

  private cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.workspaceRoot = null;
    this.initialized = false;
    this.documents.clear();
    this.pendingRequests.clear();
    this.buffer = '';
    this.status = 'stopped';
  }
}
