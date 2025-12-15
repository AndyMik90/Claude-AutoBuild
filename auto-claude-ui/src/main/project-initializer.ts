import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import path from 'path';

/**
 * Debug logging - only logs when AUTO_CLAUDE_DEBUG env var is set
 */
const DEBUG = process.env.AUTO_CLAUDE_DEBUG === 'true' || process.env.AUTO_CLAUDE_DEBUG === '1';

function debug(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    if (data) {
      console.log(`[ProjectInitializer] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[ProjectInitializer] ${message}`);
    }
  }
}

/**
 * Entries to add to .gitignore when initializing a project
 */
const GITIGNORE_ENTRIES = ['.auto-claude/'];

/**
 * Ensure entries exist in the project's .gitignore file.
 * Creates .gitignore if it doesn't exist.
 */
function ensureGitignoreEntries(projectPath: string, entries: string[]): void {
  const gitignorePath = path.join(projectPath, '.gitignore');

  let content = '';
  let existingLines: string[] = [];

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
    existingLines = content.split('\n').map(line => line.trim());
  }

  // Find entries that need to be added
  const entriesToAdd: string[] = [];
  for (const entry of entries) {
    const entryNormalized = entry.replace(/\/$/, ''); // Remove trailing slash for comparison
    const alreadyExists = existingLines.some(line => {
      const lineNormalized = line.replace(/\/$/, '');
      return lineNormalized === entry || lineNormalized === entryNormalized;
    });

    if (!alreadyExists) {
      entriesToAdd.push(entry);
    }
  }

  if (entriesToAdd.length === 0) {
    debug('All gitignore entries already exist');
    return;
  }

  // Build the content to append
  let appendContent = '';

  // Ensure file ends with newline before adding our entries
  if (content && !content.endsWith('\n')) {
    appendContent += '\n';
  }

  appendContent += '\n# Auto Claude data directory\n';
  for (const entry of entriesToAdd) {
    appendContent += entry + '\n';
  }

  if (existsSync(gitignorePath)) {
    appendFileSync(gitignorePath, appendContent);
  } else {
    writeFileSync(gitignorePath, '# Auto Claude data directory\n' + entriesToAdd.join('\n') + '\n');
  }

  debug('Added entries to .gitignore', { entries: entriesToAdd });
}

/**
 * Data directories created in .auto-claude for each project
 */
const DATA_DIRECTORIES = [
  'specs',
  'ideation',
  'insights',
  'roadmap'
];

/**
 * Result of initialization operation
 */
export interface InitializationResult {
  success: boolean;
  error?: string;
}

/**
 * Check if the project has a local auto-claude source directory
 * This indicates it's the auto-claude development project itself
 */
export function hasLocalSource(projectPath: string): boolean {
  const localSourcePath = path.join(projectPath, 'auto-claude');
  const versionFile = path.join(localSourcePath, 'VERSION');
  return existsSync(localSourcePath) && existsSync(versionFile);
}

/**
 * Get the local source path for a project (if it exists)
 */
export function getLocalSourcePath(projectPath: string): string | null {
  const localSourcePath = path.join(projectPath, 'auto-claude');
  if (hasLocalSource(projectPath)) {
    return localSourcePath;
  }
  return null;
}

/**
 * Check if project is initialized (has .auto-claude directory)
 */
export function isInitialized(projectPath: string): boolean {
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');
  return existsSync(dotAutoBuildPath);
}

/**
 * Initialize auto-claude data directory in a project.
 *
 * Creates .auto-claude/ with data directories (specs, ideation, insights, roadmap).
 * The framework code runs from the source repo - only data is stored here.
 */
export function initializeProject(projectPath: string): InitializationResult {
  debug('initializeProject called', { projectPath });

  // Validate project path exists
  if (!existsSync(projectPath)) {
    debug('Project path does not exist', { projectPath });
    return {
      success: false,
      error: `Project directory not found: ${projectPath}`
    };
  }

  // Check if already initialized
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');

  if (existsSync(dotAutoBuildPath)) {
    debug('Already initialized - .auto-claude exists');
    return {
      success: false,
      error: 'Project already has auto-claude initialized (.auto-claude exists)'
    };
  }

  try {
    debug('Creating .auto-claude data directory', { dotAutoBuildPath });

    // Create the .auto-claude directory
    mkdirSync(dotAutoBuildPath, { recursive: true });

    // Create data directories
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(dotAutoBuildPath, dataDir);
      debug('Creating data directory', { dataDir, dirPath });
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(path.join(dirPath, '.gitkeep'), '');
    }

    // Update .gitignore to exclude .auto-claude/
    ensureGitignoreEntries(projectPath, GITIGNORE_ENTRIES);

    debug('Initialization complete');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during initialization';
    debug('Initialization failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Ensure all data directories exist in .auto-claude.
 * Useful if new directories are added in future versions.
 */
export function ensureDataDirectories(projectPath: string): InitializationResult {
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');

  if (!existsSync(dotAutoBuildPath)) {
    return {
      success: false,
      error: 'Project not initialized. Run initialize first.'
    };
  }

  try {
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(dotAutoBuildPath, dataDir);
      if (!existsSync(dirPath)) {
        debug('Creating missing data directory', { dataDir, dirPath });
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(path.join(dirPath, '.gitkeep'), '');
      }
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get the auto-claude folder path for a project.
 *
 * IMPORTANT: Only .auto-claude/ is considered a valid "installed" auto-claude.
 * The auto-claude/ folder (if it exists) is the SOURCE CODE being developed,
 * not an installation. This allows Auto Claude to be used to develop itself.
 */
export function getAutoBuildPath(projectPath: string): string | null {
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');

  debug('getAutoBuildPath called', { projectPath, dotAutoBuildPath });

  if (existsSync(dotAutoBuildPath)) {
    debug('Returning .auto-claude (installed version)');
    return '.auto-claude';
  }

  debug('No .auto-claude folder found - project not initialized');
  return null;
}
