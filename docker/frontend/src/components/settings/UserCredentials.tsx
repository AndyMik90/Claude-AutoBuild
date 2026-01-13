/**
 * User Credentials Component
 *
 * Component for managing user-level API credentials.
 * Shows inheritance from global credentials and allows user overrides.
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
  Info,
  Globe,
  Lock,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
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

interface UserCredentialStatus {
  user_id: string;
  has_claude_oauth: boolean;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_github_token: boolean;
  has_linear_key: boolean;
  has_voyage_key: boolean;
  has_google_key: boolean;
  has_azure_openai_key: boolean;
  default_graphiti_llm_provider: string | null;
  default_graphiti_embedder_provider: string | null;
  default_branch: string | null;
}

interface CredentialHierarchyItem {
  key: string;
  label: string;
  global_set: boolean;
  user_set: boolean;
  project_set: boolean | null;
  effective_source: string;
  is_set: boolean;
}

interface CredentialHierarchy {
  credentials_locked: boolean;
  allow_user_credentials: boolean;
  credentials: CredentialHierarchyItem[];
}

interface UserCredentialsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  inputKey: string;
}

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'claude_oauth',
    label: 'Claude OAuth Token',
    placeholder: 'Enter Claude OAuth token',
    description: 'OAuth token from Claude Code setup',
    inputKey: 'claude_oauth_token',
  },
  {
    key: 'anthropic_key',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    description: 'API key from Anthropic Console',
    inputKey: 'anthropic_api_key',
  },
  {
    key: 'openai_key',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    description: 'For Graphiti embeddings',
    inputKey: 'openai_api_key',
  },
  {
    key: 'github_token',
    label: 'GitHub Token',
    placeholder: 'ghp_...',
    description: 'Personal access token for private repos',
    inputKey: 'github_token',
  },
  {
    key: 'linear_key',
    label: 'Linear API Key',
    placeholder: 'lin_api_...',
    description: 'For Linear integration',
    inputKey: 'linear_api_key',
  },
  {
    key: 'voyage_key',
    label: 'Voyage API Key',
    placeholder: 'pa-...',
    description: 'Voyage AI embeddings API key',
    inputKey: 'voyage_api_key',
  },
  {
    key: 'google_key',
    label: 'Google API Key',
    placeholder: 'AIza...',
    description: 'Google AI / Gemini API key',
    inputKey: 'google_api_key',
  },
  {
    key: 'azure_openai_key',
    label: 'Azure OpenAI API Key',
    placeholder: 'Enter Azure OpenAI key',
    description: 'Azure OpenAI service API key',
    inputKey: 'azure_openai_api_key',
  },
];

export function UserCredentials({ authFetch }: UserCredentialsProps) {
  const [hierarchy, setHierarchy] = useState<CredentialHierarchy | null>(null);
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
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/users/me/credentials/hierarchy');
      if (response.ok) {
        const data = await response.json();
        setHierarchy(data);
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
      const response = await authFetch('/users/me/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          [field.inputKey]: fieldValue,
        }),
      });

      if (response.ok) {
        setEditingField(null);
        setFieldValue('');
        setShowValue(false);
        setSuccess(`${field.label} saved successfully`);
        setTimeout(() => setSuccess(null), 3000);
        // Reload hierarchy to get updated status
        await loadHierarchy();
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
      const response = await authFetch('/users/me/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          [clearDialog.field.inputKey]: '',
        }),
      });

      if (response.ok) {
        setSuccess(`${clearDialog.field.label} cleared`);
        setTimeout(() => setSuccess(null), 3000);
        // Reload hierarchy
        await loadHierarchy();
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

  const getCredentialStatus = (key: string): CredentialHierarchyItem | undefined => {
    return hierarchy?.credentials.find((c) => c.key === key);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isLocked = hierarchy?.credentials_locked;
  const allowUserCreds = hierarchy?.allow_user_credentials;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-foreground">My Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Your personal API keys (override global defaults)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadHierarchy}
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
            Your credentials override global defaults. Project-specific credentials can override yours.
            A <Globe className="w-3 h-3 inline" /> indicates using global value.
          </p>
        </div>
      </div>

      {/* Locked warning */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">
            Credentials are locked by administrator. You cannot set your own credentials.
          </span>
        </div>
      )}

      {/* User credentials disabled */}
      {!isLocked && !allowUserCreds && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">
            User credentials are disabled by administrator. Contact admin to enable.
          </span>
        </div>
      )}

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
          const status = getCredentialStatus(field.key);
          const hasUserValue = status?.user_set || false;
          const hasGlobalValue = status?.global_set || false;
          const effectiveSource = status?.effective_source || 'none';
          const isEditing = editingField === field.inputKey;
          const canEdit = !isLocked && allowUserCreds;

          return (
            <div key={field.key} className="card-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      hasUserValue
                        ? 'bg-success/20 border border-success/30'
                        : hasGlobalValue
                        ? 'bg-info/20 border border-info/30'
                        : 'bg-secondary border border-border'
                    }`}
                  >
                    {hasUserValue ? (
                      <Key className="w-5 h-5 text-success" />
                    ) : hasGlobalValue ? (
                      <Globe className="w-5 h-5 text-info" />
                    ) : (
                      <Key className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-foreground font-medium">{field.label}</Label>
                      {hasUserValue ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="w-3 h-3" />
                          Your key
                        </span>
                      ) : hasGlobalValue ? (
                        <span className="flex items-center gap-1 text-xs text-info">
                          <Globe className="w-3 h-3" />
                          Using global
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

                {!isEditing && canEdit && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(field)}
                      className="border-border text-muted-foreground hover:text-foreground"
                    >
                      {hasUserValue ? 'Update' : 'Set'}
                    </Button>
                    {hasUserValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setClearDialog({ open: true, field })}
                        className="text-muted-foreground hover:text-destructive"
                        title="Clear your credential (will use global if available)"
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
            <AlertDialogTitle className="text-foreground">Clear Your Credential</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to clear{' '}
              <strong className="text-foreground">{clearDialog.field?.label}</strong>?
              {getCredentialStatus(clearDialog.field?.key || '')?.global_set
                ? ' You will fall back to using the global credential.'
                : ' There is no global credential set, so this will leave the credential unset.'}
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
