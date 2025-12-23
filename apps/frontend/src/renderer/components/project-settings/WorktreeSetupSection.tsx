import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import type { ProjectSettings } from '../../../shared/types';
import { DEFAULT_WORKTREE_SETUP_TIMEOUT_MS } from '../../../shared/constants';
import { useWorktreeTemplates } from './hooks/useWorktreeTemplates';

interface WorktreeSetupSectionProps {
  settings: ProjectSettings;
  projectPath?: string;
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
}

function parseCommands(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

function formatCommands(commands: string[]): string {
  return commands.join('\n');
}

export function WorktreeSetupSection({ settings, projectPath, onUpdateSettings }: WorktreeSetupSectionProps) {
  const { templates } = useWorktreeTemplates(projectPath);
  const config = useMemo(() => settings.worktreeSetup || {
    enabled: false,
    commands: [],
    timeout: DEFAULT_WORKTREE_SETUP_TIMEOUT_MS
  }, [settings.worktreeSetup]);

  const handleToggle = (enabled: boolean) => {
    onUpdateSettings({
      worktreeSetup: {
        ...config,
        enabled
      }
    });
  };

  const handleCommandsChange = (text: string) => {
    onUpdateSettings({
      worktreeSetup: {
        ...config,
        commands: parseCommands(text)
      }
    });
  };

  const addTemplate = (cmd: string) => {
    const exists = config.commands.some(c => c === cmd);
    if (exists) return;

    onUpdateSettings({
      worktreeSetup: {
        ...config,
        commands: [...config.commands, cmd]
      }
    });
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Worktree Setup</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="font-normal text-foreground">Enable Auto-Setup</Label>
            <p className="text-xs text-muted-foreground">
              Run commands when task enters Human Review
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={handleToggle}
          />
        </div>

        {config.enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="worktree-commands" className="text-sm font-medium text-foreground">
                Setup Commands
              </Label>
              <div className="flex flex-wrap gap-1">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addTemplate(t.command)}
                    disabled={config.commands.includes(t.command)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id="worktree-commands"
              placeholder={`npm ci\ncp $PROJECT_PATH/.env .env\n# Lines starting with # are ignored`}
              value={formatCommands(config.commands)}
              onChange={(e) => handleCommandsChange(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Variables: <code className="bg-muted px-1 rounded">$WORKTREE_PATH</code>{' '}
              <code className="bg-muted px-1 rounded">$PROJECT_PATH</code>{' '}
              <code className="bg-muted px-1 rounded">$SPEC_NAME</code>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
