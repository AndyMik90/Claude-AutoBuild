import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Users, BarChart3, RefreshCw, Plus, TrendingUp, Play, Square, RotateCcw, Clock } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Progress } from '../ui/progress';
import { getFeatureStats } from '../../stores/roadmap-store';
import { ROADMAP_PRIORITY_COLORS } from '../../../shared/constants';
import type { RoadmapHeaderProps } from './types';

// Duration options in hours
const DURATION_OPTIONS = [1, 2, 4, 8, 12, 24];

// Map phase IDs to i18n keys
const PHASE_I18N_KEYS: Record<string, string> = {
  'idle': 'idle',
  'sota_llm': 'sotaLLM',
  'competitor_analysis': 'competitorAnalysis',
  'performance_improvements': 'performanceImprovements',
  'ui_ux_improvements': 'uiuxImprovements',
  'feature_discovery': 'featureDiscovery',
};

export function RoadmapHeader({
  roadmap,
  competitorAnalysis,
  onAddFeature,
  onRefresh,
  onViewCompetitorAnalysis,
  continuousState,
  continuousProgress,
  onStartContinuous,
  onStopContinuous,
  onResumeContinuous,
}: RoadmapHeaderProps) {
  const { t } = useTranslation('common');
  const stats = getFeatureStats(roadmap);

  // Local state for continuous mode toggle and duration
  const [continuousModeEnabled, setContinuousModeEnabled] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<string>('8');

  // Determine if continuous research is currently running
  const isRunning = continuousState?.isRunning || false;
  const canResume = continuousState && !continuousState.isRunning && continuousState.iterationCount > 0;

  // Get the phase display name
  const getPhaseDisplayName = (phase: string): string => {
    const i18nKey = PHASE_I18N_KEYS[phase] || 'idle';
    return t(`continuousResearch.phases.${i18nKey}`);
  };

  // Handle starting continuous research
  const handleStartContinuous = () => {
    if (onStartContinuous) {
      onStartContinuous(parseInt(selectedDuration, 10));
    }
  };

  // Handle toggle change
  const handleToggleChange = (checked: boolean) => {
    setContinuousModeEnabled(checked);
    // If turning off while running, stop the research
    if (!checked && isRunning && onStopContinuous) {
      onStopContinuous();
    }
  };

  // Format elapsed time for display
  const formatTime = (hours: number): string => {
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  return (
    <div className="shrink-0 border-b border-border p-4 bg-card/50">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{roadmap.projectName}</h2>
            <Badge variant="outline">{roadmap.status}</Badge>
            {competitorAnalysis && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="gap-1 cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={onViewCompetitorAnalysis}
                  >
                    <TrendingUp className="h-3 w-3" />
                    Competitor Analysis
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="space-y-2">
                    <div className="font-semibold">Click to view detailed analysis</div>
                    <div className="text-sm text-muted-foreground">
                      Analyzed {competitorAnalysis.competitors.length} competitors with {' '}
                      {competitorAnalysis.competitors.reduce((sum, c) => sum + c.painPoints.length, 0)} pain points identified
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">{roadmap.vision}</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onAddFeature}>
                <Plus className="h-4 w-4 mr-1" />
                Add Feature
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new feature to the roadmap</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onRefresh} aria-label={t('accessibility.regenerateRoadmapAriaLabel')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Regenerate Roadmap</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Target Audience */}
      {roadmap.targetAudience && (
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Target:</span>
            <span className="font-medium">{roadmap.targetAudience.primary}</span>
          </div>
          {roadmap.targetAudience.secondary?.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-muted-foreground cursor-help underline decoration-dotted">
                  +{roadmap.targetAudience.secondary.length} more personas
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <div className="space-y-1">
                  <div className="font-semibold mb-2">Secondary Personas:</div>
                  {roadmap.targetAudience.secondary.map((persona) => (
                    <div key={persona} className="text-sm">• {persona}</div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-semibold">{stats.total}</span>
            <span className="text-muted-foreground"> features</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">
            <span className="font-semibold">{roadmap.phases.length}</span>
            <span className="text-muted-foreground"> phases</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Object.entries(stats.byPriority).map(([priority, count]) => (
            <Badge
              key={priority}
              variant="outline"
              className={`text-xs ${ROADMAP_PRIORITY_COLORS[priority]}`}
            >
              {count} {priority}
            </Badge>
          ))}
        </div>
      </div>

      {/* Continuous Research Mode Section */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={continuousModeEnabled || isRunning}
                onCheckedChange={handleToggleChange}
                aria-label={t('continuousResearch.accessibility.toggleContinuousModeAriaLabel')}
                disabled={isRunning}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm font-medium cursor-help">
                    {t('continuousResearch.toggle.label')}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t('continuousResearch.toggle.tooltip')}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Duration Selector - show when enabled but not running */}
            {(continuousModeEnabled || canResume) && !isRunning && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedDuration}
                  onValueChange={setSelectedDuration}
                >
                  <SelectTrigger
                    className="w-[120px] h-8"
                    aria-label={t('continuousResearch.accessibility.durationSelectorAriaLabel')}
                  >
                    <SelectValue placeholder={t('continuousResearch.duration.selectDuration')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((hours) => (
                      <SelectItem key={hours} value={hours.toString()}>
                        {t(`continuousResearch.duration.options.${hours}h`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Progress indicator when running */}
            {isRunning && continuousProgress && (
              <div className="flex items-center gap-4 flex-1 max-w-md">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      {t('continuousResearch.progress.currentPhase', {
                        phase: getPhaseDisplayName(continuousProgress.phase)
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {t('continuousResearch.progress.iteration', {
                        current: continuousProgress.iterationCount,
                        total: Math.ceil(continuousProgress.durationHours / 2) // Rough estimate
                      })}
                    </span>
                  </div>
                  <Progress
                    value={continuousProgress.progress}
                    className="h-2"
                    aria-label={t('continuousResearch.accessibility.progressIndicatorAriaLabel', {
                      phase: getPhaseDisplayName(continuousProgress.phase),
                      iteration: continuousProgress.iterationCount
                    })}
                  />
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">
                      {t('continuousResearch.progress.featuresDiscovered', {
                        count: continuousProgress.featureCount
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {t('continuousResearch.progress.timeElapsed', {
                        time: formatTime(continuousProgress.elapsedHours)
                      })} / {formatTime(continuousProgress.durationHours)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Start button - show when enabled and not running */}
            {continuousModeEnabled && !isRunning && !canResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleStartContinuous}
                    aria-label={t('continuousResearch.accessibility.startResearchAriaLabel')}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    {t('continuousResearch.controls.start')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('continuousResearch.toggle.tooltip')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Resume button - show when there's saved state */}
            {canResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onResumeContinuous}
                    aria-label={t('continuousResearch.accessibility.resumeResearchAriaLabel')}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {t('continuousResearch.controls.resume')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('continuousResearch.status.resuming')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Stop button - show when running */}
            {isRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onStopContinuous}
                    aria-label={t('continuousResearch.accessibility.stopResearchAriaLabel')}
                  >
                    <Square className="h-4 w-4 mr-1" />
                    {t('continuousResearch.controls.stop')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('continuousResearch.confirmations.stopMessage')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Running status badge */}
            {isRunning && (
              <Badge variant="secondary" className="animate-pulse">
                {t('continuousResearch.status.running')}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
