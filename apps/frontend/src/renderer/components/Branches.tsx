import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GitBranch,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  FileCode,
  Plus,
  Minus,
  ChevronRight,
  GitMerge,
  GitPullRequest
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';
import { useProjectStore } from '../stores/project-store';
import { useTaskStore } from '../stores/task-store';
import type { Task } from '../../shared/types';

interface BranchesProps {
  projectId: string;
}

interface BranchInfo {
  name: string;
  fullName: string; // e.g., 'auto-claude/001-task-name'
  task?: Task;
  isRemote: boolean;
}

export function Branches({ projectId }: BranchesProps) {
  const { t } = useTranslation(['common']);
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === projectId);
  const tasks = useTaskStore((state) => state.tasks);

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<BranchInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load branches
  const loadBranches = useCallback(async () => {
    if (!projectId || !selectedProject) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get all branches from git
      const result = await window.electronAPI.getGitBranches(selectedProject.path);

      if (result.success && result.data) {
        // Parse branches and filter for auto-claude branches
        const autoclaudeBranches: BranchInfo[] = [];

        for (let branch of result.data) {
          // API returns branch names, possibly with remotes/origin/ prefix
          const isRemote = branch.startsWith('remotes/origin/');

          if (isRemote) {
            branch = branch.replace('remotes/origin/', '');
          }

          // Only include auto-claude branches
          if (branch.startsWith('auto-claude/')) {
            // Extract spec name (001-task-name)
            const specName = branch.replace('auto-claude/', '');

            // Find associated task
            const task = tasks.find(t => t.branch === branch);

            // Avoid duplicates (local and remote of same branch)
            const existing = autoclaudeBranches.find(b => b.fullName === branch);
            if (!existing) {
              autoclaudeBranches.push({
                name: specName,
                fullName: branch,
                task,
                isRemote
              });
            }
          }
        }

        setBranches(autoclaudeBranches);
      } else {
        setError(result.error || 'Failed to load branches');
      }
    } catch (err) {
      console.error('[Branches] Error loading branches:', err);
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedProject, tasks]);

  // Load on mount and when project/tasks change
  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // Handle delete branch
  const handleDelete = async () => {
    if (!branchToDelete || !selectedProject) return;

    setIsDeleting(true);
    try {
      // Delete both local and remote branch
      const deleteLocal = await window.electronAPI.invoke('execute-command', {
        command: 'git',
        args: ['branch', '-D', branchToDelete.fullName],
        cwd: selectedProject.path
      });

      if (deleteLocal.success) {
        // Try to delete remote branch as well
        await window.electronAPI.invoke('execute-command', {
          command: 'git',
          args: ['push', 'origin', '--delete', branchToDelete.fullName],
          cwd: selectedProject.path
        });

        // Refresh branches after successful delete
        await loadBranches();
        setShowDeleteConfirm(false);
        setBranchToDelete(null);
      } else {
        setError(deleteLocal.error || 'Failed to delete branch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete branch');
    } finally {
      setIsDeleting(false);
    }
  };

  // Merge state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [branchToMerge, setBranchToMerge] = useState<BranchInfo | null>(null);

  // Open merge dialog
  const openMergeDialog = (branch: BranchInfo) => {
    setBranchToMerge(branch);
    setShowMergeDialog(true);
  };

  // Handle merge - copy merge instructions to clipboard
  const handleMergeBranch = async () => {
    if (!branchToMerge || !branchToMerge.task || !selectedProject) return;

    const baseBranch = branchToMerge.task.metadata?.baseBranch || 'main';
    const commands = `git checkout ${baseBranch} && git pull origin ${baseBranch} && git merge ${branchToMerge.fullName} && git push origin ${baseBranch}`;

    await navigator.clipboard.writeText(commands);
    setShowMergeDialog(false);

    // Show notification
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification({
        title: 'Merge Command Copied',
        body: `Paste the command in your terminal to merge ${branchToMerge.name}`
      });
    }
  };

  // Confirm delete
  const confirmDelete = (branch: BranchInfo) => {
    setBranchToDelete(branch);
    setShowDeleteConfirm(true);
  };

  if (!selectedProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view branches</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Branches (DIRECT Mode)</h2>
            <p className="text-xs text-muted-foreground">Auto Claude branches for tasks executed in DIRECT mode</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadBranches}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-6 mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">Error</p>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && branches.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && branches.length === 0 && !error && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <GitBranch className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No DIRECT Mode Branches</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Branches are created automatically when Auto Claude executes tasks in DIRECT mode (without worktrees).
          </p>
        </div>
      )}

      {/* Main content area with scroll */}
      {branches.length > 0 && (
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 py-6">
            {branches.map((branch) => {
              const { task } = branch;
              return (
                <Card key={branch.fullName} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-purple-400 shrink-0" />
                          <span className="truncate">{branch.fullName}</span>
                        </CardTitle>
                        {task && (
                          <CardDescription className="mt-1 truncate">
                            {task.title}
                          </CardDescription>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 ml-2">
                        {branch.name}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Stats - placeholder since we don't have this data for direct branches */}
                    {task && (
                      <div className="flex flex-wrap gap-4 text-sm mb-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <FileCode className="h-3.5 w-3.5" />
                          <span>Changes tracked in task</span>
                        </div>
                      </div>
                    )}

                    {/* Branch info - show base branch if we have task */}
                    {task && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 bg-muted/50 rounded-md p-2">
                        <span className="font-mono">{task.metadata?.baseBranch || 'main'}</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono text-purple-400">{branch.fullName}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openMergeDialog(branch)}
                        disabled={!task}
                      >
                        <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                        Merge to {task?.metadata?.baseBranch || 'main'}
                      </Button>
                      {task?.metadata?.prUrl ? (
                        <Button
                          variant="info"
                          size="sm"
                          onClick={() => window.electronAPI?.openExternal(task.metadata?.prUrl ?? '')}
                        >
                          <GitPullRequest className="h-3.5 w-3.5 mr-1.5" />
                          Open PR
                        </Button>
                      ) : task?.status === 'done' || task?.status === 'human_review' ? (
                        <Button
                          variant="info"
                          size="sm"
                          disabled
                          title="Create PR manually from GitHub/GitLab"
                        >
                          <GitPullRequest className="h-3.5 w-3.5 mr-1.5" />
                          Create PR
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Copy branch name to clipboard
                          navigator.clipboard.writeText(branch.fullName);
                        }}
                      >
                        <FileCode className="h-3.5 w-3.5 mr-1.5" />
                        Copy Name
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => confirmDelete(branch)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>

                    {!task && (
                      <p className="text-xs text-muted-foreground mt-3">
                        No associated task found for this branch.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Merge Dialog */}
      <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will copy the merge command to your clipboard. You can paste it in your terminal to merge the branch.
              {branchToMerge && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-purple-400">{branchToMerge.fullName}</span>
                    <ChevronRight className="h-3 w-3" />
                    <span className="font-mono">{branchToMerge.task?.metadata?.baseBranch || 'main'}</span>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMergeBranch}>
              Copy Merge Command
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the branch from both local and remote repositories.
              {branchToDelete && (
                <span className="block mt-2 font-mono text-sm">
                  {branchToDelete.fullName}
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
