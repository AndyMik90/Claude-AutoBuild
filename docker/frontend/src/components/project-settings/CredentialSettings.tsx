/**
 * Credential Settings Component
 *
 * Allows users to manage encrypted API credentials for a project.
 * Shows inheritance from Global → User → Project credential hierarchy.
 *
 * Credentials:
 * - Claude OAuth Token
 * - Anthropic API Key
 * - OpenAI API Key
 * - GitHub Token
 * - Linear API Key
 * - Voyage API Key
 * - Google API Key
 * - Azure OpenAI API Key
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
  Globe,
  User,
  FolderOpen,
  Info,
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

interface CredentialsStatus {
  project_id: string;
  has_claude_oauth: boolean;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_github_token: boolean;
  has_linear_key: boolean;
  has_voyage_key: boolean;
  has_google_key: boolean;
  has_azure_openai_key: boolean;
}

interface HierarchyCredential {
  key: string;
  label: string;
  global_set: boolean | null;
  user_set: boolean | null;
  project_set: boolean | null;
  effective_source: string;
  is_set: boolean;
}

interface HierarchyStatus {
  credentials_locked: boolean;
  allow_user_credentials: boolean;
  credentials: HierarchyCredential[];
}

interface CredentialSettingsProps {
  projectId: string;
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

interface CredentialField {
  key: keyof CredentialsStatus;
  label: string;
  placeholder: string;
  description: string;
  inputKey: string;
  hierarchyKey: string;
}

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    key: 'has_claude_oauth',
    label: 'Claude OAuth Token',
    placeholder: 'Enter Claude OAuth token',
    description: 'OAuth token from Claude Code setup',
    inputKey: 'claude_oauth_token',
    hierarchyKey: 'claude_oauth',
  },
  {
    key: 'has_anthropic_key',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    description: 'API key from Anthropic Console',
    inputKey: 'anthropic_api_key',
    hierarchyKey: 'anthropic_key',
  },
  {
    key: 'has_openai_key',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    description: 'For Graphiti embeddings (optional)',
    inputKey: 'openai_api_key',
    hierarchyKey: 'openai_key',
  },
  {
    key: 'has_github_token',
    label: 'GitHub Token',
    placeholder: 'ghp_...',
    description: 'Personal access token for private repos',
    inputKey: 'github_token',
    hierarchyKey: 'github_token',
  },
  {
    key: 'has_linear_key',
    label: 'Linear API Key',
    placeholder: 'lin_api_...',
    description: 'For Linear integration (optional)',
    inputKey: 'linear_api_key',
    hierarchyKey: 'linear_key',
  },
  {
    key: 'has_voyage_key',
    label: 'Voyage API Key',
    placeholder: 'pa-...',
    description: 'Voyage AI embeddings API key',
    inputKey: 'voyage_api_key',
    hierarchyKey: 'voyage_key',
  },
  {
    key: 'has_google_key',
    label: 'Google API Key',
    placeholder: 'AIza...',
    description: 'Google AI / Gemini API key',
    inputKey: 'google_api_key',
    hierarchyKey: 'google_key',
  },
  {
    key: 'has_azure_openai_key',
    label: 'Azure OpenAI API Key',
    placeholder: 'Enter Azure OpenAI key',
    description: 'Azure OpenAI service API key',
    inputKey: 'azure_openai_api_key',
    hierarchyKey: 'azure_openai_key',
  },
];

export function CredentialSettings({ projectId, authFetch }: CredentialSettingsProps) {
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state - only stores values being edited
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
  }, [projectId]);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load both project credentials and hierarchy info
      const [credRes, hierarchyRes] = await Promise.all([
        authFetch(`/projects/${projectId}/credentials`),
        authFetch('/users/me/credentials/hierarchy'),
      ]);

      if (credRes.ok) {
        const data = await credRes.json();
        setStatus(data);
      } else {
        const err = await credRes.json();
        setError(err.detail || 'Failed to load credentials');
      }

      if (hierarchyRes.ok) {
        const data = await hierarchyRes.json();
        setHierarchy(data);
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const getHierarchyInfo = (field: CredentialField): HierarchyCredential | undefined => {
    return hierarchy?.credentials.find((c) => c.key === field.hierarchyKey);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'global':
        return <Globe className="w-3 h-3" />;
      case 'user':
        return <User className="w-3 h-3" />;
      case 'project':
        return <FolderOpen className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'global':
        return 'Using global';
      case 'user':
        return 'Using your default';
      case 'project':
        return 'Project override';
      default:
        return 'Not set';
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
      const response = await authFetch(`/projects/${projectId}/credentials`, {
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
      const response = await authFetch(`/projects/${projectId}/credentials`, {
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
          <h3 className="text-lg font-semibold text-foreground">Credentials</h3>
          <p className="text-sm text-muted-foreground">
            Manage encrypted API keys for this project
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

      {/* Hierarchy info */}
      <div className="flex items-start gap-3 p-4 bg-info-light border border-info/30 rounded-xl">
        <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-info font-medium">Credential Hierarchy</p>
          <p className="text-xs text-info/80 mt-1">
            Project credentials override your user defaults. If not set here, user or global credentials are used.
          </p>
        </div>
      </div>

      {/* Locked warning */}
      {hierarchy?.credentials_locked && (
        <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-warning font-medium">Credentials Locked</p>
            <p className="text-xs text-warning/80 mt-1">
              Your administrator has locked all credentials. Only global credentials are used.
            </p>
          </div>
        </div>
      )}

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 bg-success-light border border-success/30 rounded-xl">
        <ShieldCheck className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-success font-medium">Credentials are encrypted at rest</p>
          <p className="text-xs text-success/80 mt-1">
            API keys are encrypted using Fernet symmetric encryption.
          </p>
        </div>
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
        {CREDENTIAL_FIELDS.map((field) => {
          const hasValue = status ? status[field.key] : false;
          const isEditing = editingField === field.inputKey;
          const hierarchyInfo = getHierarchyInfo(field);
          const effectiveSource = hierarchyInfo?.effective_source || 'none';
          const isLocked = hierarchy?.credentials_locked || false;

          return (
            <div key={field.key} className="card-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      hasValue
                        ? 'bg-success/20 border border-success/30'
                        : hierarchyInfo?.is_set
                        ? 'bg-info/20 border border-info/30'
                        : 'bg-secondary border border-border'
                    }`}
                  >
                    <Key
                      className={`w-5 h-5 ${
                        hasValue
                          ? 'text-success'
                          : hierarchyInfo?.is_set
                          ? 'text-info'
                          : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-foreground font-medium">{field.label}</Label>
                      {hasValue ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <FolderOpen className="w-3 h-3" />
                          Project override
                        </span>
                      ) : effectiveSource === 'user' ? (
                        <span className="flex items-center gap-1 text-xs text-info">
                          <User className="w-3 h-3" />
                          Using your default
                        </span>
                      ) : effectiveSource === 'global' ? (
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

                {!isEditing && !isLocked && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(field)}
                      className="border-border text-muted-foreground hover:text-foreground"
                    >
                      {hasValue ? 'Update' : 'Override'}
                    </Button>
                    {hasValue && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setClearDialog({ open: true, field })}
                        className="text-muted-foreground hover:text-destructive"
                        title={hierarchyInfo?.is_set ? 'Clear override (will use inherited value)' : 'Clear'}
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
            <AlertDialogTitle className="text-foreground">Clear Credential</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to clear{' '}
              <strong className="text-foreground">{clearDialog.field?.label}</strong>?
              This action cannot be undone.
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
