import { useState, useEffect, useCallback } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { MergeRequestList } from './components/MergeRequestList';
import { CreateMergeRequestDialog } from './components/CreateMergeRequestDialog';
import type { GitLabMergeRequest } from '../../../shared/types';

interface GitLabMergeRequestsProps {
  projectId: string;
}

export function GitLabMergeRequests({ projectId }: GitLabMergeRequestsProps) {
  const [mergeRequests, setMergeRequests] = useState<GitLabMergeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMr, setSelectedMr] = useState<GitLabMergeRequest | null>(null);
  const [stateFilter, setStateFilter] = useState<'opened' | 'closed' | 'merged' | 'all'>('opened');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchMergeRequests = useCallback(async (): Promise<GitLabMergeRequest[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getGitLabMergeRequests(projectId, stateFilter);
      if (result.success && result.data) {
        setMergeRequests(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to fetch merge requests');
        return [];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch merge requests');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [projectId, stateFilter]);

  useEffect(() => {
    fetchMergeRequests();
  }, [fetchMergeRequests]);

  const handleSelectMr = (mr: GitLabMergeRequest) => {
    setSelectedMr(mr);
  };

  const handleCreateSuccess = async (mrIid: number) => {
    // Fetch fresh data and then select the newly created MR
    const freshData = await fetchMergeRequests();
    const newMr = freshData.find(mr => mr.iid === mrIid);
    if (newMr) {
      setSelectedMr(newMr);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <Button variant="outline" onClick={fetchMergeRequests} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* List Panel */}
      <div className="w-80 border-r border-border flex flex-col">
        <MergeRequestList
          mergeRequests={mergeRequests}
          isLoading={isLoading}
          selectedMrIid={selectedMr?.iid || null}
          onSelectMr={handleSelectMr}
          onRefresh={fetchMergeRequests}
          stateFilter={stateFilter}
          onStateFilterChange={setStateFilter}
        />
        <div className="p-2 border-t border-border">
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="w-full gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            New Merge Request
          </Button>
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 p-6">
        {selectedMr ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  !{selectedMr.iid} {selectedMr.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedMr.sourceBranch} → {selectedMr.targetBranch}
                </p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                selectedMr.state === 'opened' ? 'bg-success/20 text-success' :
                selectedMr.state === 'merged' ? 'bg-info/20 text-info' :
                'bg-destructive/20 text-destructive'
              }`}>
                {selectedMr.state}
              </span>
            </div>

            {selectedMr.description && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedMr.description}
                </p>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>by {selectedMr.author.username}</span>
              <span>Created {new Date(selectedMr.createdAt).toLocaleDateString()}</span>
              {selectedMr.mergedAt && (
                <span>Merged {new Date(selectedMr.mergedAt).toLocaleDateString()}</span>
              )}
            </div>

            {selectedMr.labels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMr.labels.map((label) => (
                  <span
                    key={label}
                    className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => window.electronAPI.openExternal(selectedMr.webUrl)}
            >
              View on GitLab
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a merge request to view details
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateMergeRequestDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        projectId={projectId}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
