import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Loader2, FolderGit, ListTodo } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Task, TerminalWorktreeConfig } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';

// Special value to represent "use project default" since Radix UI Select doesn't allow empty string values
const PROJECT_DEFAULT_BRANCH = '__project_default__';

interface CreateWorktreeDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Terminal ID to associate with the worktree */
  terminalId: string;
  /** Project path for worktree creation */
  projectPath: string;
  /** Available backlog tasks for linking */
  backlogTasks: Task[];
  /** Callback when worktree is successfully created */
  onWorktreeCreated: (config: TerminalWorktreeConfig) => void;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  terminalId,
  projectPath,
  backlogTasks,
  onWorktreeCreated,
}: CreateWorktreeDialogProps) {
  const { t } = useTranslation(['terminal', 'common']);
  const [name, setName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [createGitBranch, setCreateGitBranch] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get project settings for default branch
  const project = useProjectStore((state) =>
    state.projects.find((p) => p.path === projectPath)
  );

  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [baseBranch, setBaseBranch] = useState<string>(PROJECT_DEFAULT_BRANCH);
  const [projectDefaultBranch, setProjectDefaultBranch] = useState<string>('');

  // Fetch branches when dialog opens
  useEffect(() => {
    if (open && projectPath) {
      const fetchBranches = async () => {
        setIsLoadingBranches(true);
        try {
          const result = await window.electronAPI.getGitBranches(projectPath);
          if (result.success && result.data) {
            setBranches(result.data);
          }

          // Use project settings mainBranch if available, otherwise auto-detect
          if (project?.settings?.mainBranch) {
            setProjectDefaultBranch(project.settings.mainBranch);
          } else {
            // Fallback to auto-detect if no project setting
            const defaultResult = await window.electronAPI.detectMainBranch(projectPath);
            if (defaultResult.success && defaultResult.data) {
              setProjectDefaultBranch(defaultResult.data);
            }
          }
        } catch (err) {
          console.error('Failed to fetch branches:', err);
        } finally {
          setIsLoadingBranches(false);
        }
      };
      fetchBranches();
    }
  }, [open, projectPath, project?.settings?.mainBranch]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-sanitize: lowercase, replace spaces and invalid chars
    const sanitized = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    setName(sanitized);
    setError(null);
  }, []);

  const handleTaskSelect = useCallback((taskId: string) => {
    if (taskId === 'none') {
      setSelectedTaskId(undefined);
      return;
    }
    setSelectedTaskId(taskId);
    // Auto-fill name from task if empty
    if (!name) {
      const task = backlogTasks.find(t => t.id === taskId);
      if (task) {
        // Convert task title to valid name
        const autoName = task.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30);
        setName(autoName);
      }
    }
  }, [backlogTasks, name]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('terminal:worktree.nameRequired'));
      return;
    }

    // Validate name format
    if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
      setError(t('terminal:worktree.nameInvalid'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await window.electronAPI.createTerminalWorktree({
        terminalId,
        name: name.trim(),
        taskId: selectedTaskId,
        createGitBranch,
        projectPath,
        // Only include baseBranch if not using project default
        baseBranch: baseBranch !== PROJECT_DEFAULT_BRANCH ? baseBranch : undefined,
      });

      if (result.success && result.config) {
        onWorktreeCreated(result.config);
        onOpenChange(false);
        // Reset form
        setName('');
        setSelectedTaskId(undefined);
        setCreateGitBranch(true);
      } else {
        setError(result.error || t('common:errors.generic'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:errors.generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form on close
      setName('');
      setSelectedTaskId(undefined);
      setCreateGitBranch(true);
      setBaseBranch(PROJECT_DEFAULT_BRANCH);
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit className="h-5 w-5" />
            {t('terminal:worktree.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('terminal:worktree.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Worktree Name */}
          <div className="space-y-2">
            <Label htmlFor="worktree-name">{t('terminal:worktree.name')}</Label>
            <Input
              id="worktree-name"
              value={name}
              onChange={handleNameChange}
              placeholder={t('terminal:worktree.namePlaceholder')}
              disabled={isCreating}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('terminal:worktree.nameHelp')}
            </p>
          </div>

          {/* Task Association (Optional) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              {t('terminal:worktree.associateTask')}
              <span className="text-muted-foreground text-xs">({t('common:labels.optional')})</span>
            </Label>
            <Select value={selectedTaskId || 'none'} onValueChange={handleTaskSelect}>
              <SelectTrigger>
                <SelectValue placeholder={t('terminal:worktree.selectTask')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('terminal:worktree.noTask')}</SelectItem>
                {backlogTasks.slice(0, 10).map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    <span className="truncate max-w-[300px]">{task.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Git Branch Toggle */}
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="create-branch" className="flex items-center gap-2 cursor-pointer">
                <GitBranch className="h-4 w-4" />
                {t('terminal:worktree.createBranch')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('terminal:worktree.branchHelp', { branch: `terminal/${name || 'name'}` })}
              </p>
            </div>
            <Switch
              id="create-branch"
              checked={createGitBranch}
              onCheckedChange={setCreateGitBranch}
              disabled={isCreating}
            />
          </div>

          {/* Base Branch Selection */}
          <div className="space-y-2">
            <Label htmlFor="base-branch" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              {t('terminal:worktree.baseBranch')}
            </Label>
            <Select
              value={baseBranch}
              onValueChange={setBaseBranch}
              disabled={isCreating || isLoadingBranches}
            >
              <SelectTrigger id="base-branch">
                <SelectValue placeholder={t('terminal:worktree.selectBaseBranch')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PROJECT_DEFAULT_BRANCH}>
                  {t('terminal:worktree.useProjectDefault', { branch: projectDefaultBranch || 'main' })}
                </SelectItem>
                {branches
                  .filter(b => b !== projectDefaultBranch)
                  .slice(0, 15)
                  .map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                {projectDefaultBranch && !branches.includes(projectDefaultBranch) && (
                  <SelectItem value={projectDefaultBranch}>
                    {projectDefaultBranch}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('terminal:worktree.baseBranchHelp')}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            {t('common:buttons.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common:labels.creating')}
              </>
            ) : (
              t('common:buttons.create')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
