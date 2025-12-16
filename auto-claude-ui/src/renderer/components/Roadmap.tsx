import { useEffect, useState } from 'react';
import {
  Map,
  Target,
  Users,
  Lightbulb,
  ChevronRight,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  ArrowRight,
  Zap,
  BarChart3,
  Clock,
  AlertCircle,
  Play,
  ExternalLink,
  TrendingUp,
  Plus} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './ui/tooltip';
import { RoadmapGenerationProgress } from './RoadmapGenerationProgress';
import {
  useRoadmapStore,
  loadRoadmap,
  generateRoadmap,
  refreshRoadmap,
  getFeaturesByPhase,
  getFeatureStats
} from '../stores/roadmap-store';
import {
  ROADMAP_PRIORITY_COLORS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_COMPLEXITY_COLORS,
  ROADMAP_IMPACT_COLORS
} from '../../shared/constants';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { RoadmapKanbanView } from './RoadmapKanbanView';
import { AddFeatureDialog } from './AddFeatureDialog';
import type { RoadmapFeature, RoadmapPhase, CompetitorAnalysis, CompetitorPainPoint } from '../../shared/types';

interface RoadmapProps {
  projectId: string;
  onGoToTask?: (taskId: string) => void;
}

export function Roadmap({ projectId, onGoToTask }: RoadmapProps) {
  const roadmap = useRoadmapStore((state) => state.roadmap);
  const competitorAnalysis = useRoadmapStore((state) => state.competitorAnalysis);
  const generationStatus = useRoadmapStore((state) => state.generationStatus);
  const updateFeatureLinkedSpec = useRoadmapStore((state) => state.updateFeatureLinkedSpec);
  const [selectedFeature, setSelectedFeature] = useState<RoadmapFeature | null>(null);
  const [activeTab, setActiveTab] = useState('phases');
  const [showCompetitorDialog, setShowCompetitorDialog] = useState(false);
  const [showAddFeatureDialog, setShowAddFeatureDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'generate' | 'refresh' | null>(null);

  // Load roadmap on mount
  useEffect(() => {
    loadRoadmap(projectId);
  }, [projectId]);

  const handleGenerate = () => {
    setPendingAction('generate');
    setShowCompetitorDialog(true);
  };

  const handleRefresh = () => {
    setPendingAction('refresh');
    setShowCompetitorDialog(true);
  };

  const handleCompetitorDialogAccept = () => {
    if (pendingAction === 'generate') {
      generateRoadmap(projectId);
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId);
    }
    setPendingAction(null);
  };

  const handleCompetitorDialogDecline = () => {
    if (pendingAction === 'generate') {
      generateRoadmap(projectId);
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId);
    }
    setPendingAction(null);
  };

  const handleConvertToSpec = async (feature: RoadmapFeature) => {
    const result = await window.electronAPI.convertFeatureToSpec(projectId, feature.id);
    if (result.success && result.data) {
      // Update the store with the linked spec
      updateFeatureLinkedSpec(feature.id, result.data.specId);
      // Update the selected feature if it's the one that was converted
      if (selectedFeature?.id === feature.id) {
        setSelectedFeature({
          ...feature,
          linkedSpecId: result.data.specId,
          status: 'planned'
        });
      }
    }
  };

  const handleGoToTask = (specId: string) => {
    if (onGoToTask) {
      onGoToTask(specId);
    }
  };

  const stats = getFeatureStats(roadmap);

  // Helper function to get competitor insights for a feature
  const getCompetitorInsightsForFeature = (feature: RoadmapFeature): CompetitorPainPoint[] => {
    if (!competitorAnalysis || !feature.competitorInsightIds || feature.competitorInsightIds.length === 0) {
      return [];
    }

    const insights: CompetitorPainPoint[] = [];
    for (const competitor of competitorAnalysis.competitors) {
      for (const painPoint of competitor.painPoints) {
        if (feature.competitorInsightIds.includes(painPoint.id)) {
          insights.push(painPoint);
        }
      }
    }
    return insights;
  };

  // Show generation progress
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete') {
    return (
      <div className="flex h-full items-center justify-center">
        <RoadmapGenerationProgress
          generationStatus={generationStatus}
          className="w-full max-w-md"
        />
      </div>
    );
  }

  // Show empty state
  if (!roadmap) {
    return (
      <>
        <div className="flex h-full items-center justify-center">
          <Card className="w-full max-w-lg p-8 text-center">
            <Map className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Roadmap Yet</h2>
            <p className="text-muted-foreground mb-6">
              Generate an AI-powered roadmap that understands your project's target
              audience and creates a strategic feature plan.
            </p>
            <Button onClick={handleGenerate} size="lg">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Roadmap
            </Button>
          </Card>
        </div>
        <CompetitorAnalysisDialog
          open={showCompetitorDialog}
          onOpenChange={setShowCompetitorDialog}
          onAccept={handleCompetitorDialogAccept}
          onDecline={handleCompetitorDialogDecline}
        />
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border p-4 bg-card/50">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{roadmap.projectName}</h2>
              <Badge variant="outline">{roadmap.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">{roadmap.vision}</p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setShowAddFeatureDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Feature
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a new feature to the roadmap</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate Roadmap</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Target Audience */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Target:</span>
            <span className="font-medium">{roadmap.targetAudience.primary}</span>
          </div>
          {roadmap.targetAudience.secondary.length > 0 && (
            <div className="text-muted-foreground">
              +{roadmap.targetAudience.secondary.length} more personas
            </div>
          )}
        </div>

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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="shrink-0 mx-4 mt-4">
            <TabsTrigger value="phases">Phases</TabsTrigger>
            <TabsTrigger value="features">All Features</TabsTrigger>
            <TabsTrigger value="priorities">By Priority</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>

          {/* Phases View */}
          <TabsContent value="phases" className="flex-1 overflow-auto p-4">
            <div className="space-y-6">
              {roadmap.phases.map((phase, index) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  features={getFeaturesByPhase(roadmap, phase.id)}
                  isFirst={index === 0}
                  onFeatureSelect={setSelectedFeature}
                  onConvertToSpec={handleConvertToSpec}
                  onGoToTask={handleGoToTask}
                />
              ))}
            </div>
          </TabsContent>

          {/* All Features View */}
          <TabsContent value="features" className="flex-1 overflow-auto p-4">
            <div className="grid gap-3">
              {roadmap.features.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  onClick={() => setSelectedFeature(feature)}
                  onConvertToSpec={handleConvertToSpec}
                  onGoToTask={handleGoToTask}
                  hasCompetitorInsight={
                    !!feature.competitorInsightIds && feature.competitorInsightIds.length > 0
                  }                />
              ))}
            </div>
          </TabsContent>

          {/* By Priority View */}
          <TabsContent value="priorities" className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-2 gap-4">
              {['must', 'should', 'could', 'wont'].map((priority) => {
                const features = roadmap.features.filter((f) => f.priority === priority);
                return (
                  <Card key={priority} className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className={ROADMAP_PRIORITY_COLORS[priority]}
                      >
                        {ROADMAP_PRIORITY_LABELS[priority]}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {features.length} features
                      </span>
                    </div>
                    <div className="space-y-2">
                      {features.map((feature) => (
                        <div
                          key={feature.id}
                          className="p-2 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => setSelectedFeature(feature)}
                        >
                          <div className="font-medium text-sm">{feature.title}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}>
                              {feature.complexity}
                            </Badge>
                            <Badge variant="outline" className={`text-xs ${ROADMAP_IMPACT_COLORS[feature.impact]}`}>
                              {feature.impact} impact
                            </Badge>
                            {feature.competitorInsightIds && feature.competitorInsightIds.length > 0 && (
                              <Badge variant="outline" className="text-xs text-primary border-primary/50">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Insight
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Kanban View */}
          <TabsContent value="kanban" className="flex-1 overflow-hidden">
            <RoadmapKanbanView
              roadmap={roadmap}
              onFeatureClick={setSelectedFeature}
              onConvertToSpec={handleConvertToSpec}
              onGoToTask={handleGoToTask}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Feature Detail Panel */}
      {selectedFeature && (
        <FeatureDetailPanel
          feature={selectedFeature}
          onClose={() => setSelectedFeature(null)}
          onConvertToSpec={handleConvertToSpec}
          onGoToTask={handleGoToTask}
          competitorInsights={getCompetitorInsightsForFeature(selectedFeature)}        />
      )}

      {/* Competitor Analysis Permission Dialog */}
      <CompetitorAnalysisDialog
        open={showCompetitorDialog}
        onOpenChange={setShowCompetitorDialog}
        onAccept={handleCompetitorDialogAccept}
        onDecline={handleCompetitorDialogDecline}
      />

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        phases={roadmap.phases}
        open={showAddFeatureDialog}
        onOpenChange={setShowAddFeatureDialog}
      />
    </div>
  );
}

// Phase Card Component
interface PhaseCardProps {
  phase: RoadmapPhase;
  features: RoadmapFeature[];
  isFirst: boolean;
  onFeatureSelect: (feature: RoadmapFeature) => void;
  onConvertToSpec: (feature: RoadmapFeature) => void;
  onGoToTask: (specId: string) => void;
}

function PhaseCard({ phase, features, isFirst, onFeatureSelect, onConvertToSpec, onGoToTask }: PhaseCardProps) {
  const completedCount = features.filter((f) => f.status === 'done').length;
  const progress = features.length > 0 ? (completedCount / features.length) * 100 : 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              phase.status === 'completed'
                ? 'bg-success/10 text-success'
                : phase.status === 'in_progress'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {phase.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <span className="text-sm font-semibold">{phase.order}</span>
            )}
          </div>
          <div>
            <h3 className="font-semibold">{phase.name}</h3>
            <p className="text-sm text-muted-foreground">{phase.description}</p>
          </div>
        </div>
        <Badge variant={phase.status === 'completed' ? 'default' : 'outline'}>
          {phase.status}
        </Badge>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span>
            {completedCount}/{features.length} features
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Milestones */}
      {phase.milestones.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2">Milestones</h4>
          <div className="space-y-2">
            {phase.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-2 text-sm"
              >
                {milestone.status === 'achieved' ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={milestone.status === 'achieved' ? 'line-through text-muted-foreground' : ''}>
                  {milestone.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      <div>
        <h4 className="text-sm font-medium mb-2">Features ({features.length})</h4>
        <div className="grid gap-2">
          {features.slice(0, 5).map((feature) => (
            <div
              key={feature.id}
              className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
              onClick={() => onFeatureSelect(feature)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Badge
                  variant="outline"
                  className={`text-xs ${ROADMAP_PRIORITY_COLORS[feature.priority]}`}
                >
                  {feature.priority}
                </Badge>
                <span className="text-sm truncate">{feature.title}</span>
                {feature.competitorInsightIds && feature.competitorInsightIds.length > 0 && (
                  <TrendingUp className="h-3 w-3 text-primary flex-shrink-0" />
                )}
              </div>
              {feature.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
              ) : feature.linkedSpecId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToTask(feature.linkedSpecId!);
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View Task
                </Button>              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConvertToSpec(feature);
                  }}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Build
                </Button>
              )}
            </div>
          ))}
          {features.length > 5 && (
            <div className="text-sm text-muted-foreground text-center py-1">
              +{features.length - 5} more features
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Feature Card Component
interface FeatureCardProps {
  feature: RoadmapFeature;
  onClick: () => void;
  onConvertToSpec: (feature: RoadmapFeature) => void;
  onGoToTask: (specId: string) => void;
  hasCompetitorInsight?: boolean;
}

function FeatureCard({ feature, onClick, onConvertToSpec, onGoToTask, hasCompetitorInsight = false }: FeatureCardProps) {  return (
    <Card
      className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge
              variant="outline"
              className={ROADMAP_PRIORITY_COLORS[feature.priority]}
            >
              {ROADMAP_PRIORITY_LABELS[feature.priority]}
            </Badge>
            <Badge variant="outline" className={`text-xs ${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}>
              {feature.complexity}
            </Badge>
            <Badge variant="outline" className={`text-xs ${ROADMAP_IMPACT_COLORS[feature.impact]}`}>
              {feature.impact} impact
            </Badge>
            {hasCompetitorInsight && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs text-primary border-primary/50">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Competitor Insight
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  This feature addresses competitor pain points
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <h3 className="font-medium">{feature.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{feature.description}</p>
        </div>
        {feature.linkedSpecId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGoToTask(feature.linkedSpecId!);
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Go to Task
          </Button>
        ) : feature.status !== 'done' && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onConvertToSpec(feature);
            }}
          >
            <Play className="h-3 w-3 mr-1" />
            Build
          </Button>
        )}
      </div>
    </Card>
  );
}

// Feature Detail Panel
interface FeatureDetailPanelProps {
  feature: RoadmapFeature;
  onClose: () => void;
  onConvertToSpec: (feature: RoadmapFeature) => void;
  onGoToTask: (specId: string) => void;
  competitorInsights?: CompetitorPainPoint[];
}

function FeatureDetailPanel({ feature, onClose, onConvertToSpec, onGoToTask, competitorInsights = [] }: FeatureDetailPanelProps) {  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-lg flex flex-col z-50">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="outline"
                className={ROADMAP_PRIORITY_COLORS[feature.priority]}
              >
                {ROADMAP_PRIORITY_LABELS[feature.priority]}
              </Badge>
              <Badge variant="outline" className={`${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}>
                {feature.complexity}
              </Badge>
            </div>
            <h2 className="font-semibold">{feature.title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <h3 className="text-sm font-medium mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">{feature.description}</p>
        </div>

        {/* Rationale */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Rationale
          </h3>
          <p className="text-sm text-muted-foreground">{feature.rationale}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <div className={`text-lg font-semibold ${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}>
              {feature.complexity}
            </div>
            <div className="text-xs text-muted-foreground">Complexity</div>
          </Card>
          <Card className="p-3 text-center">
            <div className={`text-lg font-semibold ${ROADMAP_IMPACT_COLORS[feature.impact]}`}>
              {feature.impact}
            </div>
            <div className="text-xs text-muted-foreground">Impact</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-semibold">{feature.dependencies.length}</div>
            <div className="text-xs text-muted-foreground">Dependencies</div>
          </Card>
        </div>

        {/* User Stories */}
        {feature.userStories.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Stories
            </h3>
            <div className="space-y-2">
              {feature.userStories.map((story, i) => (
                <div key={i} className="text-sm p-2 bg-muted/50 rounded-md italic">
                  "{story}"
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acceptance Criteria */}
        {feature.acceptanceCriteria.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Acceptance Criteria
            </h3>
            <ul className="space-y-1">
              {feature.acceptanceCriteria.map((criterion, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <Circle className="h-3 w-3 mt-1.5 shrink-0" />
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dependencies */}
        {feature.dependencies.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-1">
              {feature.dependencies.map((dep) => (
                <Badge key={dep} variant="outline" className="text-xs">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Competitor Insights */}
        {competitorInsights.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Addresses Competitor Pain Points
            </h3>
            <div className="space-y-2">
              {competitorInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-2 bg-primary/5 border border-primary/20 rounded-md"
                >
                  <p className="text-sm text-foreground">{insight.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {insight.source}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        insight.severity === 'high'
                          ? 'text-red-500 border-red-500/50'
                          : insight.severity === 'medium'
                          ? 'text-yellow-500 border-yellow-500/50'
                          : 'text-green-500 border-green-500/50'
                      }`}
                    >
                      {insight.severity} severity
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {feature.linkedSpecId ? (
        <div className="shrink-0 p-4 border-t border-border">
          <Button className="w-full" onClick={() => onGoToTask(feature.linkedSpecId!)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Task
          </Button>
        </div>
      ) : feature.status !== 'done' && (
        <div className="shrink-0 p-4 border-t border-border">
          <Button className="w-full" onClick={() => onConvertToSpec(feature)}>
            <Zap className="h-4 w-4 mr-2" />
            Convert to Auto-Build Task
          </Button>
        </div>
      )}
    </div>
  );
}
