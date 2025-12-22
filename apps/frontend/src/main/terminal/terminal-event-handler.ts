/**
 * Terminal Event Handler
 * Manages terminal data output events and processing
 */

import * as OutputParser from './output-parser';
import * as ClaudeIntegration from './claude-integration-handler';
import type { TerminalProcess, WindowGetter } from './types';

/**
 * Event handler callbacks
 */
export interface EventHandlerCallbacks {
  onClaudeSessionId: (terminal: TerminalProcess, sessionId: string) => void;
  onRateLimit: (terminal: TerminalProcess, data: string) => void;
  onOAuthToken: (terminal: TerminalProcess, data: string) => void;
}

/**
 * Handle terminal data output
 */
export function handleTerminalData(
  terminal: TerminalProcess,
  data: string,
  callbacks: EventHandlerCallbacks
): void {
  // Try to extract Claude session ID
  if (terminal.isClaudeMode && !terminal.claudeSessionId) {
    const sessionId = OutputParser.extractClaudeSessionId(data);
    if (sessionId) {
      callbacks.onClaudeSessionId(terminal, sessionId);
    }
  }

  // Check for rate limit messages
  if (terminal.isClaudeMode) {
    callbacks.onRateLimit(terminal, data);
  }

  // Check for OAuth token
  callbacks.onOAuthToken(terminal, data);
}

/**
 * Create event handler callbacks from TerminalManager context
 */
export function createEventCallbacks(
  getWindow: WindowGetter,
  lastNotifiedRateLimitReset: Map<string, string>,
  switchProfileCallback: (terminalId: string, profileId: string) => Promise<void>
): EventHandlerCallbacks {
  return {
    onClaudeSessionId: (terminal, sessionId) => {
      ClaudeIntegration.handleClaudeSessionId(terminal, sessionId, getWindow);
    },
    onRateLimit: (terminal, data) => {
      ClaudeIntegration.handleRateLimit(
        terminal,
        data,
        lastNotifiedRateLimitReset,
        getWindow,
        switchProfileCallback
      );
    },
    onOAuthToken: (terminal, data) => {
      ClaudeIntegration.handleOAuthToken(terminal, data, getWindow);
    }
  };
}
