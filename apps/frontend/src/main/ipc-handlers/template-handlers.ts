import { ipcMain, app } from 'electron';
import { existsSync, writeFileSync, readFileSync, mkdirSync, cpSync, realpathSync, statSync } from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { Template, TemplateStore, IPCResult, ParsedTemplate, TemplateParameter } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { parseTemplateDirectory, replaceTemplateParameters } from '../template-parser';

/**
 * Security: Sanitize folder/file name to prevent path traversal attacks
 * Only allows alphanumeric characters, hyphens, underscores, dots, and spaces
 * Removes any path separators or parent directory references
 */
const sanitizeName = (name: string): string => {
  // Remove any path separators and parent directory references
  const cleaned = name.replace(/[/\\]/g, '').replace(/\.\./g, '');

  // Only allow safe characters: alphanumeric, hyphen, underscore, dot, space
  const safe = cleaned.replace(/[^a-zA-Z0-9\-_. ]/g, '');

  // Trim whitespace and ensure not empty
  const trimmed = safe.trim();

  if (trimmed.length === 0) {
    throw new Error('Invalid name: must contain at least one alphanumeric character');
  }

  // Prevent names that are only dots (., .., ...)
  if (/^\.+$/.test(trimmed)) {
    throw new Error('Invalid name: cannot be only dots');
  }

  return trimmed;
};

/**
 * Security: Validate that a path is safe and within expected boundaries
 * Prevents path traversal attacks by resolving to real path and checking containment
 */
const validateDestinationPath = (destinationPath: string): string => {
  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(destinationPath);

    // Check if path exists
    if (!existsSync(absolutePath)) {
      throw new Error('Destination path does not exist');
    }

    // Resolve to real path (follows symlinks)
    const realPath = realpathSync(absolutePath);

    // Ensure it's a directory (not a file)
    const stats = statSync(realPath);
    if (!stats.isDirectory()) {
      throw new Error('Destination path must be a directory');
    }

    return realPath;
  } catch (error) {
    throw new Error(`Invalid destination path: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Execute build command in the background for a newly created project
 * Runs asynchronously and logs output/errors
 */
const executeBuildCommand = (buildCommand: string, targetPath: string): void => {
  console.log(`[TEMPLATE] Executing build command in background: ${buildCommand}`);
  console.log(`[TEMPLATE] Working directory: ${targetPath}`);

  exec(buildCommand, { cwd: targetPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[TEMPLATE] Build command failed:`, error);
      console.error(`[TEMPLATE] stderr:`, stderr);
      return;
    }

    if (stdout) {
      console.log(`[TEMPLATE] Build command stdout:`, stdout);
    }

    if (stderr) {
      console.warn(`[TEMPLATE] Build command stderr:`, stderr);
    }

    console.log(`[TEMPLATE] Build command completed successfully`);
  });
};

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
    const store = JSON.parse(data) as TemplateStore;

    // Migration: Ensure all templates have a version field
    let needsWrite = false;
    store.templates = store.templates.map(template => {
      if (typeof template.version !== 'number') {
        console.log('[TEMPLATES] Migrating template to add version field:', template.id);
        needsWrite = true;
        return {
          ...template,
          version: 1 // Initialize version for existing templates
        };
      }
      return template;
    });

    // Write back if migration was needed
    if (needsWrite) {
      console.log('[TEMPLATES] Writing migrated templates file');
      writeFileSync(templatesPath, JSON.stringify(store, null, 2), 'utf-8');
    }

    return store;
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
        console.log('[TEMPLATES_GET] Loaded templates:', store.templates.map(t => ({ id: t.id, name: t.name, version: t.version })));
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
    async (_, template: Omit<Template, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<IPCResult<Template>> => {
      try {
        // Security: Validate template name
        if (!template.name || typeof template.name !== 'string') {
          return { success: false, error: 'Template name is required' };
        }
        if (template.name.length === 0 || template.name.length > 255) {
          return { success: false, error: 'Template name must be between 1 and 255 characters' };
        }

        // Security: Validate template folderPath
        if (!template.folderPath || typeof template.folderPath !== 'string') {
          return { success: false, error: 'Template folder path is required' };
        }
        if (template.folderPath.length === 0 || template.folderPath.length > 1024) {
          return { success: false, error: 'Template folder path must be between 1 and 1024 characters' };
        }

        // Security: Validate folder exists
        if (!existsSync(template.folderPath)) {
          return { success: false, error: 'Template folder path does not exist' };
        }

        // Security: Validate imagePath if provided
        if (template.imagePath !== undefined) {
          if (typeof template.imagePath !== 'string') {
            return { success: false, error: 'Template image path must be a string' };
          }
          if (template.imagePath.length > 1024) {
            return { success: false, error: 'Template image path must not exceed 1024 characters' };
          }
        }

        // Security: Validate buildCommand if provided
        if (template.buildCommand !== undefined) {
          if (typeof template.buildCommand !== 'string') {
            return { success: false, error: 'Template build command must be a string' };
          }
          if (template.buildCommand.length > 2048) {
            return { success: false, error: 'Template build command must not exceed 2048 characters' };
          }
        }

        const store = readTemplatesFile();
        const now = Date.now();
        const newTemplate: Template = {
          ...template,
          id: uuidv4(),
          version: 1, // Initialize version for optimistic locking
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

  // Update template with optimistic locking
  ipcMain.handle(
    IPC_CHANNELS.TEMPLATES_UPDATE,
    async (
      _,
      templateId: string,
      updates: Partial<Omit<Template, 'id' | 'version' | 'createdAt' | 'updatedAt'>>,
      expectedVersion: number
    ): Promise<IPCResult<Template>> => {
      try {
        console.log('[TEMPLATES_UPDATE] Received params:', { templateId, expectedVersion, expectedVersionType: typeof expectedVersion });

        // Security: Validate templateId
        if (!templateId || typeof templateId !== 'string') {
          return { success: false, error: 'Template ID is required' };
        }

        // Security: Validate expectedVersion
        if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
          console.error('[TEMPLATES_UPDATE] Invalid version:', { expectedVersion, type: typeof expectedVersion });
          return { success: false, error: 'Expected version must be a positive integer' };
        }

        // Security: Validate updates object
        if (!updates || typeof updates !== 'object') {
          return { success: false, error: 'Updates must be an object' };
        }

        // Security: Validate name if provided
        if (updates.name !== undefined) {
          if (typeof updates.name !== 'string' || updates.name.length === 0 || updates.name.length > 255) {
            return { success: false, error: 'Template name must be between 1 and 255 characters' };
          }
        }

        // Security: Validate folderPath if provided
        if (updates.folderPath !== undefined) {
          if (typeof updates.folderPath !== 'string' || updates.folderPath.length === 0 || updates.folderPath.length > 1024) {
            return { success: false, error: 'Template folder path must be between 1 and 1024 characters' };
          }
          if (!existsSync(updates.folderPath)) {
            return { success: false, error: 'Template folder path does not exist' };
          }
        }

        // Security: Validate imagePath if provided
        if (updates.imagePath !== undefined) {
          if (typeof updates.imagePath !== 'string' || updates.imagePath.length > 1024) {
            return { success: false, error: 'Template image path must not exceed 1024 characters' };
          }
        }

        // Security: Validate buildCommand if provided
        if (updates.buildCommand !== undefined) {
          if (typeof updates.buildCommand !== 'string' || updates.buildCommand.length > 2048) {
            return { success: false, error: 'Template build command must not exceed 2048 characters' };
          }
        }

        const store = readTemplatesFile();
        const template = store.templates.find(t => t.id === templateId);

        if (!template) {
          return { success: false, error: 'Template not found' };
        }

        // Optimistic locking: Check version to detect concurrent modifications
        if (template.version !== expectedVersion) {
          return {
            success: false,
            error: `Template has been modified by another process. Expected version ${expectedVersion}, but current version is ${template.version}. Please reload and try again.`
          };
        }

        // Apply updates
        Object.assign(template, updates);

        // Increment version and update timestamp
        template.version += 1;
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

        // Security: Validate destination path
        const validatedDestPath = validateDestinationPath(destinationPath);

        // Get the template folder name and sanitize it
        const templateFolderName = sanitizeName(path.basename(template.folderPath));
        const targetPath = path.join(validatedDestPath, templateFolderName);

        // Security: Atomic directory creation to prevent TOCTOU race
        // Try to create the directory first - if it fails with EEXIST, the folder already exists
        try {
          mkdirSync(targetPath, { recursive: false });
        } catch (err: any) {
          if (err.code === 'EEXIST') {
            return { success: false, error: `A folder named "${templateFolderName}" already exists at the destination` };
          }
          throw err; // Re-throw other errors
        }

        try {
          // Copy the template folder contents into the newly created directory
          cpSync(template.folderPath, targetPath, { recursive: true });

          // Execute build command in the background if configured
          if (template.buildCommand && template.buildCommand.trim()) {
            executeBuildCommand(template.buildCommand.trim(), targetPath);
          }

          return { success: true, data: { path: targetPath } };
        } catch (copyErr: any) {
          // If copy fails, try to clean up the created directory
          try {
            require('fs').rmSync(targetPath, { recursive: true, force: true });
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
          throw copyErr; // Re-throw the original copy error
        }
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

        // Security: Validate destination path and sanitize custom name
        const validatedDestPath = validateDestinationPath(destinationPath);
        const sanitizedName = sanitizeName(customName);

        // Use the sanitized custom name for the target folder
        const targetPath = path.join(validatedDestPath, sanitizedName);

        // Security: Atomic directory creation to prevent TOCTOU race
        // Try to create the directory first - if it fails with EEXIST, the folder already exists
        try {
          mkdirSync(targetPath, { recursive: false });
        } catch (err: any) {
          if (err.code === 'EEXIST') {
            return { success: false, error: `A folder named "${sanitizedName}" already exists at the destination` };
          }
          throw err; // Re-throw other errors
        }

        try {
          // Copy the template folder contents into the newly created directory
          cpSync(template.folderPath, targetPath, { recursive: true });

          // Execute build command in the background if configured
          if (template.buildCommand && template.buildCommand.trim()) {
            executeBuildCommand(template.buildCommand.trim(), targetPath);
          }

          return { success: true, data: { path: targetPath } };
        } catch (copyErr: any) {
          // If copy fails, try to clean up the created directory
          try {
            require('fs').rmSync(targetPath, { recursive: true, force: true });
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
          throw copyErr; // Re-throw the original copy error
        }
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

        const parsed = await parseTemplateDirectory(template.folderPath);
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

        // Security: Validate destination path and sanitize custom name
        const validatedDestPath = validateDestinationPath(destinationPath);
        const sanitizedName = sanitizeName(customName);

        // Security: Validate parameterValues to prevent DoS attacks
        if (!parameterValues || typeof parameterValues !== 'object' || Array.isArray(parameterValues)) {
          return { success: false, error: 'Parameter values must be a string-to-string object' };
        }

        const keys = Object.keys(parameterValues);

        // Validate number of parameters
        if (keys.length > 100) {
          return { success: false, error: 'Too many parameters: maximum 100 allowed' };
        }

        // Validate each parameter key and value
        let totalPayloadSize = 0;
        for (const key of keys) {
          const value = parameterValues[key];

          // Ensure value is a string
          if (typeof value !== 'string') {
            return { success: false, error: `Parameter value for "${key}" must be a string` };
          }

          // Validate key length
          if (key.length > 100) {
            return { success: false, error: `Parameter key "${key}" exceeds maximum length of 100 characters` };
          }

          // Validate value length
          if (value.length > 10000) {
            return { success: false, error: `Parameter value for "${key}" exceeds maximum length of 10,000 characters` };
          }

          // Track total payload size
          totalPayloadSize += key.length + value.length;
        }

        // Validate total payload size to prevent memory exhaustion
        if (totalPayloadSize > 1000000) {
          return { success: false, error: `Total parameter payload size exceeds maximum of 1,000,000 bytes` };
        }

        const targetPath = path.join(validatedDestPath, sanitizedName);

        // Security: Atomic directory creation to prevent TOCTOU race
        // Try to create the directory first - if it fails with EEXIST, the folder already exists
        try {
          mkdirSync(targetPath, { recursive: false });
        } catch (err: any) {
          if (err.code === 'EEXIST') {
            return { success: false, error: `A folder named "${sanitizedName}" already exists at the destination` };
          }
          throw err; // Re-throw other errors
        }

        try {
          // Copy the template folder recursively into the newly created directory
          cpSync(template.folderPath, targetPath, { recursive: true });

          // Parse parameters to get file paths and placeholders
          const parsed = await parseTemplateDirectory(template.folderPath);

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

            // Normalize path to ensure consistent deduplication
            const resolvedTargetPath = path.resolve(targetFilePath);

            // Only process each file once
            if (!filesProcessed.has(resolvedTargetPath)) {
              filesProcessed.add(resolvedTargetPath);
              const newContent = replaceTemplateParameters(targetFilePath, replacements);
              writeFileSync(targetFilePath, newContent, 'utf-8');
            }
          }

          // Execute build command in the background if configured
          if (template.buildCommand && template.buildCommand.trim()) {
            executeBuildCommand(template.buildCommand.trim(), targetPath);
          }

          return { success: true, data: { path: targetPath } };
        } catch (copyErr: any) {
          // If copy or parameter replacement fails, try to clean up the created directory
          try {
            require('fs').rmSync(targetPath, { recursive: true, force: true });
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
          throw copyErr; // Re-throw the original error
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to copy template with parameters'
        };
      }
    }
  );

  // Read file content (for template parameter editor)
  ipcMain.handle(
    IPC_CHANNELS.FILE_READ,
    async (_, filePath: string): Promise<IPCResult<string>> => {
      try {
        // Security: Validate file path
        if (!filePath || typeof filePath !== 'string') {
          return { success: false, error: 'File path is required' };
        }

        // Security: Ensure file exists
        if (!existsSync(filePath)) {
          return { success: false, error: 'File does not exist' };
        }

        // Read file content
        const content = readFileSync(filePath, 'utf-8');
        return { success: true, data: content };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file'
        };
      }
    }
  );

  // Write file content (for template parameter editor)
  ipcMain.handle(
    IPC_CHANNELS.FILE_WRITE,
    async (_, filePath: string, content: string): Promise<IPCResult> => {
      try {
        // Security: Validate file path
        if (!filePath || typeof filePath !== 'string') {
          return { success: false, error: 'File path is required' };
        }

        // Security: Validate content
        if (content === undefined || content === null) {
          return { success: false, error: 'Content is required' };
        }

        if (typeof content !== 'string') {
          return { success: false, error: 'Content must be a string' };
        }

        // Security: Ensure file exists before overwriting
        if (!existsSync(filePath)) {
          return { success: false, error: 'File does not exist' };
        }

        // Write file content
        writeFileSync(filePath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file'
        };
      }
    }
  );
}
