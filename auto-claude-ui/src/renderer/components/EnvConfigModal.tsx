import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Key,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './ui/tooltip';

interface EnvConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured?: () => void;
  title?: string;
  description?: string;
}

export function EnvConfigModal({
  open,
  onOpenChange,
  onConfigured,
  title = 'Claude Authentication Required',
  description = 'A Claude Code OAuth token is required to use AI features like Ideation and Roadmap generation.'
}: EnvConfigModalProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [_isLoading, _setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = useState(false);

  // Check current token status when modal opens
  useEffect(() => {
    const checkToken = async () => {
      if (!open) return;

      setIsChecking(true);
      setError(null);
      setSuccess(false);

      try {
        const result = await window.electronAPI.checkSourceToken();
        if (result.success && result.data) {
          setSourcePath(result.data.sourcePath || null);
          setHasExistingToken(result.data.hasToken);

          if (result.data.hasToken) {
            // Token exists, show success state
            setSuccess(true);
          }
        } else {
          setError(result.error || 'Failed to check token status');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsChecking(false);
      }
    };

    checkToken();
  }, [open]);

  const handleSave = async () => {
    if (!token.trim()) {
      setError('Please enter a token');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await window.electronAPI.updateSourceEnv({
        claudeOAuthToken: token.trim()
      });

      if (result.success) {
        setSuccess(true);
        setHasExistingToken(true);
        setToken(''); // Clear the input

        // Notify parent that configuration is complete
        setTimeout(() => {
          onConfigured?.();
          onOpenChange(false);
        }, 1500);
      } else {
        setError(result.error || 'Failed to save token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('claude setup-token');
  };

  const handleOpenDocs = () => {
    // Open the Claude Code documentation for getting a token
    window.open('https://docs.anthropic.com/en/docs/claude-code', '_blank');
  };

  const handleClose = () => {
    if (!isSaving) {
      setToken('');
      setError(null);
      setSuccess(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Key className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {isChecking && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Success state */}
        {!isChecking && success && (
          <div className="py-4">
            <div className="rounded-lg bg-success/10 border border-success/30 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-success">
                  Token configured successfully
                </p>
                <p className="text-xs text-success/80 mt-1">
                  You can now use AI features like Ideation and Roadmap generation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Configuration form */}
        {!isChecking && !success && (
          <div className="py-4 space-y-4">
            {/* Error banner */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Info about getting a token */}
            <div className="rounded-lg bg-info/10 border border-info/30 p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-foreground font-medium">
                    How to get a Claude Code OAuth token:
                  </p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Install Claude Code CLI if you haven't already</li>
                    <li>
                      Run{' '}
                      <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs">
                        claude setup-token
                      </code>
                      {' '}
                      <button
                        onClick={handleCopyCommand}
                        className="inline-flex items-center text-info hover:text-info/80"
                      >
                        <Copy className="h-3 w-3 ml-1" />
                      </button>
                    </li>
                    <li>Copy the token and paste it below</li>
                  </ol>
                  <button
                    onClick={handleOpenDocs}
                    className="text-sm text-info hover:text-info/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View documentation
                  </button>
                </div>
              </div>
            </div>

            {/* Token input */}
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium text-foreground">
                Claude Code OAuth Token
              </Label>
              <div className="relative">
                <Input
                  id="token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your token..."
                  className="pr-10 font-mono text-sm"
                  disabled={isSaving}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showToken ? 'Hide token' : 'Show token'}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">
                The token will be saved to{' '}
                <code className="px-1 py-0.5 bg-muted rounded font-mono">
                  {sourcePath ? `${sourcePath}/.env` : 'auto-claude/.env'}
                </code>
              </p>
            </div>

            {/* Existing token info */}
            {hasExistingToken && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">
                  A token is already configured. Enter a new token above to replace it.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {success ? 'Close' : 'Cancel'}
          </Button>
          {!success && (
            <Button onClick={handleSave} disabled={!token.trim() || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Save Token
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to check if the Claude token is configured
 * Returns { hasToken, isLoading, checkToken }
 */
export function useClaudeTokenCheck() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkToken = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.checkSourceToken();
      if (result.success && result.data) {
        setHasToken(result.data.hasToken);
      } else {
        setHasToken(false);
        setError(result.error || 'Failed to check token');
      }
    } catch (err) {
      setHasToken(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkToken();
  }, []);

  return { hasToken, isLoading, error, checkToken };
}
