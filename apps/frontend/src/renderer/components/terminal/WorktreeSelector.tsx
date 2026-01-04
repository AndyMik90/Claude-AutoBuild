import { useState, useEffect } from 'react';
import { FolderGit, Plus, ChevronDown, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TerminalWorktreeConfig } from '../../../shared/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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

  // Fetch worktrees when dropdown opens
  useEffect(() => {
    if (isOpen && projectPath) {
      const fetchWorktrees = async () => {
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
      fetchWorktrees();
    }
  }, [isOpen, projectPath, currentWorktree]);

  // If terminal already has a worktree, show worktree badge (handled in TerminalHeader)
  // This component only shows when there's no worktree attached

  return (
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
                className="text-xs"
              >
                <FolderGit className="h-3 w-3 mr-2 text-amber-500/70" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{wt.name}</span>
                  {wt.branchName && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {wt.branchName}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
