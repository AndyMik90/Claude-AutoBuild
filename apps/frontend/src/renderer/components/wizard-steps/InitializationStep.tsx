import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  GitBranch,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

interface InitializationStepProps {
  projectPath: string;
  onNext: () => void;
  isCreating?: boolean;
  /** Callback when Auto Claude is successfully initialized */
  onAutoClaudeInitialized?: () => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

interface InitializationState {
  status: Status;
  error: string | null;
}

/**
 * Initialization step for projects without remote repository.
 * Handles Git initialization (required) and Auto Claude setup (optional).
 *
 * Git initializes automatically on mount.
 * Auto Claude initialization is user-initiated via button.
 */
export function InitializationStep({
  projectPath,
  onNext,
  isCreating = false,
  onAutoClaudeInitialized
}: InitializationStepProps) {
  const { t } = useTranslation('dialogs');

  const [gitState, setGitState] = useState<InitializationState>({
    status: 'idle',
    error: null
  });
  const [autoClaudeState, setAutoClaudeState] = useState<InitializationState>({
    status: 'idle',
    error: null
  });

  // Initialize Git on mount (required)
  const initializeGit = useCallback(async () => {
    setGitState({ status: 'loading', error: null });

    try {
      const result = await window.electronAPI.initializeGit(projectPath);

      if (result.success) {
        setGitState({ status: 'success', error: null });
      } else {
        setGitState({
          status: 'error',
          error: result.error || 'Failed to initialize Git repository'
        });
      }
    } catch (err) {
      setGitState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to initialize Git repository'
      });
    }
  }, [projectPath]);

  useEffect(() => {
    if (projectPath && gitState.status === 'idle') {
      initializeGit();
    }
  }, [projectPath, gitState.status, initializeGit]);

  const initializeAutoClaude = async () => {
    setAutoClaudeState({ status: 'loading', error: null });

    try {
      const result = await window.electronAPI.initializeProjectByPath(projectPath);

      if (result.success) {
        setAutoClaudeState({ status: 'success', error: null });
        // Notify parent that Auto Claude was initialized
        onAutoClaudeInitialized?.();
      } else {
        setAutoClaudeState({
          status: 'error',
          error: result.error || 'Failed to initialize Auto Claude'
        });
      }
    } catch (err) {
      setAutoClaudeState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to initialize Auto Claude'
      });
    }
  };

  const canProceed = gitState.status === 'success';
  const hasError = gitState.status === 'error' || autoClaudeState.status === 'error';

  return (
    <div className="space-y-6 py-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">
          {t('wizard.steps.initialize.title', 'Initialize Project')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('wizard.steps.initialize.description', 'Set up your project for development')}
        </p>
      </div>

      {/* Git Initialization Card (Required) */}
      <StatusCard
        icon={GitBranch}
        title={t('wizard.steps.initialize.git.title', 'Git Repository')}
        description={t('wizard.steps.initialize.git.description', 'Initialize Git for version control')}
        status={gitState.status}
        error={gitState.error}
        onRetry={initializeGit}
        isRequired
      />

      {/* Auto Claude Initialization Card (Optional) */}
      <StatusCard
        icon={Sparkles}
        title={t('wizard.steps.initialize.autoClaude.title', 'Auto Claude Setup')}
        description={t('wizard.steps.initialize.autoClaude.description', 'Enable AI-powered development features')}
        status={autoClaudeState.status}
        error={autoClaudeState.error}
        onRetry={initializeAutoClaude}
        isRequired={false}
        buttonText={
          autoClaudeState.status === 'idle'
            ? t('wizard.steps.initialize.autoClaude.initialize', 'Initialize')
            : undefined
        }
        onActionClick={initializeAutoClaude}
      />

      {/* Error Notice */}
      {hasError && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-destructive">
              {t('wizard.steps.initialize.errorTitle', 'Some actions failed')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('wizard.steps.initialize.errorDescription', 'You can retry the failed actions above, or continue anyway.')}
            </p>
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={onNext}
          disabled={!canProceed || isCreating}
          size="lg"
          className="gap-2"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('wizard.steps.initialize.proceeding', 'Proceeding...')}
            </>
          ) : (
            t('wizard.steps.initialize.continue', 'Continue')
          )}
        </Button>
      </div>
    </div>
  );
}

interface StatusCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  status: Status;
  error: string | null;
  onRetry: () => void;
  isRequired: boolean;
  buttonText?: string;
  onActionClick?: () => void;
}

function StatusCard({
  icon: Icon,
  title,
  description,
  status,
  error,
  onRetry,
  isRequired,
  buttonText,
  onActionClick
}: StatusCardProps) {
  const { t } = useTranslation('dialogs');

  const getStatusIndicator = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        );
      case 'success':
        return (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
        );
      case 'error':
        return (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
        );
      default:
        return (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        );
    }
  };

  const getActionButton = () => {
    if (status === 'loading') return null;
    if (status === 'error') {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          {t('wizard.steps.initialize.retry', 'Retry')}
        </Button>
      );
    }
    if (status === 'idle' && !isRequired && buttonText && onActionClick) {
      return (
        <Button
          variant="default"
          size="sm"
          onClick={onActionClick}
        >
          {buttonText}
        </Button>
      );
    }
    return null;
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return isRequired
          ? t('wizard.steps.initialize.git.loading', 'Initializing Git repository...')
          : t('wizard.steps.initialize.autoClaude.loading', 'Setting up Auto Claude...');
      case 'success':
        return isRequired
          ? t('wizard.steps.initialize.git.success', 'Git repository initialized')
          : t('wizard.steps.initialize.autoClaude.success', 'Auto Claude ready');
      case 'error':
        return error || t('wizard.steps.initialize.error', 'Failed to initialize');
      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        status === 'success' && 'border-success/30 bg-success/5',
        status === 'error' && 'border-destructive/30 bg-destructive/5',
        status === 'loading' && 'border-primary/30 bg-primary/5'
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Status Icon */}
          {getStatusIndicator()}

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  {isRequired && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {t('wizard.steps.initialize.required', 'Required')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              {getActionButton()}
            </div>

            {/* Status Message */}
            {getStatusMessage() && (
              <p
                className={cn(
                  'text-sm font-medium',
                  status === 'success' && 'text-success',
                  status === 'error' && 'text-destructive',
                  status === 'loading' && 'text-primary'
                )}
              >
                {getStatusMessage()}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
