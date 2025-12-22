import { Loader2, CheckCircle2, AlertCircle, Download, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import type { InfrastructureStatus as InfrastructureStatusType } from '../../../shared/types';

interface InfrastructureStatusProps {
  infrastructureStatus: InfrastructureStatusType | null;
  isCheckingInfrastructure: boolean;
  isStartingFalkorDB: boolean;
  isOpeningDocker: boolean;
  onStartFalkorDB: () => void;
  onOpenDockerDesktop: () => void;
  onDownloadDocker: () => void;
}

export function InfrastructureStatus({
  infrastructureStatus,
  isCheckingInfrastructure,
  isStartingFalkorDB,
  isOpeningDocker,
  onStartFalkorDB,
  onOpenDockerDesktop,
  onDownloadDocker,
}: InfrastructureStatusProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Infrastructure Status</span>
        {isCheckingInfrastructure && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Docker Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {infrastructureStatus?.docker.running ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : infrastructureStatus?.docker.installed ? (
            <AlertCircle className="h-4 w-4 text-warning" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-xs text-foreground">Docker</span>
        </div>
        <div className="flex items-center gap-2">
          {infrastructureStatus?.docker.running ? (
            <span className="text-xs text-success">Running</span>
          ) : infrastructureStatus?.docker.installed ? (
            <>
              <span className="text-xs text-warning">Not Running</span>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenDockerDesktop}
                disabled={isOpeningDocker}
                className="h-6 text-xs"
              >
                {isOpeningDocker ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Start Docker
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-destructive">Not Installed</span>
              <Button
                size="sm"
                variant="outline"
                onClick={onDownloadDocker}
                className="h-6 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Install
              </Button>
            </>
          )}
        </div>
      </div>

      {/* FalkorDB Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {infrastructureStatus?.falkordb.healthy ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : infrastructureStatus?.falkordb.containerRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-warning" />
          ) : (
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-foreground">FalkorDB</span>
        </div>
        <div className="flex items-center gap-2">
          {infrastructureStatus?.falkordb.healthy ? (
            <span className="text-xs text-success">Ready</span>
          ) : infrastructureStatus?.falkordb.containerRunning ? (
            <span className="text-xs text-warning">Starting...</span>
          ) : infrastructureStatus?.docker.running ? (
            <>
              <span className="text-xs text-muted-foreground">Not Running</span>
              <Button
                size="sm"
                variant="outline"
                onClick={onStartFalkorDB}
                disabled={isStartingFalkorDB}
                className="h-6 text-xs"
              >
                {isStartingFalkorDB ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                Start
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Requires Docker</span>
          )}
        </div>
      </div>

      {/* Overall Status Message */}
      {infrastructureStatus?.ready ? (
        <div className="text-xs text-success flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Graph memory is ready to use
        </div>
      ) : infrastructureStatus && !infrastructureStatus.docker.installed && (
        <p className="text-xs text-muted-foreground">
          Docker Desktop is required for graph-based memory.
        </p>
      )}
    </div>
  );
}
