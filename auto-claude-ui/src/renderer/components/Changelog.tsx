import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  RefreshCw,
  Copy,
  Save,
  AlertCircle,
  CheckCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Check,
  Archive,
  Github,
  ExternalLink,
  PartyPopper,
  GitBranch,
  GitCommit,
  History,
  Tag,
  Calendar,
  Loader2
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from './ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from './ui/collapsible';
import { useProjectStore } from '../stores/project-store';
import { loadTasks } from '../stores/task-store';
import {
  useChangelogStore,
  loadChangelogData,
  loadGitData,
  loadCommitsPreview,
  generateChangelog,
  saveChangelog,
  copyChangelogToClipboard,
  canGenerate as canGenerateSelector
} from '../stores/changelog-store';
import {
  CHANGELOG_FORMAT_LABELS,
  CHANGELOG_FORMAT_DESCRIPTIONS,
  CHANGELOG_AUDIENCE_LABELS,
  CHANGELOG_AUDIENCE_DESCRIPTIONS,
  CHANGELOG_STAGE_LABELS,
  CHANGELOG_SOURCE_MODE_LABELS,
  CHANGELOG_SOURCE_MODE_DESCRIPTIONS
} from '../../shared/constants';
import type {
  ChangelogFormat,
  ChangelogAudience,
  ChangelogTask,
  ChangelogSourceMode,
  GitBranchInfo,
  GitTagInfo,
  GitCommit as GitCommitType
} from '../../shared/types';
import { cn } from '../lib/utils';

type WizardStep = 1 | 2 | 3;

export function Changelog() {
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);

  // Data state
  const doneTasks = useChangelogStore((state) => state.doneTasks);
  const selectedTaskIds = useChangelogStore((state) => state.selectedTaskIds);
  const existingChangelog = useChangelogStore((state) => state.existingChangelog);

  // Source mode state
  const sourceMode = useChangelogStore((state) => state.sourceMode);

  // Git data state
  const branches = useChangelogStore((state) => state.branches);
  const tags = useChangelogStore((state) => state.tags);
  const currentBranch = useChangelogStore((state) => state.currentBranch);
  const defaultBranch = useChangelogStore((state) => state.defaultBranch);
  const previewCommits = useChangelogStore((state) => state.previewCommits);
  const isLoadingGitData = useChangelogStore((state) => state.isLoadingGitData);
  const isLoadingCommits = useChangelogStore((state) => state.isLoadingCommits);

  // Git history options state
  const gitHistoryType = useChangelogStore((state) => state.gitHistoryType);
  const gitHistoryCount = useChangelogStore((state) => state.gitHistoryCount);
  const gitHistorySinceDate = useChangelogStore((state) => state.gitHistorySinceDate);
  const gitHistoryFromTag = useChangelogStore((state) => state.gitHistoryFromTag);
  const gitHistoryToTag = useChangelogStore((state) => state.gitHistoryToTag);
  const gitHistorySinceVersion = useChangelogStore((state) => state.gitHistorySinceVersion);
  const includeMergeCommits = useChangelogStore((state) => state.includeMergeCommits);

  // Branch diff options state
  const baseBranch = useChangelogStore((state) => state.baseBranch);
  const compareBranch = useChangelogStore((state) => state.compareBranch);

  // Generation config state
  const version = useChangelogStore((state) => state.version);
  const date = useChangelogStore((state) => state.date);
  const format = useChangelogStore((state) => state.format);
  const audience = useChangelogStore((state) => state.audience);
  const customInstructions = useChangelogStore((state) => state.customInstructions);
  const generationProgress = useChangelogStore((state) => state.generationProgress);
  const generatedChangelog = useChangelogStore((state) => state.generatedChangelog);
  const isGenerating = useChangelogStore((state) => state.isGenerating);
  const error = useChangelogStore((state) => state.error);

  // Task actions
  const toggleTaskSelection = useChangelogStore((state) => state.toggleTaskSelection);
  const selectAllTasks = useChangelogStore((state) => state.selectAllTasks);
  const deselectAllTasks = useChangelogStore((state) => state.deselectAllTasks);

  // Source mode actions
  const setSourceMode = useChangelogStore((state) => state.setSourceMode);

  // Git history options actions
  const setGitHistoryType = useChangelogStore((state) => state.setGitHistoryType);
  const setGitHistoryCount = useChangelogStore((state) => state.setGitHistoryCount);
  const setGitHistorySinceDate = useChangelogStore((state) => state.setGitHistorySinceDate);
  const setGitHistoryFromTag = useChangelogStore((state) => state.setGitHistoryFromTag);
  const setGitHistoryToTag = useChangelogStore((state) => state.setGitHistoryToTag);
  const setGitHistorySinceVersion = useChangelogStore((state) => state.setGitHistorySinceVersion);
  const setIncludeMergeCommits = useChangelogStore((state) => state.setIncludeMergeCommits);

  // Branch diff options actions
  const setBaseBranch = useChangelogStore((state) => state.setBaseBranch);
  const setCompareBranch = useChangelogStore((state) => state.setCompareBranch);

  // Generation config actions
  const setVersion = useChangelogStore((state) => state.setVersion);
  const setDate = useChangelogStore((state) => state.setDate);
  const setFormat = useChangelogStore((state) => state.setFormat);
  const setAudience = useChangelogStore((state) => state.setAudience);
  const setCustomInstructions = useChangelogStore((state) => state.setCustomInstructions);
  const updateGeneratedChangelog = useChangelogStore((state) => state.updateGeneratedChangelog);
  const setError = useChangelogStore((state) => state.setError);
  const setIsGenerating = useChangelogStore((state) => state.setIsGenerating);
  const setGenerationProgress = useChangelogStore((state) => state.setGenerationProgress);
  const reset = useChangelogStore((state) => state.reset);

  const [step, setStep] = useState<WizardStep>(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [versionReason, setVersionReason] = useState<string | null>(null);

  // Load data when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadChangelogData(selectedProjectId);
      loadGitData(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Load commits preview when source mode or options change
  const handleLoadCommitsPreview = useCallback(() => {
    if (selectedProjectId && (sourceMode === 'git-history' || sourceMode === 'branch-diff')) {
      loadCommitsPreview(selectedProjectId);
    }
  }, [
    selectedProjectId,
    sourceMode,
    gitHistoryType,
    gitHistoryCount,
    gitHistorySinceDate,
    gitHistoryFromTag,
    gitHistoryToTag,
    gitHistorySinceVersion,
    includeMergeCommits,
    baseBranch,
    compareBranch
  ]);

  // Set up event listeners for generation
  useEffect(() => {
    const cleanupProgress = window.electronAPI.onChangelogGenerationProgress(
      (projectId, progress) => {
        if (projectId === selectedProjectId) {
          setGenerationProgress(progress);
        }
      }
    );

    const cleanupComplete = window.electronAPI.onChangelogGenerationComplete(
      (projectId, result) => {
        if (projectId === selectedProjectId) {
          setIsGenerating(false);
          if (result.success) {
            updateGeneratedChangelog(result.changelog);
            setGenerationProgress({
              stage: 'complete',
              progress: 100,
              message: 'Changelog generated successfully!'
            });
          } else {
            setError(result.error || 'Generation failed');
          }
        }
      }
    );

    const cleanupError = window.electronAPI.onChangelogGenerationError(
      (projectId, errorMsg) => {
        if (projectId === selectedProjectId) {
          setIsGenerating(false);
          setError(errorMsg);
          setGenerationProgress({
            stage: 'error',
            progress: 0,
            message: errorMsg,
            error: errorMsg
          });
        }
      }
    );

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, [selectedProjectId]);

  const handleGenerate = () => {
    if (selectedProjectId) {
      generateChangelog(selectedProjectId);
    }
  };

  const handleSave = async () => {
    if (selectedProjectId) {
      const success = await saveChangelog(selectedProjectId, 'prepend');
      if (success) {
        setSaveSuccess(true);
        // Move to step 3 (Release & Archive) after save
        setTimeout(() => {
          setSaveSuccess(false);
          setStep(3);
        }, 1000);
      }
    }
  };

  const handleCopy = () => {
    const success = copyChangelogToClipboard();
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleContinue = async () => {
    // Suggest version based on selected tasks before moving to step 2
    if (selectedProjectId && selectedTaskIds.length > 0) {
      try {
        const result = await window.electronAPI.suggestChangelogVersion(
          selectedProjectId,
          selectedTaskIds
        );
        if (result.success && result.data) {
          setVersion(result.data.version);
          setVersionReason(result.data.reason);
        }
      } catch {
        // Ignore errors - just keep the current version
        setVersionReason(null);
      }
    }
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const canGenerate = canGenerateSelector();
  const canSave = generatedChangelog.length > 0 && !isGenerating;

  // Determine if we can continue based on source mode
  const canContinue = (() => {
    switch (sourceMode) {
      case 'tasks':
        return selectedTaskIds.length > 0;
      case 'git-history':
        return previewCommits.length > 0;
      case 'branch-diff':
        return baseBranch !== '' && compareBranch !== '' && baseBranch !== compareBranch && previewCommits.length > 0;
      default:
        return false;
    }
  })();

  if (!selectedProjectId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No Project Selected</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a project from the sidebar to generate changelogs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold">Changelog Generator</h1>
              <p className="text-sm text-muted-foreground">
                {step === 1
                  ? 'Step 1: Select completed tasks to include'
                  : step === 2
                    ? 'Step 2: Configure and generate changelog'
                    : 'Step 3: Release and archive tasks'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="flex items-center gap-2 mr-4">
              <StepIndicator step={1} currentStep={step} label="Select" />
              <div className="w-6 h-px bg-border" />
              <StepIndicator step={2} currentStep={step} label="Generate" />
              <div className="w-6 h-px bg-border" />
              <StepIndicator step={3} currentStep={step} label="Release" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedProjectId && loadChangelogData(selectedProjectId)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Content */}
        {step === 1 && (
          <Step1SourceSelection
            // Source mode props
            sourceMode={sourceMode}
            onSourceModeChange={setSourceMode}
            // Task selection props
            doneTasks={doneTasks}
            selectedTaskIds={selectedTaskIds}
            onToggle={toggleTaskSelection}
            onSelectAll={selectAllTasks}
            onDeselectAll={deselectAllTasks}
            // Git data props
            branches={branches}
            tags={tags}
            currentBranch={currentBranch}
            defaultBranch={defaultBranch}
            previewCommits={previewCommits}
            isLoadingGitData={isLoadingGitData}
            isLoadingCommits={isLoadingCommits}
            // Git history options props
            gitHistoryType={gitHistoryType}
            gitHistoryCount={gitHistoryCount}
            gitHistorySinceDate={gitHistorySinceDate}
            gitHistoryFromTag={gitHistoryFromTag}
            gitHistoryToTag={gitHistoryToTag}
            gitHistorySinceVersion={gitHistorySinceVersion}
            includeMergeCommits={includeMergeCommits}
            onGitHistoryTypeChange={setGitHistoryType}
            onGitHistoryCountChange={setGitHistoryCount}
            onGitHistorySinceDateChange={setGitHistorySinceDate}
            onGitHistoryFromTagChange={setGitHistoryFromTag}
            onGitHistoryToTagChange={setGitHistoryToTag}
            onGitHistorySinceVersionChange={setGitHistorySinceVersion}
            onIncludeMergeCommitsChange={setIncludeMergeCommits}
            // Branch diff options props
            baseBranch={baseBranch}
            compareBranch={compareBranch}
            onBaseBranchChange={setBaseBranch}
            onCompareBranchChange={setCompareBranch}
            // Actions
            onLoadCommitsPreview={handleLoadCommitsPreview}
            onContinue={handleContinue}
            canContinue={canContinue}
          />
        )}
        {step === 2 && (
          <Step2ConfigureGenerate
            sourceMode={sourceMode}
            selectedTaskIds={selectedTaskIds}
            doneTasks={doneTasks}
            previewCommits={previewCommits}
            existingChangelog={existingChangelog}
            version={version}
            versionReason={versionReason}
            date={date}
            format={format}
            audience={audience}
            customInstructions={customInstructions}
            generationProgress={generationProgress}
            generatedChangelog={generatedChangelog}
            isGenerating={isGenerating}
            error={error}
            showAdvanced={showAdvanced}
            saveSuccess={saveSuccess}
            copySuccess={copySuccess}
            canGenerate={canGenerate}
            canSave={canSave}
            onBack={handleBack}
            onVersionChange={setVersion}
            onDateChange={setDate}
            onFormatChange={setFormat}
            onAudienceChange={setAudience}
            onCustomInstructionsChange={setCustomInstructions}
            onShowAdvancedChange={setShowAdvanced}
            onGenerate={handleGenerate}
            onSave={handleSave}
            onCopy={handleCopy}
            onChangelogEdit={updateGeneratedChangelog}
          />
        )}
        {step === 3 && selectedProjectId && (
          <Step3ReleaseArchive
            projectId={selectedProjectId}
            version={version}
            selectedTaskIds={selectedTaskIds}
            doneTasks={doneTasks}
            generatedChangelog={generatedChangelog}
            onDone={async () => {
              reset();
              setStep(1);
              // Reload tasks to reflect archive status in Kanban
              await loadTasks(selectedProjectId);
              // Then reload changelog data with fresh tasks
              loadChangelogData(selectedProjectId);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

interface StepIndicatorProps {
  step: WizardStep;
  currentStep: WizardStep;
  label: string;
}

function StepIndicator({ step, currentStep, label }: StepIndicatorProps) {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors',
          isComplete
            ? 'bg-primary text-primary-foreground'
            : isActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
        )}
      >
        {isComplete ? <Check className="h-3 w-3" /> : step}
      </div>
      <span
        className={cn(
          'text-sm',
          isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </div>
  );
}

interface Step1SourceSelectionProps {
  // Source mode
  sourceMode: ChangelogSourceMode;
  onSourceModeChange: (mode: ChangelogSourceMode) => void;
  // Task selection
  doneTasks: ChangelogTask[];
  selectedTaskIds: string[];
  onToggle: (taskId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  // Git data
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  currentBranch: string;
  defaultBranch: string;
  previewCommits: GitCommitType[];
  isLoadingGitData: boolean;
  isLoadingCommits: boolean;
  // Git history options
  gitHistoryType: 'recent' | 'since-date' | 'tag-range' | 'since-version';
  gitHistoryCount: number;
  gitHistorySinceDate: string;
  gitHistoryFromTag: string;
  gitHistoryToTag: string;
  gitHistorySinceVersion: string;
  includeMergeCommits: boolean;
  onGitHistoryTypeChange: (type: 'recent' | 'since-date' | 'tag-range' | 'since-version') => void;
  onGitHistoryCountChange: (count: number) => void;
  onGitHistorySinceDateChange: (date: string) => void;
  onGitHistoryFromTagChange: (tag: string) => void;
  onGitHistoryToTagChange: (tag: string) => void;
  onGitHistorySinceVersionChange: (version: string) => void;
  onIncludeMergeCommitsChange: (include: boolean) => void;
  // Branch diff options
  baseBranch: string;
  compareBranch: string;
  onBaseBranchChange: (branch: string) => void;
  onCompareBranchChange: (branch: string) => void;
  // Actions
  onLoadCommitsPreview: () => void;
  onContinue: () => void;
  canContinue: boolean;
}

function Step1SourceSelection({
  sourceMode,
  onSourceModeChange,
  doneTasks,
  selectedTaskIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  branches,
  tags,
  currentBranch,
  defaultBranch,
  previewCommits,
  isLoadingGitData,
  isLoadingCommits,
  gitHistoryType,
  gitHistoryCount,
  gitHistorySinceDate,
  gitHistoryFromTag,
  gitHistoryToTag,
  gitHistorySinceVersion,
  includeMergeCommits,
  onGitHistoryTypeChange,
  onGitHistoryCountChange,
  onGitHistorySinceDateChange,
  onGitHistoryFromTagChange,
  onGitHistoryToTagChange,
  onGitHistorySinceVersionChange,
  onIncludeMergeCommitsChange,
  baseBranch,
  compareBranch,
  onBaseBranchChange,
  onCompareBranchChange,
  onLoadCommitsPreview,
  onContinue,
  canContinue
}: Step1SourceSelectionProps) {
  const localBranches = branches.filter((b) => !b.isRemote);

  // Get summary text for footer badge
  const getSummaryCount = () => {
    switch (sourceMode) {
      case 'tasks':
        return selectedTaskIds.length;
      case 'git-history':
      case 'branch-diff':
        return previewCommits.length;
      default:
        return 0;
    }
  };

  const getSummaryLabel = () => {
    switch (sourceMode) {
      case 'tasks':
        return 'task';
      case 'git-history':
      case 'branch-diff':
        return 'commit';
      default:
        return 'item';
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Panel - Source Mode Selection */}
      <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Source Mode Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Changelog Source</Label>
            <RadioGroup
              value={sourceMode}
              onValueChange={(value) => onSourceModeChange(value as ChangelogSourceMode)}
              className="space-y-2"
            >
              <label
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                  sourceMode === 'tasks'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="tasks" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      {CHANGELOG_SOURCE_MODE_LABELS['tasks']}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {doneTasks.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CHANGELOG_SOURCE_MODE_DESCRIPTIONS['tasks']}
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                  sourceMode === 'git-history'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="git-history" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      {CHANGELOG_SOURCE_MODE_LABELS['git-history']}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CHANGELOG_SOURCE_MODE_DESCRIPTIONS['git-history']}
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all',
                  sourceMode === 'branch-diff'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value="branch-diff" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <span className="font-medium text-sm">
                      {CHANGELOG_SOURCE_MODE_LABELS['branch-diff']}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CHANGELOG_SOURCE_MODE_DESCRIPTIONS['branch-diff']}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Git History Options */}
          {sourceMode === 'git-history' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Git History Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* History Type */}
                <div className="space-y-2">
                  <Label className="text-xs">History Type</Label>
                  <Select
                    value={gitHistoryType}
                    onValueChange={(v) => onGitHistoryTypeChange(v as 'recent' | 'since-date' | 'tag-range' | 'since-version')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="since-version">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3" />
                          Since Version
                        </div>
                      </SelectItem>
                      <SelectItem value="recent">
                        <div className="flex items-center gap-2">
                          <History className="h-3 w-3" />
                          Recent Commits
                        </div>
                      </SelectItem>
                      <SelectItem value="since-date">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          Since Date
                        </div>
                      </SelectItem>
                      <SelectItem value="tag-range">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3" />
                          Tag Range
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Type-specific options */}
                {gitHistoryType === 'recent' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Number of Commits</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={gitHistoryCount}
                      onChange={(e) => onGitHistoryCountChange(parseInt(e.target.value) || 25)}
                    />
                  </div>
                )}

                {gitHistoryType === 'since-date' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Since Date</Label>
                    <Input
                      type="date"
                      value={gitHistorySinceDate}
                      onChange={(e) => onGitHistorySinceDateChange(e.target.value)}
                    />
                  </div>
                )}

                {gitHistoryType === 'tag-range' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">From Tag</Label>
                      <Select value={gitHistoryFromTag} onValueChange={onGitHistoryFromTagChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tag..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tags.map((tag) => (
                            <SelectItem key={tag.name} value={tag.name}>
                              {tag.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">To Tag (optional)</Label>
                      <Select value={gitHistoryToTag || 'HEAD'} onValueChange={(v) => onGitHistoryToTagChange(v === 'HEAD' ? '' : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="HEAD (latest)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HEAD">HEAD (latest)</SelectItem>
                          {tags.map((tag) => (
                            <SelectItem key={tag.name} value={tag.name}>
                              {tag.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {gitHistoryType === 'since-version' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Last Version</Label>
                    <Select value={gitHistorySinceVersion} onValueChange={onGitHistorySinceVersionChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tags.map((tag) => (
                          <SelectItem key={tag.name} value={tag.name}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      All commits since this version will be included
                    </p>
                  </div>
                )}

                {/* Include merge commits */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="merge-commits"
                    checked={includeMergeCommits}
                    onCheckedChange={(checked) => onIncludeMergeCommitsChange(checked as boolean)}
                  />
                  <Label htmlFor="merge-commits" className="text-xs cursor-pointer">
                    Include merge commits
                  </Label>
                </div>

                {/* Load Preview Button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onLoadCommitsPreview}
                  disabled={isLoadingCommits || isLoadingGitData}
                >
                  {isLoadingCommits ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Load Commits
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Branch Diff Options */}
          {sourceMode === 'branch-diff' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Branch Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Base Branch</Label>
                  <Select value={baseBranch} onValueChange={onBaseBranchChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select base branch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {localBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <div className="flex items-center gap-2">
                            {branch.name}
                            {branch.name === defaultBranch && (
                              <Badge variant="outline" className="text-xs">default</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The branch you're merging into
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Compare Branch</Label>
                  <Select value={compareBranch} onValueChange={onCompareBranchChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select compare branch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {localBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <div className="flex items-center gap-2">
                            {branch.name}
                            {branch.isCurrent && (
                              <Badge variant="secondary" className="text-xs">current</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The branch with your changes
                  </p>
                </div>

                {baseBranch && compareBranch && baseBranch === compareBranch && (
                  <div className="flex items-center gap-2 text-destructive text-xs">
                    <AlertCircle className="h-3 w-3" />
                    Branches must be different
                  </div>
                )}

                {/* Load Preview Button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onLoadCommitsPreview}
                  disabled={isLoadingCommits || isLoadingGitData || !baseBranch || !compareBranch || baseBranch === compareBranch}
                >
                  {isLoadingCommits ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Load Commits
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Right Panel - Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tasks Mode - Task Selection */}
        {sourceMode === 'tasks' && (
          <>
            {/* Task selection header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-muted/30">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedTaskIds.length} of {doneTasks.length} tasks selected
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSelectAll}
                    className="h-7 px-2 text-xs"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDeselectAll}
                    className="h-7 px-2 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {/* Task grid */}
            <ScrollArea className="flex-1 p-6">
              {doneTasks.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
                    <h3 className="mt-4 text-lg font-medium">No Completed Tasks</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-md">
                      Complete tasks in the Kanban board and mark them as "Done" to include them in your changelog.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doneTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isSelected={selectedTaskIds.includes(task.id)}
                      onToggle={() => onToggle(task.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* Git History / Branch Diff Mode - Commit Preview */}
        {(sourceMode === 'git-history' || sourceMode === 'branch-diff') && (
          <>
            {/* Commit preview header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-muted/30">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {previewCommits.length} commit{previewCommits.length !== 1 ? 's' : ''} found
                </span>
                {isLoadingCommits && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Commit list */}
            <ScrollArea className="flex-1 p-6">
              {isLoadingCommits ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center py-12">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="mt-4 text-sm text-muted-foreground">Loading commits...</p>
                  </div>
                </div>
              ) : previewCommits.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center py-12">
                    <GitCommit className="mx-auto h-12 w-12 text-muted-foreground/30" />
                    <h3 className="mt-4 text-lg font-medium">No Commits Found</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-md">
                      {sourceMode === 'git-history'
                        ? 'Configure the history options and click "Load Commits" to preview.'
                        : 'Select both branches and click "Load Commits" to see the changes.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {previewCommits.map((commit) => (
                    <CommitCard key={commit.fullHash} commit={commit} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* Footer with Continue button */}
        <div className="flex items-center justify-end border-t border-border px-6 py-4 bg-background">
          <Button onClick={onContinue} disabled={!canContinue} size="lg">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
            {canContinue && (
              <Badge variant="secondary" className="ml-2">
                {getSummaryCount()} {getSummaryLabel()}{getSummaryCount() !== 1 ? 's' : ''}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CommitCardProps {
  commit: GitCommitType;
}

function CommitCard({ commit }: CommitCardProps) {
  const commitDate = new Date(commit.date).toLocaleDateString();

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3 bg-background">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
        <GitCommit className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight line-clamp-2">{commit.subject}</p>
          <code className="text-xs text-muted-foreground font-mono shrink-0">{commit.hash}</code>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span>{commit.author}</span>
          <span>{commitDate}</span>
          {commit.filesChanged !== undefined && (
            <span>
              {commit.filesChanged} file{commit.filesChanged !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: ChangelogTask;
  isSelected: boolean;
  onToggle: () => void;
}

function TaskCard({ task, isSelected, onToggle }: TaskCardProps) {
  const completedDate = new Date(task.completedAt).toLocaleDateString();

  return (
    <label
      className={cn(
        'flex flex-col rounded-lg border p-4 cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/30'
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-tight">{task.title}</h3>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            {task.hasSpecs && (
              <Badge variant="secondary" className="text-xs">
                Has Specs
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {completedDate}
            </span>
          </div>
        </div>
      </div>
    </label>
  );
}

interface Step2Props {
  sourceMode: ChangelogSourceMode;
  selectedTaskIds: string[];
  doneTasks: ChangelogTask[];
  previewCommits: GitCommitType[];
  existingChangelog: { lastVersion?: string } | null;
  version: string;
  versionReason: string | null;
  date: string;
  format: ChangelogFormat;
  audience: ChangelogAudience;
  customInstructions: string;
  generationProgress: { stage: string; progress: number; message?: string; error?: string } | null;
  generatedChangelog: string;
  isGenerating: boolean;
  error: string | null;
  showAdvanced: boolean;
  saveSuccess: boolean;
  copySuccess: boolean;
  canGenerate: boolean;
  canSave: boolean;
  onBack: () => void;
  onVersionChange: (v: string) => void;
  onDateChange: (d: string) => void;
  onFormatChange: (f: ChangelogFormat) => void;
  onAudienceChange: (a: ChangelogAudience) => void;
  onCustomInstructionsChange: (i: string) => void;
  onShowAdvancedChange: (show: boolean) => void;
  onGenerate: () => void;
  onSave: () => void;
  onCopy: () => void;
  onChangelogEdit: (content: string) => void;
}

function Step2ConfigureGenerate({
  sourceMode,
  selectedTaskIds,
  doneTasks,
  previewCommits,
  existingChangelog,
  version,
  versionReason,
  date,
  format,
  audience,
  customInstructions,
  generationProgress,
  generatedChangelog,
  isGenerating,
  error,
  showAdvanced,
  saveSuccess,
  copySuccess,
  canGenerate,
  canSave,
  onBack,
  onVersionChange,
  onDateChange,
  onFormatChange,
  onAudienceChange,
  onCustomInstructionsChange,
  onShowAdvancedChange,
  onGenerate,
  onSave,
  onCopy,
  onChangelogEdit
}: Step2Props) {
  const selectedTasks = doneTasks.filter((t) => selectedTaskIds.includes(t.id));

  // Get summary info based on source mode
  const getSummaryInfo = () => {
    switch (sourceMode) {
      case 'tasks':
        return {
          count: selectedTaskIds.length,
          label: 'task',
          details: selectedTasks.slice(0, 3).map((t) => t.title).join(', ') +
            (selectedTasks.length > 3 ? ` +${selectedTasks.length - 3} more` : '')
        };
      case 'git-history':
      case 'branch-diff':
        return {
          count: previewCommits.length,
          label: 'commit',
          details: previewCommits.slice(0, 3).map((c) => c.subject.substring(0, 40)).join(', ') +
            (previewCommits.length > 3 ? ` +${previewCommits.length - 3} more` : '')
        };
      default:
        return { count: 0, label: 'item', details: '' };
    }
  };

  const summaryInfo = getSummaryInfo();

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Panel - Configuration */}
      <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Back button and task summary */}
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Selection
            </Button>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                {sourceMode === 'tasks' ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <GitCommit className="h-4 w-4" />
                )}
                Including {summaryInfo.count} {summaryInfo.label}{summaryInfo.count !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {summaryInfo.details}
              </div>
            </div>
          </div>

          {/* Version & Date */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Release Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => onVersionChange(e.target.value)}
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => onDateChange(e.target.value)}
                />
              </div>
              {(existingChangelog?.lastVersion || versionReason) && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {existingChangelog?.lastVersion && (
                    <p>Previous: {existingChangelog.lastVersion}</p>
                  )}
                  {versionReason && (
                    <p className="text-primary/70">
                      {versionReason === 'breaking'
                        ? 'Major version bump (breaking changes detected)'
                        : versionReason === 'feature'
                          ? 'Minor version bump (new features detected)'
                          : 'Patch version bump (fixes/improvements)'}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Format & Audience */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Output Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={format}
                  onValueChange={(value) => onFormatChange(value as ChangelogFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANGELOG_FORMAT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <div>
                          <div>{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {CHANGELOG_FORMAT_DESCRIPTIONS[value]}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={audience}
                  onValueChange={(value) => onAudienceChange(value as ChangelogAudience)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANGELOG_AUDIENCE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        <div>
                          <div>{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {CHANGELOG_AUDIENCE_DESCRIPTIONS[value]}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={onShowAdvancedChange}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                Advanced Options
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="instructions">Custom Instructions</Label>
                    <Textarea
                      id="instructions"
                      value={customInstructions}
                      onChange={(e) => onCustomInstructionsChange(e.target.value)}
                      placeholder="Add any special instructions for the AI..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional. Guide the AI on tone, specific details to include, etc.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Generate Button */}
          <Button
            className="w-full"
            onClick={onGenerate}
            disabled={!canGenerate}
            size="lg"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Changelog
              </>
            )}
          </Button>

          {/* Progress */}
          {generationProgress && isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{CHANGELOG_STAGE_LABELS[generationProgress.stage]}</span>
                <span>{generationProgress.progress}%</span>
              </div>
              <Progress value={generationProgress.progress} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <span className="text-destructive">{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <h2 className="font-medium">Preview</h2>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCopy}
                  disabled={!canSave}
                >
                  {copySuccess ? (
                    <CheckCircle className="mr-2 h-4 w-4 text-success" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copySuccess ? 'Copied!' : 'Copy'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onSave}
                  disabled={!canSave}
                >
                  {saveSuccess ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saveSuccess ? 'Saved!' : 'Save to CHANGELOG.md'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Prepend to CHANGELOG.md in project root
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden p-6">
          {generatedChangelog ? (
            <Textarea
              className="h-full w-full resize-none font-mono text-sm"
              value={generatedChangelog}
              onChange={(e) => onChangelogEdit(e.target.value)}
              placeholder="Generated changelog will appear here..."
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Click "Generate Changelog" to create release notes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Step3Props {
  projectId: string;
  version: string;
  selectedTaskIds: string[];
  doneTasks: ChangelogTask[];
  generatedChangelog: string;
  onDone: () => void;
}

function Step3ReleaseArchive({
  projectId,
  version,
  selectedTaskIds,
  doneTasks,
  generatedChangelog,
  onDone
}: Step3Props) {
  const [isCreatingRelease, setIsCreatingRelease] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const selectedTasks = doneTasks.filter((t) => selectedTaskIds.includes(t.id));
  const tag = version.startsWith('v') ? version : `v${version}`;

  const handleCreateRelease = async () => {
    setIsCreatingRelease(true);
    setReleaseError(null);
    try {
      const result = await window.electronAPI.createGitHubRelease(
        projectId,
        version,
        generatedChangelog
      );
      if (result.success && result.data) {
        setReleaseUrl(result.data.url);
      } else {
        setReleaseError(result.error || 'Failed to create release');
      }
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'Failed to create release');
    } finally {
      setIsCreatingRelease(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    setArchiveError(null);
    try {
      const result = await window.electronAPI.archiveTasks(projectId, selectedTaskIds, version);
      if (result.success) {
        setArchiveSuccess(true);
      } else {
        setArchiveError(result.error || 'Failed to archive tasks');
      }
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Failed to archive tasks');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-8">
        {/* Success Message */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
            <PartyPopper className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-2xl font-semibold">Changelog Saved!</h2>
          <p className="text-muted-foreground mt-2">
            Version {tag} has been added to CHANGELOG.md
          </p>
        </div>

        {/* Action Cards */}
        <div className="space-y-4">
          {/* GitHub Release */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                <CardTitle className="text-base">Create GitHub Release</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {releaseUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm">Release created successfully!</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open(releaseUrl, '_blank')}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Release on GitHub
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Create a new release {tag} on GitHub with the changelog as release notes.
                  </p>
                  {releaseError && (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{releaseError}</span>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleCreateRelease}
                    disabled={isCreatingRelease}
                  >
                    {isCreatingRelease ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Creating Release...
                      </>
                    ) : (
                      <>
                        <Github className="mr-2 h-4 w-4" />
                        Create Release {tag}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Archive Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                <CardTitle className="text-base">Archive Completed Tasks</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {archiveSuccess ? (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">
                    {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} archived!
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Archive {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} to
                    clean up your Kanban board. Archived tasks can be viewed using the "Show
                    Archived" toggle.
                  </p>
                  {archiveError && (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{archiveError}</span>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleArchive}
                    disabled={isArchiving}
                  >
                    {isArchiving ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Archiving...
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-4 w-4" />
                        Archive {selectedTasks.length} Task{selectedTasks.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Done Button */}
        <div className="pt-4">
          <Button className="w-full" size="lg" onClick={onDone}>
            <Check className="mr-2 h-4 w-4" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
