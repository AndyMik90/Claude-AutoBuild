import { useState, useEffect } from 'react';
import {
  Github,
  GitBranch,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { GitHubOAuthFlow } from './project-settings/GitHubOAuthFlow';
import type { Project, ProjectSettings } from '../../shared/types';

interface GitHubSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onComplete: (settings: { githubToken: string; githubRepo: string; mainBranch: string }) => void;
  onSkip?: () => void;
}

type SetupStep = 'auth' | 'repo' | 'branch' | 'complete';

/**
 * GitHub Setup Modal - Required setup flow after Auto Claude initialization
 *
 * Flow:
 * 1. Authenticate with GitHub (via gh CLI OAuth)
 * 2. Detect/confirm repository
 * 3. Select base branch for tasks (with recommended default)
 */
export function GitHubSetupModal({
  open,
  onOpenChange,
  project,
  onComplete,
  onSkip
}: GitHubSetupModalProps) {
  const [step, setStep] = useState<SetupStep>('auth');
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [detectedRepo, setDetectedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [recommendedBranch, setRecommendedBranch] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('auth');
      setGithubToken(null);
      setGithubRepo(null);
      setDetectedRepo(null);
      setBranches([]);
      setSelectedBranch(null);
      setRecommendedBranch(null);
      setError(null);
    }
  }, [open]);

  // Detect repository from git remote when auth succeeds
  const detectRepository = async () => {
    setIsLoadingRepo(true);
    setError(null);

    try {
      // Try to detect repo from git remote
      const result = await window.electronAPI.detectGitHubRepo(project.path);
      if (result.success && result.data) {
        setDetectedRepo(result.data);
        setGithubRepo(result.data);
        setStep('branch');
        // Immediately load branches
        await loadBranches(result.data);
      } else {
        // No remote detected, show repo input step
        setStep('repo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect repository');
      setStep('repo');
    } finally {
      setIsLoadingRepo(false);
    }
  };

  // Load branches from GitHub
  const loadBranches = async (repo: string) => {
    setIsLoadingBranches(true);
    setError(null);

    try {
      // Get branches from GitHub API
      const result = await window.electronAPI.getGitHubBranches(repo, githubToken!);
      if (result.success && result.data) {
        setBranches(result.data);

        // Detect recommended branch (main > master > develop > first)
        const recommended = detectRecommendedBranch(result.data);
        setRecommendedBranch(recommended);
        setSelectedBranch(recommended);
      } else {
        setError(result.error || 'Failed to load branches');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  // Detect recommended branch from list
  const detectRecommendedBranch = (branchList: string[]): string | null => {
    const priorities = ['main', 'master', 'develop', 'dev'];
    for (const priority of priorities) {
      if (branchList.includes(priority)) {
        return priority;
      }
    }
    return branchList[0] || null;
  };

  // Handle OAuth success
  const handleAuthSuccess = async (token: string) => {
    setGithubToken(token);
    // Move to repo detection
    await detectRepository();
  };

  // Handle branch selection complete
  const handleComplete = () => {
    if (githubToken && githubRepo && selectedBranch) {
      onComplete({
        githubToken,
        githubRepo,
        mainBranch: selectedBranch
      });
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'auth':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Connect to GitHub
              </DialogTitle>
              <DialogDescription>
                Auto Claude requires GitHub to manage your code branches and keep tasks up to date.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <GitHubOAuthFlow
                onSuccess={handleAuthSuccess}
                onCancel={onSkip}
              />
            </div>
          </>
        );

      case 'repo':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Repository Not Detected
              </DialogTitle>
              <DialogDescription>
                We couldn't detect a GitHub repository for this project. Please ensure your project has a GitHub remote configured.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">No GitHub remote found</p>
                    <p className="text-xs text-muted-foreground">
                      To use Auto Claude, your project needs to be connected to a GitHub repository.
                    </p>
                    <div className="text-xs font-mono bg-muted p-2 rounded mt-2">
                      git remote add origin https://github.com/owner/repo.git
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              {onSkip && (
                <Button variant="outline" onClick={onSkip}>
                  Skip for now
                </Button>
              )}
              <Button onClick={detectRepository} disabled={isLoadingRepo}>
                {isLoadingRepo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Retry Detection'
                )}
              </Button>
            </DialogFooter>
          </>
        );

      case 'branch':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Select Base Branch
              </DialogTitle>
              <DialogDescription>
                Choose which branch Auto Claude should use as the base for creating task branches.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Show detected repo */}
              {detectedRepo && (
                <div className="flex items-center gap-2 text-sm">
                  <Github className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Repository:</span>
                  <code className="px-2 py-0.5 bg-muted rounded font-mono text-xs">
                    {detectedRepo}
                  </code>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
              )}

              {/* Branch selector */}
              <div className="space-y-2">
                <Label>Base Branch</Label>
                <Select
                  value={selectedBranch || ''}
                  onValueChange={setSelectedBranch}
                  disabled={isLoadingBranches || branches.length === 0}
                >
                  <SelectTrigger>
                    {isLoadingBranches ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Loading branches...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Select a branch" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        <div className="flex items-center gap-2">
                          <span>{branch}</span>
                          {branch === recommendedBranch && (
                            <span className="flex items-center gap-1 text-xs text-success">
                              <Sparkles className="h-3 w-3" />
                              Recommended
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All tasks will be created from branches like{' '}
                  <code className="px-1 bg-muted rounded">auto-claude/task-name</code>
                  {selectedBranch && (
                    <> based on <code className="px-1 bg-muted rounded">{selectedBranch}</code></>
                  )}
                </p>
              </div>

              {/* Info about branch selection */}
              <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-info mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Why select a branch?</p>
                    <p className="mt-1">
                      Auto Claude creates isolated workspaces for each task. Selecting the right base branch ensures
                      your tasks start with the latest code from your main development line.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              {onSkip && (
                <Button variant="outline" onClick={onSkip}>
                  Skip for now
                </Button>
              )}
              <Button
                onClick={handleComplete}
                disabled={!selectedBranch || isLoadingBranches}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Complete Setup
              </Button>
            </DialogFooter>
          </>
        );

      case 'complete':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Setup Complete
              </DialogTitle>
            </DialogHeader>

            <div className="py-8 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Auto Claude is ready to use! You can now create tasks that will be
                automatically based on <code className="px-1 bg-muted rounded">{selectedBranch}</code>.
              </p>
            </div>
          </>
        );
    }
  };

  // Progress indicator
  const renderProgress = () => {
    const steps: { key: SetupStep; label: string }[] = [
      { key: 'auth', label: 'Connect' },
      { key: 'branch', label: 'Configure' },
    ];

    // Don't show progress on complete step
    if (step === 'complete') return null;

    const currentIndex = step === 'auth' ? 0 : step === 'repo' ? 0 : 1;

    return (
      <div className="flex items-center justify-center gap-2 mb-4">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                index < currentIndex
                  ? 'bg-success text-success-foreground'
                  : index === currentIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < currentIndex ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span className={`ml-2 text-xs ${
              index === currentIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}>
              {s.label}
            </span>
            {index < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {renderProgress()}
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
