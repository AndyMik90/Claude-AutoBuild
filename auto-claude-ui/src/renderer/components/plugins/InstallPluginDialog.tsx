import { useState, useEffect, useCallback } from 'react';
import {
  Github,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Link2,
  ChevronRight,
  Package
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { usePluginStore, installPlugin } from '../../stores/plugin-store';
import type { PluginInstallOptions, PluginInstallProgress } from '../../../shared/types';

interface InstallPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type InstallMode = 'github';
type InstallStep = 'input' | 'validating' | 'installing' | 'complete' | 'error';

/**
 * InstallPluginDialog - Dialog for installing plugins from GitHub
 *
 * Features:
 * - GitHub URL input with validation
 * - Personal Access Token input for private repos (masked)
 * - Connection testing before installation
 * - Progress tracking during installation
 * - Error handling with clear messages
 */
export function InstallPluginDialog({
  open,
  onOpenChange,
  onSuccess
}: InstallPluginDialogProps) {
  // Form state
  const [mode] = useState<InstallMode>('github');
  const [step, setStep] = useState<InstallStep>('input');
  const [githubUrl, setGithubUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [isValidUrl, setIsValidUrl] = useState<boolean | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ owner: string; repo: string } | null>(null);

  // Installation state from store
  const isInstalling = usePluginStore((state) => state.isInstalling);
  const installProgress = usePluginStore((state) => state.installProgress);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('input');
      setGithubUrl('');
      setToken('');
      setShowToken(false);
      setError(null);
      setIsValidUrl(null);
      setRepoInfo(null);
    }
  }, [open]);

  /**
   * Parse GitHub URL to extract owner and repo
   */
  const parseGitHubUrl = useCallback((url: string): { owner: string; repo: string } | null => {
    // Support various GitHub URL formats:
    // - https://github.com/owner/repo
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    // - github.com/owner/repo

    const trimmedUrl = url.trim();

    // SSH format: git@github.com:owner/repo.git
    const sshMatch = trimmedUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // HTTPS format: https://github.com/owner/repo(.git)?
    const httpsMatch = trimmedUrl.match(/^(?:https?:\/\/)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  }, []);

  /**
   * Validate GitHub URL format
   */
  const validateUrl = useCallback((url: string) => {
    if (!url.trim()) {
      setIsValidUrl(null);
      setRepoInfo(null);
      return;
    }

    const parsed = parseGitHubUrl(url);
    if (parsed) {
      setIsValidUrl(true);
      setRepoInfo(parsed);
      setError(null);
    } else {
      setIsValidUrl(false);
      setRepoInfo(null);
    }
  }, [parseGitHubUrl]);

  /**
   * Handle URL input change with validation
   */
  const handleUrlChange = (value: string) => {
    setGithubUrl(value);
    validateUrl(value);
  };

  /**
   * Test GitHub connection and repository access
   */
  const handleTestConnection = async () => {
    if (!repoInfo) {
      setError('Please enter a valid GitHub URL');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // First validate the token if provided
      if (token) {
        const tokenResult = await window.electronAPI.validateGitHubToken(token);
        if (!tokenResult.valid) {
          setError(tokenResult.error || 'Invalid GitHub token');
          setIsValidating(false);
          return;
        }
      }

      // Check repository access
      const accessResult = await window.electronAPI.checkGitHubRepoAccess(
        repoInfo.owner,
        repoInfo.repo,
        token || undefined
      );

      if (!accessResult.hasAccess) {
        if (accessResult.isPrivate && !token) {
          setError('This repository is private. Please provide a Personal Access Token.');
        } else {
          setError(accessResult.error || 'Unable to access repository');
        }
        setIsValidating(false);
        return;
      }

      // Connection successful - show success briefly then proceed
      setStep('validating');
      setTimeout(() => {
        setStep('input');
        setIsValidating(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test connection');
      setIsValidating(false);
    }
  };

  /**
   * Install the plugin
   */
  const handleInstall = async () => {
    if (!githubUrl || !isValidUrl) {
      setError('Please enter a valid GitHub URL');
      return;
    }

    setStep('installing');
    setError(null);

    try {
      const options: PluginInstallOptions = {
        source: githubUrl.trim(),
        sourceType: 'github',
        token: token || undefined
      };

      const plugin = await installPlugin(options);

      if (plugin) {
        setStep('complete');
        // Auto-close after success
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 2000);
      } else {
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
      setStep('error');
    }
  };

  /**
   * Get progress message for current installation stage
   */
  const getProgressMessage = (progress: PluginInstallProgress | null): string => {
    if (!progress) return 'Starting installation...';

    switch (progress.stage) {
      case 'validating':
        return 'Validating plugin source...';
      case 'cloning':
        return 'Cloning repository...';
      case 'copying':
        return 'Copying plugin files...';
      case 'registering':
        return 'Registering plugin...';
      case 'complete':
        return 'Installation complete!';
      case 'error':
        return progress.message || 'Installation failed';
      default:
        return progress.message || 'Installing...';
    }
  };

  /**
   * Render the current step content
   */
  const renderStepContent = () => {
    // Installing state
    if (step === 'installing' || isInstalling) {
      return (
        <div className="py-8 flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <p className="text-sm font-medium text-foreground mb-2">
            {getProgressMessage(installProgress)}
          </p>
          {installProgress && installProgress.percent > 0 && (
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${installProgress.percent}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    // Complete state
    if (step === 'complete') {
      return (
        <div className="py-8 flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            Plugin installed successfully!
          </p>
          <p className="text-xs text-muted-foreground">
            The plugin is now available in your project settings.
          </p>
        </div>
      );
    }

    // Validating state (brief success feedback)
    if (step === 'validating') {
      return (
        <div className="py-8 flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Connection successful!
          </p>
        </div>
      );
    }

    // Error state
    if (step === 'error') {
      return (
        <div className="py-8 flex flex-col items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive mb-2">
            Installation failed
          </p>
          {error && (
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              {error}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setStep('input')}
          >
            Try Again
          </Button>
        </div>
      );
    }

    // Input state (default)
    return (
      <div className="space-y-4 py-4">
        {/* GitHub URL Input */}
        <div className="space-y-2">
          <Label htmlFor="github-url" className="text-sm font-medium">
            GitHub Repository URL
          </Label>
          <div className="relative">
            <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="github-url"
              type="text"
              placeholder="https://github.com/owner/repo"
              value={githubUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              className={cn(
                'pl-10 pr-10',
                isValidUrl === true && 'border-success focus-visible:ring-success',
                isValidUrl === false && 'border-destructive focus-visible:ring-destructive'
              )}
              disabled={isValidating}
            />
            {isValidUrl === true && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
            )}
            {isValidUrl === false && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
            )}
          </div>
          {repoInfo && isValidUrl && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="h-3 w-3" />
              <span>
                {repoInfo.owner}/{repoInfo.repo}
              </span>
            </div>
          )}
          {isValidUrl === false && (
            <p className="text-xs text-destructive">
              Please enter a valid GitHub URL (e.g., https://github.com/owner/repo)
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Supports HTTPS URLs and SSH format (git@github.com:owner/repo.git)
          </p>
        </div>

        {/* Personal Access Token Input */}
        <div className="space-y-2">
          <Label htmlFor="github-token" className="text-sm font-medium">
            Personal Access Token <span className="text-muted-foreground font-normal">(for private repos)</span>
          </Label>
          <div className="relative">
            <Input
              id="github-token"
              type={showToken ? 'text' : 'password'}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
              disabled={isValidating}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              disabled={isValidating}
            >
              {showToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Required for private repositories. Token is stored securely and only used for this plugin.
          </p>
        </div>

        {/* Info box about token scopes */}
        <div className="rounded-lg border border-info/30 bg-info/5 p-3">
          <div className="flex items-start gap-2">
            <Github className="h-4 w-4 text-info mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Token Requirements</p>
              <p>
                Your token needs the <code className="px-1 bg-muted rounded">repo</code> scope to access private repositories.
                You can create a token at{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline"
                >
                  github.com/settings/tokens
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  /**
   * Render footer buttons based on current step
   */
  const renderFooter = () => {
    // Hide footer during non-input steps
    if (step !== 'input' && step !== 'error') {
      return null;
    }

    return (
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isInstalling || isValidating}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={!isValidUrl || isInstalling || isValidating}
        >
          {isValidating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </Button>
        <Button
          onClick={handleInstall}
          disabled={!isValidUrl || isInstalling || isValidating}
        >
          {isInstalling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Package className="mr-2 h-4 w-4" />
              Install Plugin
            </>
          )}
        </Button>
      </DialogFooter>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Install Plugin from GitHub
          </DialogTitle>
          <DialogDescription>
            Install a plugin from a GitHub repository. Private repositories require a Personal Access Token.
          </DialogDescription>
        </DialogHeader>

        {renderStepContent()}
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
