/**
 * Agent Profile Settings Component
 *
 * Allows users to configure agent behavior for a project:
 * - Model selection
 * - Thinking level
 * - Complexity settings
 * - Memory backend
 * - Git settings
 * - QA settings
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  Brain,
  Cpu,
  GitBranch,
  Database,
  CheckCircle,
  Zap,
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

interface AgentProfile {
  id: string;
  project_id: string;
  default_model: string;
  thinking_level: string;
  phase_models: Record<string, string> | null;
  default_complexity: string;
  auto_detect_complexity: boolean;
  memory_backend: string;
  graphiti_config: Record<string, unknown> | null;
  default_branch: string;
  auto_commit: boolean;
  auto_push: boolean;
  max_parallel_subtasks: number;
  qa_strict_mode: boolean;
  recovery_attempts: number;
  custom_prompts: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

interface AgentProfileSettingsProps {
  projectId: string;
  authFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Latest)' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
];

const THINKING_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultrathink', label: 'Ultrathink' },
];

const COMPLEXITY_OPTIONS = [
  { value: 'simple', label: 'Simple (3 phases)' },
  { value: 'standard', label: 'Standard (6-7 phases)' },
  { value: 'complex', label: 'Complex (8 phases)' },
];

const MEMORY_BACKENDS = [
  { value: 'file', label: 'File-based (Default)' },
  { value: 'graphiti', label: 'Graphiti (Graph DB)' },
];

export function AgentProfileSettings({ projectId, authFetch }: AgentProfileSettingsProps) {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-20250514');
  const [thinkingLevel, setThinkingLevel] = useState('medium');
  const [defaultComplexity, setDefaultComplexity] = useState('standard');
  const [autoDetectComplexity, setAutoDetectComplexity] = useState(true);
  const [memoryBackend, setMemoryBackend] = useState('file');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [autoCommit, setAutoCommit] = useState(true);
  const [autoPush, setAutoPush] = useState(false);
  const [maxParallelSubtasks, setMaxParallelSubtasks] = useState(3);
  const [qaStrictMode, setQaStrictMode] = useState(false);
  const [recoveryAttempts, setRecoveryAttempts] = useState(2);

  useEffect(() => {
    loadProfile();
  }, [projectId]);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch(`/projects/${projectId}/agent-profile`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
        // Update form state with loaded values
        setDefaultModel(data.default_model);
        setThinkingLevel(data.thinking_level);
        setDefaultComplexity(data.default_complexity);
        setAutoDetectComplexity(data.auto_detect_complexity);
        setMemoryBackend(data.memory_backend);
        setDefaultBranch(data.default_branch);
        setAutoCommit(data.auto_commit);
        setAutoPush(data.auto_push);
        setMaxParallelSubtasks(data.max_parallel_subtasks);
        setQaStrictMode(data.qa_strict_mode);
        setRecoveryAttempts(data.recovery_attempts);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load agent profile');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authFetch(`/projects/${projectId}/agent-profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          default_model: defaultModel,
          thinking_level: thinkingLevel,
          default_complexity: defaultComplexity,
          auto_detect_complexity: autoDetectComplexity,
          memory_backend: memoryBackend,
          default_branch: defaultBranch,
          auto_commit: autoCommit,
          auto_push: autoPush,
          max_parallel_subtasks: maxParallelSubtasks,
          qa_strict_mode: qaStrictMode,
          recovery_attempts: recoveryAttempts,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
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
          <h3 className="text-lg font-semibold text-foreground">Agent Profile</h3>
          <p className="text-sm text-muted-foreground">
            Configure how AI agents work on this project
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProfile}
            disabled={isLoading}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
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

      {/* Model Settings */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary" />
          <h4 className="font-medium text-foreground">Model Settings</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="model" className="text-foreground">
              Default Model
            </Label>
            <Select value={defaultModel} onValueChange={setDefaultModel}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="thinking" className="text-foreground">
              Thinking Level
            </Label>
            <Select value={thinkingLevel} onValueChange={setThinkingLevel}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {THINKING_LEVELS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Complexity Settings */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-primary" />
          <h4 className="font-medium text-foreground">Complexity Settings</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="complexity" className="text-foreground">
              Default Complexity
            </Label>
            <Select value={defaultComplexity} onValueChange={setDefaultComplexity}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {COMPLEXITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
            <div>
              <Label className="text-foreground">Auto-detect Complexity</Label>
              <p className="text-xs text-muted-foreground">
                Let AI choose the right complexity level
              </p>
            </div>
            <Switch checked={autoDetectComplexity} onCheckedChange={setAutoDetectComplexity} />
          </div>
        </div>
      </div>

      {/* Memory Settings */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-primary" />
          <h4 className="font-medium text-foreground">Memory Settings</h4>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memory" className="text-foreground">
            Memory Backend
          </Label>
          <Select value={memoryBackend} onValueChange={setMemoryBackend}>
            <SelectTrigger className="w-full md:w-[300px] bg-secondary border-border text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {MEMORY_BACKENDS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            File-based memory is always available. Graphiti requires a FalkorDB instance.
          </p>
        </div>
      </div>

      {/* Git Settings */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-primary" />
          <h4 className="font-medium text-foreground">Git Settings</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-foreground">
              Default Branch
            </Label>
            <Input
              id="branch"
              type="text"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder="main"
              className="bg-secondary border-border text-foreground"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <Label className="text-foreground">Auto-commit</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically commit completed changes
                </p>
              </div>
              <Switch checked={autoCommit} onCheckedChange={setAutoCommit} />
            </div>

            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <Label className="text-foreground">Auto-push</Label>
                <p className="text-xs text-muted-foreground">
                  Push commits to remote automatically
                </p>
              </div>
              <Switch checked={autoPush} onCheckedChange={setAutoPush} />
            </div>
          </div>
        </div>
      </div>

      {/* Execution Settings */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-primary" />
          <h4 className="font-medium text-foreground">Execution Settings</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="parallel" className="text-foreground">
              Max Parallel Subtasks
            </Label>
            <Input
              id="parallel"
              type="number"
              min={1}
              max={10}
              value={maxParallelSubtasks}
              onChange={(e) => setMaxParallelSubtasks(parseInt(e.target.value) || 1)}
              className="bg-secondary border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of subtasks to run in parallel
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recovery" className="text-foreground">
              Recovery Attempts
            </Label>
            <Input
              id="recovery"
              type="number"
              min={0}
              max={5}
              value={recoveryAttempts}
              onChange={(e) => setRecoveryAttempts(parseInt(e.target.value) || 0)}
              className="bg-secondary border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              How many times to retry failed tasks
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary rounded-lg md:col-span-2">
            <div>
              <Label className="text-foreground">QA Strict Mode</Label>
              <p className="text-xs text-muted-foreground">
                Require all acceptance criteria to pass
              </p>
            </div>
            <Switch checked={qaStrictMode} onCheckedChange={setQaStrictMode} />
          </div>
        </div>
      </div>
    </div>
  );
}
