import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Monitor,
  Network,
  Database,
  Gauge,
  Smartphone,
  Terminal,
  Check,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { SettingsSection } from './SettingsSection';
import { cn } from '../../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

// CDP tool categories
type CDPCategory = 'network' | 'storage' | 'performance' | 'emulation' | 'console' | 'dom';

// Agent types that can have CDP enabled
type AgentType = 'qa_reviewer' | 'qa_fixer' | 'coder' | 'planner';

// CDP log levels
type CDPLogLevel = 'none' | 'basic' | 'verbose' | 'debug';

interface CDPConfig {
  enabledAgents: AgentType[];
  enabledCategories: CDPCategory[];
  logLevel: CDPLogLevel;
}

interface CDPSettingsProps {
  section: 'general' | 'advanced';
}

// Agent type display names
const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  qa_reviewer: 'QA Reviewer',
  qa_fixer: 'QA Fixer',
  coder: 'Coder',
  planner: 'Planner',
};

// Agent type descriptions
const AGENT_TYPE_DESCRIPTIONS: Record<AgentType, string> = {
  qa_reviewer: 'Validates implementation against acceptance criteria using E2E testing',
  qa_fixer: 'Fixes issues reported by QA reviewer using browser automation',
  coder: 'Implements features and fixes bugs (CDP adds debugging capabilities)',
  planner: 'Creates implementation plans (CDP adds research capabilities)',
};

// CDP category definitions
const CDP_CATEGORIES: Record<CDPCategory, { name: string; description: string; icon: React.ElementType }> = {
  network: {
    name: 'Network',
    description: 'HTTP request/response monitoring, performance timing',
    icon: Network,
  },
  storage: {
    name: 'Storage',
    description: 'localStorage, sessionStorage, cookies, application state',
    icon: Database,
  },
  performance: {
    name: 'Performance',
    description: 'FCP, LCP, TTI, FPS, memory usage, CPU profiling',
    icon: Gauge,
  },
  emulation: {
    name: 'Emulation',
    description: 'Device emulation, network throttling, geolocation, theme',
    icon: Smartphone,
  },
  console: {
    name: 'Console',
    description: 'Filtered logs, exception tracking, console history',
    icon: Terminal,
  },
  dom: {
    name: 'DOM',
    description: 'Enhanced interactions (drag, hover, scroll, element state)',
    icon: Monitor,
  },
};

const LOG_LEVEL_LABELS: Record<CDPLogLevel, string> = {
  none: 'None',
  basic: 'Basic',
  verbose: 'Verbose',
  debug: 'Debug',
};

/**
 * CDP (Chrome DevTools Protocol) settings component
 * Configures which agents get access to CDP tools and which categories are enabled
 */
export function CDPSettings({ section }: CDPSettingsProps) {
  const { t } = useTranslation('settings');
  const [config, setConfig] = useState<CDPConfig>({
    enabledAgents: ['qa_reviewer', 'qa_fixer'],
    enabledCategories: ['network', 'storage', 'performance', 'console', 'dom'],
    logLevel: 'basic',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load configuration from backend
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement IPC call to load CDP config from backend
      // For now, use default values
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load CDP configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement IPC call to save CDP config to backend
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save CDP configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAgent = (agent: AgentType) => {
    setConfig((prev) => {
      const enabledAgents = prev.enabledAgents.includes(agent)
        ? prev.enabledAgents.filter((a) => a !== agent)
        : [...prev.enabledAgents, agent];
      return { ...prev, enabledAgents };
    });
    setHasChanges(true);
  };

  const toggleCategory = (category: CDPCategory) => {
    setConfig((prev) => {
      const enabledCategories = prev.enabledCategories.includes(category)
        ? prev.enabledCategories.filter((c) => c !== category)
        : [...prev.enabledCategories, category];
      return { ...prev, enabledCategories };
    });
    setHasChanges(true);
  };

  const enabledCount = config.enabledAgents.length;
  const categoryCount = config.enabledCategories.length;

  return (
    <SettingsSection
      title="CDP Configuration"
      description="Configure Chrome DevTools Protocol access for AI agents"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading CDP configuration...</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Configuration Summary */}
        <div className="rounded-lg border border-info/50 bg-info/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                CDP Tools Configuration
              </p>
              <p className="text-sm text-muted-foreground">
                {enabledCount} agent(s) with CDP access, {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'} enabled
              </p>
            </div>
          </div>
        </div>

        {/* Agent Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold text-foreground">
            Agents with CDP Access
          </Label>
          <p className="text-sm text-muted-foreground">
            Select which AI agents get access to Chrome DevTools Protocol tools
          </p>

          <div className="space-y-2">
            {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((agent) => {
              const isEnabled = config.enabledAgents.includes(agent);
              return (
                <div
                  key={agent}
                  className="flex items-start justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {isEnabled ? (
                      <Check className="h-5 w-5 text-success mt-0.5" />
                    ) : (
                      <div className="h-5 w-5 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{AGENT_TYPE_LABELS[agent]}</p>
                      <p className="text-sm text-muted-foreground">{AGENT_TYPE_DESCRIPTIONS[agent]}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleAgent(agent)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold text-foreground">
            CDP Tool Categories
          </Label>
          <p className="text-sm text-muted-foreground">
            Select which categories of Chrome DevTools Protocol tools to enable
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(Object.keys(CDP_CATEGORIES) as CDPCategory[]).map((category) => {
              const { name, description, icon: Icon } = CDP_CATEGORIES[category];
              const isEnabled = config.enabledCategories.includes(category);
              return (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left',
                    isEnabled
                      ? 'border-info bg-info/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <Icon className={cn(
                    'h-5 w-5 mt-0.5 shrink-0',
                    isEnabled ? 'text-info' : 'text-muted-foreground'
                  )} />
                  <div className="space-y-1">
                    <p className={cn(
                      'font-medium',
                      isEnabled ? 'text-info' : 'text-foreground'
                    )}>{name}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  {isEnabled && (
                    <Check className="h-4 w-4 text-info ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Log Level */}
        <div className="space-y-3">
          <Label className="text-base font-semibold text-foreground">
            Logging Level
          </Label>
          <p className="text-sm text-muted-foreground">
            Configure the verbosity of CDP activity logging
          </p>

          <Select
            value={config.logLevel}
            onValueChange={(value) => {
              setConfig((prev) => ({ ...prev, logLevel: value as CDPLogLevel }));
              setHasChanges(true);
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LOG_LEVEL_LABELS) as CDPLogLevel[]).map((level) => (
                <SelectItem key={level} value={level}>
                  {LOG_LEVEL_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Warning Message */}
        {config.enabledAgents.includes('coder') || config.enabledAgents.includes('planner') ? (
          <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-warning">
                  Context Window Impact
                </p>
                <p className="text-sm text-muted-foreground">
                  Enabling CDP for Coder or Planner agents increases their context usage,
                  which may affect performance and token costs. Consider enabling only for
                  QA agents unless you specifically need these capabilities.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
