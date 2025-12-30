/**
 * Agent Tools Overview
 *
 * Displays MCP server and tool configuration for each agent phase.
 * Helps users understand what tools are available during different execution phases.
 * Now shows per-project MCP configuration with toggles to enable/disable servers.
 */

import {
  Server,
  Wrench,
  Brain,
  Code,
  Search,
  FileCheck,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Monitor,
  Globe,
  ClipboardList,
  ListChecks,
  Info,
  AlertCircle
} from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { useSettingsStore } from '../stores/settings-store';
import { useProjectStore } from '../stores/project-store';
import type { ProjectEnvConfig } from '../../shared/types';
import {
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING,
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_THINKING,
  AVAILABLE_MODELS,
  THINKING_LEVELS
} from '../../shared/constants/models';
import type { ModelTypeShort, ThinkingLevel } from '../../shared/types/settings';

// Agent configuration data - mirrors AGENT_CONFIGS from backend
// Model and thinking are now dynamically read from user settings
interface AgentConfig {
  label: string;
  description: string;
  category: string;
  tools: string[];
  mcp_servers: string[];
  mcp_optional?: string[];
  // Maps to settings source - either a phase or a feature
  settingsSource: {
    type: 'phase';
    phase: 'spec' | 'planning' | 'coding' | 'qa';
  } | {
    type: 'feature';
    feature: 'insights' | 'ideation' | 'roadmap' | 'githubIssues' | 'githubPrs';
  } | {
    type: 'fixed';  // For agents not yet configurable
    model: ModelTypeShort;
    thinking: ThinkingLevel;
  };
}

// Helper to get model label from short name
function getModelLabel(modelShort: ModelTypeShort): string {
  const model = AVAILABLE_MODELS.find(m => m.value === modelShort);
  return model?.label.replace('Claude ', '') || modelShort;
}

// Helper to get thinking label from level
function getThinkingLabel(level: ThinkingLevel): string {
  const thinking = THINKING_LEVELS.find(t => t.value === level);
  return thinking?.label || level;
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  // Spec Creation Phases - all use 'spec' phase settings
  spec_gatherer: {
    label: 'Spec Gatherer',
    description: 'Collects initial requirements from user',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_researcher: {
    label: 'Spec Researcher',
    description: 'Validates external integrations and APIs',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_writer: {
    label: 'Spec Writer',
    description: 'Creates the spec.md document',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_critic: {
    label: 'Spec Critic',
    description: 'Self-critique using deep analysis',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_discovery: {
    label: 'Spec Discovery',
    description: 'Initial project discovery and analysis',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_context: {
    label: 'Spec Context',
    description: 'Builds context from existing codebase',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_validation: {
    label: 'Spec Validation',
    description: 'Validates spec completeness and quality',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },

  // Build Phases
  planner: {
    label: 'Planner',
    description: 'Creates implementation plan with subtasks',
    category: 'build',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear'],
    settingsSource: { type: 'phase', phase: 'planning' },
  },
  coder: {
    label: 'Coder',
    description: 'Implements individual subtasks',
    category: 'build',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear'],
    settingsSource: { type: 'phase', phase: 'coding' },
  },

  // QA Phases
  qa_reviewer: {
    label: 'QA Reviewer',
    description: 'Validates acceptance criteria. Uses Electron or Puppeteer based on project type.',
    category: 'qa',
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear', 'electron', 'puppeteer'],
    settingsSource: { type: 'phase', phase: 'qa' },
  },
  qa_fixer: {
    label: 'QA Fixer',
    description: 'Fixes QA-reported issues. Uses Electron or Puppeteer based on project type.',
    category: 'qa',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear', 'electron', 'puppeteer'],
    settingsSource: { type: 'phase', phase: 'qa' },
  },

  // Utility Phases - use feature settings
  pr_reviewer: {
    label: 'PR Reviewer',
    description: 'Reviews GitHub pull requests',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'feature', feature: 'githubPrs' },
  },
  commit_message: {
    label: 'Commit Message',
    description: 'Generates commit messages',
    category: 'utility',
    tools: [],
    mcp_servers: [],
    // Commit message uses Haiku for speed - not yet user-configurable
    settingsSource: { type: 'fixed', model: 'haiku', thinking: 'low' },
  },
  merge_resolver: {
    label: 'Merge Resolver',
    description: 'Resolves merge conflicts',
    category: 'utility',
    tools: [],
    mcp_servers: [],
    // Merge resolver uses Haiku - not yet user-configurable
    settingsSource: { type: 'fixed', model: 'haiku', thinking: 'low' },
  },
  insights: {
    label: 'Insights',
    description: 'Extracts code insights',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'feature', feature: 'insights' },
  },
  analysis: {
    label: 'Analysis',
    description: 'Codebase analysis with context lookup',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    // Analysis uses same as insights
    settingsSource: { type: 'feature', feature: 'insights' },
  },
  batch_analysis: {
    label: 'Batch Analysis',
    description: 'Batch processing of issues or items',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    // Batch uses same as GitHub Issues
    settingsSource: { type: 'feature', feature: 'githubIssues' },
  },

  // Ideation & Roadmap - use feature settings
  ideation: {
    label: 'Ideation',
    description: 'Generates feature ideas',
    category: 'ideation',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'feature', feature: 'ideation' },
  },
  roadmap_discovery: {
    label: 'Roadmap Discovery',
    description: 'Discovers roadmap items',
    category: 'ideation',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'feature', feature: 'roadmap' },
  },
};

// MCP Server descriptions - accurate per backend models.py
const MCP_SERVERS: Record<string, { name: string; description: string; icon: React.ElementType; tools?: string[] }> = {
  context7: {
    name: 'Context7',
    description: 'Documentation lookup for libraries and frameworks via @upstash/context7-mcp',
    icon: Search,
    tools: ['mcp__context7__resolve-library-id', 'mcp__context7__get-library-docs'],
  },
  'graphiti-memory': {
    name: 'Graphiti Memory',
    description: 'Knowledge graph for cross-session context. Requires GRAPHITI_MCP_URL env var.',
    icon: Brain,
    tools: [
      'mcp__graphiti-memory__search_nodes',
      'mcp__graphiti-memory__search_facts',
      'mcp__graphiti-memory__add_episode',
      'mcp__graphiti-memory__get_episodes',
      'mcp__graphiti-memory__get_entity_edge',
    ],
  },
  'auto-claude': {
    name: 'Auto-Claude Tools',
    description: 'Build progress tracking, session context, discoveries & gotchas recording',
    icon: ListChecks,
    tools: [
      'mcp__auto-claude__update_subtask_status',
      'mcp__auto-claude__get_build_progress',
      'mcp__auto-claude__record_discovery',
      'mcp__auto-claude__record_gotcha',
      'mcp__auto-claude__get_session_context',
      'mcp__auto-claude__update_qa_status',
    ],
  },
  linear: {
    name: 'Linear',
    description: 'Project management via Linear API. Requires LINEAR_API_KEY env var.',
    icon: ClipboardList,
    tools: [
      'mcp__linear-server__list_teams',
      'mcp__linear-server__list_projects',
      'mcp__linear-server__list_issues',
      'mcp__linear-server__create_issue',
      'mcp__linear-server__update_issue',
      // ... and more
    ],
  },
  electron: {
    name: 'Electron MCP',
    description: 'Desktop app automation via Chrome DevTools Protocol. Requires ELECTRON_MCP_ENABLED=true.',
    icon: Monitor,
    tools: [
      'mcp__electron__get_electron_window_info',
      'mcp__electron__take_screenshot',
      'mcp__electron__send_command_to_electron',
      'mcp__electron__read_electron_logs',
    ],
  },
  puppeteer: {
    name: 'Puppeteer MCP',
    description: 'Web browser automation for non-Electron web frontends.',
    icon: Globe,
    tools: [
      'mcp__puppeteer__puppeteer_connect_active_tab',
      'mcp__puppeteer__puppeteer_navigate',
      'mcp__puppeteer__puppeteer_screenshot',
      'mcp__puppeteer__puppeteer_click',
      'mcp__puppeteer__puppeteer_fill',
      'mcp__puppeteer__puppeteer_select',
      'mcp__puppeteer__puppeteer_hover',
      'mcp__puppeteer__puppeteer_evaluate',
    ],
  },
};

// Category metadata - neutral styling per design.json
const CATEGORIES = {
  spec: { label: 'Spec Creation', icon: FileCheck },
  build: { label: 'Build', icon: Code },
  qa: { label: 'QA', icon: CheckCircle2 },
  utility: { label: 'Utility', icon: Wrench },
  ideation: { label: 'Ideation', icon: Lightbulb },
};

interface AgentCardProps {
  id: string;
  config: typeof AGENT_CONFIGS[keyof typeof AGENT_CONFIGS];
  modelLabel: string;
  thinkingLabel: string;
}

function AgentCard({ config, modelLabel, thinkingLabel }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const category = CATEGORIES[config.category as keyof typeof CATEGORIES];
  const CategoryIcon = category.icon;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header - clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="p-2 rounded-lg bg-muted">
          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm text-foreground">{config.label}</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {modelLabel}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {thinkingLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{config.description}</p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs">
            {config.mcp_servers.length + (config.mcp_optional?.length || 0)} MCP
          </span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/30">
          {/* MCP Servers */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              MCP Servers
            </h4>
            {config.mcp_servers.length > 0 || (config.mcp_optional && config.mcp_optional.length > 0) ? (
              <div className="space-y-3">
                {config.mcp_servers.map((server) => {
                  const serverInfo = MCP_SERVERS[server];
                  const ServerIcon = serverInfo?.icon || Server;
                  return (
                    <div key={server} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <ServerIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{serverInfo?.name || server}</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        {serverInfo?.description}
                      </p>
                      {serverInfo?.tools && (
                        <div className="ml-6 flex flex-wrap gap-1">
                          {serverInfo.tools.slice(0, 3).map((tool) => (
                            <span key={tool} className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {tool.replace('mcp__', '').replace(/__/g, ':')}
                            </span>
                          ))}
                          {serverInfo.tools.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{serverInfo.tools.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {config.mcp_optional?.map((server) => {
                  const serverInfo = MCP_SERVERS[server];
                  const ServerIcon = serverInfo?.icon || Server;
                  return (
                    <div key={server} className="space-y-1 opacity-60">
                      <div className="flex items-center gap-2 text-sm">
                        <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                        <ServerIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{serverInfo?.name || server}</span>
                        <span className="text-[10px] text-muted-foreground">(conditional)</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        {serverInfo?.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No MCP servers required</p>
            )}
          </div>

          {/* Tools */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Available Tools
            </h4>
            {config.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {config.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-muted rounded text-xs font-mono"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Text-only (no tools)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentTools() {
  const settings = useSettingsStore((state) => state.settings);
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['spec', 'build', 'qa'])
  );
  const [envConfig, setEnvConfig] = useState<ProjectEnvConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load project env config when project changes
  useEffect(() => {
    if (selectedProjectId && selectedProject?.autoBuildPath) {
      setIsLoading(true);
      window.electronAPI.getProjectEnv(selectedProjectId)
        .then((result) => {
          if (result.success && result.data) {
            setEnvConfig(result.data);
          } else {
            setEnvConfig(null);
          }
        })
        .catch(() => {
          setEnvConfig(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setEnvConfig(null);
    }
  }, [selectedProjectId, selectedProject?.autoBuildPath]);

  // Update MCP server toggle
  const updateMcpServer = useCallback(async (
    key: keyof NonNullable<ProjectEnvConfig['mcpServers']>,
    value: boolean
  ) => {
    if (!selectedProjectId || !envConfig) return;

    const newMcpServers = {
      ...envConfig.mcpServers,
      [key]: value,
    };

    // Optimistic update
    setEnvConfig((prev) => prev ? { ...prev, mcpServers: newMcpServers } : null);

    // Save to backend
    try {
      await window.electronAPI.updateProjectEnv(selectedProjectId, {
        mcpServers: newMcpServers,
      });
    } catch (error) {
      // Revert on error
      console.error('Failed to update MCP config:', error);
      setEnvConfig((prev) => prev ? { ...prev, mcpServers: envConfig.mcpServers } : null);
    }
  }, [selectedProjectId, envConfig]);

  // Get phase and feature settings with defaults
  const phaseModels = settings.customPhaseModels || DEFAULT_PHASE_MODELS;
  const phaseThinking = settings.customPhaseThinking || DEFAULT_PHASE_THINKING;
  const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
  const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

  // Get MCP server status for display
  const mcpServers = envConfig?.mcpServers || {};
  const getServerStatus = (serverId: string): 'enabled' | 'disabled' | 'not_configured' => {
    switch (serverId) {
      case 'context7':
        return mcpServers.context7Enabled !== false ? 'enabled' : 'disabled';
      case 'graphiti-memory':
        return mcpServers.graphitiEnabled && envConfig?.graphitiProviderConfig
          ? 'enabled'
          : 'not_configured';
      case 'linear':
        return mcpServers.linearMcpEnabled !== false && envConfig?.linearEnabled
          ? 'enabled'
          : envConfig?.linearEnabled ? 'disabled' : 'not_configured';
      case 'electron':
        return mcpServers.electronEnabled ? 'enabled' : 'disabled';
      case 'puppeteer':
        return mcpServers.puppeteerEnabled ? 'enabled' : 'disabled';
      case 'auto-claude':
        return 'enabled'; // Always enabled
      default:
        return 'enabled';
    }
  };

  // Count enabled MCP servers
  const enabledCount = [
    mcpServers.context7Enabled !== false,
    mcpServers.graphitiEnabled && envConfig?.graphitiProviderConfig,
    mcpServers.linearMcpEnabled !== false && envConfig?.linearEnabled,
    mcpServers.electronEnabled,
    mcpServers.puppeteerEnabled,
    true, // auto-claude always enabled
  ].filter(Boolean).length;

  // Resolve model and thinking for an agent based on its settings source
  const resolveAgentSettings = useMemo(() => {
    return (config: AgentConfig): { model: ModelTypeShort; thinking: ThinkingLevel } => {
      const source = config.settingsSource;

      if (source.type === 'phase') {
        return {
          model: phaseModels[source.phase],
          thinking: phaseThinking[source.phase],
        };
      } else if (source.type === 'feature') {
        return {
          model: featureModels[source.feature],
          thinking: featureThinking[source.feature],
        };
      } else {
        // Fixed settings
        return {
          model: source.model,
          thinking: source.thinking,
        };
      }
    };
  }, [phaseModels, phaseThinking, featureModels, featureThinking]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group agents by category
  const agentsByCategory = Object.entries(AGENT_CONFIGS).reduce(
    (acc, [id, config]) => {
      const category = config.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({ id, config });
      return acc;
    },
    {} as Record<string, Array<{ id: string; config: typeof AGENT_CONFIGS[keyof typeof AGENT_CONFIGS] }>>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">MCP Server Overview</h1>
              {selectedProject && (
                <span className="text-sm text-muted-foreground">
                  for {selectedProject.name}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedProject
                ? `Configure which MCP servers are available for agents in this project`
                : 'Select a project to configure MCP servers'}
            </p>
          </div>
          {envConfig && (
            <div className="text-right">
              <span className="text-sm font-medium text-foreground">{enabledCount}</span>
              <span className="text-sm text-muted-foreground"> servers enabled</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* No project selected message */}
          {!selectedProject && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-sm font-medium text-foreground mb-1">No Project Selected</h2>
              <p className="text-sm text-muted-foreground">
                Select a project from the dropdown to view and configure MCP servers.
              </p>
            </div>
          )}

          {/* Project not initialized message */}
          {selectedProject && !selectedProject.autoBuildPath && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <Info className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-sm font-medium text-foreground mb-1">Project Not Initialized</h2>
              <p className="text-sm text-muted-foreground">
                Initialize Auto Claude for this project to configure MCP servers.
              </p>
            </div>
          )}

          {/* MCP Server Configuration */}
          {envConfig && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">MCP Server Configuration</h2>
                <span className="text-xs text-muted-foreground">
                  Disabled servers reduce context usage and startup time
                </span>
              </div>

              <div className="space-y-4">
                {/* Context7 */}
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">Context7</span>
                      <p className="text-xs text-muted-foreground">Documentation lookup for libraries</p>
                    </div>
                  </div>
                  <Switch
                    checked={mcpServers.context7Enabled !== false}
                    onCheckedChange={(checked) => updateMcpServer('context7Enabled', checked)}
                  />
                </div>

                {/* Graphiti Memory */}
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">Graphiti Memory</span>
                      <p className="text-xs text-muted-foreground">
                        {envConfig.graphitiProviderConfig
                          ? 'Knowledge graph for cross-session context'
                          : 'Requires memory configuration (see Memory settings)'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={mcpServers.graphitiEnabled !== false && !!envConfig.graphitiProviderConfig}
                    onCheckedChange={(checked) => updateMcpServer('graphitiEnabled', checked)}
                    disabled={!envConfig.graphitiProviderConfig}
                  />
                </div>

                {/* Linear */}
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">Linear</span>
                      <p className="text-xs text-muted-foreground">
                        {envConfig.linearEnabled
                          ? 'Project management integration'
                          : 'Requires Linear integration (see Linear settings)'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={mcpServers.linearMcpEnabled !== false && envConfig.linearEnabled}
                    onCheckedChange={(checked) => updateMcpServer('linearMcpEnabled', checked)}
                    disabled={!envConfig.linearEnabled}
                  />
                </div>

                {/* Browser Automation Section */}
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      Browser Automation (QA agents only)
                    </span>
                  </div>

                  {/* Electron */}
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <div className="flex items-center gap-3">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium">Electron</span>
                        <p className="text-xs text-muted-foreground">Desktop app automation via Chrome DevTools</p>
                      </div>
                    </div>
                    <Switch
                      checked={mcpServers.electronEnabled === true}
                      onCheckedChange={(checked) => updateMcpServer('electronEnabled', checked)}
                    />
                  </div>

                  {/* Puppeteer */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium">Puppeteer</span>
                        <p className="text-xs text-muted-foreground">Web browser automation for testing</p>
                      </div>
                    </div>
                    <Switch
                      checked={mcpServers.puppeteerEnabled === true}
                      onCheckedChange={(checked) => updateMcpServer('puppeteerEnabled', checked)}
                    />
                  </div>
                </div>

                {/* Auto-Claude (always enabled) */}
                <div className="flex items-center justify-between py-2 border-t border-border opacity-60">
                  <div className="flex items-center gap-3">
                    <ListChecks className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">Auto-Claude Tools</span>
                      <p className="text-xs text-muted-foreground">Build progress tracking (always enabled)</p>
                    </div>
                  </div>
                  <Switch checked={true} disabled />
                </div>
              </div>
            </div>
          )}

          {/* Agent Categories */}
          {Object.entries(CATEGORIES).map(([categoryId, category]) => {
            const agents = agentsByCategory[categoryId] || [];
            if (agents.length === 0) return null;

            const isExpanded = expandedCategories.has(categoryId);
            const CategoryIcon = category.icon;

            return (
              <div key={categoryId} className="space-y-3">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(categoryId)}
                  className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    {category.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ({agents.length} agents)
                  </span>
                </button>

                {/* Agent Cards */}
                {isExpanded && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pl-6">
                    {agents.map(({ id, config }) => {
                      const { model, thinking } = resolveAgentSettings(config);
                      return (
                        <AgentCard
                          key={id}
                          id={id}
                          config={config}
                          modelLabel={getModelLabel(model)}
                          thinkingLabel={getThinkingLabel(thinking)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
