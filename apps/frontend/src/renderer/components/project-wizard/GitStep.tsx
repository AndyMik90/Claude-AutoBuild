import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, CheckCircle2, AlertCircle, Loader2, FolderGit2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { Project } from '../../../shared/types';

interface GitStepProps {
  project: Project | null;
  gitInitialized: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

type StepState = 'info' | 'initializing' | 'success';

/**
 * Git initialization step
 */
export function GitStep({ project, gitInitialized, onComplete, onSkip, onBack }: GitStepProps) {
  const { t } = useTranslation('project-wizard');
  const [step, setStep] = useState<StepState>('info');
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<{ isGitRepo: boolean; hasCommits: boolean } | null>(null);

  // Check git status on mount
  useEffect(() => {
    const checkGitStatus = async () => {
      if (!project) return;
      try {
        const status = await window.electronAPI.checkGitStatus(project.path);
        if (status.success && status.data) {
          setGitStatus({
            isGitRepo: status.data.isGitRepo,
            hasCommits: status.data.hasCommits
          });
        }
      } catch {
        // Ignore errors
      }
    };
    checkGitStatus();
  }, [project]);

  // If already initialized, show success state
  useEffect(() => {
    if (gitInitialized || (gitStatus && gitStatus.isGitRepo && gitStatus.hasCommits)) {
      setStep('success');
    }
  }, [gitInitialized, gitStatus]);

  const handleInitializeGit = async () => {
    if (!project) return;

    setIsInitializing(true);
    setError(null);
    setStep('initializing');

    try {
      // Call the backend to initialize git
      const result = await window.electronAPI.initializeGit(project.path);

      if (result.success) {
        setStep('success');
        // Wait a moment to show success, then trigger callback
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setError(result.error || 'Failed to initialize git');
        setStep('info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize git');
      setStep('info');
    } finally {
      setIsInitializing(false);
    }
  };

  const needsGitInit = gitStatus && !gitStatus.isGitRepo;
  const needsCommit = gitStatus && gitStatus.isGitRepo && !gitStatus.hasCommits;

  const renderInfoStep = () => (
    <>
      <div className="flex h-full flex-col items-center justify-center px-8 py-6">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FolderGit2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {t('git.title')}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {t('git.description')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('git.optionalLabel')}
            </p>
          </div>

          {/* Status indicator */}
          <div className="rounded-lg bg-muted p-5 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {needsGitInit
                    ? t('git.notGitRepo')
                    : t('git.noCommits')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {needsGitInit
                    ? t('git.needsInit')
                    : t('git.needsCommit')}
                </p>
              </div>
            </div>
          </div>

          {/* What will happen */}
          <div className="rounded-lg border border-border p-5 mb-6">
            <p className="font-medium text-sm mb-3">{t('git.willSetup')}</p>
            <ul className="space-y-2">
              {needsGitInit && (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4 text-primary" />
                  {t('git.initRepo')}
                </li>
              )}
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('git.createCommit')}
              </li>
            </ul>
          </div>

          {/* Manual instructions for advanced users */}
          <details className="text-sm mb-6">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t('git.manual')}
            </summary>
            <div className="mt-3 rounded-lg bg-muted/50 p-4 font-mono text-xs space-y-1">
              <p className="text-muted-foreground">{t('git.manualInstructions')}</p>
              {needsGitInit && <p>git init</p>}
              <p>git add .</p>
              <p>git commit -m "Initial commit"</p>
            </div>
          </details>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-6" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between px-8 pb-6">
        <Button variant="outline" onClick={onBack}>
          {t('project.back')}
        </Button>
        <Button onClick={handleInitializeGit} disabled={isInitializing}>
          <GitBranch className="mr-2 h-4 w-4" />
          {isInitializing ? t('git.settingUp') : t('git.initialize')}
        </Button>
      </div>
    </>
  );

  const renderInitializingStep = () => (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="text-center">
        <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto mb-6" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {t('git.settingUp')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('git.initializingRepo')}
        </p>
      </div>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t('git.success')}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t('git.readyToUse')}
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onBack}>
            {t('project.back')}
          </Button>
          <Button onClick={onComplete}>
            {t('project.continue')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {step === 'info' && renderInfoStep()}
      {step === 'initializing' && renderInitializingStep()}
      {step === 'success' && renderSuccessStep()}
    </>
  );
}
