/**
 * Application settings types
 */

import type { NotificationSettings } from './project';

// Thinking level for Claude model (budget token allocation)
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'ultrathink';

// Agent profile for preset model/thinking configurations
export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  model: 'haiku' | 'sonnet' | 'opus';
  thinkingLevel: ThinkingLevel;
  icon?: string;  // Lucide icon name
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  agentFramework: string;
  pythonPath?: string;
  autoBuildPath?: string;
  autoUpdateAutoBuild: boolean;
  autoNameTerminals: boolean;
  notifications: NotificationSettings;
  // Global API keys (used as defaults for all projects)
  globalClaudeOAuthToken?: string;
  globalOpenAIApiKey?: string;
  // Onboarding wizard completion state
  onboardingCompleted?: boolean;
  // Selected agent profile for preset model/thinking configurations
  selectedAgentProfile?: string;
}

// Auto-Claude Source Environment Configuration (for auto-claude repo .env)
export interface SourceEnvConfig {
  // Claude Authentication (required for ideation, roadmap generation, etc.)
  hasClaudeToken: boolean;
  claudeOAuthToken?: string;

  // Source path info
  sourcePath?: string;
  envExists: boolean;
}

export interface SourceEnvCheckResult {
  hasToken: boolean;
  sourcePath?: string;
  error?: string;
}

// Auto Claude Source Update Types
export interface AutoBuildSourceUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  error?: string;
}

export interface AutoBuildSourceUpdateResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface AutoBuildSourceUpdateProgress {
  stage: 'checking' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent?: number;
  message: string;
}
