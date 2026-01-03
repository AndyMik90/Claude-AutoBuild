import {
  Database,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Globe
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Separator } from '../ui/separator';
import type { ProjectEnvConfig, ProjectSettings as ProjectSettingsType } from '../../../shared/types';

interface SecuritySettingsProps {
  envConfig: ProjectEnvConfig | null;
  settings: ProjectSettingsType;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettingsType>>;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;

  // Password visibility
  showOpenAIKey: boolean;
  setShowOpenAIKey: React.Dispatch<React.SetStateAction<boolean>>;
  showFalkorPassword: boolean;
  setShowFalkorPassword: React.Dispatch<React.SetStateAction<boolean>>;

  // Collapsible section
  expanded: boolean;
  onToggle: () => void;
}

export function SecuritySettings({
  envConfig,
  settings,
  setSettings,
  updateEnvConfig,
  showOpenAIKey,
  setShowOpenAIKey,
  showFalkorPassword,
  setShowFalkorPassword,
  expanded,
  onToggle
}: SecuritySettingsProps) {
  if (!envConfig) return null;

  return (
    <section className="space-y-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
      >
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Memory Backend
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            envConfig.graphitiEnabled
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}>
            {envConfig.graphitiEnabled ? 'Graphiti' : 'File-based'}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 pl-6 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-normal text-foreground">Use Graphiti (Recommended)</Label>
              <p className="text-xs text-muted-foreground">
                Persistent cross-session memory using FalkorDB graph database
              </p>
            </div>
            <Switch
              checked={envConfig.graphitiEnabled}
              onCheckedChange={(checked) => {
                updateEnvConfig({ graphitiEnabled: checked });
                setSettings({ ...settings, memoryBackend: checked ? 'graphiti' : 'file' });
              }}
            />
          </div>

          {!envConfig.graphitiEnabled && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Using file-based memory. Session insights are stored locally in JSON files.
                Enable Graphiti for persistent cross-session memory with semantic search.
              </p>
            </div>
          )}

          {envConfig.graphitiEnabled && (
            <>
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs text-warning">
                  Requires FalkorDB running. Start with:{' '}
                  <code className="px-1 bg-warning/10 rounded">docker-compose up -d falkordb</code>
                </p>
              </div>

              {/* Graphiti MCP Server Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-normal text-foreground">Enable Agent Memory Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow agents to search and add to the knowledge graph via MCP
                  </p>
                </div>
                <Switch
                  checked={settings.graphitiMcpEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, graphitiMcpEnabled: checked })
                  }
                />
              </div>

              {settings.graphitiMcpEnabled && (
                <div className="space-y-2 ml-6">
                  <Label className="text-sm font-medium text-foreground">Graphiti MCP Server URL</Label>
                  <p className="text-xs text-muted-foreground">
                    URL of the Graphiti MCP server (requires Docker container)
                  </p>
                  <Input
                    placeholder="http://localhost:8000/mcp/"
                    value={settings.graphitiMcpUrl || ''}
                    onChange={(e) => setSettings({ ...settings, graphitiMcpUrl: e.target.value || undefined })}
                  />
                  <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                    <p className="text-xs text-info">
                      Start the MCP server with:{' '}
                      <code className="px-1 bg-info/10 rounded">docker run -d -p 8000:8000 falkordb/graphiti-knowledge-graph-mcp</code>
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {/* LLM Provider Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">LLM Provider</Label>
                <p className="text-xs text-muted-foreground">
                  Provider for graph operations (extraction, search, reasoning)
                </p>
                <Select
                  value={envConfig.graphitiProviderConfig?.llmProvider || 'openai'}
                  onValueChange={(value) => {
                    const currentConfig = envConfig.graphitiProviderConfig || {
                      llmProvider: 'openai' as const,
                      embeddingProvider: 'openai' as const
                    };
                    updateEnvConfig({
                      graphitiProviderConfig: {
                        ...currentConfig,
                        llmProvider: value as 'openai' | 'anthropic' | 'google' | 'groq',
                      }
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select LLM provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (GPT-5-mini)</SelectItem>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    <SelectItem value="google">Google (Gemini)</SelectItem>
                    <SelectItem value="groq">Groq (Llama)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Embedding Provider Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Embedding Provider</Label>
                <p className="text-xs text-muted-foreground">
                  Provider for semantic search embeddings
                </p>
                <Select
                  value={envConfig.graphitiProviderConfig?.embeddingProvider || 'openai'}
                  onValueChange={(value) => {
                    const currentConfig = envConfig.graphitiProviderConfig || {
                      llmProvider: 'openai' as const,
                      embeddingProvider: 'openai' as const
                    };
                    updateEnvConfig({
                      graphitiProviderConfig: {
                        ...currentConfig,
                        embeddingProvider: value as 'openai' | 'voyage' | 'google' | 'huggingface',
                      }
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select embedding provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="voyage">Voyage AI</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="huggingface">HuggingFace (Local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground">
                    OpenAI API Key {envConfig.openaiKeyIsGlobal ? '(Override)' : ''}
                  </Label>
                  {envConfig.openaiKeyIsGlobal && (
                    <span className="flex items-center gap-1 text-xs text-info">
                      <Globe className="h-3 w-3" />
                      Using global key
                    </span>
                  )}
                </div>
                {envConfig.openaiKeyIsGlobal ? (
                  <p className="text-xs text-muted-foreground">
                    Using key from App Settings. Enter a project-specific key below to override.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Required when using OpenAI as LLM or embedding provider
                  </p>
                )}
                <div className="relative">
                  <Input
                    type={showOpenAIKey ? 'text' : 'password'}
                    placeholder={envConfig.openaiKeyIsGlobal ? 'Enter to override global key...' : 'sk-xxxxxxxx'}
                    value={envConfig.openaiKeyIsGlobal ? '' : (envConfig.openaiApiKey || '')}
                    onChange={(e) => updateEnvConfig({ openaiApiKey: e.target.value || undefined })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">FalkorDB Host</Label>
                  <Input
                    placeholder="localhost"
                    value={envConfig.graphitiFalkorDbHost || ''}
                    onChange={(e) => updateEnvConfig({ graphitiFalkorDbHost: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">FalkorDB Port</Label>
                  <Input
                    type="number"
                    placeholder="6380"
                    value={envConfig.graphitiFalkorDbPort || ''}
                    onChange={(e) => updateEnvConfig({ graphitiFalkorDbPort: parseInt(e.target.value) || undefined })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">FalkorDB Password (Optional)</Label>
                <div className="relative">
                  <Input
                    type={showFalkorPassword ? 'text' : 'password'}
                    placeholder="Leave empty if none"
                    value={envConfig.graphitiFalkorDbPassword || ''}
                    onChange={(e) => updateEnvConfig({ graphitiFalkorDbPassword: e.target.value })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFalkorPassword(!showFalkorPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showFalkorPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Database Name</Label>
                <Input
                  placeholder="auto_claude_memory"
                  value={envConfig.graphitiDatabase || ''}
                  onChange={(e) => updateEnvConfig({ graphitiDatabase: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
