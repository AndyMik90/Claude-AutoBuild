import { ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { Template, IPCResult, ParsedTemplate, TemplateEditorStatus, TemplateEditorStreamChunk } from '../../shared/types';

export interface TemplateAPI {
  getTemplates: () => Promise<IPCResult<Template[]>>;
  saveTemplate: (template: Omit<Template, 'id' | 'version' | 'createdAt' | 'updatedAt'>) => Promise<IPCResult<Template>>;
  deleteTemplate: (templateId: string) => Promise<IPCResult>;
  updateTemplate: (templateId: string, updates: Partial<Omit<Template, 'id' | 'version' | 'createdAt' | 'updatedAt'>>, expectedVersion: number) => Promise<IPCResult<Template>>;
  copyTemplate: (templateId: string, destinationPath: string) => Promise<IPCResult<{ path: string }>>;
  copyTemplateWithName: (templateId: string, destinationPath: string, customName: string) => Promise<IPCResult<{ path: string }>>;
  parseTemplateParameters: (templateId: string) => Promise<IPCResult<ParsedTemplate>>;
  copyTemplateWithParameters: (templateId: string, destinationPath: string, customName: string, parameterValues: Record<string, string>) => Promise<IPCResult<{ path: string }>>;

  // File operations (for template parameter editor)
  readFile: (filePath: string) => Promise<IPCResult<string>>;
  writeFile: (filePath: string, content: string) => Promise<IPCResult>;

  // Template Editor (AI-powered)
  // Auto-initializes with active API profile or global Anthropic API key
  checkTemplateEditorInitialized: () => Promise<IPCResult<boolean>>;
  sendTemplateEditorMessage: (templateId: string, templatePath: string, message: string) => Promise<IPCResult>;
  clearTemplateEditorHistory: (templateId: string) => Promise<IPCResult>;
  onTemplateEditorStatus: (callback: (templateId: string, status: TemplateEditorStatus) => void) => () => void;
  onTemplateEditorStreamChunk: (callback: (templateId: string, chunk: TemplateEditorStreamChunk) => void) => () => void;
  onTemplateEditorError: (callback: (templateId: string, error: string) => void) => () => void;
}

export const createTemplateAPI = (): TemplateAPI => ({
  getTemplates: (): Promise<IPCResult<Template[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_GET),

  saveTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPCResult<Template>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_SAVE, template),

  deleteTemplate: (templateId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_DELETE, templateId),

  updateTemplate: (templateId: string, updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>, expectedVersion: number): Promise<IPCResult<Template>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_UPDATE, templateId, updates, expectedVersion),

  copyTemplate: (templateId: string, destinationPath: string): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY, templateId, destinationPath),

  copyTemplateWithName: (templateId: string, destinationPath: string, customName: string): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY_WITH_NAME, templateId, destinationPath, customName),

  parseTemplateParameters: (templateId: string): Promise<IPCResult<ParsedTemplate>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_PARSE_PARAMETERS, templateId),

  copyTemplateWithParameters: (templateId: string, destinationPath: string, customName: string, parameterValues: Record<string, string>): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY_WITH_PARAMETERS, templateId, destinationPath, customName, parameterValues),

  // File operations (for template parameter editor)
  readFile: (filePath: string): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),

  writeFile: (filePath: string, content: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, content),

  // Template Editor (AI-powered)
  checkTemplateEditorInitialized: (): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_EDITOR_CHECK_INITIALIZED),

  sendTemplateEditorMessage: (templateId: string, templatePath: string, message: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_EDITOR_SEND_MESSAGE, templateId, templatePath, message),

  clearTemplateEditorHistory: (templateId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_EDITOR_CLEAR_HISTORY, templateId),

  onTemplateEditorStatus: (callback: (templateId: string, status: TemplateEditorStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, templateId: string, status: TemplateEditorStatus) => {
      callback(templateId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.TEMPLATE_EDITOR_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TEMPLATE_EDITOR_STATUS, listener);
  },

  onTemplateEditorStreamChunk: (callback: (templateId: string, chunk: TemplateEditorStreamChunk) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, templateId: string, chunk: TemplateEditorStreamChunk) => {
      callback(templateId, chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.TEMPLATE_EDITOR_STREAM_CHUNK, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TEMPLATE_EDITOR_STREAM_CHUNK, listener);
  },

  onTemplateEditorError: (callback: (templateId: string, error: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, templateId: string, error: string) => {
      callback(templateId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.TEMPLATE_EDITOR_ERROR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TEMPLATE_EDITOR_ERROR, listener);
  }
});
