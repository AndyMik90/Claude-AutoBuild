/**
 * Terminal Manager Facade
 * Slim re-export facade for backward compatibility
 *
 * The actual implementation has been refactored into modular components:
 * - terminal/terminal-manager.ts - Main orchestration
 * - terminal/pty-manager.ts - PTY process management
 * - terminal/session-handler.ts - Session persistence and restoration
 * - terminal/output-parser.ts - Output parsing and pattern detection
 * - terminal/types.ts - TypeScript type definitions
 */

export { TerminalManager } from './terminal/terminal-manager';
export type { TerminalProcess } from './terminal/types';
