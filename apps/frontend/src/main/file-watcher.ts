import chokidar, { FSWatcher } from 'chokidar';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { ImplementationPlan } from '../shared/types';

interface WatcherInfo {
  taskId: string;
  watcher: FSWatcher;
  planPath: string;
}

interface SpecsWatcherInfo {
  projectId: string;
  watcher: FSWatcher;
  specsPath: string;
}

// Debounce tracking for spec updates
interface PendingUpdate {
  projectId: string;
  specId: string;
  timeout: NodeJS.Timeout;
}

/**
 * Watches implementation_plan.json files for real-time progress updates
 * Also watches specs directories for new/removed spec folders
 */
export class FileWatcher extends EventEmitter {
  private watchers: Map<string, WatcherInfo> = new Map();
  private specsWatchers: Map<string, SpecsWatcherInfo> = new Map();
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private readonly DEBOUNCE_MS = 400; // Debounce time for file changes

  /**
   * Start watching a task's implementation plan
   */
  async watch(taskId: string, specDir: string): Promise<void> {
    // Stop any existing watcher for this task
    await this.unwatch(taskId);

    const planPath = path.join(specDir, 'implementation_plan.json');

    // Check if plan file exists
    if (!existsSync(planPath)) {
      this.emit('error', taskId, `Plan file not found: ${planPath}`);
      return;
    }

    // Create watcher with settings to handle frequent writes
    const watcher = chokidar.watch(planPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    // Store watcher info
    this.watchers.set(taskId, {
      taskId,
      watcher,
      planPath
    });

    // Handle file changes
    watcher.on('change', () => {
      try {
        const content = readFileSync(planPath, 'utf-8');
        const plan: ImplementationPlan = JSON.parse(content);
        this.emit('progress', taskId, plan);
      } catch {
        // File might be in the middle of being written
        // Ignore parse errors, next change event will have complete file
      }
    });

    // Handle errors
    watcher.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('error', taskId, message);
    });

    // Read and emit initial state
    try {
      const content = readFileSync(planPath, 'utf-8');
      const plan: ImplementationPlan = JSON.parse(content);
      this.emit('progress', taskId, plan);
    } catch {
      // Initial read failed - not critical
    }
  }

  /**
   * Stop watching a task
   */
  async unwatch(taskId: string): Promise<void> {
    const watcherInfo = this.watchers.get(taskId);
    if (watcherInfo) {
      await watcherInfo.watcher.close();
      this.watchers.delete(taskId);
    }
  }

  /**
   * Stop all watchers
   */
  async unwatchAll(): Promise<void> {
    const closePromises = Array.from(this.watchers.values()).map(
      async (info) => {
        await info.watcher.close();
      }
    );
    await Promise.all(closePromises);
    this.watchers.clear();
  }

  /**
   * Check if a task is being watched
   */
  isWatching(taskId: string): boolean {
    return this.watchers.has(taskId);
  }

  /**
   * Get current plan state for a task
   */
  getCurrentPlan(taskId: string): ImplementationPlan | null {
    const watcherInfo = this.watchers.get(taskId);
    if (!watcherInfo) return null;

    try {
      const content = readFileSync(watcherInfo.planPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // ============================================
  // Specs Directory Watching
  // ============================================

  /**
   * Start watching a project's specs directory for new/removed spec folders
   * and for changes to implementation_plan.json and task_metadata.json inside each spec
   * Emits 'spec-added', 'spec-removed', and 'spec-updated' events
   */
  async watchSpecsDirectory(projectId: string, specsPath: string): Promise<void> {
    // Stop any existing watcher for this project
    await this.unwatchSpecsDirectory(projectId);

    // Check if specs directory exists
    if (!existsSync(specsPath)) {
      console.log(`[FileWatcher] Specs directory not found, skipping watch: ${specsPath}`);
      return;
    }

    console.log(`[FileWatcher] Starting specs directory watcher for project ${projectId}: ${specsPath}`);

    // Watch for new directories and file changes inside spec folders
    const watcher = chokidar.watch(specsPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 1, // Watch spec folders and their direct children (JSON files)
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    // Store watcher info
    this.specsWatchers.set(projectId, {
      projectId,
      watcher,
      specsPath
    });

    // Handle new spec directory added
    watcher.on('addDir', (dirPath: string) => {
      // Only emit for direct children of specs directory
      const relativePath = path.relative(specsPath, dirPath);
      if (relativePath && !relativePath.includes(path.sep)) {
        const specId = path.basename(dirPath);
        console.log(`[FileWatcher] Spec directory added: ${specId} in project ${projectId}`);
        this.emit('spec-added', projectId, specId, dirPath);
      }
    });

    // Handle spec directory removed
    watcher.on('unlinkDir', (dirPath: string) => {
      // Only emit for direct children of specs directory
      const relativePath = path.relative(specsPath, dirPath);
      if (relativePath && !relativePath.includes(path.sep)) {
        const specId = path.basename(dirPath);
        console.log(`[FileWatcher] Spec directory removed: ${specId} in project ${projectId}`);
        this.emit('spec-removed', projectId, specId);
      }
    });

    // Handle file changes inside spec folders (implementation_plan.json, task_metadata.json)
    watcher.on('change', (filePath: string) => {
      const fileName = path.basename(filePath);
      // Only watch for our target files
      if (fileName !== 'implementation_plan.json' && fileName !== 'task_metadata.json') {
        return;
      }

      // Extract specId from path: specsPath/specId/filename.json
      const relativePath = path.relative(specsPath, filePath);
      const parts = relativePath.split(path.sep);
      if (parts.length !== 2) {
        return; // Not a file directly inside a spec folder
      }

      const specId = parts[0];
      this.debouncedSpecUpdate(projectId, specId);
    });

    // Also handle file additions (new JSON files in existing spec folders)
    watcher.on('add', (filePath: string) => {
      const fileName = path.basename(filePath);
      if (fileName !== 'implementation_plan.json' && fileName !== 'task_metadata.json') {
        return;
      }

      const relativePath = path.relative(specsPath, filePath);
      const parts = relativePath.split(path.sep);
      if (parts.length !== 2) {
        return;
      }

      const specId = parts[0];
      this.debouncedSpecUpdate(projectId, specId);
    });

    // Handle errors
    watcher.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FileWatcher] Specs watcher error for project ${projectId}:`, message);
    });
  }

  /**
   * Debounce spec update events to prevent rapid-fire updates
   * when files are written multiple times quickly
   */
  private debouncedSpecUpdate(projectId: string, specId: string): void {
    const key = `${projectId}:${specId}`;

    // Clear any existing pending update for this spec
    const existing = this.pendingUpdates.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Schedule new debounced update
    const timeout = setTimeout(() => {
      this.pendingUpdates.delete(key);
      console.log(`[FileWatcher] Spec updated (debounced): ${specId} in project ${projectId}`);
      this.emit('spec-updated', projectId, specId);
    }, this.DEBOUNCE_MS);

    this.pendingUpdates.set(key, { projectId, specId, timeout });
  }

  /**
   * Stop watching a project's specs directory
   */
  async unwatchSpecsDirectory(projectId: string): Promise<void> {
    const watcherInfo = this.specsWatchers.get(projectId);
    if (watcherInfo) {
      console.log(`[FileWatcher] Stopping specs directory watcher for project ${projectId}`);
      await watcherInfo.watcher.close();
      this.specsWatchers.delete(projectId);
    }
  }

  /**
   * Check if a project's specs directory is being watched
   */
  isWatchingSpecs(projectId: string): boolean {
    return this.specsWatchers.has(projectId);
  }

  /**
   * Stop all specs directory watchers
   */
  async unwatchAllSpecsDirectories(): Promise<void> {
    const closePromises = Array.from(this.specsWatchers.values()).map(
      async (info) => {
        await info.watcher.close();
      }
    );
    await Promise.all(closePromises);
    this.specsWatchers.clear();
  }
}

// Singleton instance
export const fileWatcher = new FileWatcher();
