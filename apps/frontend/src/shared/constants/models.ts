/**
 * Model and agent profile constants
 * Claude models, thinking levels, memory backends, and agent profiles
 */

import type {
  AgentProfile,
  PhaseModelConfig,
  FeatureModelConfig,
  FeatureThinkingConfig,
  CrewAIAgentModelsConfig,
  CrewAIProfileDefinition
} from '../types/settings';

// ============================================
// Available Models
// ============================================

export const AVAILABLE_MODELS = [
  { value: 'opus', label: 'Claude Opus 4.5' },
  { value: 'sonnet', label: 'Claude Sonnet 4.5' },
  { value: 'haiku', label: 'Claude Haiku 4.5' }
] as const;

// Maps model shorthand to actual Claude model IDs
export const MODEL_ID_MAP: Record<string, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001'
} as const;

// Maps thinking levels to budget tokens (null = no extended thinking)
export const THINKING_BUDGET_MAP: Record<string, number | null> = {
  none: null,
  low: 1024,
  medium: 4096,
  high: 16384,
  ultrathink: 65536
} as const;

// ============================================
// Thinking Levels
// ============================================

// Thinking levels for Claude model (budget token allocation)
export const THINKING_LEVELS = [
  { value: 'none', label: 'None', description: 'No extended thinking' },
  { value: 'low', label: 'Low', description: 'Brief consideration' },
  { value: 'medium', label: 'Medium', description: 'Moderate analysis' },
  { value: 'high', label: 'High', description: 'Deep thinking' },
  { value: 'ultrathink', label: 'Ultra Think', description: 'Maximum reasoning depth' }
] as const;

// ============================================
// Agent Profiles
// ============================================

// Default phase model configuration for Auto profile
// Uses Opus across all phases for maximum quality
export const DEFAULT_PHASE_MODELS: PhaseModelConfig = {
  spec: 'opus',       // Best quality for spec creation
  planning: 'opus',   // Complex architecture decisions benefit from Opus
  coding: 'opus',     // Highest quality implementation
  qa: 'opus'          // Thorough QA review
};

// Default phase thinking configuration for Auto profile
export const DEFAULT_PHASE_THINKING: import('../types/settings').PhaseThinkingConfig = {
  spec: 'ultrathink',   // Deep thinking for comprehensive spec creation
  planning: 'high',     // High thinking for planning complex features
  coding: 'low',        // Faster coding iterations
  qa: 'low'             // Efficient QA review
};

// ============================================
// Feature Settings (Non-Pipeline Features)
// ============================================

// Default feature model configuration (for insights, ideation, roadmap, github, utility)
export const DEFAULT_FEATURE_MODELS: FeatureModelConfig = {
  insights: 'sonnet',     // Fast, responsive chat
  ideation: 'opus',       // Creative ideation benefits from Opus
  roadmap: 'opus',        // Strategic planning benefits from Opus
  githubIssues: 'opus',   // Issue triage and analysis benefits from Opus
  githubPrs: 'opus',      // PR review benefits from thorough Opus analysis
  utility: 'haiku'        // Fast utility operations (commit messages, merge resolution)
};

// Default feature thinking configuration
export const DEFAULT_FEATURE_THINKING: FeatureThinkingConfig = {
  insights: 'medium',     // Balanced thinking for chat
  ideation: 'high',       // Deep thinking for creative ideas
  roadmap: 'high',        // Strategic thinking for roadmap
  githubIssues: 'medium', // Moderate thinking for issue analysis
  githubPrs: 'medium',    // Moderate thinking for PR review
  utility: 'low'          // Fast thinking for utility operations
};

// Feature labels for UI display
export const FEATURE_LABELS: Record<keyof FeatureModelConfig, { label: string; description: string }> = {
  insights: { label: 'Insights Chat', description: 'Ask questions about your codebase' },
  ideation: { label: 'Ideation', description: 'Generate feature ideas and improvements' },
  roadmap: { label: 'Roadmap', description: 'Create strategic feature roadmaps' },
  githubIssues: { label: 'GitHub Issues', description: 'Automated issue triage and labeling' },
  githubPrs: { label: 'GitHub PR Review', description: 'AI-powered pull request reviews' },
  utility: { label: 'Utility', description: 'Commit messages and merge conflict resolution' }
};

// Default agent profiles for preset model/thinking configurations
export const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'auto',
    name: 'Auto (Optimized)',
    description: 'Uses Opus across all phases with optimized thinking levels',
    model: 'opus',  // Fallback/default model
    thinkingLevel: 'high',
    icon: 'Sparkles',
    isAutoProfile: true,
    phaseModels: DEFAULT_PHASE_MODELS,
    phaseThinking: DEFAULT_PHASE_THINKING
  },
  {
    id: 'complex',
    name: 'Complex Tasks',
    description: 'For intricate, multi-step implementations requiring deep analysis',
    model: 'opus',
    thinkingLevel: 'ultrathink',
    icon: 'Brain'
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Good balance of speed and quality for most tasks',
    model: 'sonnet',
    thinkingLevel: 'medium',
    icon: 'Scale'
  },
  {
    id: 'quick',
    name: 'Quick Edits',
    description: 'Fast iterations for simple changes and quick fixes',
    model: 'haiku',
    thinkingLevel: 'low',
    icon: 'Zap'
  }
];

// ============================================
// Memory Backends
// ============================================

export const MEMORY_BACKENDS = [
  { value: 'file', label: 'File-based (default)' },
  { value: 'graphiti', label: 'Graphiti (LadybugDB)' }
] as const;

// ============================================
// CrewAI Configuration
// ============================================

// Default CrewAI agent model configuration (balanced profile)
export const DEFAULT_CREWAI_AGENT_MODELS: CrewAIAgentModelsConfig = {
  // Product Management Crew
  productManager: { model: 'sonnet', thinkingLevel: 'medium' },
  requirementsAnalyst: { model: 'sonnet', thinkingLevel: 'medium' },
  priorityAnalyst: { model: 'haiku', thinkingLevel: 'low' },
  // Development Crew
  techLead: { model: 'opus', thinkingLevel: 'high' },
  seniorDeveloper: { model: 'sonnet', thinkingLevel: 'medium' },
  codeReviewer: { model: 'sonnet', thinkingLevel: 'medium' },
  // QA & Release Crew
  qaLead: { model: 'sonnet', thinkingLevel: 'high' },
  securityAnalyst: { model: 'sonnet', thinkingLevel: 'medium' },
  releaseManager: { model: 'haiku', thinkingLevel: 'low' }
};

// Performance profile - Opus everywhere for maximum quality
const CREWAI_PERFORMANCE_MODELS: CrewAIAgentModelsConfig = {
  productManager: { model: 'opus', thinkingLevel: 'high' },
  requirementsAnalyst: { model: 'opus', thinkingLevel: 'high' },
  priorityAnalyst: { model: 'opus', thinkingLevel: 'medium' },
  techLead: { model: 'opus', thinkingLevel: 'ultrathink' },
  seniorDeveloper: { model: 'opus', thinkingLevel: 'high' },
  codeReviewer: { model: 'opus', thinkingLevel: 'high' },
  qaLead: { model: 'opus', thinkingLevel: 'high' },
  securityAnalyst: { model: 'opus', thinkingLevel: 'high' },
  releaseManager: { model: 'opus', thinkingLevel: 'medium' }
};

// Economy profile - Haiku/Sonnet for cost reduction
const CREWAI_ECONOMY_MODELS: CrewAIAgentModelsConfig = {
  productManager: { model: 'haiku', thinkingLevel: 'low' },
  requirementsAnalyst: { model: 'haiku', thinkingLevel: 'low' },
  priorityAnalyst: { model: 'haiku', thinkingLevel: 'none' },
  techLead: { model: 'sonnet', thinkingLevel: 'medium' },
  seniorDeveloper: { model: 'haiku', thinkingLevel: 'low' },
  codeReviewer: { model: 'haiku', thinkingLevel: 'low' },
  qaLead: { model: 'haiku', thinkingLevel: 'low' },
  securityAnalyst: { model: 'haiku', thinkingLevel: 'low' },
  releaseManager: { model: 'haiku', thinkingLevel: 'none' }
};

// CrewAI profile definitions
export const CREWAI_PROFILES: CrewAIProfileDefinition[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Optimal mix of performance and cost',
    agents: DEFAULT_CREWAI_AGENT_MODELS
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'Opus everywhere for maximum quality',
    agents: CREWAI_PERFORMANCE_MODELS
  },
  {
    id: 'economy',
    name: 'Economy',
    description: 'Haiku/Sonnet to reduce costs',
    agents: CREWAI_ECONOMY_MODELS
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configure each agent individually',
    agents: null // Uses crewaiAgentModels from settings
  }
];

// CrewAI agent labels for UI display (grouped by crew)
export const CREWAI_AGENT_LABELS = {
  // Product Management Crew
  productManager: {
    label: 'Product Manager',
    description: 'Analyzes requests and creates requirements',
    crew: 'Product Management'
  },
  requirementsAnalyst: {
    label: 'Requirements Analyst',
    description: 'Validates requirements against codebase',
    crew: 'Product Management'
  },
  priorityAnalyst: {
    label: 'Priority Analyst',
    description: 'Evaluates complexity and prioritizes tasks',
    crew: 'Product Management'
  },
  // Development Crew
  techLead: {
    label: 'Tech Lead',
    description: 'Designs architecture and implementation plans',
    crew: 'Development'
  },
  seniorDeveloper: {
    label: 'Senior Developer',
    description: 'Implements features via Auto-Claude bridge',
    crew: 'Development'
  },
  codeReviewer: {
    label: 'Code Reviewer',
    description: 'Reviews code quality and standards',
    crew: 'Development'
  },
  // QA & Release Crew
  qaLead: {
    label: 'QA Lead',
    description: 'Validates acceptance criteria',
    crew: 'QA & Release'
  },
  securityAnalyst: {
    label: 'Security Analyst',
    description: 'Scans for vulnerabilities',
    crew: 'QA & Release'
  },
  releaseManager: {
    label: 'Release Manager',
    description: 'Manages changelog and versioning',
    crew: 'QA & Release'
  }
} as const;

// CrewAI crew groupings for UI accordion
export const CREWAI_CREWS = [
  {
    id: 'product-management',
    name: 'Product Management',
    description: 'Transform user requests into actionable specs',
    agents: ['productManager', 'requirementsAnalyst', 'priorityAnalyst'] as const
  },
  {
    id: 'development',
    name: 'Development',
    description: 'Execute technical implementation via Auto-Claude',
    agents: ['techLead', 'seniorDeveloper', 'codeReviewer'] as const
  },
  {
    id: 'qa-release',
    name: 'QA & Release',
    description: 'Validate and prepare releases',
    agents: ['qaLead', 'securityAnalyst', 'releaseManager'] as const
  }
] as const;
