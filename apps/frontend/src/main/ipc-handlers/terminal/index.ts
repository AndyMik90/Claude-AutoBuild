/**
 * Terminal handlers module
 *
 * This module organizes terminal worktree-related IPC handlers:
 * - Worktree operations (create, list, remove)
 */

import { registerTerminalWorktreeHandlers } from './worktree-handlers';

/**
 * Register all terminal worktree IPC handlers
 */
export function registerTerminalWorktreeIpcHandlers(): void {
  registerTerminalWorktreeHandlers();
}

export { registerTerminalWorktreeHandlers } from './worktree-handlers';
