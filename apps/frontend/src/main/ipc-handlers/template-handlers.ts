import { ipcMain, app } from 'electron';
import { existsSync, writeFileSync, readFileSync, mkdirSync, cpSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { Template, TemplateStore, IPCResult } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { parseTemplateDirectory, replaceTemplateParameters, type ParsedTemplate, type TemplateParameter } from '../template-parser';

const getTemplatesPath = (): string => {
  const userDataPath = app.getPath('userData');
  const storeDir = path.join(userDataPath, 'store');

  // Ensure store directory exists
  if (!existsSync(storeDir)) {
    mkdirSync(storeDir, { recursive: true });
  }

  return path.join(storeDir, 'templates.json');
};

const readTemplatesFile = (): TemplateStore => {
  const templatesPath = getTemplatesPath();

  if (!existsSync(templatesPath)) {
    return { templates: [] };
  }

  try {
    const data = readFileSync(templatesPath, 'utf-8');
    return JSON.parse(data) as TemplateStore;
  } catch (error) {
    console.error('[TEMPLATES] Failed to read templates file:', error);
    return { templates: [] };
  }
};

const writeTemplatesFile = (store: TemplateStore): void => {
  const templatesPath = getTemplatesPath();
  writeFileSync(templatesPath, JSON.stringify(store, null, 2), 'utf-8');
};

export function registerTemplateHandlers(): void {
  // Get all templates
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_GET,
    async (): Promise<IPCResult<Template[]>> => {
      try {
        const store = readTemplatesFile();
        return { success: true, data: store.templates };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get templates'
        };
      }
    }
  );

  // Save new template
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_SAVE,
    async (_, template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPCResult<Template>> => {
      try {
        const store = readTemplatesFile();
        const now = Date.now();
        const newTemplate: Template = {
          ...template,
          id: uuidv4(),
          createdAt: now,
          updatedAt: now
        };

        store.templates.push(newTemplate);
        writeTemplatesFile(store);

        return { success: true, data: newTemplate };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save template'
        };
      }
    }
  );

  // Delete template
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_DELETE,
    async (_, templateId: string): Promise<IPCResult> => {
      try {
        const store = readTemplatesFile();
        const index = store.templates.findIndex(t => t.id === templateId);

        if (index === -1) {
          return { success: false, error: 'Template not found' };
        }

        store.templates.splice(index, 1);
        writeTemplatesFile(store);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete template'
        };
      }
    }
  );

  // Update template
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_UPDATE,
    async (_, templateId: string, updates: Partial<Omit<Template, 'id' | 'createdAt' | 'updatedAt'>>): Promise<IPCResult<Template>> => {
      try {
        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          return { success: false, error: 'Template not found' };
        }

        Object.assign(template, updates);
        template.updatedAt = Date.now();

        writeTemplatesFile(store);

        return { success: true, data: template };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update template'
        };
      }
    }
  );

  // Copy template to a new location
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_COPY,
    async (_, templateId: string, destinationPath: string): Promise<IPCResult<{ path: string }>> => {
      try {
        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          return { success: false, error: 'Template not found' };
        }

        if (!existsSync(template.folderPath)) {
          return { success: false, error: 'Template folder does not exist' };
        }

        // Get the template folder name
        const templateFolderName = path.basename(template.folderPath);
        const targetPath = path.join(destinationPath, templateFolderName);

        // Check if target already exists
        if (existsSync(targetPath)) {
          return { success: false, error: `A folder named "${templateFolderName}" already exists at the destination` };
        }

        // Copy the template folder recursively
        cpSync(template.folderPath, targetPath, { recursive: true });

        return { success: true, data: { path: targetPath } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to copy template'
        };
      }
    }
  );

  // Copy template to a new location with custom name
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_COPY_WITH_NAME,
    async (_, templateId: string, destinationPath: string, customName: string): Promise<IPCResult<{ path: string }>> => {
      try {
        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          return { success: false, error: 'Template not found' };
        }

        if (!existsSync(template.folderPath)) {
          return { success: false, error: 'Template folder does not exist' };
        }

        // Use the custom name for the target folder
        const targetPath = path.join(destinationPath, customName);

        // Check if target already exists
        if (existsSync(targetPath)) {
          return { success: false, error: `A folder named "${customName}" already exists at the destination` };
        }

        // Copy the template folder recursively
        cpSync(template.folderPath, targetPath, { recursive: true });

        return { success: true, data: { path: targetPath } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to copy template'
        };
      }
    }
  );

  // Parse template parameters
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_PARSE_PARAMETERS,
    async (_, templateId: string): Promise<IPCResult<ParsedTemplate>> => {
      try {
        console.log('[TEMPLATES] Parsing parameters for template:', templateId);
        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          console.log('[TEMPLATES] Template not found:', templateId);
          return { success: false, error: 'Template not found' };
        }

        console.log('[TEMPLATES] Template folder path:', template.folderPath);

        if (!existsSync(template.folderPath)) {
          console.log('[TEMPLATES] Template folder does not exist:', template.folderPath);
          return { success: false, error: 'Template folder does not exist' };
        }

        const parsed = parseTemplateDirectory(template.folderPath);
        console.log('[TEMPLATES] Parse result:', {
          totalFiles: parsed.totalFiles,
          filesWithParameters: parsed.filesWithParameters,
          parametersCount: parsed.parameters.length
        });
        return { success: true, data: parsed };
      } catch (error) {
        console.error('[TEMPLATES] Error parsing template parameters:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse template parameters'
        };
      }
    }
  );

  // Copy template with parameter replacement
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_COPY_WITH_PARAMETERS,
    async (
      _,
      templateId: string,
      destinationPath: string,
      customName: string,
      parameterValues: Record<string, string>
    ): Promise<IPCResult<{ path: string }>> => {
      try {
        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          return { success: false, error: 'Template not found' };
        }

        if (!existsSync(template.folderPath)) {
          return { success: false, error: 'Template folder does not exist' };
        }

        const targetPath = path.join(destinationPath, customName);

        if (existsSync(targetPath)) {
          return { success: false, error: `A folder named "${customName}" already exists at the destination` };
        }

        // First, copy the template folder recursively
        cpSync(template.folderPath, targetPath, { recursive: true });

        // Parse parameters to get file paths and placeholders
        const parsed = parseTemplateDirectory(template.folderPath);

        // Create replacement map (placeholder -> value)
        const replacements = new Map<string, string>();
        for (const param of parsed.parameters) {
          const value = parameterValues[param.key];
          if (value !== undefined && param.placeholder) {
            replacements.set(param.placeholder, value);
          }
        }

        // Replace parameters in copied files
        const filesProcessed = new Set<string>();
        for (const param of parsed.parameters) {
          const relativePath = path.relative(template.folderPath, param.filePath);
          const targetFilePath = path.join(targetPath, relativePath);

          // Only process each file once
          if (!filesProcessed.has(targetFilePath)) {
            filesProcessed.add(targetFilePath);
            const newContent = replaceTemplateParameters(targetFilePath, replacements);
            writeFileSync(targetFilePath, newContent, 'utf-8');
          }
        }

        return { success: true, data: { path: targetPath } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to copy template with parameters'
        };
      }
    }
  );
}
