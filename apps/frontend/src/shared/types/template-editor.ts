/**
 * Template Editor Types
 *
 * Types for AI-powered template editing using Claude SDK
 */

export type TemplateEditorStatus = 'thinking' | 'complete' | 'error';

export interface TemplateEditorStreamChunk {
  type: 'text' | 'tool_use';
  text?: string;
  name?: string;
  input?: any;
  result?: string;
}

export interface TemplateEditorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
