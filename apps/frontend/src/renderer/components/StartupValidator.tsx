import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

/**
 * Environment validation status types (matches environment-handlers.ts)
 */
export interface EnvironmentValidationStatus {
  isValidating: boolean;
  isComplete: boolean;
  buildToolsResult: {
    success: boolean;
    platform: string;
    missingTools: string[];
    errors: string[];
    installationInstructions: string;
  } | null;
  environmentResult: {
    success: boolean;
    bundled: { success: boolean; errors: string[] } | null;
    venv: { success: boolean; errors: string[] } | null;
    summary: string;
  } | null;
  overallSuccess: boolean;
  lastValidatedAt: string | null;
}

/**
 * Validation phase enum for UI display
 */
type ValidationPhase = 'idle' | 'checking-tools' | 'checking-python' | 'complete' | 'error';

/**
 * Hook to detect user's reduced motion preference.
 */
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reducedMotion;
}

interface StartupValidatorProps {
  /** Called when validation completes successfully */
  onComplete?: () => void;
  /** Called when user chooses to skip validation */
  onSkip?: () => void;
  /** Whether to auto-start validation on mount */
  autoStart?: boolean;
  /** Optional CSS class */
  className?: string;
}

/**
 * StartupValidator Component
 *
 * Displays validation progress and errors during app startup.
 * Checks system build tools (make, cmake) and Python environments.
 */
export function StartupValidator({
  onComplete,
  onSkip,
  autoStart = true,
  className
}: StartupValidatorProps) {
  const reducedMotion = useReducedMotion();

  // Validation state
  const [status, setStatus] = useState<EnvironmentValidationStatus | null>(null);
  const [phase, setPhase] = useState<ValidationPhase>('idle');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedCommand, setCopiedCommand] = useState(false);

  /**
   * Start the validation process
   */
  const startValidation = useCallback(async () => {
    setPhase('checking-tools');
    setProgressMessage('Checking system build tools (make, cmake)...');

    try {
      const result = await window.electronAPI?.startValidation?.();

      if (result?.success && result.data) {
        setStatus(result.data);
        if (result.data.overallSuccess) {
          setPhase('complete');
          onComplete?.();
        } else {
          setPhase('error');
        }
      } else {
        setPhase('error');
        setProgressMessage(result?.error || 'Validation failed');
      }
    } catch (error) {
      setPhase('error');
      setProgressMessage(error instanceof Error ? error.message : 'Unexpected error during validation');
    }
  }, [onComplete]);

  /**
   * Retry validation
   */
  const handleRetry = useCallback(() => {
    setStatus(null);
    setPhase('idle');
    setProgressMessage('');
    startValidation();
  }, [startValidation]);

  /**
   * Copy installation command to clipboard
   */
  const handleCopyCommand = useCallback((command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }, []);

  // Set up IPC listeners for progress events
  useEffect(() => {
    // Skip if not in Electron context
    if (!window.electronAPI) {
      return;
    }

    // Listen for progress updates
    const cleanupProgress = window.electronAPI.onValidationProgress?.((message: string) => {
      setProgressMessage(message);
      if (message.toLowerCase().includes('python')) {
        setPhase('checking-python');
      }
    });

    // Listen for completion
    const cleanupComplete = window.electronAPI.onValidationComplete?.((validationStatus: EnvironmentValidationStatus) => {
      setStatus(validationStatus);
      if (validationStatus.overallSuccess) {
        setPhase('complete');
        onComplete?.();
      } else {
        setPhase('error');
      }
    });

    // Listen for errors
    const cleanupError = window.electronAPI.onValidationError?.((errorMessage: string) => {
      setPhase('error');
      setProgressMessage(errorMessage);
    });

    return () => {
      cleanupProgress?.();
      cleanupComplete?.();
      cleanupError?.();
    };
  }, [onComplete]);

  // Auto-start validation if enabled
  useEffect(() => {
    if (autoStart && phase === 'idle') {
      startValidation();
    }
  }, [autoStart, phase, startValidation]);

  // Don't render if complete and successful (validation passed, app can proceed)
  if (phase === 'complete' && status?.overallSuccess) {
    return null;
  }

  // Animation values respecting reduced motion
  const spinAnimation = reducedMotion ? {} : { rotate: 360 };
  const spinTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 1, repeat: Infinity, ease: 'linear' as const };

  const pulseAnimation = reducedMotion ? {} : { scale: [1, 1.05, 1] };
  const pulseTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const };

  // Get platform-specific installation instructions
  const getInstallInstructions = () => {
    if (!status?.buildToolsResult) return null;

    const { platform, missingTools, installationInstructions } = status.buildToolsResult;

    if (missingTools.length === 0) return null;

    // Default instructions based on platform
    const defaultInstructions: Record<string, string> = {
      Darwin: `brew install ${missingTools.join(' ')}`,
      Windows: `choco install ${missingTools.join(' ')} -y`,
      Linux: `sudo apt-get install ${missingTools.join(' ')}`
    };

    return installationInstructions || defaultInstructions[platform] || `Install: ${missingTools.join(', ')}`;
  };

  return (
    <div className={cn('p-6 rounded-xl bg-card border shadow-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            {phase === 'checking-tools' || phase === 'checking-python' ? (
              <motion.div
                animate={spinAnimation}
                transition={spinTransition}
              >
                <Loader2 className="h-6 w-6 text-primary" />
              </motion.div>
            ) : phase === 'complete' ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : phase === 'error' ? (
              <AlertCircle className="h-6 w-6 text-destructive" />
            ) : (
              <Settings className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-lg">Environment Validation</h3>
            <p className="text-sm text-muted-foreground">
              {phase === 'idle' && 'Ready to validate environment'}
              {phase === 'checking-tools' && 'Checking build tools...'}
              {phase === 'checking-python' && 'Validating Python environments...'}
              {phase === 'complete' && 'Validation complete'}
              {phase === 'error' && 'Validation issues found'}
            </p>
          </div>
        </div>

        {/* Expand/collapse toggle */}
        {phase === 'error' && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-muted rounded-md transition-colors"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>

      {/* Progress indicator */}
      {(phase === 'checking-tools' || phase === 'checking-python') && (
        <motion.div
          className="mb-4"
          animate={pulseAnimation}
          transition={pulseTransition}
        >
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="absolute h-full w-1/3 rounded-full bg-primary"
              animate={{ x: ['-100%', '400%'] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {progressMessage || 'Validating environment...'}
          </p>
        </motion.div>
      )}

      {/* Error details */}
      <AnimatePresence>
        {phase === 'error' && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Build tools errors */}
            {status?.buildToolsResult && !status.buildToolsResult.success && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">Missing Build Tools</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The following tools are required but not installed:
                      <span className="font-mono ml-1">
                        {status.buildToolsResult.missingTools.join(', ')}
                      </span>
                    </p>

                    {/* Installation command */}
                    {getInstallInstructions() && (
                      <div className="mt-3 p-3 rounded bg-background/50 border">
                        <p className="text-xs text-muted-foreground mb-2">
                          Install with ({status.buildToolsResult.platform}):
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono bg-muted px-2 py-1 rounded">
                            {getInstallInstructions()}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyCommand(getInstallInstructions()!)}
                          >
                            {copiedCommand ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Python environment errors */}
            {status?.environmentResult && !status.environmentResult.success && (
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-warning">Python Environment Issues</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {status.environmentResult.summary}
                    </p>

                    {/* Bundled Python errors */}
                    {status.environmentResult.bundled && !status.environmentResult.bundled.success && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Bundled Python:</p>
                        <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                          {status.environmentResult.bundled.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Venv Python errors */}
                    {status.environmentResult.venv && !status.environmentResult.venv.success && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Virtual Environment:</p>
                        <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                          {status.environmentResult.venv.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Generic error message */}
            {progressMessage && phase === 'error' && !status && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-destructive">Validation Error</p>
                    <p className="text-sm text-muted-foreground mt-1">{progressMessage}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 mt-4">
        {phase === 'error' && (
          <>
            <Button variant="outline" onClick={onSkip}>
              Skip for Now
            </Button>
            <Button onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Validation
            </Button>
          </>
        )}
        {phase === 'idle' && !autoStart && (
          <Button onClick={startValidation}>
            Start Validation
          </Button>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
        <StepIndicator
          label="Build Tools"
          status={
            phase === 'checking-tools'
              ? 'active'
              : status?.buildToolsResult?.success
                ? 'complete'
                : status?.buildToolsResult
                  ? 'error'
                  : 'pending'
          }
        />
        <div className={cn(
          'w-8 h-px',
          phase === 'checking-python' || status?.environmentResult
            ? 'bg-primary/50'
            : 'bg-border'
        )} />
        <StepIndicator
          label="Python"
          status={
            phase === 'checking-python'
              ? 'active'
              : status?.environmentResult?.success
                ? 'complete'
                : status?.environmentResult
                  ? 'error'
                  : 'pending'
          }
        />
      </div>
    </div>
  );
}

/**
 * Step indicator component
 */
function StepIndicator({
  label,
  status
}: {
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
        status === 'complete' && 'bg-success/10 text-success',
        status === 'active' && 'bg-primary/10 text-primary',
        status === 'error' && 'bg-destructive/10 text-destructive',
        status === 'pending' && 'bg-muted text-muted-foreground'
      )}
    >
      {status === 'complete' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'active' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'error' && <AlertCircle className="h-3 w-3" />}
      {label}
    </div>
  );
}

export default StartupValidator;
