import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { Template, IPCResult, ParsedTemplate } from '../../shared/types';

export interface TemplateAPI {
  getTemplates: () => Promise<IPCResult<Template[]>>;
  saveTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) => Promise<IPCResult<Template>>;
  deleteTemplate: (templateId: string) => Promise<IPCResult>;
  updateTemplate: (templateId: string, updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<IPCResult<Template>>;
  copyTemplate: (templateId: string, destinationPath: string) => Promise<IPCResult<{ path: string }>>;
  copyTemplateWithName: (templateId: string, destinationPath: string, customName: string) => Promise<IPCResult<{ path: string }>>;
  parseTemplateParameters: (templateId: string) => Promise<IPCResult<ParsedTemplate>>;
  copyTemplateWithParameters: (templateId: string, destinationPath: string, customName: string, parameterValues: Record<string, string>) => Promise<IPCResult<{ path: string }>>;
}

export const createTemplateAPI = (): TemplateAPI => ({
  getTemplates: (): Promise<IPCResult<Template[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_GET),

  saveTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPCResult<Template>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_SAVE, template),

  deleteTemplate: (templateId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_DELETE, templateId),

  updateTemplate: (templateId: string, updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>): Promise<IPCResult<Template>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_UPDATE, templateId, updates),

  copyTemplate: (templateId: string, destinationPath: string): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY, templateId, destinationPath),

  copyTemplateWithName: (templateId: string, destinationPath: string, customName: string): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY_WITH_NAME, templateId, destinationPath, customName),

  parseTemplateParameters: (templateId: string): Promise<IPCResult<ParsedTemplate>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_PARSE_PARAMETERS, templateId),

  copyTemplateWithParameters: (templateId: string, destinationPath: string, customName: string, parameterValues: Record<string, string>): Promise<IPCResult<{ path: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATES_COPY_WITH_PARAMETERS, templateId, destinationPath, customName, parameterValues)
});
