import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Eye,
  EyeOff,
  Info,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { SettingsSection } from './SettingsSection';
import type { AppSettings } from '../../../shared/types';

interface MorphSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Validation status for Morph API key
 */
type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'serviceUnavailable' | 'error';

/**
 * Morph Fast Apply settings for enabling AI-powered code application
 */
export function MorphSettings({ settings, onSettingsChange }: MorphSettingsProps) {
  const { t } = useTranslation('settings');

  // Password visibility toggle for API key
  const [showApiKey, setShowApiKey] = useState(false);

  // Validation state
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastValidatedKey, setLastValidatedKey] = useState<string | null>(null);

  // Reset validation status when API key changes
  useEffect(() => {
    if (settings.morphApiKey !== lastValidatedKey) {
      setValidationStatus('idle');
      setErrorMessage(null);
    }
  }, [settings.morphApiKey, lastValidatedKey]);

  const handleEnableChange = (enabled: boolean) => {
    onSettingsChange({ ...settings, morphEnabled: enabled });
    // Reset validation when toggling
    if (!enabled) {
      setValidationStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleApiKeyChange = (apiKey: string) => {
    onSettingsChange({ ...settings, morphApiKey: apiKey || undefined });
    // Reset validation status when key changes
    setValidationStatus('idle');
    setErrorMessage(null);
  };

  /**
   * Validate the Morph API key by attempting to call the Morph API
   * This provides user feedback about whether their key is valid
   */
  const validateApiKey = useCallback(async () => {
    const apiKey = settings.morphApiKey;

    if (!apiKey || apiKey.trim() === '') {
      setValidationStatus('invalid');
      setErrorMessage(t('morph.errors.emptyApiKey'));
      return;
    }

    setValidationStatus('validating');
    setErrorMessage(null);

    try {
      // Attempt to validate the API key with the Morph service
      // The Morph API base URL - using environment variable or default
      const morphBaseUrl = 'https://api.morph.so';

      const response = await fetch(`${morphBaseUrl}/v1/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      setLastValidatedKey(apiKey);

      if (response.ok) {
        setValidationStatus('valid');
        setErrorMessage(null);
      } else if (response.status === 401 || response.status === 403) {
        setValidationStatus('invalid');
        setErrorMessage(t('morph.errors.invalidApiKey'));
      } else if (response.status >= 500) {
        setValidationStatus('serviceUnavailable');
        setErrorMessage(t('morph.errors.serviceUnavailable'));
      } else {
        setValidationStatus('error');
        setErrorMessage(t('morph.errors.validationFailed'));
      }
    } catch (error) {
      setLastValidatedKey(apiKey);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - service might be unreachable
        setValidationStatus('serviceUnavailable');
        setErrorMessage(t('morph.errors.networkError'));
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        // Timeout
        setValidationStatus('serviceUnavailable');
        setErrorMessage(t('morph.errors.timeout'));
      } else {
        // For any other error, we assume the key format might be valid
        // but we couldn't verify it (fail open for better UX)
        setValidationStatus('serviceUnavailable');
        setErrorMessage(t('morph.errors.couldNotVerify'));
      }
    }
  }, [settings.morphApiKey, t]);

  /**
   * Clear validation error and reset to idle state
   */
  const clearError = useCallback(() => {
    setValidationStatus('idle');
    setErrorMessage(null);
  }, []);

  /**
   * Get the appropriate icon and color for the current validation status
   */
  const getStatusIndicator = () => {
    switch (validationStatus) {
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'invalid':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'serviceUnavailable':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  return (
    <SettingsSection
      title={t('morph.title')}
      description={t('morph.description')}
    >
      <div className="space-y-6">
        {/* Info banner */}
        <div className="rounded-lg bg-info/10 border border-info/30 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t('morph.info')}
              </p>
              <button
                type="button"
                onClick={() => window.electronAPI?.openExternal('https://morph.so')}
                className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 hover:underline transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {t('morph.learnMore')}
              </button>
            </div>
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{t('morph.enableLabel')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('morph.enableDescription')}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.morphEnabled ?? false}
            onCheckedChange={handleEnableChange}
          />
        </div>

        {/* API Key input - only show when enabled */}
        {settings.morphEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/20">
            <div className="space-y-2">
              <Label htmlFor="morphApiKey" className="text-sm font-medium text-foreground">
                {t('morph.apiKeyLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('morph.apiKeyDescription')}
              </p>
              <div className="flex items-center gap-2 max-w-lg">
                <div className="relative flex-1">
                  <Input
                    id="morphApiKey"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={t('morph.apiKeyPlaceholder')}
                    value={settings.morphApiKey || ''}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    className={`pr-10 font-mono text-sm ${
                      validationStatus === 'invalid' || validationStatus === 'error'
                        ? 'border-destructive focus-visible:ring-destructive'
                        : validationStatus === 'valid'
                        ? 'border-success focus-visible:ring-success'
                        : validationStatus === 'serviceUnavailable'
                        ? 'border-warning focus-visible:ring-warning'
                        : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={validateApiKey}
                  disabled={validationStatus === 'validating' || !settings.morphApiKey}
                  className="gap-1 shrink-0"
                >
                  {validationStatus === 'validating' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {t('morph.validateKey')}
                </Button>
              </div>

              {/* Validation status indicator */}
              {validationStatus !== 'idle' && validationStatus !== 'validating' && (
                <div className="flex items-center gap-2 text-sm">
                  {getStatusIndicator()}
                  <span className={
                    validationStatus === 'valid'
                      ? 'text-success'
                      : validationStatus === 'invalid' || validationStatus === 'error'
                      ? 'text-destructive'
                      : 'text-warning'
                  }>
                    {validationStatus === 'valid'
                      ? t('morph.status.valid')
                      : validationStatus === 'invalid'
                      ? t('morph.status.invalid')
                      : validationStatus === 'serviceUnavailable'
                      ? t('morph.status.serviceUnavailable')
                      : t('morph.status.error')}
                  </span>
                </div>
              )}
            </div>

            {/* Warning if enabled but no API key */}
            {settings.morphEnabled && !settings.morphApiKey && (
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    {t('morph.noApiKeyWarning')}
                  </p>
                </div>
              </div>
            )}

            {/* Error message display */}
            {errorMessage && (
              <div className={`rounded-lg p-3 ${
                validationStatus === 'serviceUnavailable'
                  ? 'bg-warning/10 border border-warning/30'
                  : 'bg-destructive/10 border border-destructive/30'
              }`}>
                <div className="flex items-start gap-2">
                  {validationStatus === 'serviceUnavailable' ? (
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`text-xs ${
                      validationStatus === 'serviceUnavailable'
                        ? 'text-warning'
                        : 'text-destructive'
                    }`}>
                      {errorMessage}
                    </p>
                    {validationStatus === 'serviceUnavailable' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('morph.errors.fallbackActive')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearError}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Dismiss error"
                  >
                    <span className="sr-only">Dismiss</span>
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Success message when key is valid */}
            {validationStatus === 'valid' && !errorMessage && (
              <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <p className="text-xs text-success">
                    {t('morph.status.keyValidated')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
