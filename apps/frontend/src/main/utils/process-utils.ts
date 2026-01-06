/**
 * Process utilities for cross-platform process management
 */

import { spawnSync } from 'child_process';

/** Default timeout for taskkill operations (5 seconds) */
const TASKKILL_TIMEOUT_MS = 5000;

/**
 * Kill a process and all its children (process tree).
 * On Windows, uses taskkill /T to kill the entire process tree.
 * On Unix, uses standard signal-based killing.
 *
 * @param pid - Process ID to kill
 * @param signal - Signal to send (Unix only, Windows always force-kills)
 * @param timeout - Timeout in ms for taskkill (Windows only), defaults to 5000ms
 */
export function killProcessTree(
  pid: number,
  signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM',
  timeout: number = TASKKILL_TIMEOUT_MS
): void {
  if (process.platform === 'win32') {
    // taskkill /T kills the process tree, /F forces termination
    try {
      const result = spawnSync('taskkill', ['/PID', pid.toString(), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout
      });

      // Log if taskkill timed out (result.signal will be 'SIGTERM' on timeout)
      if (result.signal) {
        console.warn(`[ProcessUtils] taskkill timed out or was killed (signal: ${result.signal}) for PID ${pid}`);
      }
    } catch (error) {
      // Process may already be dead, or taskkill timed out
      if (error instanceof Error && error.message.includes('ETIMEDOUT')) {
        console.warn(`[ProcessUtils] taskkill timed out for PID ${pid}`);
      }
      // Silently ignore other errors (process already dead)
    }
  } else {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already be dead
    }
  }
}
