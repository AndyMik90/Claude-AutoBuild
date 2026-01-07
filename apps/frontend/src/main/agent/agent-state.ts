import { AgentProcess } from './types';

/**
 * Agent state tracking and process map management
 */
export class AgentState {
  private processes: Map<string, AgentProcess> = new Map();
  private killedSpawnIds: Set<number> = new Set();
  private spawnCounter: number = 0;

  /**
   * Generate a unique spawn ID
   */
  generateSpawnId(): number {
    return ++this.spawnCounter;
  }

  /**
   * Add a process to the tracking map
   */
  addProcess(taskId: string, process: AgentProcess): void {
    this.processes.set(taskId, process);
  }

  /**
   * Get a process by task ID
   */
  getProcess(taskId: string): AgentProcess | undefined {
    return this.processes.get(taskId);
  }

  /**
   * Remove a process from tracking
   */
  deleteProcess(taskId: string): boolean {
    return this.processes.delete(taskId);
  }

  /**
   * Check if a task has a running process
   */
  hasProcess(taskId: string): boolean {
    return this.processes.has(taskId);
  }

  /**
   * Get all running task IDs
   */
  getRunningTaskIds(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Mark a spawn ID as killed
   */
  markSpawnAsKilled(spawnId: number): void {
    this.killedSpawnIds.add(spawnId);
  }

  /**
   * Check if a spawn ID was killed
   */
  wasSpawnKilled(spawnId: number): boolean {
    return this.killedSpawnIds.has(spawnId);
  }

  /**
   * Remove a spawn ID from killed set
   */
  clearKilledSpawn(spawnId: number): void {
    this.killedSpawnIds.delete(spawnId);
  }

  /**
   * Get all processes
   */
  getAllProcesses(): Map<string, AgentProcess> {
    return this.processes;
  }

  /**
   * Clear all state (for testing or cleanup)
   */
  clear(): void {
    this.processes.clear();
    this.killedSpawnIds.clear();
  }
}
