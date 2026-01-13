/**
 * Global Settings Component
 *
 * Admin-only component for managing global (system-wide) settings.
 * These settings apply to all users unless overridden at user/project level.
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  CheckCircle,
  Info,
  Brain,
  Cloud,
  Server,
  Link2,
  Settings2,
  Monitor,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface GlobalSettingsData {
  graphiti_enabled: boolean;
  graphiti_llm_provider: string | null;
  graphiti_embedder_provider: string | null;
  graphiti_model_name: string | null;
  graphiti_embedding_model: string | null;
  graphiti_database: string | null;
  azure_openai_base_url: string | null;
  azure_openai_llm_deployment: string | null;
  azure_openai_embedding_deployment: string | null;
  ollama_base_url: string | null;
  ollama_llm_model: string | null;
  ollama_embedding_model: string | null;
  ollama_embedding_dim: number | null;
  linear_team_id: string | null;
  linear_project_id: string | null;
  default_branch: string;
  debug_mode: boolean;
  auto_build_model: string | null;
  electron_mcp_enabled: boolean;
  electron_debug_port: number;
}

interface GlobalSettingsProps {
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card-surface overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-medium text-foreground">{title}</h3>
        </div>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'google', label: 'Google AI' },
];

const EMBEDDER_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'voyage', label: 'Voyage AI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'google', label: 'Google AI' },
];

export function GlobalSettings({ authFetch }: GlobalSettingsProps) {
  const [settings, setSettings] = useState<GlobalSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state for edits
  const [formData, setFormData] = useState<Partial<GlobalSettingsData>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/admin/settings/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setFormData(data);
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

  const handleChange = (key: keyof GlobalSettingsData, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authFetch('/admin/settings/settings', {
        method: 'PUT',
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setFormData(data);
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
      setFormData(settings);
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
          <h2 className="text-xl font-bold text-foreground">System Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure global settings for all users and projects
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
            These global settings serve as defaults. Users and projects can override some settings
            (like Graphiti providers) at their own level.
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

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* Graphiti Memory */}
        <CollapsibleSection
          title="Graphiti Memory"
          icon={<Brain className="w-5 h-5 text-primary" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <Label className="text-foreground">Enable Graphiti</Label>
                <p className="text-xs text-muted-foreground">
                  Enable graph-based memory for cross-session context
                </p>
              </div>
              <Switch
                checked={formData.graphiti_enabled || false}
                onCheckedChange={(checked) => handleChange('graphiti_enabled', checked)}
              />
            </div>

            {formData.graphiti_enabled && (
              <>
                {/* LLM Provider */}
                <div className="space-y-2">
                  <Label className="text-foreground">LLM Provider</Label>
                  <Select
                    value={formData.graphiti_llm_provider || ''}
                    onValueChange={(value) => handleChange('graphiti_llm_provider', value || null)}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select LLM provider" />
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
                  <Label className="text-foreground">Embedder Provider</Label>
                  <Select
                    value={formData.graphiti_embedder_provider || ''}
                    onValueChange={(value) => handleChange('graphiti_embedder_provider', value || null)}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Select embedder provider" />
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

                {/* Model Name */}
                <div className="space-y-2">
                  <Label className="text-foreground">LLM Model Name</Label>
                  <Input
                    value={formData.graphiti_model_name || ''}
                    onChange={(e) => handleChange('graphiti_model_name', e.target.value || null)}
                    placeholder="e.g., gpt-4o-mini, claude-3-5-sonnet-latest"
                    className="bg-secondary border-border"
                  />
                </div>

                {/* Embedding Model */}
                <div className="space-y-2">
                  <Label className="text-foreground">Embedding Model</Label>
                  <Input
                    value={formData.graphiti_embedding_model || ''}
                    onChange={(e) => handleChange('graphiti_embedding_model', e.target.value || null)}
                    placeholder="e.g., text-embedding-3-small"
                    className="bg-secondary border-border"
                  />
                </div>

                {/* Database Name */}
                <div className="space-y-2">
                  <Label className="text-foreground">Database Name</Label>
                  <Input
                    value={formData.graphiti_database || ''}
                    onChange={(e) => handleChange('graphiti_database', e.target.value || null)}
                    placeholder="e.g., auto_claude"
                    className="bg-secondary border-border"
                  />
                </div>
              </>
            )}
          </div>
        </CollapsibleSection>

        {/* Azure OpenAI */}
        <CollapsibleSection
          title="Azure OpenAI"
          icon={<Cloud className="w-5 h-5 text-blue-500" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure Azure OpenAI service for LLM and embeddings
            </p>

            {/* Base URL */}
            <div className="space-y-2">
              <Label className="text-foreground">Base URL</Label>
              <Input
                value={formData.azure_openai_base_url || ''}
                onChange={(e) => handleChange('azure_openai_base_url', e.target.value || null)}
                placeholder="https://your-resource.openai.azure.com/"
                className="bg-secondary border-border"
              />
            </div>

            {/* LLM Deployment */}
            <div className="space-y-2">
              <Label className="text-foreground">LLM Deployment Name</Label>
              <Input
                value={formData.azure_openai_llm_deployment || ''}
                onChange={(e) => handleChange('azure_openai_llm_deployment', e.target.value || null)}
                placeholder="e.g., gpt-4o"
                className="bg-secondary border-border"
              />
            </div>

            {/* Embedding Deployment */}
            <div className="space-y-2">
              <Label className="text-foreground">Embedding Deployment Name</Label>
              <Input
                value={formData.azure_openai_embedding_deployment || ''}
                onChange={(e) => handleChange('azure_openai_embedding_deployment', e.target.value || null)}
                placeholder="e.g., text-embedding-3-small"
                className="bg-secondary border-border"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Ollama (Local AI) */}
        <CollapsibleSection
          title="Ollama (Local AI)"
          icon={<Server className="w-5 h-5 text-green-500" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure Ollama for local/offline AI processing
            </p>

            {/* Base URL */}
            <div className="space-y-2">
              <Label className="text-foreground">Ollama URL</Label>
              <Input
                value={formData.ollama_base_url || ''}
                onChange={(e) => handleChange('ollama_base_url', e.target.value || null)}
                placeholder="http://localhost:11434"
                className="bg-secondary border-border"
              />
            </div>

            {/* LLM Model */}
            <div className="space-y-2">
              <Label className="text-foreground">LLM Model</Label>
              <Input
                value={formData.ollama_llm_model || ''}
                onChange={(e) => handleChange('ollama_llm_model', e.target.value || null)}
                placeholder="e.g., llama3.2, mistral"
                className="bg-secondary border-border"
              />
            </div>

            {/* Embedding Model */}
            <div className="space-y-2">
              <Label className="text-foreground">Embedding Model</Label>
              <Input
                value={formData.ollama_embedding_model || ''}
                onChange={(e) => handleChange('ollama_embedding_model', e.target.value || null)}
                placeholder="e.g., nomic-embed-text"
                className="bg-secondary border-border"
              />
            </div>

            {/* Embedding Dimensions */}
            <div className="space-y-2">
              <Label className="text-foreground">Embedding Dimensions</Label>
              <Input
                type="number"
                value={formData.ollama_embedding_dim || ''}
                onChange={(e) => handleChange('ollama_embedding_dim', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 768"
                className="bg-secondary border-border"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Linear Integration */}
        <CollapsibleSection
          title="Linear Integration"
          icon={<Link2 className="w-5 h-5 text-purple-500" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure Linear project tracking integration
            </p>

            {/* Team ID */}
            <div className="space-y-2">
              <Label className="text-foreground">Team ID</Label>
              <Input
                value={formData.linear_team_id || ''}
                onChange={(e) => handleChange('linear_team_id', e.target.value || null)}
                placeholder="Enter Linear team ID"
                className="bg-secondary border-border"
              />
            </div>

            {/* Project ID */}
            <div className="space-y-2">
              <Label className="text-foreground">Project ID</Label>
              <Input
                value={formData.linear_project_id || ''}
                onChange={(e) => handleChange('linear_project_id', e.target.value || null)}
                placeholder="Enter Linear project ID"
                className="bg-secondary border-border"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* General Settings */}
        <CollapsibleSection
          title="General Settings"
          icon={<Settings2 className="w-5 h-5 text-gray-500" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            {/* Default Branch */}
            <div className="space-y-2">
              <Label className="text-foreground">Default Branch</Label>
              <Input
                value={formData.default_branch || 'main'}
                onChange={(e) => handleChange('default_branch', e.target.value)}
                placeholder="main"
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Default git branch for new projects
              </p>
            </div>

            {/* Debug Mode */}
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <Label className="text-foreground">Debug Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Enable verbose logging and debug output
                </p>
              </div>
              <Switch
                checked={formData.debug_mode || false}
                onCheckedChange={(checked) => handleChange('debug_mode', checked)}
              />
            </div>

            {/* Auto-build Model */}
            <div className="space-y-2">
              <Label className="text-foreground">Auto-build Model Override</Label>
              <Input
                value={formData.auto_build_model || ''}
                onChange={(e) => handleChange('auto_build_model', e.target.value || null)}
                placeholder="Leave empty for default"
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                Override the default model for auto-build operations
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Electron MCP */}
        <CollapsibleSection
          title="Electron MCP"
          icon={<Monitor className="w-5 h-5 text-cyan-500" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure Electron Model Context Protocol for desktop integration
            </p>

            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <Label className="text-foreground">Enable Electron MCP</Label>
                <p className="text-xs text-muted-foreground">
                  Enable desktop app integration
                </p>
              </div>
              <Switch
                checked={formData.electron_mcp_enabled || false}
                onCheckedChange={(checked) => handleChange('electron_mcp_enabled', checked)}
              />
            </div>

            {formData.electron_mcp_enabled && (
              <div className="space-y-2">
                <Label className="text-foreground">Debug Port</Label>
                <Input
                  type="number"
                  value={formData.electron_debug_port || 9222}
                  onChange={(e) => handleChange('electron_debug_port', parseInt(e.target.value) || 9222)}
                  placeholder="9222"
                  className="bg-secondary border-border"
                />
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
