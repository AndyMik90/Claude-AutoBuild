/**
 * Update Engine
 *
 * Manages plugin updates with conflict detection:
 * - Fetching latest changes from GitHub
 * - Detecting local modifications
 * - Categorizing changes by type (skills, patterns, conventions, etc.)
 * - Creating backups before updates
 * - Applying selective updates with rollback capability
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { simpleGit, SimpleGit } from 'simple-git';
import type {
  Plugin,
  PluginUpdateCheck,
  PluginUpdateOptions,
  PluginUpdateResult,
  PluginBackup,
  UpdateCategory,
  UpdateFile,
  UpdateSummary
} from '../../shared/types';
import { getPluginManager } from './PluginManager';
import { getGitHubAuth } from './GitHubAuth';

/** Backup directory name within plugin directory */
const BACKUPS_DIR = '.backups';

/** Maximum number of backups to keep per plugin */
const MAX_BACKUPS = 5;

/** File categories for grouping updates */
const FILE_CATEGORIES: { [key: string]: { id: string; name: string; description: string; patterns: RegExp[] } } = {
  skills: {
    id: 'skills',
    name: 'Skills',
    description: 'Skill definitions and implementations',
    patterns: [/^boilerplate\/skills\//i, /\/skills\//i, /\.skill\.(json|md|ts|js)$/i]
  },
  patterns: {
    id: 'patterns',
    name: 'Patterns',
    description: 'Design patterns and templates',
    patterns: [/^boilerplate\/patterns\//i, /\/patterns\//i, /\.pattern\.(json|md|ts|js)$/i]
  },
  conventions: {
    id: 'conventions',
    name: 'Conventions',
    description: 'Coding conventions and style guides',
    patterns: [/^boilerplate\/conventions\//i, /\/conventions\//i, /\.convention\.(json|md)$/i]
  },
  config: {
    id: 'config',
    name: 'Configuration',
    description: 'Plugin configuration files',
    patterns: [/^plugin\.json$/i, /^boilerplate-ref\.json$/i, /\.(config|rc)\.(json|js|ts)$/i]
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    description: 'README and documentation files',
    patterns: [/^readme\.md$/i, /\.md$/i, /\/docs\//i]
  },
  other: {
    id: 'other',
    name: 'Other Files',
    description: 'Miscellaneous files',
    patterns: [/.*/] // Catch-all
  }
};

/**
 * Update Engine
 *
 * Handles plugin updates with conflict detection and safe application.
 */
export class UpdateEngine {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  /**
   * Check for updates for a plugin
   * Fetches latest from remote and compares with local
   */
  async checkForUpdates(pluginId: string, token?: string): Promise<PluginUpdateCheck> {
    const pluginManager = getPluginManager();
    const plugin = pluginManager.getPlugin(pluginId);

    if (!plugin) {
      return {
        pluginId,
        hasUpdate: false,
        currentVersion: 'unknown',
        categories: [],
        summary: this.createEmptySummary(),
        error: 'Plugin not found'
      };
    }

    // Only GitHub plugins can check for updates
    if (plugin.sourceType !== 'github') {
      return {
        pluginId,
        hasUpdate: false,
        currentVersion: plugin.version,
        categories: [],
        summary: this.createEmptySummary(),
        error: 'Only GitHub plugins support update checking'
      };
    }

    try {
      // Initialize git in plugin directory
      const git = simpleGit(plugin.path);

      // Fetch latest from remote
      const gitHubAuth = getGitHubAuth();
      if (token && plugin.source.includes('github.com')) {
        // Pull with authentication for private repos
        const pullResult = await gitHubAuth.pullUpdates(plugin.path, token);
        if (!pullResult.success) {
          return {
            pluginId,
            hasUpdate: false,
            currentVersion: plugin.version,
            categories: [],
            summary: this.createEmptySummary(),
            error: pullResult.error || 'Failed to fetch updates'
          };
        }
      } else {
        // Fetch without authentication
        await git.fetch();
      }

      // Get diff between local and remote
      const changedFiles = await this.getChangedFiles(git);

      if (changedFiles.length === 0) {
        return {
          pluginId,
          hasUpdate: false,
          currentVersion: plugin.version,
          categories: [],
          summary: this.createEmptySummary()
        };
      }

      // Detect local modifications (conflicts)
      const filesWithConflicts = await this.detectConflicts(plugin.path, changedFiles);

      // Categorize changes
      const categories = this.categorizeChanges(filesWithConflicts);

      // Get latest version from remote
      const latestVersion = await this.getRemoteVersion(git, plugin.path);

      // Build summary
      const summary = this.buildSummary(filesWithConflicts);

      return {
        pluginId,
        hasUpdate: true,
        currentVersion: plugin.version,
        latestVersion,
        categories,
        summary
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UpdateEngine] Failed to check updates for ${pluginId}:`, message);

      return {
        pluginId,
        hasUpdate: false,
        currentVersion: plugin.version,
        categories: [],
        summary: this.createEmptySummary(),
        error: message
      };
    }
  }

  /**
   * Get list of files changed between local and remote
   */
  private async getChangedFiles(git: SimpleGit): Promise<UpdateFile[]> {
    try {
      // Get diff between HEAD and origin/main (or origin/master)
      const branch = await this.getDefaultBranch(git);
      const diffSummary = await git.diffSummary([`origin/${branch}`, 'HEAD']);

      const files: UpdateFile[] = [];

      for (const file of diffSummary.files) {
        let status: UpdateFile['status'] = 'modified';
        const filePath = file.file;

        // Check file type - DiffResultTextFile has 'changes', 'insertions', 'deletions'
        // DiffResultBinaryFile has 'binary', DiffResultNameStatusFile has 'status'
        if ('changes' in file && 'insertions' in file && 'deletions' in file) {
          // Text file - check if it's a rename (all zeros)
          if (file.changes === 0 && file.insertions === 0 && file.deletions === 0) {
            status = 'renamed';
          } else {
            status = 'modified';
          }
        } else if ('binary' in file) {
          // Binary file
          status = 'modified';
        } else if ('status' in file) {
          // Name status file - use the status field
          const fileStatus = (file as { status: string }).status;
          if (fileStatus === 'A') {
            status = 'added';
          } else if (fileStatus === 'D') {
            status = 'deleted';
          } else if (fileStatus === 'R') {
            status = 'renamed';
          } else {
            status = 'modified';
          }
        }

        files.push({
          path: filePath,
          status,
          hasConflict: false // Will be determined by detectConflicts
        });
      }

      return files;
    } catch (error) {
      console.error('[UpdateEngine] Failed to get changed files:', error);
      return [];
    }
  }

  /**
   * Get the default branch name (main or master)
   */
  private async getDefaultBranch(git: SimpleGit): Promise<string> {
    try {
      const remotes = await git.branch(['-r']);
      if (remotes.all.includes('origin/main')) {
        return 'main';
      }
      if (remotes.all.includes('origin/master')) {
        return 'master';
      }
      // Fall back to first remote branch
      const originBranches = remotes.all.filter(b => b.startsWith('origin/'));
      if (originBranches.length > 0) {
        return originBranches[0].replace('origin/', '');
      }
      return 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Detect local modifications that would conflict with updates
   */
  async detectConflicts(pluginPath: string, changedFiles: UpdateFile[]): Promise<UpdateFile[]> {
    const git = simpleGit(pluginPath);

    for (const file of changedFiles) {
      try {
        // Check if file has local uncommitted changes
        const status = await git.status();
        const fileStatus = status.files.find(f => f.path === file.path);

        if (fileStatus && (fileStatus.working_dir !== ' ' || fileStatus.index !== ' ')) {
          file.hasConflict = true;
          continue;
        }

        // Check if file differs from last commit
        const localPath = path.join(pluginPath, file.path);
        if (existsSync(localPath)) {
          try {
            // Get file content from HEAD
            const headContent = await git.show([`HEAD:${file.path}`]);
            const localContent = readFileSync(localPath, 'utf-8');

            // Compare hashes
            const headHash = this.hashContent(headContent);
            const localHash = this.hashContent(localContent);

            file.hasConflict = headHash !== localHash;
          } catch {
            // File might not exist in HEAD (new file)
            file.hasConflict = false;
          }
        }

        // Get diff if conflict detected
        if (file.hasConflict || file.status === 'modified') {
          try {
            const diff = await git.diff([file.path]);
            file.diff = diff;
          } catch {
            // Diff might fail for new files
          }
        }
      } catch (error) {
        console.error(`[UpdateEngine] Failed to detect conflicts for ${file.path}:`, error);
      }
    }

    return changedFiles;
  }

  /**
   * Create a hash of file content for comparison
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get plugin version from remote
   */
  private async getRemoteVersion(git: SimpleGit, pluginPath: string): Promise<string | undefined> {
    try {
      const branch = await this.getDefaultBranch(git);
      const remotePluginJson = await git.show([`origin/${branch}:plugin.json`]);
      const remoteMetadata = JSON.parse(remotePluginJson);
      return remoteMetadata.version;
    } catch {
      // plugin.json might not exist or parse failed
      return undefined;
    }
  }

  /**
   * Categorize changes by file type
   */
  categorizeChanges(files: UpdateFile[]): UpdateCategory[] {
    const categoryMap = new Map<string, UpdateCategory>();

    // Initialize categories
    for (const [key, category] of Object.entries(FILE_CATEGORIES)) {
      categoryMap.set(key, {
        id: category.id,
        name: category.name,
        description: category.description,
        files: [],
        conflictCount: 0
      });
    }

    // Categorize each file
    for (const file of files) {
      let assigned = false;

      for (const [key, category] of Object.entries(FILE_CATEGORIES)) {
        if (key === 'other') continue; // Skip catch-all initially

        for (const pattern of category.patterns) {
          if (pattern.test(file.path)) {
            const cat = categoryMap.get(key)!;
            cat.files.push(file);
            if (file.hasConflict) {
              cat.conflictCount++;
            }
            assigned = true;
            break;
          }
        }

        if (assigned) break;
      }

      // Assign to 'other' if no match
      if (!assigned) {
        const otherCat = categoryMap.get('other')!;
        otherCat.files.push(file);
        if (file.hasConflict) {
          otherCat.conflictCount++;
        }
      }
    }

    // Return only non-empty categories
    return Array.from(categoryMap.values()).filter(cat => cat.files.length > 0);
  }

  /**
   * Build update summary
   */
  private buildSummary(files: UpdateFile[]): UpdateSummary {
    const summary: UpdateSummary = {
      totalFiles: files.length,
      addedFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      conflictFiles: 0
    };

    for (const file of files) {
      switch (file.status) {
        case 'added':
          summary.addedFiles++;
          break;
        case 'modified':
          summary.modifiedFiles++;
          break;
        case 'deleted':
          summary.deletedFiles++;
          break;
        case 'renamed':
          summary.modifiedFiles++;
          break;
      }

      if (file.hasConflict) {
        summary.conflictFiles++;
      }
    }

    return summary;
  }

  /**
   * Create empty summary
   */
  private createEmptySummary(): UpdateSummary {
    return {
      totalFiles: 0,
      addedFiles: 0,
      modifiedFiles: 0,
      deletedFiles: 0,
      conflictFiles: 0
    };
  }

  /**
   * Apply selected updates to a plugin
   */
  async applyUpdates(options: PluginUpdateOptions): Promise<PluginUpdateResult> {
    const pluginManager = getPluginManager();
    const plugin = pluginManager.getPlugin(options.pluginId);

    if (!plugin) {
      return {
        success: false,
        appliedFiles: [],
        skippedFiles: options.selectedFiles,
        error: 'Plugin not found'
      };
    }

    try {
      let backupPath: string | undefined;

      // Create backup if requested
      if (options.createBackup) {
        backupPath = await this.createBackup(plugin);
        if (!backupPath) {
          return {
            success: false,
            appliedFiles: [],
            skippedFiles: options.selectedFiles,
            error: 'Failed to create backup'
          };
        }
      }

      const git = simpleGit(plugin.path);
      const appliedFiles: string[] = [];
      const skippedFiles: string[] = [];

      // Get the default branch
      const branch = await this.getDefaultBranch(git);

      // Apply each selected file
      for (const filePath of options.selectedFiles) {
        try {
          // Checkout file from remote
          await git.checkout([`origin/${branch}`, '--', filePath]);
          appliedFiles.push(filePath);
        } catch (error) {
          console.error(`[UpdateEngine] Failed to apply update for ${filePath}:`, error);
          skippedFiles.push(filePath);
        }
      }

      // Update plugin manifest with new version if all files applied
      if (appliedFiles.length > 0) {
        await pluginManager.refresh();
      }

      return {
        success: true,
        appliedFiles,
        skippedFiles,
        backupPath
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[UpdateEngine] Failed to apply updates:`, message);

      return {
        success: false,
        appliedFiles: [],
        skippedFiles: options.selectedFiles,
        error: message
      };
    }
  }

  /**
   * Create a backup of the plugin before updating
   */
  async createBackup(plugin: Plugin): Promise<string | undefined> {
    try {
      const backupsDir = path.join(plugin.path, BACKUPS_DIR);

      // Ensure backups directory exists
      if (!existsSync(backupsDir)) {
        mkdirSync(backupsDir, { recursive: true });
      }

      // Create timestamped backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${plugin.version}-${timestamp}`;
      const backupPath = path.join(backupsDir, backupName);

      // Copy plugin files (excluding .git and .backups)
      this.copyDirExcluding(plugin.path, backupPath, ['.git', BACKUPS_DIR]);

      // Save backup metadata
      const backupMeta: PluginBackup = {
        pluginId: plugin.id,
        timestamp: new Date().toISOString(),
        path: backupPath,
        version: plugin.version,
        files: this.listFiles(backupPath)
      };

      writeFileSync(
        path.join(backupPath, 'backup-meta.json'),
        JSON.stringify(backupMeta, null, 2),
        'utf-8'
      );

      // Clean up old backups
      await this.cleanupOldBackups(backupsDir);

      console.warn(`[UpdateEngine] Created backup: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('[UpdateEngine] Failed to create backup:', error);
      return undefined;
    }
  }

  /**
   * Copy directory excluding certain paths
   */
  private copyDirExcluding(src: string, dest: string, exclude: string[]): void {
    mkdirSync(dest, { recursive: true });

    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirExcluding(srcPath, destPath, exclude);
      } else {
        cpSync(srcPath, destPath);
      }
    }
  }

  /**
   * List all files in a directory recursively
   */
  private listFiles(dir: string, basePath: string = ''): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        files.push(...this.listFiles(path.join(dir, entry.name), relativePath));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }

  /**
   * Clean up old backups, keeping only the most recent ones
   */
  private async cleanupOldBackups(backupsDir: string): Promise<void> {
    try {
      const entries = readdirSync(backupsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('backup-'));

      // Sort by modification time (newest first)
      const sortedBackups = entries
        .map(e => ({
          name: e.name,
          path: path.join(backupsDir, e.name),
          mtime: statSync(path.join(backupsDir, e.name)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove old backups
      for (let i = MAX_BACKUPS; i < sortedBackups.length; i++) {
        rmSync(sortedBackups[i].path, { recursive: true, force: true });
        console.warn(`[UpdateEngine] Removed old backup: ${sortedBackups[i].name}`);
      }
    } catch (error) {
      console.error('[UpdateEngine] Failed to cleanup old backups:', error);
    }
  }

  /**
   * List available backups for a plugin
   */
  listBackups(pluginId: string): PluginBackup[] {
    const pluginManager = getPluginManager();
    const plugin = pluginManager.getPlugin(pluginId);

    if (!plugin) return [];

    const backupsDir = path.join(plugin.path, BACKUPS_DIR);
    if (!existsSync(backupsDir)) return [];

    try {
      const entries = readdirSync(backupsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('backup-'));

      const backups: PluginBackup[] = [];

      for (const entry of entries) {
        const metaPath = path.join(backupsDir, entry.name, 'backup-meta.json');
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as PluginBackup;
            backups.push(meta);
          } catch {
            // Skip invalid backup metadata
          }
        }
      }

      // Sort by timestamp (newest first)
      return backups.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Rollback to a previous backup
   */
  async rollback(pluginId: string, backupPath: string): Promise<PluginUpdateResult> {
    const pluginManager = getPluginManager();
    const plugin = pluginManager.getPlugin(pluginId);

    if (!plugin) {
      return {
        success: false,
        appliedFiles: [],
        skippedFiles: [],
        error: 'Plugin not found'
      };
    }

    if (!existsSync(backupPath)) {
      return {
        success: false,
        appliedFiles: [],
        skippedFiles: [],
        error: 'Backup not found'
      };
    }

    try {
      // Create a backup of current state before rollback
      const currentBackupPath = await this.createBackup(plugin);

      // Get list of files from backup
      const metaPath = path.join(backupPath, 'backup-meta.json');
      if (!existsSync(metaPath)) {
        return {
          success: false,
          appliedFiles: [],
          skippedFiles: [],
          error: 'Backup metadata not found'
        };
      }

      const backupMeta = JSON.parse(readFileSync(metaPath, 'utf-8')) as PluginBackup;
      const appliedFiles: string[] = [];

      // Restore each file from backup
      for (const file of backupMeta.files) {
        if (file === 'backup-meta.json') continue;

        const srcPath = path.join(backupPath, file);
        const destPath = path.join(plugin.path, file);

        try {
          // Ensure destination directory exists
          const destDir = path.dirname(destPath);
          if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
          }

          cpSync(srcPath, destPath);
          appliedFiles.push(file);
        } catch (error) {
          console.error(`[UpdateEngine] Failed to restore ${file}:`, error);
        }
      }

      // Refresh plugin manager
      await pluginManager.refresh();

      return {
        success: true,
        appliedFiles,
        skippedFiles: [],
        backupPath: currentBackupPath
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[UpdateEngine] Failed to rollback:', message);

      return {
        success: false,
        appliedFiles: [],
        skippedFiles: [],
        error: message
      };
    }
  }

  /**
   * Get diff for a specific file
   */
  async getFileDiff(pluginId: string, filePath: string): Promise<string | undefined> {
    const pluginManager = getPluginManager();
    const plugin = pluginManager.getPlugin(pluginId);

    if (!plugin) return undefined;

    try {
      const git = simpleGit(plugin.path);
      const branch = await this.getDefaultBranch(git);

      // Get diff between local and remote
      const diff = await git.diff([`origin/${branch}`, '--', filePath]);
      return diff;
    } catch (error) {
      console.error(`[UpdateEngine] Failed to get diff for ${filePath}:`, error);
      return undefined;
    }
  }
}

// Singleton instance
let updateEngineInstance: UpdateEngine | null = null;

/**
 * Get the singleton UpdateEngine instance
 */
export function getUpdateEngine(): UpdateEngine {
  if (!updateEngineInstance) {
    updateEngineInstance = new UpdateEngine();
  }
  return updateEngineInstance;
}
