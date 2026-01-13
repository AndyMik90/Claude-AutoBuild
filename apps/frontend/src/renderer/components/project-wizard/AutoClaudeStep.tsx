import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, AlertCircle, CheckCircle2, Loader2, FileCode } from 'lucide-react';
import { Button } from '../ui/button';
import type { Project } from '../../../shared/types';

interface AutoClaudeStepProps {
  project: Project | null;
  autoClaudeInitialized: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
}

type StepState = 'info' | 'initializing' | 'success';

/**
 * Auto Claude initialization step
 */
export function AutoClaudeStep({
  project,
  autoClaudeInitialized,
  onComplete,
  onSkip,
  onBack
}: AutoClaudeStepProps) {
  const { t } = useTranslation('project-wizard');
  const [step, setStep] = useState<StepState>('info');
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoBuildPath, setAutoBuildPath] = useState<string | null>(null);

  // Load settings to get autoBuildPath
  useEffect(() => {
    window.electronAPI.getSettings().then(result => {
      if (result.success && result.data?.autoBuildPath) {
        setAutoBuildPath(result.data.autoBuildPath);
      }
    }).catch(err => {
      console.error('Failed to get settings in AutoClaudeStep:', err);
    });
  }, []);

  // If already initialized, show success state
  useEffect(() => {
    if (autoClaudeInitialized || project?.autoBuildPath) {
      setStep('success');
    }
  }, [autoClaudeInitialized, project]);

  const handleInitialize = async () => {
    if (!project) {
      setError('Project not available');
      return;
    }

    setIsInitializing(true);
    setError(null);
    setStep('initializing');

    try {
      const result = await window.electronAPI.initializeProject(project.id);

      if (result.success) {
        setStep('success');
        // Wait a moment to show success, then trigger callback
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setError(result.error || 'Failed to initialize Auto Claude');
        setStep('info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Auto Claude');
      setStep('info');
    } finally {
      setIsInitializing(false);
    }
  };

  const renderInfoStep = () => (
    <>
      <div className="flex h-full flex-col items-center justify-center px-8 py-6">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileCode className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {t('autoclaude.title')}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {t('autoclaude.description')}
            </p>
          </div>

          {/* What will happen */}
          <div className="rounded-lg border border-border p-5 mb-6">
            <p className="font-medium text-sm mb-3">{t('autoclaude.willDo')}</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('autoclaude.createFolder')}
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('autoclaude.copyFramework')}
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('autoclaude.setupSpecs')}
              </li>
            </ul>
          </div>

          {/* Warning if source path not configured */}
          {!autoBuildPath && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-warning text-sm">{t('autoclaude.sourcePathNotConfigured')}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {t('autoclaude.sourcePathNotConfiguredDescription')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-6" role="alert">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('autoclaude.failedToInitialize')}</p>
                  <p className="text-xs mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between px-8 pb-6">
        <Button variant="outline" onClick={onBack}>
          {t('project.back')}
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSkip}>
            {t('autoclaude.skip')}
          </Button>
          <Button
            onClick={handleInitialize}
            disabled={isInitializing || !autoBuildPath}
          >
            {isInitializing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('autoclaude.initializing')}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t('autoclaude.initialize')}
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );

  const renderInitializingStep = () => (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="text-center">
        <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto mb-6" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {t('autoclaude.initializing')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('autoclaude.description')}
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
          {t('autoclaude.success')}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t('autoclaude.readyToUse')}
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
