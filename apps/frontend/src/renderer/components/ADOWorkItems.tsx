import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Circle,
  Search,
  Settings,
  Loader2,
  Bug,
  BookOpen,
  Zap,
  ChevronRight,
  Tag,
  User,
  Calendar,
  ExternalLink,
  Cloud,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useProjectStore } from '../stores/project-store';
import { ADOSetupModal } from './ADOSetupModal';
import type { ADOWorkItem } from '../../preload/api/modules/ado-api';

// Work item type icons
const workItemTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Bug: Bug,
  Task: CheckCircle2,
  'User Story': BookOpen,
  Feature: Zap,
  Epic: Zap,
};

interface ADOWorkItemsProps {
  onOpenSettings?: () => void;
}

export function ADOWorkItems({ onOpenSettings }: ADOWorkItemsProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const [workItems, setWorkItems] = useState<ADOWorkItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [selectedWorkItem, setSelectedWorkItem] = useState<ADOWorkItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<'open' | 'closed' | 'all'>('open');
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Check connection status
  const checkConnection = useCallback(async () => {
    if (!selectedProject?.id) return;

    try {
      const result = await window.electronAPI.ado.checkADOConnection(selectedProject.id);
      setIsConnected(result.success);
      if (!result.success) {
        setError(result.error || 'Not connected to Azure DevOps');
      }
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Failed to check connection');
    }
  }, [selectedProject?.id]);

  // Fetch work items
  const fetchWorkItems = useCallback(async () => {
    if (!selectedProject?.id || !isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.ado.getADOWorkItems(selectedProject.id, filterState);
      if (result.success && result.data) {
        setWorkItems(result.data);
      } else {
        setError(result.error || 'Failed to fetch work items');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch work items');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject?.id, isConnected, filterState]);

  // Initial load
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Fetch work items when connected or filter changes
  useEffect(() => {
    if (isConnected) {
      fetchWorkItems();
    }
  }, [fetchWorkItems, isConnected]);

  // Filter work items by search query
  const filteredWorkItems = useMemo(() => {
    if (!searchQuery) return workItems;
    const query = searchQuery.toLowerCase();
    return workItems.filter(
      (wi) =>
        wi.title.toLowerCase().includes(query) ||
        wi.id.toString().includes(query) ||
        wi.workItemType.toLowerCase().includes(query) ||
        wi.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [workItems, searchQuery]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    checkConnection();
    if (isConnected) {
      fetchWorkItems();
    }
  }, [checkConnection, fetchWorkItems, isConnected]);

  // Handle setup complete
  const handleSetupComplete = useCallback(async (settings: {
    adoOrganization: string;
    adoProject: string;
    adoRepoName: string;
    adoPat: string;
    adoInstanceUrl: string;
  }) => {
    // TODO: Save settings to project
    // For now, settings should be saved to .env file
    console.log('ADO settings received:', settings);
    setShowSetupModal(false);
    handleRefresh();
  }, [handleRefresh]);

  // Not connected state
  if (isConnected === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
          <Cloud className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connect to Azure DevOps</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {error || 'Configure your Azure DevOps connection to view and manage work items.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setShowSetupModal(true)}>
            <Cloud className="mr-2 h-4 w-4" />
            Configure Connection
          </Button>
          {onOpenSettings && (
            <Button variant="outline" onClick={onOpenSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          )}
        </div>

        {selectedProject && (
          <ADOSetupModal
            open={showSetupModal}
            onOpenChange={setShowSetupModal}
            project={selectedProject}
            onComplete={handleSetupComplete}
            onSkip={() => setShowSetupModal(false)}
          />
        )}
      </div>
    );
  }

  // Loading initial connection
  if (isConnected === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex-none border-b border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-500" />
            <h2 className="font-semibold">Azure DevOps Work Items</h2>
            <Badge variant="outline" className="text-xs">
              {filteredWorkItems.length} items
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSetupModal(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search work items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            {(['open', 'closed', 'all'] as const).map((state) => (
              <Button
                key={state}
                variant={filterState === state ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterState(state)}
                className="h-7 px-2 text-xs capitalize"
              >
                {state}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Work Items List */}
        <div className="w-1/2 border-r border-border flex flex-col">
          {error ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : filteredWorkItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <Circle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No matching work items' : 'No work items found'}
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {filteredWorkItems.map((wi) => {
                  const TypeIcon = workItemTypeIcons[wi.workItemType] || Circle;
                  const isSelected = selectedWorkItem?.id === wi.id;

                  return (
                    <button
                      key={wi.id}
                      onClick={() => setSelectedWorkItem(wi)}
                      className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                        isSelected ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <TypeIcon
                          className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                            wi.workItemType === 'Bug'
                              ? 'text-red-500'
                              : wi.workItemType === 'User Story'
                              ? 'text-blue-500'
                              : 'text-green-500'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">#{wi.id}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                wi.state === 'open'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                              }`}
                            >
                              {wi.state}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate">{wi.title}</p>
                          {wi.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {wi.tags.slice(0, 3).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs px-1 py-0"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {wi.tags.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{wi.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Work Item Detail */}
        <div className="w-1/2 flex flex-col">
          {selectedWorkItem ? (
            <WorkItemDetail workItem={selectedWorkItem} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Circle className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Select a work item to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Setup Modal */}
      {selectedProject && (
        <ADOSetupModal
          open={showSetupModal}
          onOpenChange={setShowSetupModal}
          project={selectedProject}
          onComplete={handleSetupComplete}
          onSkip={() => setShowSetupModal(false)}
        />
      )}
    </div>
  );
}

// Work Item Detail Component
function WorkItemDetail({ workItem }: { workItem: ADOWorkItem }) {
  const TypeIcon = workItemTypeIcons[workItem.workItemType] || Circle;

  return (
    <ScrollArea className="flex-1">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon
                className={`h-5 w-5 ${
                  workItem.workItemType === 'Bug'
                    ? 'text-red-500'
                    : workItem.workItemType === 'User Story'
                    ? 'text-blue-500'
                    : 'text-green-500'
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {workItem.workItemType} #{workItem.id}
              </span>
              <Badge
                variant={workItem.state === 'open' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {workItem.state}
              </Badge>
            </div>
            <h3 className="text-lg font-semibold">{workItem.title}</h3>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a
              href={workItem.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open in ADO
            </a>
          </Button>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Author:</span>
            <span>{workItem.author.displayName}</span>
          </div>
          {workItem.assignees.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Assigned:</span>
              <span>{workItem.assignees.map((a) => a.displayName).join(', ')}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span>{new Date(workItem.createdAt).toLocaleDateString()}</span>
          </div>
          {workItem.iteration && (
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Iteration:</span>
              <span>{workItem.iteration.split('\\').pop()}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {workItem.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tags:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {workItem.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {workItem.body && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Description</h4>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: workItem.body }}
            />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
