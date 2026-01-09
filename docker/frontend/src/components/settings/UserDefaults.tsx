/**
 * User Defaults Component
 *
 * Component for managing user-level default settings.
 * These settings override global defaults and can be overridden at project level.
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  CheckCircle,
  Info,
  Settings2,
  GitBranch,
  Brain,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface UserSettingsData {
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

interface UserDefaultsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

const LLM_PROVIDERS = [
  { value: '__global__', label: 'Use global default' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'google', label: 'Google AI' },
];

const EMBEDDER_PROVIDERS = [
  { value: '__global__', label: 'Use global default' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'voyage', label: 'Voyage AI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'google', label: 'Google AI' },
];

export function UserDefaults({ authFetch }: UserDefaultsProps) {
  const [settings, setSettings] = useState<UserSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [formData, setFormData] = useState<{
    default_graphiti_llm_provider: string;
    default_graphiti_embedder_provider: string;
    default_branch: string;
  }>({
    default_graphiti_llm_provider: '',
    default_graphiti_embedder_provider: '',
    default_branch: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/users/me/credentials');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setFormData({
          default_graphiti_llm_provider: data.default_graphiti_llm_provider || '__global__',
          default_graphiti_embedder_provider: data.default_graphiti_embedder_provider || '__global__',
          default_branch: data.default_branch || '',
        });
        setHasChanges(false);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load settings');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    // Convert __global__ back to null for API
    const llmProvider = formData.default_graphiti_llm_provider === '__global__' ? null : formData.default_graphiti_llm_provider;
    const embedderProvider = formData.default_graphiti_embedder_provider === '__global__' ? null : formData.default_graphiti_embedder_provider;

    try {
      const response = await authFetch('/users/me/credentials/settings', {
        method: 'PUT',
        body: JSON.stringify({
          default_graphiti_llm_provider: llmProvider || null,
          default_graphiti_embedder_provider: embedderProvider || null,
          default_branch: formData.default_branch || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setFormData({
          default_graphiti_llm_provider: data.default_graphiti_llm_provider || '__global__',
          default_graphiti_embedder_provider: data.default_graphiti_embedder_provider || '__global__',
          default_branch: data.default_branch || '',
        });
        setHasChanges(false);
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        default_graphiti_llm_provider: settings.default_graphiti_llm_provider || '__global__',
        default_graphiti_embedder_provider: settings.default_graphiti_embedder_provider || '__global__',
        default_branch: settings.default_branch || '',
      });
      setHasChanges(false);
    }
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
          <h2 className="text-xl font-bold text-foreground">Default Settings</h2>
          <p className="text-sm text-muted-foreground">
            Your default preferences (override global defaults)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSettings}
            disabled={isLoading}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {hasChanges && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
                className="border-border text-muted-foreground"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary text-primary-foreground"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 bg-info-light border border-info/30 rounded-xl">
        <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-info font-medium">Settings Hierarchy</p>
          <p className="text-xs text-info/80 mt-1">
            These settings serve as your personal defaults. Leave empty to use global defaults.
            Individual projects can override these settings.
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

      {/* Graphiti Settings */}
      <div className="card-surface p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 border border-primary/30 rounded-lg flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Graphiti Memory</h3>
            <p className="text-xs text-muted-foreground">
              Default providers for graph-based memory
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LLM Provider */}
          <div className="space-y-2">
            <Label className="text-foreground">Default LLM Provider</Label>
            <Select
              value={formData.default_graphiti_llm_provider}
              onValueChange={(value) => handleChange('default_graphiti_llm_provider', value)}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Use global default" />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Embedder Provider */}
          <div className="space-y-2">
            <Label className="text-foreground">Default Embedder Provider</Label>
            <Select
              value={formData.default_graphiti_embedder_provider}
              onValueChange={(value) => handleChange('default_graphiti_embedder_provider', value)}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Use global default" />
              </SelectTrigger>
              <SelectContent>
                {EMBEDDER_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Git Settings */}
      <div className="card-surface p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-500/20 border border-gray-500/30 rounded-lg flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">Git Settings</h3>
            <p className="text-xs text-muted-foreground">
              Default git configuration
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-foreground">Default Branch</Label>
          <Input
            value={formData.default_branch}
            onChange={(e) => handleChange('default_branch', e.target.value)}
            placeholder="Leave empty for global default (main)"
            className="bg-secondary border-border max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            Default git branch for new projects
          </p>
        </div>
      </div>
    </div>
  );
}
