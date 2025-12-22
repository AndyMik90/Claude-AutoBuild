import { useState, useEffect } from 'react';
import { Import, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../ui/select';
import type { ProjectEnvConfig, PlaneSyncStatus } from '../../../../shared/types';

interface PlaneConfiguredProject {
  id: string;
  name: string;
  hasPlaneConfig: boolean;
  planeBaseUrl?: string;
  planeWorkspaceSlug?: string;
}

interface PlaneIntegrationProps {
  projectId: string;
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showPlaneKey: boolean;
  setShowPlaneKey: React.Dispatch<React.SetStateAction<boolean>>;
  planeConnectionStatus: PlaneSyncStatus | null;
  isCheckingPlane: boolean;
  onOpenPlaneImport: () => void;
}

/**
 * Plane.so integration settings component.
 * Manages Plane API key, workspace, connection status, and import functionality.
 */
export function PlaneIntegration({
  projectId,
  envConfig,
  updateEnvConfig,
  showPlaneKey,
  setShowPlaneKey,
  planeConnectionStatus,
  isCheckingPlane,
  onOpenPlaneImport
}: PlaneIntegrationProps) {
  const [configuredProjects, setConfiguredProjects] = useState<PlaneConfiguredProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Load projects that have Plane configured (for copy feature)
  useEffect(() => {
    const loadConfiguredProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const result = await window.electronAPI.getPlaneConfiguredProjects(projectId);
        if (result.success && result.data) {
          setConfiguredProjects(result.data);
        }
      } catch (error) {
        console.error('Failed to load configured projects:', error);
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadConfiguredProjects();
  }, [projectId]);

  const handleCopyFromProject = async (sourceProjectId: string) => {
    const sourceProject = configuredProjects.find(p => p.id === sourceProjectId);
    if (!sourceProject) return;

    try {
      // Security: Copy config in main process without exposing API key to renderer
      const result = await window.electronAPI.copyPlaneConfigFromProject(projectId, sourceProjectId);
      if (result.success) {
        // Trigger a refresh of the env config to show the new values
        // The parent component should re-fetch the config
        updateEnvConfig({ planeEnabled: true });
      } else {
        console.error('Failed to copy Plane config:', result.error);
      }
    } catch (error) {
      console.error('Failed to copy Plane config:', error);
    }
  };

  if (!envConfig) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">Enable Plane.so Integration</Label>
          <p className="text-xs text-muted-foreground">
            Import work items and track progress in Plane.so
          </p>
        </div>
        <Switch
          checked={envConfig.planeEnabled}
          onCheckedChange={(checked) => updateEnvConfig({ planeEnabled: checked })}
        />
      </div>

      {envConfig.planeEnabled && (
        <>
          {/* Copy from another project */}
          {configuredProjects.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Copy settings from another project</p>
                  <p className="text-xs text-muted-foreground">
                    Quickly set up by copying API key and workspace from an existing project
                  </p>
                </div>
                <Select onValueChange={handleCopyFromProject} disabled={isLoadingProjects}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">API Key</Label>
            <p className="text-xs text-muted-foreground">
              Get your API key from{' '}
              <a
                href="https://app.plane.so/profile/api-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-info hover:underline"
              >
                Plane Settings → API Tokens
              </a>
            </p>
            <div className="relative">
              <Input
                type={showPlaneKey ? 'text' : 'password'}
                placeholder="plane_api_xxxxxxxx"
                value={envConfig.planeApiKey || ''}
                onChange={(e) => updateEnvConfig({ planeApiKey: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPlaneKey(!showPlaneKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPlaneKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Base URL (Optional)</Label>
            <p className="text-xs text-muted-foreground">
              Leave empty for Plane Cloud, or enter your self-hosted Plane URL
            </p>
            <Input
              placeholder="https://api.plane.so (default)"
              value={envConfig.planeBaseUrl || ''}
              onChange={(e) => updateEnvConfig({ planeBaseUrl: e.target.value })}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Workspace Slug</Label>
              <Input
                placeholder="my-workspace"
                value={envConfig.planeWorkspaceSlug || ''}
                onChange={(e) => updateEnvConfig({ planeWorkspaceSlug: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                From your Plane URL: plane.so/<span className="font-mono">workspace-slug</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Project ID (Optional)</Label>
              <Input
                placeholder="Auto-selected"
                value={envConfig.planeProjectId || ''}
                onChange={(e) => updateEnvConfig({ planeProjectId: e.target.value })}
              />
            </div>
          </div>

          {envConfig.planeApiKey && (
            <ConnectionStatus
              isChecking={isCheckingPlane}
              connectionStatus={planeConnectionStatus}
            />
          )}

          {planeConnectionStatus?.connected && (
            <ImportTasksPrompt onOpenPlaneImport={onOpenPlaneImport} />
          )}
        </>
      )}
    </div>
  );
}

interface ConnectionStatusProps {
  isChecking: boolean;
  connectionStatus: PlaneSyncStatus | null;
}

function ConnectionStatus({ isChecking, connectionStatus }: ConnectionStatusProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Connection Status</p>
          <p className="text-xs text-muted-foreground">
            {isChecking ? 'Checking...' :
              connectionStatus?.connected
                ? `Connected${connectionStatus.workspaceSlug ? ` to ${connectionStatus.workspaceSlug}` : ''}`
                : connectionStatus?.error || 'Not connected'}
          </p>
          {connectionStatus?.connected && connectionStatus.projectCount !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {connectionStatus.projectCount} project{connectionStatus.projectCount !== 1 ? 's' : ''} available
            </p>
          )}
        </div>
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : connectionStatus?.connected ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-warning" />
        )}
      </div>
    </div>
  );
}

interface ImportTasksPromptProps {
  onOpenPlaneImport: () => void;
}

function ImportTasksPrompt({ onOpenPlaneImport }: ImportTasksPromptProps) {
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-3">
      <div className="flex items-start gap-3">
        <Import className="h-5 w-5 text-info mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Import Work Items</p>
          <p className="text-xs text-muted-foreground mt-1">
            Select which Plane work items to import into AutoBuild as tasks.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={onOpenPlaneImport}
          >
            <Import className="h-4 w-4 mr-2" />
            Import from Plane.so
          </Button>
        </div>
      </div>
    </div>
  );
}
