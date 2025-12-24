import { useState, useEffect } from 'react';
import { GitBranch, GitMerge, Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { MergeOptions } from '../../../../shared/types';

type MergeTarget = 'current' | 'existing' | 'new';

interface MergeTargetDialogProps {
  open: boolean;
  projectPath: string;
  currentBranch: string;
  isMerging: boolean;
  onOpenChange: (open: boolean) => void;
  onMerge: (options: MergeOptions) => void;
}

/**
 * Dialog for selecting merge target branch before merging worktree changes
 */
export function MergeTargetDialog({
  open,
  projectPath,
  currentBranch,
  isMerging,
  onOpenChange,
  onMerge,
}: MergeTargetDialogProps) {
  const [mergeTarget, setMergeTarget] = useState<MergeTarget>('current');
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [stageOnly, setStageOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch branches when dialog opens
  useEffect(() => {
    if (open && projectPath) {
      fetchBranches();
    }
  }, [open, projectPath]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMergeTarget('current');
      setSelectedBranch('');
      setNewBranchName('');
      setStageOnly(false);
      setError(null);
    }
  }, [open]);

  const fetchBranches = async () => {
    if (!projectPath) return;

    setIsLoadingBranches(true);
    try {
      const result = await window.electronAPI.getGitBranches(projectPath);
      if (result.success && result.data) {
        // Filter out current branch from the list (user can use "current branch" option for that)
        setBranches(result.data.filter(b => b !== currentBranch));
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const validateNewBranchName = (name: string): boolean => {
    if (!name.trim()) {
      setError('Branch name is required');
      return false;
    }
    // Basic git branch name validation
    if (/[\s~^:?*\[\]\\]/.test(name)) {
      setError('Branch name contains invalid characters');
      return false;
    }
    if (name.startsWith('-') || name.endsWith('.') || name.endsWith('/')) {
      setError('Branch name has invalid start or end character');
      return false;
    }
    if (branches.includes(name) || name === currentBranch) {
      setError('Branch already exists');
      return false;
    }
    setError(null);
    return true;
  };

  const handleMerge = () => {
    const options: MergeOptions = {
      noCommit: stageOnly,
    };

    if (mergeTarget === 'existing') {
      if (!selectedBranch) {
        setError('Please select a branch');
        return;
      }
      options.targetBranch = selectedBranch;
    } else if (mergeTarget === 'new') {
      if (!validateNewBranchName(newBranchName)) {
        return;
      }
      options.createBranch = newBranchName.trim();
    }
    // For 'current', we don't set targetBranch - merge will use current branch

    onMerge(options);
  };

  const canMerge =
    mergeTarget === 'current' ||
    (mergeTarget === 'existing' && selectedBranch) ||
    (mergeTarget === 'new' && newBranchName.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Target
          </DialogTitle>
          <DialogDescription>
            Choose where to merge the worktree changes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup
            value={mergeTarget}
            onValueChange={(value) => {
              setMergeTarget(value as MergeTarget);
              setError(null);
            }}
            className="space-y-3"
          >
            {/* Current Branch Option */}
            <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="current" id="current" />
              <Label htmlFor="current" className="flex-1 cursor-pointer">
                <div className="font-medium">Current branch</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  {currentBranch}
                </div>
              </Label>
            </div>

            {/* Existing Branch Option */}
            <div className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="existing" id="existing" />
                <Label htmlFor="existing" className="flex-1 cursor-pointer">
                  <div className="font-medium">Existing branch</div>
                  <div className="text-sm text-muted-foreground">
                    Merge into a different branch
                  </div>
                </Label>
              </div>
              {mergeTarget === 'existing' && (
                <div className="mt-3 ml-6">
                  <Select
                    value={selectedBranch}
                    onValueChange={(value) => {
                      setSelectedBranch(value);
                      setError(null);
                    }}
                    disabled={isLoadingBranches}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingBranches ? "Loading..." : "Select a branch"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.length === 0 ? (
                        <div className="py-2 px-3 text-sm text-muted-foreground">
                          No other branches available
                        </div>
                      ) : (
                        branches.map((branch) => (
                          <SelectItem key={branch} value={branch}>
                            <div className="flex items-center gap-2">
                              <GitBranch className="h-3.5 w-3.5" />
                              {branch}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* New Branch Option */}
            <div className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new" className="flex-1 cursor-pointer">
                  <div className="font-medium flex items-center gap-1.5">
                    <Plus className="h-4 w-4" />
                    Create new branch
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Create a feature branch for these changes
                  </div>
                </Label>
              </div>
              {mergeTarget === 'new' && (
                <div className="mt-3 ml-6">
                  <Input
                    placeholder="feature/my-changes"
                    value={newBranchName}
                    onChange={(e) => {
                      setNewBranchName(e.target.value);
                      if (error) validateNewBranchName(e.target.value);
                    }}
                    onBlur={() => newBranchName && validateNewBranchName(newBranchName)}
                    className={error ? 'border-destructive' : ''}
                  />
                </div>
              )}
            </div>
          </RadioGroup>

          {/* Error message */}
          {error && (
            <div className="text-sm text-destructive px-1">
              {error}
            </div>
          )}

          {/* Stage only checkbox */}
          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="stageOnly"
              checked={stageOnly}
              onCheckedChange={(checked) => setStageOnly(checked === true)}
            />
            <Label htmlFor="stageOnly" className="text-sm cursor-pointer">
              Stage only (don't commit)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isMerging || !canMerge}
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
