import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { ImplementationPlan } from '../shared/types';

interface WatcherInfo {
  taskId: string;
  watcher: FSWatcher;
  planPath: string;
}

/**
 * Watches implementation_plan.json files for real-time progress updates
 */
export class FileWatcher extends EventEmitter {
  private watchers: Map<string, WatcherInfo> = new Map();

  /**
   * Start watching a task's implementation plan
   */
  async watch(taskId: string, specDir: string): Promise<void> {
    // Stop any existing watcher for this task
    await this.unwatch(taskId);

    const planPath = path.join(specDir, 'implementation_plan.json');

    // Check if plan file exists (async)
    try {
      await fs.access(planPath);
    } catch {
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

    // Handle file changes (async)
    watcher.on('change', async () => {
      try {
        const content = await fs.readFile(planPath, 'utf-8');
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

    // Read and emit initial state (async)
    try {
      const content = await fs.readFile(planPath, 'utf-8');
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
   * Get current plan state for a task (async)
   */
  async getCurrentPlan(taskId: string): Promise<ImplementationPlan | null> {
    const watcherInfo = this.watchers.get(taskId);
    if (!watcherInfo) return null;

    try {
      const content = await fs.readFile(watcherInfo.planPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const fileWatcher = new FileWatcher();
