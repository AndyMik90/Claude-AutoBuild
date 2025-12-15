import { useState, useEffect } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '../ui/tooltip';

interface OAuthStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/**
 * OAuth step component for the onboarding wizard.
 * Guides users through Claude OAuth token configuration,
 * reusing patterns from EnvConfigModal.
 */
export function OAuthStep({ onNext, onBack, onSkip }: OAuthStepProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [hasExistingToken, setHasExistingToken] = useState(false);

  // Check current token status on mount
  useEffect(() => {
    const checkToken = async () => {
      setIsChecking(true);
      setError(null);

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
  }, []);

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
    window.open('https://docs.anthropic.com/en/docs/claude-code', '_blank');
  };

  const handleContinue = () => {
    onNext();
  };

  const handleReconfigure = () => {
    setSuccess(false);
    setError(null);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Key className="h-7 w-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Configure Claude Authentication
          </h1>
          <p className="mt-2 text-muted-foreground">
            A Claude Code OAuth token is required to use AI features
          </p>
        </div>

        {/* Loading state */}
        {isChecking && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Success state - differentiate between existing token and newly configured */}
        {!isChecking && success && (
          <div className="space-y-6">
            <Card className="border border-success/30 bg-success/10">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-success">
                      {hasExistingToken && !token
                        ? 'Token already configured'
                        : 'Token configured successfully'}
                    </h3>
                    <p className="mt-1 text-sm text-success/80">
                      {hasExistingToken && !token
                        ? 'Your Claude OAuth token is already set up. You can continue to the next step or reconfigure if needed.'
                        : "You're all set to use AI features like Ideation, Roadmap generation, and autonomous code generation."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center text-sm text-muted-foreground">
              <button
                onClick={handleReconfigure}
                className="text-primary hover:text-primary/80 underline-offset-4 hover:underline"
              >
                {hasExistingToken && !token ? 'Reconfigure token' : 'Configure a different token'}
              </button>
            </div>
          </div>
        )}

        {/* Configuration form */}
        {!isChecking && !success && (
          <div className="space-y-6">
            {/* Error banner */}
            {error && (
              <Card className="border border-destructive/30 bg-destructive/10">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Info about getting a token */}
            <Card className="border border-info/30 bg-info/10">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      How to get a Claude Code OAuth token:
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
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
              </CardContent>
            </Card>

            {/* Token input */}
            <div className="space-y-3">
              <Label htmlFor="token" className="text-sm font-medium text-foreground">
                Claude Code OAuth Token
              </Label>
              <div className="relative">
                <Input
                  id="token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="sk-ant-oat01-..."
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
              <Card className="border border-border bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    A token is already configured. Enter a new token above to replace it,
                    or continue to the next step.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Save button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={handleSave}
                disabled={!token.trim() || isSaving}
                className="gap-2 px-8"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4" />
                    Save Token
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            Back
          </Button>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!success && !hasExistingToken}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
