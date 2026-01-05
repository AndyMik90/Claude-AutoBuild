import { useState, useEffect } from 'react';
import { FolderGit, Plus, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TerminalWorktreeConfig } from '../../../shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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
import { cn } from '../../lib/utils';

interface WorktreeSelectorProps {
  terminalId: string;
  projectPath: string;
  /** Currently attached worktree config, if any */
  currentWorktree?: TerminalWorktreeConfig;
  /** Callback to create a new worktree */
  onCreateWorktree: () => void;
  /** Callback when an existing worktree is selected */
  onSelectWorktree: (config: TerminalWorktreeConfig) => void;
}

export function WorktreeSelector({
  terminalId: _terminalId,
  projectPath,
  currentWorktree,
  onCreateWorktree,
  onSelectWorktree,
}: WorktreeSelectorProps) {
  const { t } = useTranslation(['terminal', 'common']);
  const [worktrees, setWorktrees] = useState<TerminalWorktreeConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [deleteWorktree, setDeleteWorktree] = useState<TerminalWorktreeConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch worktrees when dropdown opens
  const fetchWorktrees = async () => {
    if (!projectPath) return;
    setIsLoading(true);
    try {
      const result = await window.electronAPI.listTerminalWorktrees(projectPath);
      if (result.success && result.data) {
        // Filter out the current worktree from the list
        const available = currentWorktree
          ? result.data.filter((wt) => wt.name !== currentWorktree.name)
          : result.data;
        setWorktrees(available);
      }
    } catch (err) {
      console.error('Failed to fetch worktrees:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectPath) {
      fetchWorktrees();
    }
  }, [isOpen, projectPath, currentWorktree]);

  // Handle delete worktree
  const handleDeleteWorktree = async () => {
    if (!deleteWorktree || !projectPath) return;
    setIsDeleting(true);
    try {
      const result = await window.electronAPI.removeTerminalWorktree(
        projectPath,
        deleteWorktree.name,
        deleteWorktree.hasGitBranch // Delete the branch too if it was created
      );
      if (result.success) {
        // Refresh the list
        await fetchWorktrees();
      } else {
        console.error('Failed to delete worktree:', result.error);
      }
    } catch (err) {
      console.error('Failed to delete worktree:', err);
    } finally {
      setIsDeleting(false);
      setDeleteWorktree(null);
    }
  };

  // If terminal already has a worktree, show worktree badge (handled in TerminalHeader)
  // This component only shows when there's no worktree attached

  return (
    <>
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 h-6 px-2 rounded text-xs font-medium transition-colors',
            'hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <FolderGit className="h-3 w-3" />
          <span>{t('terminal:worktree.create')}</span>
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* New Worktree - always at top */}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
            onCreateWorktree();
          }}
          className="text-xs text-amber-500"
        >
          <Plus className="h-3 w-3 mr-2" />
          {t('terminal:worktree.createNew')}
        </DropdownMenuItem>

        {/* Separator and existing worktrees */}
        {isLoading ? (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : worktrees.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t('terminal:worktree.existing')}
            </div>
            {worktrees.map((wt) => (
              <DropdownMenuItem
                key={wt.name}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onSelectWorktree(wt);
                }}
                className="text-xs group"
              >
                <FolderGit className="h-3 w-3 mr-2 text-amber-500/70 shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate font-medium">{wt.name}</span>
                  {wt.branchName && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {wt.branchName}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDeleteWorktree(wt);
                  }}
                  className="ml-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title={t('common:delete')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={!!deleteWorktree} onOpenChange={(open) => !open && setDeleteWorktree(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('terminal:worktree.deleteTitle', 'Delete Worktree?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('terminal:worktree.deleteDescription', 'This will permanently delete the worktree and its branch. Any uncommitted changes will be lost.')}
            {deleteWorktree && (
              <span className="block mt-2 font-mono text-sm">
                {deleteWorktree.name}
                {deleteWorktree.branchName && (
                  <span className="text-muted-foreground"> ({deleteWorktree.branchName})</span>
                )}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('common:cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteWorktree}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common:deleting', 'Deleting...')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common:delete')}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
