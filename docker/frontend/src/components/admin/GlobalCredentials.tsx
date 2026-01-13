/**
 * Global Credentials Component
 *
 * Admin-only component for managing global (system-wide) API credentials.
 * These credentials apply to all users unless overridden at user/project level.
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  Key,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Trash2,
  ShieldCheck,
  Lock,
  Unlock,
  Users,
  Info,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface GlobalCredentialStatus {
  has_global_claude_oauth: boolean;
  has_global_anthropic_key: boolean;
  has_global_openai_key: boolean;
  has_global_github_token: boolean;
  has_global_linear_key: boolean;
  has_global_voyage_key: boolean;
  has_global_google_key: boolean;
  has_global_azure_openai_key: boolean;
  credentials_locked: boolean;
  allow_user_credentials: boolean;
}

interface GlobalCredentialsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

interface CredentialField {
  key: keyof GlobalCredentialStatus;
  label: string;
  placeholder: string;
  description: string;
  inputKey: string;
}

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'has_global_claude_oauth',
    label: 'Claude OAuth Token',
    placeholder: 'Enter Claude OAuth token',
    description: 'OAuth token from Claude Code setup',
    inputKey: 'claude_oauth_token',
  },
  {
    key: 'has_global_anthropic_key',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    description: 'API key from Anthropic Console',
    inputKey: 'anthropic_api_key',
  },
  {
    key: 'has_global_openai_key',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    description: 'For Graphiti embeddings',
    inputKey: 'openai_api_key',
  },
  {
    key: 'has_global_github_token',
    label: 'GitHub Token',
    placeholder: 'ghp_...',
    description: 'Personal access token for private repos',
    inputKey: 'github_token',
  },
  {
    key: 'has_global_linear_key',
    label: 'Linear API Key',
    placeholder: 'lin_api_...',
    description: 'For Linear integration',
    inputKey: 'linear_api_key',
  },
  {
    key: 'has_global_voyage_key',
    label: 'Voyage API Key',
    placeholder: 'pa-...',
    description: 'Voyage AI embeddings API key',
    inputKey: 'voyage_api_key',
  },
  {
    key: 'has_global_google_key',
    label: 'Google API Key',
    placeholder: 'AIza...',
    description: 'Google AI / Gemini API key',
    inputKey: 'google_api_key',
  },
  {
    key: 'has_global_azure_openai_key',
    label: 'Azure OpenAI API Key',
    placeholder: 'Enter Azure OpenAI key',
    description: 'Azure OpenAI service API key',
    inputKey: 'azure_openai_api_key',
  },
];

export function GlobalCredentials({ authFetch }: GlobalCredentialsProps) {
  const [status, setStatus] = useState<GlobalCredentialStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [showValue, setShowValue] = useState(false);

  // Clear confirmation
  const [clearDialog, setClearDialog] = useState<{
    open: boolean;
    field: CredentialField | null;
  }>({ open: false, field: null });
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/admin/settings/credentials');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load credentials');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (field: CredentialField) => {
    if (!fieldValue.trim()) {
      setError('Please enter a value');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authFetch('/admin/settings/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          [field.inputKey]: fieldValue,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setEditingField(null);
        setFieldValue('');
        setShowValue(false);
        setSuccess(`${field.label} saved successfully`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to save credential');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!clearDialog.field) return;

    setIsClearing(true);
    setError(null);

    try {
      const response = await authFetch('/admin/settings/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          [clearDialog.field.inputKey]: '',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setSuccess(`${clearDialog.field.label} cleared`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to clear credential');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsClearing(false);
      setClearDialog({ open: false, field: null });
    }
  };

  const handleToggleControl = async (field: 'credentials_locked' | 'allow_user_credentials', value: boolean) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await authFetch('/admin/settings/credentials/controls', {
        method: 'PUT',
        body: JSON.stringify({
          [field]: value,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        const message = field === 'credentials_locked'
          ? (value ? 'Credentials locked - users cannot override' : 'Credentials unlocked')
          : (value ? 'User credentials enabled' : 'User credentials disabled');
        setSuccess(message);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to update setting');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  const startEditing = (field: CredentialField) => {
    setEditingField(field.inputKey);
    setFieldValue('');
    setShowValue(false);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setFieldValue('');
    setShowValue(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-foreground">Global Credentials</h2>
          <p className="text-sm text-muted-foreground">
            System-wide API keys that apply to all users
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStatus}
          disabled={isLoading}
          className="border-border text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 bg-info-light border border-info/30 rounded-xl">
        <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-info font-medium">Credential Hierarchy</p>
          <p className="text-xs text-info/80 mt-1">
            Global credentials are used by all users unless overridden at user or project level.
            Use the lock option below to prevent any overrides.
          </p>
        </div>
      </div>

      {/* Control toggles */}
      <div className="card-surface p-4 space-y-4">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Access Controls
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lock credentials */}
          <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-3">
              {status?.credentials_locked ? (
                <Lock className="w-5 h-5 text-warning" />
              ) : (
                <Unlock className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-foreground">Lock Credentials</Label>
                <p className="text-xs text-muted-foreground">
                  Prevent users & projects from overriding
                </p>
              </div>
            </div>
            <Switch
              checked={status?.credentials_locked || false}
              onCheckedChange={(checked) => handleToggleControl('credentials_locked', checked)}
            />
          </div>

          {/* Allow user credentials */}
          <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <Label className="text-foreground">Allow User Credentials</Label>
                <p className="text-xs text-muted-foreground">
                  Let users set their own defaults
                </p>
              </div>
            </div>
            <Switch
              checked={status?.allow_user_credentials || false}
              onCheckedChange={(checked) => handleToggleControl('allow_user_credentials', checked)}
              disabled={status?.credentials_locked}
            />
          </div>
        </div>

        {status?.credentials_locked && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning">
            <Lock className="w-4 h-4" />
            <span className="text-sm">
              All credentials are locked. Users and projects will only use these global credentials.
            </span>
          </div>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-success-light border border-success/50 rounded-lg text-success">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Credential fields */}
      <div className="space-y-4">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          API Credentials
        </h3>

        {CREDENTIAL_FIELDS.map((field) => {
          const hasValue = status ? status[field.key] : false;
          const isEditing = editingField === field.inputKey;

          return (
            <div key={field.key} className="card-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      hasValue
                        ? 'bg-success/20 border border-success/30'
                        : 'bg-secondary border border-border'
                    }`}
                  >
                    <Key
                      className={`w-5 h-5 ${
                        hasValue ? 'text-success' : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-foreground font-medium">{field.label}</Label>
                      {hasValue ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="w-3 h-3" />
                          Configured
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <XCircle className="w-3 h-3" />
                          Not set
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  </div>
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(field)}
                      className="border-border text-muted-foreground hover:text-foreground"
                    >
                      {hasValue ? 'Update' : 'Add'}
                    </Button>
                    {hasValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setClearDialog({ open: true, field })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Edit form */}
              {isEditing && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showValue ? 'text' : 'password'}
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        placeholder={field.placeholder}
                        disabled={isSaving}
                        className="bg-secondary border-border text-foreground pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowValue(!showValue)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showValue ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      onClick={() => handleSave(field)}
                      disabled={isSaving || !fieldValue.trim()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelEditing}
                      disabled={isSaving}
                      className="border-border text-muted-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clear confirmation dialog */}
      <AlertDialog open={clearDialog.open} onOpenChange={(open) => setClearDialog({ open, field: clearDialog.field })}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Clear Global Credential</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to clear{' '}
              <strong className="text-foreground">{clearDialog.field?.label}</strong>?
              Users will need to provide their own credentials at user or project level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-foreground"
              disabled={isClearing}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                'Clear'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
