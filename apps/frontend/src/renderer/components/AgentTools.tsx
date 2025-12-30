/**
 * Agent Tools Overview
 *
 * Displays MCP server and tool configuration for each agent phase.
 * Helps users understand what tools are available during different execution phases.
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
  ListChecks
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from './ui/scroll-area';
import { useSettingsStore } from '../stores/settings-store';
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
  labelKey: string;
  descriptionKey: string;
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
    labelKey: 'agents.specGatherer.label',
    descriptionKey: 'agents.specGatherer.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_researcher: {
    labelKey: 'agents.specResearcher.label',
    descriptionKey: 'agents.specResearcher.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_writer: {
    labelKey: 'agents.specWriter.label',
    descriptionKey: 'agents.specWriter.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_critic: {
    labelKey: 'agents.specCritic.label',
    descriptionKey: 'agents.specCritic.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_discovery: {
    labelKey: 'agents.specDiscovery.label',
    descriptionKey: 'agents.specDiscovery.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_context: {
    labelKey: 'agents.specContext.label',
    descriptionKey: 'agents.specContext.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },
  spec_validation: {
    labelKey: 'agents.specValidation.label',
    descriptionKey: 'agents.specValidation.description',
    category: 'spec',
    tools: ['Read', 'Glob', 'Grep'],
    mcp_servers: [],
    settingsSource: { type: 'phase', phase: 'spec' },
  },

  // Build Phases
  planner: {
    labelKey: 'agents.planner.label',
    descriptionKey: 'agents.planner.description',
    category: 'build',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear'],
    settingsSource: { type: 'phase', phase: 'planning' },
  },
  coder: {
    labelKey: 'agents.coder.label',
    descriptionKey: 'agents.coder.description',
    category: 'build',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear'],
    settingsSource: { type: 'phase', phase: 'coding' },
  },

  // QA Phases
  qa_reviewer: {
    labelKey: 'agents.qaReviewer.label',
    descriptionKey: 'agents.qaReviewer.description',
    category: 'qa',
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear', 'electron', 'puppeteer'],
    settingsSource: { type: 'phase', phase: 'qa' },
  },
  qa_fixer: {
    labelKey: 'agents.qaFixer.label',
    descriptionKey: 'agents.qaFixer.description',
    category: 'qa',
    tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7', 'graphiti-memory', 'auto-claude'],
    mcp_optional: ['linear', 'electron', 'puppeteer'],
    settingsSource: { type: 'phase', phase: 'qa' },
  },

  // Utility Phases - use feature settings
  pr_reviewer: {
    labelKey: 'agents.prReviewer.label',
    descriptionKey: 'agents.prReviewer.description',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'feature', feature: 'githubPrs' },
  },
  commit_message: {
    labelKey: 'agents.commitMessage.label',
    descriptionKey: 'agents.commitMessage.description',
    category: 'utility',
    tools: [],
    mcp_servers: [],
    // Commit message uses Haiku for speed - not yet user-configurable
    settingsSource: { type: 'fixed', model: 'haiku', thinking: 'low' },
  },
  merge_resolver: {
    labelKey: 'agents.mergeResolver.label',
    descriptionKey: 'agents.mergeResolver.description',
    category: 'utility',
    tools: [],
    mcp_servers: [],
    // Merge resolver uses Haiku - not yet user-configurable
    settingsSource: { type: 'fixed', model: 'haiku', thinking: 'low' },
  },
  insights: {
    labelKey: 'agents.insights.label',
    descriptionKey: 'agents.insights.description',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'feature', feature: 'insights' },
  },
  analysis: {
    labelKey: 'agents.analysis.label',
    descriptionKey: 'agents.analysis.description',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    // Analysis uses same as insights
    settingsSource: { type: 'feature', feature: 'insights' },
  },
  batch_analysis: {
    labelKey: 'agents.batchAnalysis.label',
    descriptionKey: 'agents.batchAnalysis.description',
    category: 'utility',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    // Batch uses same as GitHub Issues
    settingsSource: { type: 'feature', feature: 'githubIssues' },
  },

  // Ideation & Roadmap - use feature settings
  ideation: {
    labelKey: 'agents.ideation.label',
    descriptionKey: 'agents.ideation.description',
    category: 'ideation',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: [],
    settingsSource: { type: 'feature', feature: 'ideation' },
  },
  roadmap_discovery: {
    labelKey: 'agents.roadmapDiscovery.label',
    descriptionKey: 'agents.roadmapDiscovery.description',
    category: 'ideation',
    tools: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
    mcp_servers: ['context7'],
    settingsSource: { type: 'feature', feature: 'roadmap' },
  },
};

// MCP Server descriptions - accurate per backend models.py
const MCP_SERVERS: Record<string, { name: string; descriptionKey: string; icon: React.ElementType; tools?: string[] }> = {
  context7: {
    name: 'Context7',
    descriptionKey: 'mcpServers.context7.description',
    icon: Search,
    tools: ['mcp__context7__resolve-library-id', 'mcp__context7__get-library-docs'],
  },
  'graphiti-memory': {
    name: 'Graphiti Memory',
    descriptionKey: 'mcpServers.graphiti.description',
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
    descriptionKey: 'mcpServers.autoClaude.description',
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
    descriptionKey: 'mcpServers.linear.description',
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
    descriptionKey: 'mcpServers.electron.description',
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
    descriptionKey: 'mcpServers.puppeteer.description',
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
  spec: { labelKey: 'categories.spec', icon: FileCheck },
  build: { labelKey: 'categories.build', icon: Code },
  qa: { labelKey: 'categories.qa', icon: CheckCircle2 },
  utility: { labelKey: 'categories.utility', icon: Wrench },
  ideation: { labelKey: 'categories.ideation', icon: Lightbulb },
};

interface AgentCardProps {
  id: string;
  config: typeof AGENT_CONFIGS[keyof typeof AGENT_CONFIGS];
  modelLabel: string;
  thinkingLabel: string;
}

function AgentCard({ config, modelLabel, thinkingLabel }: AgentCardProps) {
  const { t } = useTranslation('agentTools');
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
            <h3 className="font-medium text-sm text-foreground">{t(config.labelKey)}</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {modelLabel}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
              {thinkingLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{t(config.descriptionKey)}</p>
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
              {t('mcpServersSection')}
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
                        {serverInfo ? t(serverInfo.descriptionKey) : server}
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
                              +{serverInfo.tools.length - 3} {t('more')}
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
                        <span className="text-[10px] text-muted-foreground">({t('conditional')})</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        {serverInfo ? t(serverInfo.descriptionKey) : server}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noMcpServers')}</p>
            )}
          </div>

          {/* Tools */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t('availableToolsSection')}
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
              <p className="text-sm text-muted-foreground">{t('textOnly')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentTools() {
  const { t } = useTranslation('agentTools');
  const settings = useSettingsStore((state) => state.settings);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['spec', 'build', 'qa'])
  );

  // Get phase and feature settings with defaults
  const phaseModels = settings.customPhaseModels || DEFAULT_PHASE_MODELS;
  const phaseThinking = settings.customPhaseThinking || DEFAULT_PHASE_THINKING;
  const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
  const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

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
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* MCP Server Legend */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">{t('availableServers')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(MCP_SERVERS).map(([id, server]) => {
                const Icon = server.icon;
                return (
                  <div key={id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{server.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">{t(server.descriptionKey)}</p>
                    {server.tools && (
                      <div className="ml-6 text-xs text-muted-foreground">
                        {server.tools.length} {t('toolsAvailable')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

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
                    {t(category.labelKey)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ({agents.length} {t('agentsCount')})
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
