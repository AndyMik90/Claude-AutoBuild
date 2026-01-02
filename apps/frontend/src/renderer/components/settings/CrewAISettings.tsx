import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, ChevronDown, ChevronUp, RotateCcw, Check, Zap, Scale, Sparkles, Settings2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  AVAILABLE_MODELS,
  THINKING_LEVELS,
  CREWAI_PROFILES,
  CREWAI_CREWS,
  CREWAI_AGENT_LABELS,
  DEFAULT_CREWAI_AGENT_MODELS
} from '../../../shared/constants';
import { useSettingsStore, saveSettings } from '../../stores/settings-store';
import { SettingsSection } from './SettingsSection';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import type {
  CrewAIProfile,
  CrewAIAgentModelsConfig,
  CrewAIAgentConfig,
  ModelTypeShort,
  ThinkingLevel
} from '../../../shared/types/settings';

/**
 * Icon mapping for CrewAI profile icons
 */
const profileIconMap: Record<CrewAIProfile, React.ElementType> = {
  balanced: Scale,
  performance: Sparkles,
  economy: Zap,
  custom: Settings2
};

type AgentKey = keyof CrewAIAgentModelsConfig;

/**
 * CrewAI Settings component
 * Configure CrewAI orchestration, profile selection, and per-agent model settings
 */
export function CrewAISettings() {
  const { t } = useTranslation('settings');
  const settings = useSettingsStore((state) => state.settings);

  const isEnabled = settings.crewaiEnabled ?? false;
  const selectedProfile = settings.crewaiProfile ?? 'balanced';
  const customAgentModels = settings.crewaiAgentModels ?? DEFAULT_CREWAI_AGENT_MODELS;

  const [expandedCrew, setExpandedCrew] = useState<string | null>(null);

  const handleEnableChange = async (enabled: boolean) => {
    await saveSettings({ crewaiEnabled: enabled });
  };

  const handleProfileSelect = async (profileId: CrewAIProfile) => {
    await saveSettings({ crewaiProfile: profileId });
  };

  const handleAgentModelChange = async (agent: AgentKey, model: ModelTypeShort) => {
    const newConfig: CrewAIAgentModelsConfig = {
      ...customAgentModels,
      [agent]: { ...customAgentModels[agent], model }
    };
    await saveSettings({ crewaiAgentModels: newConfig });
  };

  const handleAgentThinkingChange = async (agent: AgentKey, thinkingLevel: ThinkingLevel) => {
    const newConfig: CrewAIAgentModelsConfig = {
      ...customAgentModels,
      [agent]: { ...customAgentModels[agent], thinkingLevel }
    };
    await saveSettings({ crewaiAgentModels: newConfig });
  };

  const handleResetToDefaults = async () => {
    await saveSettings({ crewaiAgentModels: DEFAULT_CREWAI_AGENT_MODELS });
  };

  /**
   * Get the effective agent config based on selected profile
   */
  const getEffectiveAgentConfig = (agent: AgentKey): CrewAIAgentConfig => {
    if (selectedProfile === 'custom') {
      return customAgentModels[agent];
    }
    const profile = CREWAI_PROFILES.find(p => p.id === selectedProfile);
    return profile?.agents?.[agent] ?? DEFAULT_CREWAI_AGENT_MODELS[agent];
  };

  /**
   * Check if custom config differs from defaults
   */
  const hasCustomChanges = (): boolean => {
    const agents = Object.keys(DEFAULT_CREWAI_AGENT_MODELS) as AgentKey[];
    return agents.some(agent => {
      const current = customAgentModels[agent];
      const defaultVal = DEFAULT_CREWAI_AGENT_MODELS[agent];
      return current.model !== defaultVal.model || current.thinkingLevel !== defaultVal.thinkingLevel;
    });
  };

  /**
   * Get human-readable model label
   */
  const getModelLabel = (modelValue: string): string => {
    const model = AVAILABLE_MODELS.find((m) => m.value === modelValue);
    return model?.label || modelValue;
  };

  /**
   * Get human-readable thinking level label
   */
  const getThinkingLabel = (thinkingValue: string): string => {
    const level = THINKING_LEVELS.find((l) => l.value === thinkingValue);
    return level?.label || thinkingValue;
  };

  /**
   * Render a profile selection card
   */
  const renderProfileCard = (profile: typeof CREWAI_PROFILES[number]) => {
    const isSelected = selectedProfile === profile.id;
    const Icon = profileIconMap[profile.id];

    return (
      <button
        key={profile.id}
        onClick={() => handleProfileSelect(profile.id)}
        disabled={!isEnabled}
        className={cn(
          'relative w-full rounded-lg border p-4 text-left transition-all duration-200',
          'hover:border-primary/50 hover:shadow-sm',
          isSelected
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card',
          !isEnabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}

        {/* Profile content */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
              isSelected ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-medium text-sm text-foreground">{profile.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {profile.description}
            </p>
          </div>
        </div>
      </button>
    );
  };

  /**
   * Render agent configuration row
   */
  const renderAgentConfig = (agentKey: AgentKey) => {
    const agentLabel = CREWAI_AGENT_LABELS[agentKey];
    const config = getEffectiveAgentConfig(agentKey);
    const isCustomProfile = selectedProfile === 'custom';

    return (
      <div key={agentKey} className="py-3 border-b border-border last:border-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <Label className="text-sm font-medium text-foreground">
              {agentLabel.label}
            </Label>
            <p className="text-xs text-muted-foreground">{agentLabel.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Model Select */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select
              value={config.model}
              onValueChange={(value) => handleAgentModelChange(agentKey, value as ModelTypeShort)}
              disabled={!isCustomProfile || !isEnabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Thinking Level Select */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Thinking</Label>
            <Select
              value={config.thinkingLevel}
              onValueChange={(value) => handleAgentThinkingChange(agentKey, value as ThinkingLevel)}
              disabled={!isCustomProfile || !isEnabled}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THINKING_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render crew accordion section
   */
  const renderCrewSection = (crew: typeof CREWAI_CREWS[number]) => {
    const isExpanded = expandedCrew === crew.id;

    return (
      <div key={crew.id} className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedCrew(isExpanded ? null : crew.id)}
          disabled={!isEnabled}
          className={cn(
            'flex w-full items-center justify-between p-4 text-left transition-colors',
            'hover:bg-muted/50',
            !isEnabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="font-medium text-sm text-foreground">{crew.name}</h4>
              <p className="text-xs text-muted-foreground">{crew.description}</p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {isExpanded && (
          <div className="border-t border-border px-4 pb-4">
            {crew.agents.map((agentKey) => renderAgentConfig(agentKey as AgentKey))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SettingsSection
      title={t('crewai.title', 'CrewAI Orchestration')}
      description={t('crewai.description', 'Configure multi-agent workflow orchestration')}
    >
      <div className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">
              {t('crewai.enable', 'Enable CrewAI')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('crewai.enableDescription', 'Use CrewAI for automated multi-agent orchestration')}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleEnableChange}
          />
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            {t('crewai.info', 'CrewAI orchestrates 3 specialized crews (Product Management, Development, QA & Release) that work together to automate your entire development workflow. Each agent can be configured with a different Claude model and thinking level.')}
          </p>
        </div>

        {/* Profile Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t('crewai.profile', 'Profile')}
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {CREWAI_PROFILES.map(renderProfileCard)}
          </div>
        </div>

        {/* Per-Agent Configuration (only for custom profile) */}
        {selectedProfile === 'custom' && isEnabled && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {t('crewai.agentConfiguration', 'Agent Configuration')}
              </Label>
              {hasCustomChanges() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToDefaults}
                  className="text-xs h-7"
                >
                  <RotateCcw className="h-3 w-3 mr-1.5" />
                  {t('crewai.resetToDefaults', 'Reset to Defaults')}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {CREWAI_CREWS.map(renderCrewSection)}
            </div>
          </div>
        )}

        {/* Quick view for non-custom profiles */}
        {selectedProfile !== 'custom' && isEnabled && (
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('crewai.currentConfiguration', 'Current Configuration')}
            </Label>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="grid grid-cols-3 gap-4 text-xs">
                {CREWAI_CREWS.map(crew => (
                  <div key={crew.id}>
                    <h5 className="font-medium text-foreground mb-2">{crew.name}</h5>
                    <div className="space-y-1">
                      {crew.agents.map(agentKey => {
                        const config = getEffectiveAgentConfig(agentKey as AgentKey);
                        return (
                          <div key={agentKey} className="flex items-center justify-between text-muted-foreground">
                            <span>{CREWAI_AGENT_LABELS[agentKey as AgentKey].label.split(' ').pop()}</span>
                            <span className="text-[10px] bg-background px-1.5 py-0.5 rounded">
                              {getModelLabel(config.model).split(' ').pop()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
