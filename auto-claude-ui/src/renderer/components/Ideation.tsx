import { useEffect, useState, useRef } from 'react';
import {
  Lightbulb,
  Zap,
  Palette,
  Target,
  ChevronRight,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Circle,
  Play,
  X,
  Settings2,
  Filter,
  Eye,
  EyeOff,
  FileCode,
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  BookOpen,
  Shield,
  Gauge,
  AlertTriangle,
  ExternalLink,
  Wrench,
  Database,
  Wifi,
  Box,
  HardDrive,
  Code2,
  Loader2,
  XCircle,
  Plus,
  Square,
  Trash2
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { EnvConfigModal, useClaudeTokenCheck } from './EnvConfigModal';
import {
  useIdeationStore,
  loadIdeation,
  generateIdeation,
  refreshIdeation,
  stopIdeation,
  appendIdeation,
  dismissAllIdeasForProject,
  getIdeasByType,
  getActiveIdeas,
  getIdeationSummary,
  isCodeImprovementIdea,
  isUIUXIdea,
  setupIdeationListeners,
  IdeationTypeState
} from '../stores/ideation-store';
import { loadTasks } from '../stores/task-store';
import {
  IDEATION_TYPE_LABELS,
  IDEATION_TYPE_DESCRIPTIONS,
  IDEATION_TYPE_COLORS,
  IDEATION_STATUS_COLORS,
  IDEATION_EFFORT_COLORS,
  IDEATION_IMPACT_COLORS,
  SECURITY_SEVERITY_COLORS,
  UIUX_CATEGORY_LABELS,
  DOCUMENTATION_CATEGORY_LABELS,
  SECURITY_CATEGORY_LABELS,
  PERFORMANCE_CATEGORY_LABELS,
  CODE_QUALITY_CATEGORY_LABELS,
  CODE_QUALITY_SEVERITY_COLORS
} from '../../shared/constants';
import type {
  Idea,
  IdeationType,
  IdeationGenerationStatus,
  IdeationSession,
  CodeImprovementIdea,
  UIUXImprovementIdea,
  DocumentationGapIdea,
  SecurityHardeningIdea,
  PerformanceOptimizationIdea,
  CodeQualityIdea
} from '../../shared/types';

interface IdeationProps {
  projectId: string;
}

const TypeIcon = ({ type }: { type: IdeationType }) => {
  switch (type) {
    case 'code_improvements':
      return <Zap className="h-4 w-4" />;
    case 'ui_ux_improvements':
      return <Palette className="h-4 w-4" />;
    case 'documentation_gaps':
      return <BookOpen className="h-4 w-4" />;
    case 'security_hardening':
      return <Shield className="h-4 w-4" />;
    case 'performance_optimizations':
      return <Gauge className="h-4 w-4" />;
    case 'code_quality':
      return <Code2 className="h-4 w-4" />;
    default:
      return <Lightbulb className="h-4 w-4" />;
  }
};

// All ideation types for iteration
// Note: high_value_features removed - strategic features belong to Roadmap
const ALL_IDEATION_TYPES: IdeationType[] = [
  'code_improvements',
  'ui_ux_improvements',
  'documentation_gaps',
  'security_hardening',
  'performance_optimizations',
  'code_quality'
];

// Type guard functions for new types
function isDocumentationGapIdea(idea: Idea): idea is DocumentationGapIdea {
  return idea.type === 'documentation_gaps';
}

function isSecurityHardeningIdea(idea: Idea): idea is SecurityHardeningIdea {
  return idea.type === 'security_hardening';
}

function isCodeQualityIdea(idea: Idea): idea is CodeQualityIdea {
  return idea.type === 'code_quality';
}

function isPerformanceOptimizationIdea(idea: Idea): idea is PerformanceOptimizationIdea {
  return idea.type === 'performance_optimizations';
}

// Helper to get state icon for ideation type
function TypeStateIcon({ state }: { state: IdeationTypeState }) {
  switch (state) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'generating':
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

// Skeleton card for ideas being loaded
function IdeaSkeletonCard() {
  return (
    <Card className="p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-24 bg-muted rounded" />
            <div className="h-5 w-16 bg-muted rounded" />
          </div>
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-2/3 bg-muted rounded" />
        </div>
      </div>
    </Card>
  );
}

// Generation Progress Screen Component - handles auto-scroll with streaming UI
interface GenerationProgressScreenProps {
  generationStatus: IdeationGenerationStatus;
  logs: string[];
  typeStates: Record<IdeationType, IdeationTypeState>;
  enabledTypes: IdeationType[];
  session: IdeationSession | null;
  onSelectIdea: (idea: Idea | null) => void;
  selectedIdea: Idea | null;
  onConvert: (idea: Idea) => void;
  onDismiss: (idea: Idea) => void;
  onStop: () => void;
}

function GenerationProgressScreen({
  generationStatus,
  logs,
  typeStates,
  enabledTypes,
  session,
  onSelectIdea,
  selectedIdea,
  onConvert,
  onDismiss,
  onStop
}: GenerationProgressScreenProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logsEndRef.current && showLogs) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Get ideas for a specific type from the current session
  const getStreamingIdeasByType = (type: IdeationType): Idea[] => {
    if (!session) return [];
    return session.ideas.filter((idea) => idea.type === type);
  };

  // Count how many types are still generating
  const generatingCount = enabledTypes.filter((t) => typeStates[t] === 'generating').length;
  const completedCount = enabledTypes.filter((t) => typeStates[t] === 'completed').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4 bg-card/50">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              <h2 className="text-lg font-semibold">Generating Ideas</h2>
              <Badge variant="outline">
                {completedCount}/{enabledTypes.length} complete
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{generationStatus.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
            >
              <FileCode className="h-4 w-4 mr-1" />
              {showLogs ? 'Hide' : 'Show'} Logs
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onStop}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generation</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Progress value={generationStatus.progress} className="mt-3" />

        {/* Type Status Indicators */}
        <div className="mt-3 flex flex-wrap gap-2">
          {enabledTypes.map((type) => (
            <div
              key={type}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                typeStates[type] === 'completed'
                  ? 'bg-success/10 text-success'
                  : typeStates[type] === 'failed'
                    ? 'bg-destructive/10 text-destructive'
                    : typeStates[type] === 'generating'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              <TypeStateIcon state={typeStates[type]} />
              <TypeIcon type={type} />
              <span>{IDEATION_TYPE_LABELS[type]}</span>
              {typeStates[type] === 'completed' && session && (
                <span className="ml-1 font-medium">
                  ({getStreamingIdeasByType(type).length})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Logs Panel (collapsible) */}
      {showLogs && logs.length > 0 && (
        <div className="flex-shrink-0 border-b border-border p-4 bg-muted/20">
          <ScrollArea className="h-32 rounded-md border border-border bg-muted/30">
            <div className="p-3 space-y-1 font-mono text-xs">
              {logs.map((log, index) => (
                <div key={index} className="text-muted-foreground leading-relaxed">
                  <span className="text-muted-foreground/50 mr-2 select-none">
                    {String(index + 1).padStart(3, '0')}
                  </span>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Streaming Ideas View */}
      <div className="flex-1 overflow-auto p-4">
        {generationStatus.error && (
          <div className="mb-4 p-3 bg-destructive/10 rounded-md text-destructive text-sm">
            {generationStatus.error}
          </div>
        )}

        <div className="space-y-6">
          {enabledTypes.map((type) => {
            const ideas = getStreamingIdeasByType(type);
            const state = typeStates[type];

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-md ${IDEATION_TYPE_COLORS[type]}`}>
                    <TypeIcon type={type} />
                  </div>
                  <h3 className="font-medium">{IDEATION_TYPE_LABELS[type]}</h3>
                  <TypeStateIcon state={state} />
                  {ideas.length > 0 && (
                    <Badge variant="outline" className="ml-auto">
                      {ideas.length} ideas
                    </Badge>
                  )}
                </div>

                <div className="grid gap-3">
                  {/* Show actual ideas if available */}
                  {ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onClick={() => onSelectIdea(selectedIdea?.id === idea.id ? null : idea)}
                      onConvert={onConvert}
                      onDismiss={onDismiss}
                    />
                  ))}

                  {/* Show skeleton placeholders while generating */}
                  {state === 'generating' && (
                    <>
                      <IdeaSkeletonCard />
                      <IdeaSkeletonCard />
                    </>
                  )}

                  {/* Show pending message */}
                  {state === 'pending' && (
                    <div className="text-sm text-muted-foreground py-2">
                      Waiting to start...
                    </div>
                  )}

                  {/* Show failed message */}
                  {state === 'failed' && ideas.length === 0 && (
                    <div className="text-sm text-destructive py-2">
                      Failed to generate ideas for this category
                    </div>
                  )}

                  {/* Show empty message if completed with no ideas */}
                  {state === 'completed' && ideas.length === 0 && (
                    <div className="text-sm text-muted-foreground py-2">
                      No ideas generated for this category
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Idea Detail Panel */}
      {selectedIdea && (
        <IdeaDetailPanel
          idea={selectedIdea}
          onClose={() => onSelectIdea(null)}
          onConvert={onConvert}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

export function Ideation({ projectId }: IdeationProps) {
  const session = useIdeationStore((state) => state.session);
  const generationStatus = useIdeationStore((state) => state.generationStatus);
  const config = useIdeationStore((state) => state.config);
  const setConfig = useIdeationStore((state) => state.setConfig);
  const logs = useIdeationStore((state) => state.logs);
  const typeStates = useIdeationStore((state) => state.typeStates);

  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showEnvConfigModal, setShowEnvConfigModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'generate' | 'refresh' | 'append' | null>(null);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [typesToAdd, setTypesToAdd] = useState<IdeationType[]>([]);

  // Check if Claude token is configured
  const { hasToken, isLoading: isCheckingToken, checkToken } = useClaudeTokenCheck();

  // Set up IPC listeners and load ideation on mount
  useEffect(() => {
    const cleanup = setupIdeationListeners();
    loadIdeation(projectId);
    return cleanup;
  }, [projectId]);

  const handleGenerate = async () => {
    // Check token before generating
    if (hasToken === false) {
      setPendingAction('generate');
      setShowEnvConfigModal(true);
      return;
    }
    generateIdeation(projectId);
  };

  const handleRefresh = async () => {
    // Check token before refreshing
    if (hasToken === false) {
      setPendingAction('refresh');
      setShowEnvConfigModal(true);
      return;
    }
    refreshIdeation(projectId);
  };

  const handleStop = async () => {
    await stopIdeation(projectId);
  };

  const handleDismissAll = async () => {
    await dismissAllIdeasForProject(projectId);
  };

  // Handle when env config is complete - execute pending action
  const handleEnvConfigured = () => {
    checkToken(); // Re-check the token
    if (pendingAction === 'generate') {
      generateIdeation(projectId);
    } else if (pendingAction === 'refresh') {
      refreshIdeation(projectId);
    } else if (pendingAction === 'append' && typesToAdd.length > 0) {
      appendIdeation(projectId, typesToAdd);
      setTypesToAdd([]);
    }
    setPendingAction(null);
  };

  // Get which types are not yet in the session (available to add)
  const getAvailableTypesToAdd = (): IdeationType[] => {
    if (!session) return ALL_IDEATION_TYPES;
    const existingTypes = new Set(session.ideas.map((idea) => idea.type));
    return ALL_IDEATION_TYPES.filter((type) => !existingTypes.has(type));
  };

  // Handle adding more ideas
  const handleAddMoreIdeas = () => {
    if (typesToAdd.length === 0) return;

    // Check token before generating
    if (hasToken === false) {
      setPendingAction('append');
      setShowEnvConfigModal(true);
      return;
    }

    appendIdeation(projectId, typesToAdd);
    setTypesToAdd([]);
    setShowAddMoreDialog(false);
  };

  // Toggle a type in the typesToAdd list
  const toggleTypeToAdd = (type: IdeationType) => {
    setTypesToAdd((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleConvertToTask = async (idea: Idea) => {
    const result = await window.electronAPI.convertIdeaToTask(projectId, idea.id);
    if (result.success) {
      // Idea converted to task - update status
      useIdeationStore.getState().updateIdeaStatus(idea.id, 'converted');
      // Reload tasks so the new task appears in the kanban board
      loadTasks(projectId);
    }
  };

  const handleDismiss = async (idea: Idea) => {
    const result = await window.electronAPI.dismissIdea(projectId, idea.id);
    if (result.success) {
      useIdeationStore.getState().dismissIdea(idea.id);
    }
  };

  const toggleIdeationType = (type: IdeationType) => {
    const currentTypes = config.enabledTypes;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];

    if (newTypes.length > 0) {
      setConfig({ enabledTypes: newTypes });
    }
  };

  const summary = getIdeationSummary(session);
  const activeIdeas = showDismissed ? session?.ideas || [] : getActiveIdeas(session);

  // Show generation progress with streaming ideas
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete' && generationStatus.phase !== 'error') {
    return (
      <GenerationProgressScreen
        generationStatus={generationStatus}
        logs={logs}
        typeStates={typeStates}
        enabledTypes={config.enabledTypes}
        session={session}
        onSelectIdea={setSelectedIdea}
        selectedIdea={selectedIdea}
        onConvert={handleConvertToTask}
        onDismiss={handleDismiss}
        onStop={handleStop}
      />
    );
  }

  // Show empty state
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-lg p-8 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Ideas Yet</h2>
          <p className="text-muted-foreground mb-6">
            Generate AI-powered feature ideas based on your project's context,
            existing patterns, and target audience.
          </p>

          {/* Configuration Preview */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Enabled Ideation Types</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfigDialog(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {ALL_IDEATION_TYPES.map((type) => (
                <div
                  key={type}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <TypeIcon type={type} />
                    <span className="text-sm">{IDEATION_TYPE_LABELS[type]}</span>
                  </div>
                  <Switch
                    checked={config.enabledTypes.includes(type)}
                    onCheckedChange={() => toggleIdeationType(type)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleGenerate} size="lg" disabled={isCheckingToken}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Ideas
          </Button>

          {/* Show warning if token is missing */}
          {hasToken === false && !isCheckingToken && (
            <p className="mt-3 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 inline-block mr-1 text-warning" />
              Claude token not configured. You'll be prompted to enter it when generating.
            </p>
          )}
        </Card>

        {/* Environment Configuration Modal */}
        <EnvConfigModal
          open={showEnvConfigModal}
          onOpenChange={setShowEnvConfigModal}
          onConfigured={handleEnvConfigured}
          title="Claude Authentication Required"
          description="A Claude Code OAuth token is required to generate AI-powered feature ideas."
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4 bg-card/50">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Ideation</h2>
              <Badge variant="outline">{summary.totalIdeas} ideas</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-generated feature ideas for your project
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowDismissed(!showDismissed)}
                >
                  {showDismissed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowConfigDialog(true)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configure</TooltipContent>
            </Tooltip>
            {/* Add More Ideas Button - only show if there are types not yet generated */}
            {getAvailableTypesToAdd().length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTypesToAdd([]);
                      setShowAddMoreDialog(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add More
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add more ideation types</TooltipContent>
              </Tooltip>
            )}
            {/* Dismiss All Button - only show if there are active ideas */}
            {activeIdeas.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={handleDismissAll}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dismiss all ideas</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate Ideas</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-4">
          {Object.entries(summary.byType).map(([type, count]) => (
            <Badge
              key={type}
              variant="outline"
              className={IDEATION_TYPE_COLORS[type]}
            >
              <TypeIcon type={type as IdeationType} />
              <span className="ml-1">{count}</span>
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="flex-shrink-0 mx-4 mt-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="code_improvements">
              <Zap className="h-3 w-3 mr-1" />
              Code
            </TabsTrigger>
            <TabsTrigger value="ui_ux_improvements">
              <Palette className="h-3 w-3 mr-1" />
              UI/UX
            </TabsTrigger>
            <TabsTrigger value="documentation_gaps">
              <BookOpen className="h-3 w-3 mr-1" />
              Docs
            </TabsTrigger>
            <TabsTrigger value="security_hardening">
              <Shield className="h-3 w-3 mr-1" />
              Security
            </TabsTrigger>
            <TabsTrigger value="performance_optimizations">
              <Gauge className="h-3 w-3 mr-1" />
              Performance
            </TabsTrigger>
          </TabsList>

          {/* All Ideas View */}
          <TabsContent value="all" className="flex-1 overflow-auto p-4">
            <div className="grid gap-3">
              {activeIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onClick={() => setSelectedIdea(selectedIdea?.id === idea.id ? null : idea)}
                  onConvert={handleConvertToTask}
                  onDismiss={handleDismiss}
                />
              ))}
              {activeIdeas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No ideas to display
                </div>
              )}
            </div>
          </TabsContent>

          {/* Type-specific Views */}
          {ALL_IDEATION_TYPES.map((type) => (
            <TabsContent key={type} value={type} className="flex-1 overflow-auto p-4">
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {IDEATION_TYPE_DESCRIPTIONS[type]}
                </p>
              </div>
              <div className="grid gap-3">
                {getIdeasByType(session, type)
                  .filter((idea) => showDismissed || idea.status !== 'dismissed')
                  .map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onClick={() => setSelectedIdea(selectedIdea?.id === idea.id ? null : idea)}
                      onConvert={handleConvertToTask}
                      onDismiss={handleDismiss}
                    />
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Idea Detail Panel */}
      {selectedIdea && (
        <IdeaDetailPanel
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onConvert={handleConvertToTask}
          onDismiss={handleDismiss}
        />
      )}

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ideation Configuration</DialogTitle>
            <DialogDescription>
              Configure which types of ideas to generate
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-96 overflow-y-auto">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Ideation Types</h4>
              {ALL_IDEATION_TYPES.map((type) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${IDEATION_TYPE_COLORS[type]}`}>
                      <TypeIcon type={type} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{IDEATION_TYPE_LABELS[type]}</div>
                      <div className="text-xs text-muted-foreground">
                        {IDEATION_TYPE_DESCRIPTIONS[type]}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={config.enabledTypes.includes(type)}
                    onCheckedChange={() => toggleIdeationType(type)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Context Sources</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm">Include Roadmap Context</span>
                <Switch
                  checked={config.includeRoadmapContext}
                  onCheckedChange={(checked) => setConfig({ includeRoadmapContext: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Include Kanban Context</span>
                <Switch
                  checked={config.includeKanbanContext}
                  onCheckedChange={(checked) => setConfig({ includeKanbanContext: checked })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add More Ideas Dialog */}
      <Dialog open={showAddMoreDialog} onOpenChange={setShowAddMoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add More Ideas</DialogTitle>
            <DialogDescription>
              Select additional ideation types to generate. Your existing ideas will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-96 overflow-y-auto">
            {getAvailableTypesToAdd().length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-success" />
                <p>You've already generated all ideation types!</p>
                <p className="text-sm mt-1">Use "Regenerate" to refresh existing ideas.</p>
              </div>
            ) : (
              getAvailableTypesToAdd().map((type) => (
                <div
                  key={type}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    typesToAdd.includes(type)
                      ? 'bg-primary/10 border border-primary'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => toggleTypeToAdd(type)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${IDEATION_TYPE_COLORS[type]}`}>
                      <TypeIcon type={type} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{IDEATION_TYPE_LABELS[type]}</div>
                      <div className="text-xs text-muted-foreground">
                        {IDEATION_TYPE_DESCRIPTIONS[type]}
                      </div>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    typesToAdd.includes(type)
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  }`}>
                    {typesToAdd.includes(type) && (
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {typesToAdd.length > 0 && `${typesToAdd.length} selected`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddMoreDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddMoreIdeas}
                disabled={typesToAdd.length === 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                Generate {typesToAdd.length > 0 ? `${typesToAdd.length} Types` : 'Ideas'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Environment Configuration Modal */}
      <EnvConfigModal
        open={showEnvConfigModal}
        onOpenChange={setShowEnvConfigModal}
        onConfigured={handleEnvConfigured}
        title="Claude Authentication Required"
        description="A Claude Code OAuth token is required to generate AI-powered feature ideas."
      />
    </div>
  );
}

// Idea Card Component
interface IdeaCardProps {
  idea: Idea;
  onClick: () => void;
  onConvert: (idea: Idea) => void;
  onDismiss: (idea: Idea) => void;
}

function IdeaCard({ idea, onClick, onConvert, onDismiss }: IdeaCardProps) {
  const isDismissed = idea.status === 'dismissed';
  const isConverted = idea.status === 'converted';

  return (
    <Card
      className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
        isDismissed ? 'opacity-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
              <TypeIcon type={idea.type} />
              <span className="ml-1">{IDEATION_TYPE_LABELS[idea.type]}</span>
            </Badge>
            {idea.status !== 'draft' && (
              <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                {idea.status}
              </Badge>
            )}
            {isCodeImprovementIdea(idea) && (
              <Badge variant="outline" className={IDEATION_EFFORT_COLORS[(idea as CodeImprovementIdea).estimatedEffort]}>
                {(idea as CodeImprovementIdea).estimatedEffort}
              </Badge>
            )}
            {isUIUXIdea(idea) && (
              <Badge variant="outline">
                {UIUX_CATEGORY_LABELS[(idea as UIUXImprovementIdea).category]}
              </Badge>
            )}
            {isDocumentationGapIdea(idea) && (
              <Badge variant="outline">
                {DOCUMENTATION_CATEGORY_LABELS[(idea as DocumentationGapIdea).category]}
              </Badge>
            )}
            {isSecurityHardeningIdea(idea) && (
              <Badge variant="outline" className={SECURITY_SEVERITY_COLORS[(idea as SecurityHardeningIdea).severity]}>
                {(idea as SecurityHardeningIdea).severity}
              </Badge>
            )}
            {isPerformanceOptimizationIdea(idea) && (
              <Badge variant="outline" className={IDEATION_IMPACT_COLORS[(idea as PerformanceOptimizationIdea).impact]}>
                {(idea as PerformanceOptimizationIdea).impact} impact
              </Badge>
            )}
            {isCodeQualityIdea(idea) && (
              <Badge variant="outline" className={CODE_QUALITY_SEVERITY_COLORS[(idea as CodeQualityIdea).severity]}>
                {(idea as CodeQualityIdea).severity}
              </Badge>
            )}
          </div>
          <h3 className={`font-medium ${isDismissed ? 'line-through' : ''}`}>
            {idea.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
        </div>
        {!isDismissed && !isConverted && (
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConvert(idea);
                  }}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert to Task</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(idea);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dismiss</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </Card>
  );
}

// Idea Detail Panel
interface IdeaDetailPanelProps {
  idea: Idea;
  onClose: () => void;
  onConvert: (idea: Idea) => void;
  onDismiss: (idea: Idea) => void;
}

function IdeaDetailPanel({ idea, onClose, onConvert, onDismiss }: IdeaDetailPanelProps) {
  const isDismissed = idea.status === 'dismissed';
  const isConverted = idea.status === 'converted';

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-lg flex flex-col z-50">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
                <TypeIcon type={idea.type} />
                <span className="ml-1">{IDEATION_TYPE_LABELS[idea.type]}</span>
              </Badge>
              {idea.status !== 'draft' && (
                <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                  {idea.status}
                </Badge>
              )}
            </div>
            <h2 className="font-semibold">{idea.title}</h2>
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
          <p className="text-sm text-muted-foreground">{idea.description}</p>
        </div>

        {/* Rationale */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Rationale
          </h3>
          <p className="text-sm text-muted-foreground">{idea.rationale}</p>
        </div>

        {/* Type-specific content */}
        {isCodeImprovementIdea(idea) && (
          <CodeImprovementDetails idea={idea as CodeImprovementIdea} />
        )}

        {isUIUXIdea(idea) && (
          <UIUXDetails idea={idea as UIUXImprovementIdea} />
        )}

        {isDocumentationGapIdea(idea) && (
          <DocumentationGapDetails idea={idea as DocumentationGapIdea} />
        )}

        {isSecurityHardeningIdea(idea) && (
          <SecurityHardeningDetails idea={idea as SecurityHardeningIdea} />
        )}

        {isPerformanceOptimizationIdea(idea) && (
          <PerformanceOptimizationDetails idea={idea as PerformanceOptimizationIdea} />
        )}

        {isCodeQualityIdea(idea) && (
          <CodeQualityDetails idea={idea as CodeQualityIdea} />
        )}
      </div>

      {/* Actions */}
      {!isDismissed && !isConverted && (
        <div className="flex-shrink-0 p-4 border-t border-border space-y-2">
          <Button className="w-full" onClick={() => onConvert(idea)}>
            <Play className="h-4 w-4 mr-2" />
            Convert to Auto-Build Task
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onDismiss(idea)}
          >
            <X className="h-4 w-4 mr-2" />
            Dismiss Idea
          </Button>
        </div>
      )}
    </div>
  );
}

// Type-specific detail components
function CodeImprovementDetails({ idea }: { idea: CodeImprovementIdea }) {
  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${IDEATION_EFFORT_COLORS[idea.estimatedEffort]}`}>
            {idea.estimatedEffort}
          </div>
          <div className="text-xs text-muted-foreground">Effort</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-semibold">{idea.affectedFiles?.length ?? 0}</div>
          <div className="text-xs text-muted-foreground">Files</div>
        </Card>
      </div>

      {/* Builds Upon */}
      {idea.buildsUpon && idea.buildsUpon.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Builds Upon
          </h3>
          <div className="flex flex-wrap gap-1">
            {idea.buildsUpon.map((item, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Implementation Approach */}
      {idea.implementationApproach && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Implementation Approach
          </h3>
          <p className="text-sm text-muted-foreground">{idea.implementationApproach}</p>
        </div>
      )}

      {/* Affected Files */}
      {idea.affectedFiles && idea.affectedFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Files
          </h3>
          <ul className="space-y-1">
            {idea.affectedFiles.map((file, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Existing Patterns */}
      {idea.existingPatterns && idea.existingPatterns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Patterns to Follow</h3>
          <ul className="space-y-1">
            {idea.existingPatterns.map((pattern, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <Circle className="h-3 w-3 mt-1.5 flex-shrink-0" />
                {pattern}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function UIUXDetails({ idea }: { idea: UIUXImprovementIdea }) {
  return (
    <>
      {/* Category */}
      <div>
        <Badge variant="outline" className="text-sm">
          {UIUX_CATEGORY_LABELS[idea.category]}
        </Badge>
      </div>

      {/* Current State */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Current State
        </h3>
        <p className="text-sm text-muted-foreground">{idea.currentState}</p>
      </div>

      {/* Proposed Change */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Proposed Change
        </h3>
        <p className="text-sm text-muted-foreground">{idea.proposedChange}</p>
      </div>

      {/* User Benefit */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Users className="h-4 w-4" />
          User Benefit
        </h3>
        <p className="text-sm text-muted-foreground">{idea.userBenefit}</p>
      </div>

      {/* Affected Components */}
      {idea.affectedComponents && idea.affectedComponents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Components
          </h3>
          <ul className="space-y-1">
            {idea.affectedComponents.map((component, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {component}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// Note: HighValueDetails removed - strategic features belong to Roadmap

function DocumentationGapDetails({ idea }: { idea: DocumentationGapIdea }) {
  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className="text-lg font-semibold">
            {DOCUMENTATION_CATEGORY_LABELS[idea.category]}
          </div>
          <div className="text-xs text-muted-foreground">Category</div>
        </Card>
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${IDEATION_EFFORT_COLORS[idea.estimatedEffort]}`}>
            {idea.estimatedEffort}
          </div>
          <div className="text-xs text-muted-foreground">Effort</div>
        </Card>
      </div>

      {/* Target Audience */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Target Audience
        </h3>
        <Badge variant="outline" className="capitalize">
          {idea.targetAudience}
        </Badge>
      </div>

      {/* Current Documentation */}
      {idea.currentDocumentation && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Current Documentation
          </h3>
          <p className="text-sm text-muted-foreground">{idea.currentDocumentation}</p>
        </div>
      )}

      {/* Proposed Content */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Proposed Content
        </h3>
        <p className="text-sm text-muted-foreground">{idea.proposedContent}</p>
      </div>

      {/* Affected Areas */}
      {idea.affectedAreas && idea.affectedAreas.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Areas
          </h3>
          <ul className="space-y-1">
            {idea.affectedAreas.map((area, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {area}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Priority */}
      <div>
        <h3 className="text-sm font-medium mb-2">Priority</h3>
        <Badge variant="outline" className={IDEATION_IMPACT_COLORS[idea.priority]}>
          {idea.priority}
        </Badge>
      </div>
    </>
  );
}

function SecurityHardeningDetails({ idea }: { idea: SecurityHardeningIdea }) {
  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${SECURITY_SEVERITY_COLORS[idea.severity]}`}>
            {idea.severity}
          </div>
          <div className="text-xs text-muted-foreground">Severity</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-semibold">
            {idea.affectedFiles?.length ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">Files</div>
        </Card>
      </div>

      {/* Category */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Category
        </h3>
        <Badge variant="outline">
          {SECURITY_CATEGORY_LABELS[idea.category]}
        </Badge>
      </div>

      {/* Vulnerability */}
      {idea.vulnerability && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Vulnerability
          </h3>
          <p className="text-sm font-mono text-muted-foreground">{idea.vulnerability}</p>
        </div>
      )}

      {/* Current Risk */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Current Risk
        </h3>
        <p className="text-sm text-muted-foreground">{idea.currentRisk}</p>
      </div>

      {/* Remediation */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Remediation
        </h3>
        <p className="text-sm text-muted-foreground">{idea.remediation}</p>
      </div>

      {/* Affected Files */}
      {idea.affectedFiles && idea.affectedFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Files
          </h3>
          <ul className="space-y-1">
            {idea.affectedFiles.map((file, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* References */}
      {idea.references && idea.references.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            References
          </h3>
          <ul className="space-y-1">
            {idea.references.map((ref, i) => (
              <li key={i} className="text-sm text-primary hover:underline">
                <a href={ref} target="_blank" rel="noopener noreferrer">{ref}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compliance */}
      {idea.compliance && idea.compliance.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Compliance</h3>
          <div className="flex flex-wrap gap-1">
            {idea.compliance.map((comp, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {comp}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PerformanceOptimizationDetails({ idea }: { idea: PerformanceOptimizationIdea }) {
  // Get an icon for the performance category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bundle_size':
        return <Box className="h-4 w-4" />;
      case 'database':
        return <Database className="h-4 w-4" />;
      case 'network':
        return <Wifi className="h-4 w-4" />;
      case 'memory':
        return <HardDrive className="h-4 w-4" />;
      default:
        return <Gauge className="h-4 w-4" />;
    }
  };

  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${IDEATION_IMPACT_COLORS[idea.impact]}`}>
            {idea.impact}
          </div>
          <div className="text-xs text-muted-foreground">Impact</div>
        </Card>
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${IDEATION_EFFORT_COLORS[idea.estimatedEffort]}`}>
            {idea.estimatedEffort}
          </div>
          <div className="text-xs text-muted-foreground">Effort</div>
        </Card>
      </div>

      {/* Category */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          {getCategoryIcon(idea.category)}
          Category
        </h3>
        <Badge variant="outline">
          {PERFORMANCE_CATEGORY_LABELS[idea.category]}
        </Badge>
      </div>

      {/* Current Metric */}
      {idea.currentMetric && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Current State
          </h3>
          <p className="text-sm text-muted-foreground">{idea.currentMetric}</p>
        </div>
      )}

      {/* Expected Improvement */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-success" />
          Expected Improvement
        </h3>
        <p className="text-sm text-muted-foreground">{idea.expectedImprovement}</p>
      </div>

      {/* Implementation */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Implementation
        </h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{idea.implementation}</p>
      </div>

      {/* Affected Areas */}
      {idea.affectedAreas && idea.affectedAreas.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Areas
          </h3>
          <ul className="space-y-1">
            {idea.affectedAreas.map((area, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {area}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tradeoffs */}
      {idea.tradeoffs && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Tradeoffs
          </h3>
          <p className="text-sm text-muted-foreground">{idea.tradeoffs}</p>
        </div>
      )}
    </>
  );
}

function CodeQualityDetails({ idea }: { idea: CodeQualityIdea }) {
  return (
    <>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${CODE_QUALITY_SEVERITY_COLORS[idea.severity]}`}>
            {idea.severity}
          </div>
          <div className="text-xs text-muted-foreground">Severity</div>
        </Card>
        <Card className="p-3 text-center">
          <div className={`text-lg font-semibold ${IDEATION_EFFORT_COLORS[idea.estimatedEffort]}`}>
            {idea.estimatedEffort}
          </div>
          <div className="text-xs text-muted-foreground">Effort</div>
        </Card>
      </div>

      {/* Category */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Code2 className="h-4 w-4" />
          Category
        </h3>
        <Badge variant="outline">
          {CODE_QUALITY_CATEGORY_LABELS[idea.category]}
        </Badge>
      </div>

      {/* Breaking Change Warning */}
      {idea.breakingChange && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Breaking Change</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This refactoring may break existing code or tests.
          </p>
        </div>
      )}

      {/* Current State */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Current State
        </h3>
        <p className="text-sm text-muted-foreground">{idea.currentState}</p>
      </div>

      {/* Proposed Change */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-success" />
          Proposed Change
        </h3>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{idea.proposedChange}</p>
      </div>

      {/* Code Example */}
      {idea.codeExample && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Code Example
          </h3>
          <pre className="text-xs font-mono bg-muted/50 p-3 rounded-lg overflow-x-auto">
            {idea.codeExample}
          </pre>
        </div>
      )}

      {/* Metrics (if available) */}
      {idea.metrics && (
        <div>
          <h3 className="text-sm font-medium mb-2">Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {idea.metrics.lineCount && (
              <Card className="p-2 text-center">
                <div className="text-sm font-semibold">{idea.metrics.lineCount}</div>
                <div className="text-xs text-muted-foreground">Lines</div>
              </Card>
            )}
            {idea.metrics.complexity && (
              <Card className="p-2 text-center">
                <div className="text-sm font-semibold">{idea.metrics.complexity}</div>
                <div className="text-xs text-muted-foreground">Complexity</div>
              </Card>
            )}
            {idea.metrics.duplicateLines && (
              <Card className="p-2 text-center">
                <div className="text-sm font-semibold">{idea.metrics.duplicateLines}</div>
                <div className="text-xs text-muted-foreground">Duplicate Lines</div>
              </Card>
            )}
            {idea.metrics.testCoverage !== undefined && (
              <Card className="p-2 text-center">
                <div className="text-sm font-semibold">{idea.metrics.testCoverage}%</div>
                <div className="text-xs text-muted-foreground">Test Coverage</div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Affected Files */}
      {idea.affectedFiles && idea.affectedFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Affected Files
          </h3>
          <ul className="space-y-1">
            {idea.affectedFiles.map((file, i) => (
              <li key={i} className="text-sm font-mono text-muted-foreground">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Best Practice */}
      {idea.bestPractice && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Best Practice
          </h3>
          <p className="text-sm text-muted-foreground">{idea.bestPractice}</p>
        </div>
      )}

      {/* Prerequisites */}
      {idea.prerequisites && idea.prerequisites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Prerequisites
          </h3>
          <ul className="space-y-1">
            {idea.prerequisites.map((prereq, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                {prereq}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
