import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, symlinkSync, lstatSync, unlinkSync, rmSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

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
 * Files and directories to exclude when copying auto-claude
 */
const EXCLUDE_PATTERNS = [
  '__pycache__',
  '.DS_Store',
  '*.pyc',
  '.env',
  'specs',
  '.git'
];

/**
 * Files to preserve during updates (never overwrite)
 */
const PRESERVE_ON_UPDATE = [
  'specs',
  '.env'
];

/**
 * Directories that contain data (not code) - these are NEVER symlinked
 * They are always real directories to store project-specific data
 */
const DATA_DIRECTORIES = [
  'specs',
  'ideation',
  'insights',
  'roadmap'
];

/**
 * Files that should always be real (not symlinked) in dev mode
 */
const DEV_MODE_REAL_FILES = [
  '.env',
  '.env.example',
  '.version.json'
];

/**
 * Version metadata stored in .auto-claude/.version.json
 */
export interface VersionMetadata {
  version: string;
  sourceHash: string;
  sourcePath: string;
  initializedAt: string;
  updatedAt: string;
  /** If true, this installation uses symlinks to source code (for development) */
  devMode?: boolean;
  /** Path to the local source code when in dev mode */
  devSourcePath?: string;
}

/**
 * Result of initialization or update operation
 */
export interface InitializationResult {
  success: boolean;
  error?: string;
  version?: string;
  wasUpdate?: boolean;
}

/**
 * Result of version check
 */
export interface VersionCheckResult {
  isInitialized: boolean;
  currentVersion?: string;
  sourceVersion?: string;
  updateAvailable: boolean;
  sourcePath?: string;
}

/**
 * Check if a file/directory matches exclusion patterns
 */
function shouldExclude(name: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.startsWith('*')) {
      // Wildcard pattern (e.g., *.pyc)
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    } else if (name === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a file/directory should be preserved during updates
 */
function shouldPreserve(name: string): boolean {
  return PRESERVE_ON_UPDATE.includes(name);
}

/**
 * Check if an entry is a data directory (should never be symlinked)
 */
function isDataDirectory(name: string): boolean {
  return DATA_DIRECTORIES.includes(name);
}

/**
 * Check if a file should be real (not symlinked) in dev mode
 */
function shouldBeRealFile(name: string): boolean {
  return DEV_MODE_REAL_FILES.includes(name);
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
 * Check if a path is a symbolic link
 */
function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Safely remove a file or symlink
 */
function safeRemove(filePath: string): void {
  try {
    if (isSymlink(filePath)) {
      unlinkSync(filePath);
    } else if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        // Don't remove directories - they might have data
        return;
      }
      unlinkSync(filePath);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Recursively copy directory with exclusions
 */
function copyDirectoryRecursive(
  src: string,
  dest: string,
  isUpdate: boolean = false
): void {
  // Create destination directory if it doesn't exist
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip excluded files/directories
    if (shouldExclude(entry.name)) {
      continue;
    }

    // During updates, skip preserved files/directories if they exist
    if (isUpdate && shouldPreserve(entry.name) && existsSync(destPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, isUpdate);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively create symlinks from dest to src for code files.
 * Data directories are created as real directories, not symlinked.
 * This enables dev mode where code changes in source are immediately reflected.
 */
function symlinkDirectoryRecursive(
  src: string,
  dest: string,
  isUpdate: boolean = false
): void {
  // Create destination directory if it doesn't exist
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip excluded files/directories
    if (shouldExclude(entry.name)) {
      continue;
    }

    // Data directories should be real directories, not symlinked
    if (entry.isDirectory() && isDataDirectory(entry.name)) {
      if (!existsSync(destPath)) {
        mkdirSync(destPath, { recursive: true });
        writeFileSync(path.join(destPath, '.gitkeep'), '');
      }
      continue;
    }

    // During updates, skip preserved files/directories if they exist
    if (isUpdate && shouldPreserve(entry.name) && existsSync(destPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      // For directories (like prompts/), symlink the entire directory
      // Remove existing file/symlink if it exists
      safeRemove(destPath);
      
      if (!existsSync(destPath)) {
        try {
          symlinkSync(srcPath, destPath, 'dir');
          debug('Created directory symlink', { from: destPath, to: srcPath });
        } catch (err) {
          debug('Failed to create directory symlink, copying instead', { error: String(err) });
          copyDirectoryRecursive(srcPath, destPath, isUpdate);
        }
      }
    } else {
      // For files, check if they should be real or symlinked
      if (shouldBeRealFile(entry.name)) {
        // Copy real files (like .env.example)
        if (!existsSync(destPath) || isUpdate) {
          copyFileSync(srcPath, destPath);
        }
      } else {
        // Create symlink for code files
        safeRemove(destPath);
        
        try {
          symlinkSync(srcPath, destPath, 'file');
          debug('Created file symlink', { from: destPath, to: srcPath });
        } catch (err) {
          debug('Failed to create file symlink, copying instead', { error: String(err) });
          copyFileSync(srcPath, destPath);
        }
      }
    }
  }
}

/**
 * Calculate hash of directory contents for version comparison
 */
function calculateDirectoryHash(dirPath: string): string {
  const hash = crypto.createHash('sha256');

  function processDirectory(currentPath: string): void {
    if (!existsSync(currentPath)) return;

    const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip excluded items for hash calculation
      if (shouldExclude(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        hash.update(`dir:${entry.name}`);
        processDirectory(fullPath);
      } else {
        const content = readFileSync(fullPath);
        hash.update(`file:${entry.name}:${content.length}`);
        hash.update(content);
      }
    }
  }

  processDirectory(dirPath);
  return hash.digest('hex').slice(0, 16); // Use first 16 chars for brevity
}

/**
 * Read version from VERSION file in auto-claude source
 */
function readSourceVersion(sourcePath: string): string {
  const versionFile = path.join(sourcePath, 'VERSION');
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf-8').trim();
  }
  return '0.0.0';
}

/**
 * Read version metadata from initialized project
 */
function readVersionMetadata(autoBuildPath: string): VersionMetadata | null {
  const metadataPath = path.join(autoBuildPath, '.version.json');
  if (existsSync(metadataPath)) {
    try {
      return JSON.parse(readFileSync(metadataPath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Write version metadata to initialized project
 */
function writeVersionMetadata(
  autoBuildPath: string,
  metadata: VersionMetadata
): void {
  const metadataPath = path.join(autoBuildPath, '.version.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Check if .env file has been modified from example
 */
export function hasCustomEnv(autoBuildPath: string): boolean {
  const envPath = path.join(autoBuildPath, '.env');
  const envExamplePath = path.join(autoBuildPath, '.env.example');

  if (!existsSync(envPath)) {
    return false;
  }

  if (!existsSync(envExamplePath)) {
    return true; // Has .env but no example to compare
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const exampleContent = readFileSync(envExamplePath, 'utf-8');

  // Simple check: if .env differs from .env.example, it's customized
  return envContent !== exampleContent;
}

/**
 * Check version status for a project
 * If an existing auto-claude folder is found without version metadata,
 * create a retroactive .version.json to enable future update tracking.
 */
export function checkVersion(
  projectPath: string,
  sourcePath: string
): VersionCheckResult {
  debug('checkVersion called', { projectPath, sourcePath });

  // Only .auto-claude counts as "installed" - auto-claude/ is source code
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');

  let installedPath: string | null = null;
  if (existsSync(dotAutoBuildPath)) {
    installedPath = dotAutoBuildPath;
    debug('Found .auto-claude folder (installed)');
  }

  if (!installedPath) {
    debug('No .auto-claude folder found - not initialized');
    return {
      isInitialized: false,
      updateAvailable: false
    };
  }

  let metadata = readVersionMetadata(installedPath);

  if (!metadata && existsSync(sourcePath)) {
    // Has folder but no version metadata - create retroactive metadata
    // This allows existing projects to participate in the update system
    const sourceVersion = readSourceVersion(sourcePath);
    const installedHash = calculateDirectoryHash(installedPath);
    const now = new Date().toISOString();

    metadata = {
      version: sourceVersion,
      sourceHash: installedHash, // Use installed hash as baseline
      sourcePath,
      initializedAt: now,
      updatedAt: now
    };

    // Write the retroactive metadata
    writeVersionMetadata(installedPath, metadata);
  }

  if (!metadata) {
    // Still no metadata (source doesn't exist) - legacy or manual install
    return {
      isInitialized: true,
      updateAvailable: false, // Can't determine without source
      sourcePath: installedPath
    };
  }

  // Check if source exists
  if (!existsSync(sourcePath)) {
    return {
      isInitialized: true,
      currentVersion: metadata.version,
      updateAvailable: false,
      sourcePath: installedPath
    };
  }

  const sourceVersion = readSourceVersion(sourcePath);
  const sourceHash = calculateDirectoryHash(sourcePath);

  // Only show update available if hash differs AND version is actually different
  // This prevents false positives when versions match but hashes differ due to
  // metadata files or other non-functional differences
  const hashDiffers = metadata.sourceHash !== sourceHash;
  const versionDiffers = metadata.version !== sourceVersion;
  const updateAvailable = hashDiffers && versionDiffers;

  return {
    isInitialized: true,
    currentVersion: metadata.version,
    sourceVersion,
    updateAvailable,
    sourcePath: installedPath
  };
}

/**
 * Initialize auto-claude in a project
 */
export function initializeProject(
  projectPath: string,
  sourcePath: string
): InitializationResult {
  debug('initializeProject called', { projectPath, sourcePath });

  // Validate source exists
  if (!existsSync(sourcePath)) {
    debug('Source path does not exist', { sourcePath });
    return {
      success: false,
      error: `Auto-build source not found at: ${sourcePath}`
    };
  }

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
  const autoBuildPath = path.join(projectPath, 'auto-claude');

  const dotExists = existsSync(dotAutoBuildPath);
  const sourceExists = existsSync(autoBuildPath);
  debug('Checking existing paths', {
    dotAutoBuildPath,
    dotExists,
    autoBuildPath,
    sourceExists
  });

  // Only .auto-claude counts as "initialized" - auto-claude/ is the source folder
  // This allows initializing the Auto Claude project itself (which has auto-claude/ source)
  if (dotExists) {
    debug('Already initialized - .auto-claude exists');
    return {
      success: false,
      error: 'Project already has auto-claude initialized (.auto-claude exists)'
    };
  }

  try {
    debug('Copying files to .auto-claude', { from: sourcePath, to: dotAutoBuildPath });
    // Copy files to .auto-claude
    copyDirectoryRecursive(sourcePath, dotAutoBuildPath, false);

    // Create specs directory
    const specsDir = path.join(dotAutoBuildPath, 'specs');
    if (!existsSync(specsDir)) {
      debug('Creating specs directory', { specsDir });
      mkdirSync(specsDir, { recursive: true });
    }
    writeFileSync(path.join(specsDir, '.gitkeep'), '');

    // Create roadmap directory
    const roadmapDir = path.join(dotAutoBuildPath, 'roadmap');
    if (!existsSync(roadmapDir)) {
      debug('Creating roadmap directory', { roadmapDir });
      mkdirSync(roadmapDir, { recursive: true });
    }
    writeFileSync(path.join(roadmapDir, '.gitkeep'), '');

    // Create ideation directory
    const ideationDir = path.join(dotAutoBuildPath, 'ideation');
    if (!existsSync(ideationDir)) {
      debug('Creating ideation directory', { ideationDir });
      mkdirSync(ideationDir, { recursive: true });
    }
    writeFileSync(path.join(ideationDir, '.gitkeep'), '');

    // Copy .env.example to .env if .env doesn't exist
    const envExamplePath = path.join(dotAutoBuildPath, '.env.example');
    const envPath = path.join(dotAutoBuildPath, '.env');
    if (existsSync(envExamplePath) && !existsSync(envPath)) {
      debug('Copying .env.example to .env');
      copyFileSync(envExamplePath, envPath);
    }

    // Write version metadata
    const version = readSourceVersion(sourcePath);
    const sourceHash = calculateDirectoryHash(sourcePath);
    const now = new Date().toISOString();

    debug('Writing version metadata', { version, sourceHash });
    writeVersionMetadata(dotAutoBuildPath, {
      version,
      sourceHash,
      sourcePath,
      initializedAt: now,
      updatedAt: now
    });

    debug('Initialization complete', { version });
    return {
      success: true,
      version,
      wasUpdate: false
    };
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
 * Update auto-claude in a project
 */
export function updateProject(
  projectPath: string,
  sourcePath: string
): InitializationResult {
  debug('updateProject called', { projectPath, sourcePath });

  // Validate source exists
  if (!existsSync(sourcePath)) {
    debug('Source path does not exist');
    return {
      success: false,
      error: `Auto-build source not found at: ${sourcePath}`
    };
  }

  // Only .auto-claude is considered an installed instance
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');

  if (!existsSync(dotAutoBuildPath)) {
    debug('No .auto-claude folder found to update');
    return {
      success: false,
      error: 'No .auto-claude folder found to update. Initialize the project first.'
    };
  }

  const targetPath = dotAutoBuildPath;
  debug('Updating .auto-claude folder', { targetPath });

  try {
    // Copy files with preservation of specs/ and .env
    copyDirectoryRecursive(sourcePath, targetPath, true);

    // Update version metadata
    const version = readSourceVersion(sourcePath);
    const sourceHash = calculateDirectoryHash(sourcePath);
    const existingMetadata = readVersionMetadata(targetPath);
    const now = new Date().toISOString();

    writeVersionMetadata(targetPath, {
      version,
      sourceHash,
      sourcePath,
      initializedAt: existingMetadata?.initializedAt || now,
      updatedAt: now
    });

    return {
      success: true,
      version,
      wasUpdate: true
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during update'
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
  const autoBuildPath = path.join(projectPath, 'auto-claude');

  const dotExists = existsSync(dotAutoBuildPath);
  const sourceExists = existsSync(autoBuildPath);

  debug('getAutoBuildPath called', {
    projectPath,
    dotAutoBuildPath,
    dotExists,
    autoBuildPath,
    sourceExists
  });

  // Only .auto-claude counts as an "installed" auto-claude
  // auto-claude/ is the source code folder, not an installation
  if (dotExists) {
    debug('Returning .auto-claude (installed version)');
    return '.auto-claude';
  }

  // Don't return auto-claude/ - that's source code, not an installation
  // The project needs to be initialized to create .auto-claude/
  debug('No .auto-claude folder found - project not initialized');
  return null;
}

/**
 * Check if a project's .auto-claude is in dev mode (symlinked to source)
 */
export function isDevMode(projectPath: string): boolean {
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');
  const metadataPath = path.join(dotAutoBuildPath, '.version.json');
  
  if (!existsSync(metadataPath)) {
    return false;
  }
  
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as VersionMetadata;
    return metadata.devMode === true;
  } catch {
    return false;
  }
}

/**
 * Enable dev mode for a project by converting .auto-claude to use symlinks
 * from the local auto-claude/ source directory.
 * 
 * This is useful when developing auto-claude itself - changes to the source
 * code are immediately reflected in .auto-claude without manual updates.
 * 
 * @param projectPath - Path to the project
 * @returns Result of the operation
 */
export function enableDevMode(projectPath: string): InitializationResult {
  debug('enableDevMode called', { projectPath });
  
  // Check if project has local source
  const localSourcePath = getLocalSourcePath(projectPath);
  if (!localSourcePath) {
    debug('No local source found');
    return {
      success: false,
      error: 'No auto-claude/ source directory found. Dev mode requires the project to have an auto-claude/ folder (the source code).'
    };
  }
  
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');
  
  // Create .auto-claude if it doesn't exist
  if (!existsSync(dotAutoBuildPath)) {
    mkdirSync(dotAutoBuildPath, { recursive: true });
  }
  
  try {
    // Use symlink-based copy
    symlinkDirectoryRecursive(localSourcePath, dotAutoBuildPath, true);
    
    // Ensure data directories exist as real directories
    for (const dataDir of DATA_DIRECTORIES) {
      const dataDirPath = path.join(dotAutoBuildPath, dataDir);
      if (!existsSync(dataDirPath)) {
        mkdirSync(dataDirPath, { recursive: true });
        writeFileSync(path.join(dataDirPath, '.gitkeep'), '');
      }
    }
    
    // Ensure insights directory exists
    const insightsDir = path.join(dotAutoBuildPath, 'insights');
    if (!existsSync(insightsDir)) {
      mkdirSync(insightsDir, { recursive: true });
    }
    
    // Copy .env.example to .env if .env doesn't exist
    const envExamplePath = path.join(localSourcePath, '.env.example');
    const envPath = path.join(dotAutoBuildPath, '.env');
    if (existsSync(envExamplePath) && !existsSync(envPath)) {
      copyFileSync(envExamplePath, envPath);
    }
    
    // Write version metadata with dev mode flag
    const version = readSourceVersion(localSourcePath);
    const sourceHash = calculateDirectoryHash(localSourcePath);
    const existingMetadata = readVersionMetadata(dotAutoBuildPath);
    const now = new Date().toISOString();
    
    writeVersionMetadata(dotAutoBuildPath, {
      version,
      sourceHash,
      sourcePath: localSourcePath,
      initializedAt: existingMetadata?.initializedAt || now,
      updatedAt: now,
      devMode: true,
      devSourcePath: localSourcePath
    });
    
    debug('Dev mode enabled successfully', { version });
    return {
      success: true,
      version,
      wasUpdate: true
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error enabling dev mode';
    debug('Failed to enable dev mode', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Disable dev mode by converting symlinks back to real files.
 * This copies the source files to .auto-claude instead of symlinking.
 * 
 * @param projectPath - Path to the project
 * @param sourcePath - Path to the auto-claude source to copy from
 * @returns Result of the operation
 */
export function disableDevMode(
  projectPath: string,
  sourcePath: string
): InitializationResult {
  debug('disableDevMode called', { projectPath, sourcePath });
  
  const dotAutoBuildPath = path.join(projectPath, '.auto-claude');
  
  if (!existsSync(dotAutoBuildPath)) {
    return {
      success: false,
      error: 'No .auto-claude folder found'
    };
  }
  
  if (!existsSync(sourcePath)) {
    return {
      success: false,
      error: `Source not found at: ${sourcePath}`
    };
  }
  
  try {
    // Remove symlinks and copy real files
    const entries = readdirSync(dotAutoBuildPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dotAutoBuildPath, entry.name);
      
      // Skip data directories - they're already real
      if (isDataDirectory(entry.name)) {
        continue;
      }
      
      // Skip version file
      if (entry.name === '.version.json') {
        continue;
      }
      
      // Remove symlink and copy from source
      if (isSymlink(entryPath)) {
        unlinkSync(entryPath);
        
        const srcPath = path.join(sourcePath, entry.name);
        if (existsSync(srcPath)) {
          const srcStat = statSync(srcPath);
          if (srcStat.isDirectory()) {
            copyDirectoryRecursive(srcPath, entryPath, false);
          } else {
            copyFileSync(srcPath, entryPath);
          }
        }
      }
    }
    
    // Update version metadata without dev mode flag
    const version = readSourceVersion(sourcePath);
    const sourceHash = calculateDirectoryHash(sourcePath);
    const existingMetadata = readVersionMetadata(dotAutoBuildPath);
    const now = new Date().toISOString();
    
    writeVersionMetadata(dotAutoBuildPath, {
      version,
      sourceHash,
      sourcePath,
      initializedAt: existingMetadata?.initializedAt || now,
      updatedAt: now,
      devMode: false
    });
    
    debug('Dev mode disabled successfully', { version });
    return {
      success: true,
      version,
      wasUpdate: true
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error disabling dev mode';
    debug('Failed to disable dev mode', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Sync .auto-claude with the local source (refresh symlinks).
 * Useful when new files are added to the source.
 * 
 * @param projectPath - Path to the project  
 * @returns Result of the operation
 */
export function syncDevMode(projectPath: string): InitializationResult {
  debug('syncDevMode called', { projectPath });
  
  if (!isDevMode(projectPath)) {
    return {
      success: false,
      error: 'Project is not in dev mode. Enable dev mode first.'
    };
  }
  
  const localSourcePath = getLocalSourcePath(projectPath);
  if (!localSourcePath) {
    return {
      success: false,
      error: 'No auto-claude/ source directory found.'
    };
  }
  
  // Re-enable dev mode which will refresh all symlinks
  return enableDevMode(projectPath);
}
