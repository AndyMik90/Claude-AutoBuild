import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface Props {
  pythonPath: string;
  activationScript?: string;
  onValidationStateChange?: (isValidating: boolean) => void;
}

export function PythonPackageValidator({ pythonPath, activationScript, onValidationStateChange }: Props) {
  const { t } = useTranslation('settings');

  // Package validation state
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [missingPackages, setMissingPackages] = useState<string[]>([]);
  const [installLocation, setInstallLocation] = useState<string>('');
  const [validationProgress, setValidationProgress] = useState<{ current: number; total: number; packageName: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState('');
  const [error, setError] = useState<string>('');

  // Environment validation state
  const [envStatus, setEnvStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [envValidation, setEnvValidation] = useState<{
    valid: boolean;
    pythonPath: string | null;
    version: string | null;
    error: string | null;
    status: 'valid' | 'missing' | 'wrong_version' | 'error';
  } | null>(null);
  const [reinstalling, setReinstalling] = useState(false);
  const [reinstallProgress, setReinstallProgress] = useState<{ step: string; completed: number; total: number } | null>(null);

  // Track last validated paths to avoid re-validating unnecessarily
  const lastValidatedRef = useRef<{ pythonPath: string; activationScript: string | undefined }>({ pythonPath: '', activationScript: undefined });

  useEffect(() => {
    // Skip validation if paths haven't changed
    if (lastValidatedRef.current.pythonPath === pythonPath &&
        lastValidatedRef.current.activationScript === activationScript) {
      return;
    }

    // Defer validation to allow UI to render first (prevents blocking)
    const timeoutId = setTimeout(() => {
      lastValidatedRef.current = { pythonPath, activationScript };

      if (activationScript) {
        validateEnvironment();
      } else {
        checkPackages();
      }
    }, 100); // 100ms delay to let UI render

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkPackages and validateEnvironment are stable functions, only re-run on path changes
  }, [pythonPath, activationScript]);

  const checkPackages = async () => {
    setStatus('checking');
    setValidationProgress(null);
    setError('');

    // Listen for validation progress
    const unsubscribe = window.electronAPI.onPythonValidationProgress((progress) => {
      setValidationProgress({
        current: progress.current,
        total: progress.total,
        packageName: progress.packageName
      });
    });

    const result = await window.electronAPI.validatePythonPackages({
      pythonPath,
      activationScript
    });

    unsubscribe();

    if (result.success && result.data) {
      setStatus(result.data.allInstalled ? 'valid' : 'invalid');
      setMissingPackages(result.data.missingPackages || []);
      setInstallLocation(result.data.installLocation || '');
      setError('');
    } else {
      setStatus('invalid');
      setMissingPackages([]);
      setInstallLocation('');
      setError(result.error || 'Failed to validate packages. Check that your Python path points to a Python executable (python.exe), not a directory.');
    }

    setValidationProgress(null);
  };

  const installRequirements = async () => {
    setInstalling(true);
    setInstallProgress(t('python.installing'));
    setError('');

    const unsubscribe = window.electronAPI.onPythonInstallProgress((progress) => {
      setInstallProgress(progress);
    });

    const result = await window.electronAPI.installPythonRequirements({
      pythonPath,
      activationScript
    });

    unsubscribe();
    setInstalling(false);

    if (result.success) {
      setError('');
      await checkPackages();
    } else {
      setError(result.error || 'Installation failed. Check the progress output above for details.');
    }
  };

  const validateEnvironment = async () => {
    if (!activationScript) {
      checkPackages();
      return;
    }

    setEnvStatus('checking');
    setError('');

    try {
      const result = await window.electronAPI.validatePythonEnvironment({
        activationScript
      });

      if (result.success && result.data) {
        setEnvValidation(result.data);
        setEnvStatus(result.data.valid ? 'valid' : 'invalid');

        // If environment is valid, proceed to check packages
        if (result.data.valid) {
          await checkPackages();
        }
      } else {
        setEnvStatus('invalid');
        setError(result.error || 'Failed to validate Python environment');
      }
    } catch (error) {
      console.error('Error validating Python environment:', error);
      setEnvStatus('invalid');
      setError('Failed to validate Python environment: ' + String(error));
    }
  };

  const handleReinstallEnvironment = async () => {
    if (!activationScript) {
      setError('No activation script configured');
      return;
    }

    if (!confirm('⚠️ WARNING: This will DELETE the existing Python environment and reinstall Python 3.12.\n\nAll installed packages will be removed.\n\nContinue?')) {
      return;
    }

    setReinstalling(true);
    setError('');
    setReinstallProgress({ step: 'Starting...', completed: 0, total: 3 });

    const unsubscribe = window.electronAPI.onPythonReinstallProgress((progress) => {
      setReinstallProgress(progress);
    });

    const result = await window.electronAPI.reinstallPythonEnvironment({
      activationScript,
      pythonVersion: '3.12'
    });

    unsubscribe();
    setReinstalling(false);
    setReinstallProgress(null);

    if (result.success && result.data?.success) {
      setError('');
      setEnvStatus('valid');
      setEnvValidation({
        valid: true,
        pythonPath: result.data.environmentPath,
        version: result.data.pythonVersion,
        error: null,
        status: 'valid'
      });
      // Re-validate environment and packages after reinstall
      await validateEnvironment();
    } else {
      setError(result.data?.error || result.error || 'Environment reinstall failed');
      setEnvStatus('invalid');
    }
  };

  // Check if initial validation is in progress
  const isInitialValidation = (envStatus === 'checking' && !envValidation) ||
                                (status === 'checking' && !missingPackages.length && !installLocation);

  // Notify parent component of validation state changes
  useEffect(() => {
    onValidationStateChange?.(isInitialValidation);
  }, [isInitialValidation, onValidationStateChange]);

  return (
    <div className="space-y-4 relative">
      {/* Loading Overlay - Show during initial validation */}
      {isInitialValidation && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">Validating Python environment...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take a few seconds</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm font-medium text-destructive mb-1">Error</p>
          <p className="text-xs text-destructive/80">{error}</p>
        </div>
      )}

      {/* Python Environment Section (only show if checking or invalid) */}
      {activationScript && envStatus !== 'idle' && envStatus !== 'valid' && (
        <div className="space-y-3 p-4 border border-border rounded-md bg-muted/30">
          {/* Environment Status Display */}
          {envStatus === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Validating Python environment...</span>
            </div>
          )}

          {envStatus === 'invalid' && envValidation && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-destructive">
                {envValidation.status === 'missing' && <XCircle className="h-4 w-4" />}
                {envValidation.status === 'wrong_version' && <AlertTriangle className="h-4 w-4" />}
                {envValidation.status === 'error' && <XCircle className="h-4 w-4" />}
                <span>
                  {envValidation.status === 'missing' && 'Python not found'}
                  {envValidation.status === 'wrong_version' && `Wrong version: ${envValidation.version}`}
                  {envValidation.status === 'error' && 'Validation error'}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {envValidation.status === 'missing' &&
                  'Python 3.12+ is required but not found. Click below to install it.'}
                {envValidation.status === 'wrong_version' &&
                  'Python 3.12+ is required. Click below to reinstall with the correct version.'}
                {envValidation.status === 'error' &&
                  envValidation.error}
              </p>

              <Button
                onClick={handleReinstallEnvironment}
                disabled={reinstalling}
                size="sm"
                variant="destructive"
              >
                {reinstalling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reinstall Python Environment
              </Button>

              {/* Reinstall Progress */}
              {reinstallProgress && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{reinstallProgress.step}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Step {reinstallProgress.completed} of {reinstallProgress.total}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Installation Location */}
      {installLocation && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Install location:</span>{' '}
          <code className="bg-muted px-1 py-0.5 rounded text-xs">{installLocation}</code>
        </div>
      )}

      {status === 'checking' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {validationProgress
                ? `${validationProgress.packageName} (${validationProgress.current}/${validationProgress.total})`
                : t('python.validatingPackages')}
            </span>
          </div>
        </div>
      )}

      {status === 'valid' && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          <span>{t('python.allPackagesInstalled')}</span>
        </div>
      )}

      {status === 'invalid' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            <span>{t('python.packagesMissing')}</span>
          </div>

          {missingPackages.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                Missing packages ({missingPackages.length}):
              </p>
              <div className="max-h-32 overflow-y-auto bg-muted/50 rounded p-2 space-y-1">
                {missingPackages.map((pkg) => (
                  <div key={pkg} className="text-xs text-muted-foreground font-mono">
                    • {pkg}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={installRequirements}
            disabled={installing}
            size="sm"
          >
            {installing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('python.installMissing')}
          </Button>

          {(installing || installProgress) && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Installation Output:</p>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/50 rounded p-3 font-mono border border-border">
                {installProgress || 'Starting installation...'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
