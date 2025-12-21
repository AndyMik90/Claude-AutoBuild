import { useState, useEffect } from 'react';
import {
  Package,
  Loader2,
  Trash2,
  RefreshCw,
  Github,
  FolderOpen,
  AlertCircle,
  CheckCircle,
  Info,
  Plus,
  Download
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import { usePluginStore, loadPlugins, uninstallPlugin } from '../../stores/plugin-store';
import { InstallPluginDialog, UpdatePluginDialog } from '../plugins';
import type { Plugin } from '../../../shared/types';

/**
 * PluginsPanel - Settings panel for managing installed plugins
 *
 * Features:
 * - Displays list of installed plugins with metadata
 * - Shows empty state when no plugins are installed
 * - Provides install and uninstall functionality
 * - Displays plugin source (GitHub or local) and version info
 */
export function PluginsPanel() {
  const plugins = usePluginStore((state) => state.plugins);
  const isLoading = usePluginStore((state) => state.isLoading);
  const error = usePluginStore((state) => state.error);

  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [updateDialogPlugin, setUpdateDialogPlugin] = useState<Plugin | null>(null);

  // Load plugins when component mounts
  useEffect(() => {
    loadPlugins();
  }, []);

  const handleUninstall = async (pluginId: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin? This cannot be undone.')) {
      return;
    }

    setUninstallingId(pluginId);
    try {
      await uninstallPlugin(pluginId);
    } finally {
      setUninstallingId(null);
    }
  };

  const handleRefresh = () => {
    loadPlugins();
  };

  const renderPluginStatus = (plugin: Plugin) => {
    if (plugin.updateStatus === 'update_available') {
      return (
        <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Update Available
        </span>
      );
    }
    if (plugin.status === 'installed') {
      return (
        <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Installed
        </span>
      );
    }
    return null;
  };

  const renderSourceIcon = (sourceType: Plugin['sourceType']) => {
    if (sourceType === 'github') {
      return <Github className="h-4 w-4 text-muted-foreground" />;
    }
    return <FolderOpen className="h-4 w-4 text-muted-foreground" />;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <SettingsSection
      title="Plugins"
      description="Manage installed plugins and boilerplate integrations"
    >
      <div className="space-y-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">Installed Plugins</h4>
            {plugins.length > 0 && (
              <span className="text-xs text-muted-foreground">({plugins.length})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-1 h-8"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1 h-8"
              onClick={() => setIsInstallDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Install Plugin
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && plugins.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : plugins.length === 0 ? (
          /* Empty state */
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <h4 className="text-sm font-medium text-foreground mb-1">No plugins installed</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Plugins extend Auto Claude with additional skills, patterns, and conventions.
            </p>
            <div className="rounded-lg bg-muted/30 border border-border p-3 max-w-md mx-auto">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground text-left">
                  Install plugins from GitHub repositories or local directories to access specialized
                  knowledge and workflows for your projects.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Plugins list */
          <div className="space-y-3">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className={cn(
                  'rounded-lg border border-border bg-background transition-colors',
                  'hover:border-border/80'
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Plugin info */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-medium text-foreground">{plugin.name}</h5>
                          <span className="text-xs text-muted-foreground font-mono">
                            v{plugin.version}
                          </span>
                          {renderPluginStatus(plugin)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {plugin.description}
                        </p>

                        {/* Metadata row */}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1" title={`Source: ${plugin.source}`}>
                            {renderSourceIcon(plugin.sourceType)}
                            <span className="capitalize">{plugin.sourceType}</span>
                          </div>
                          {plugin.metadata?.skillCount !== undefined && (
                            <span>{plugin.metadata.skillCount} skills</span>
                          )}
                          <span>Installed {formatDate(plugin.installedAt)}</span>
                        </div>

                        {/* Domains/categories */}
                        {plugin.metadata?.domains && plugin.metadata.domains.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {plugin.metadata.domains.slice(0, 5).map((domain) => (
                              <span
                                key={domain}
                                className="text-xs bg-muted px-1.5 py-0.5 rounded"
                              >
                                {domain}
                              </span>
                            ))}
                            {plugin.metadata.domains.length > 5 && (
                              <span className="text-xs text-muted-foreground">
                                +{plugin.metadata.domains.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Check Updates button - only for GitHub plugins */}
                      {plugin.sourceType === 'github' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUpdateDialogPlugin(plugin)}
                          className="h-8 w-8"
                          title="Check for updates"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUninstall(plugin.id)}
                        disabled={uninstallingId === plugin.id}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Uninstall plugin"
                      >
                        {uninstallingId === plugin.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Install Plugin Dialog */}
      <InstallPluginDialog
        open={isInstallDialogOpen}
        onOpenChange={setIsInstallDialogOpen}
        onSuccess={() => {
          // Refresh plugin list after successful installation
          loadPlugins();
        }}
      />

      {/* Update Plugin Dialog */}
      <UpdatePluginDialog
        open={updateDialogPlugin !== null}
        onOpenChange={(open) => {
          if (!open) setUpdateDialogPlugin(null);
        }}
        plugin={updateDialogPlugin}
        onSuccess={() => {
          // Refresh plugin list after successful update
          loadPlugins();
        }}
      />
    </SettingsSection>
  );
}
