import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Package,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Tag,
  Clock,
  Lightbulb,
  Layers,
  Grid3X3
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import type { Project, BoilerplateReference, Plugin, PluginSkill } from '../../../shared/types';
import { usePluginStore, loadPlugins } from '../../stores/plugin-store';

interface BoilerplateTabProps {
  project: Project;
  boilerplateInfo: BoilerplateReference;
}

/**
 * BoilerplateTab displays information about a boilerplate plugin linked to a project.
 * Shows plugin name, version, description, and lists all available skills.
 */
export function BoilerplateTab({ project, boilerplateInfo }: BoilerplateTabProps) {
  const { plugins, isLoading: isLoadingPlugins } = usePluginStore();
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [linkedPlugin, setLinkedPlugin] = useState<Plugin | null>(null);

  // Find the linked plugin from the store
  useEffect(() => {
    const plugin = plugins.find((p) => p.id === boilerplateInfo.pluginId);
    setLinkedPlugin(plugin || null);
  }, [plugins, boilerplateInfo.pluginId]);

  // Load plugins if not already loaded
  useEffect(() => {
    if (plugins.length === 0 && !isLoadingPlugins) {
      loadPlugins();
    }
  }, [plugins.length, isLoadingPlugins]);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      // Refresh plugin list to get latest status
      await loadPlugins();
      // TODO: In Phase 7, integrate with UpdatePluginDialog for checking and applying updates
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  // Group skills by domain
  const skillsByDomain = linkedPlugin?.metadata.content?.skills.reduce<
    Record<string, PluginSkill[]>
  >((acc, skill) => {
    const domain = skill.domain || 'Other';
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(skill);
    return acc;
  }, {}) || {};

  const skills = linkedPlugin?.metadata.content?.skills || [];
  const domains = Object.keys(skillsByDomain).sort();

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Boilerplate Plugin</h2>
            <p className="text-sm text-muted-foreground">
              This project is linked to a boilerplate plugin
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={isCheckingUpdates || isLoadingPlugins}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isCheckingUpdates ? 'animate-spin' : ''}`}
            />
            Check for Updates
          </Button>
        </div>

        {/* Loading State */}
        {isLoadingPlugins && !linkedPlugin && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Plugin Not Found Warning */}
        {!isLoadingPlugins && !linkedPlugin && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 text-warning border border-warning/20">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Plugin Not Found</p>
              <p className="text-sm opacity-80">
                The plugin &quot;{boilerplateInfo.pluginName}&quot; (v{boilerplateInfo.pluginVersion})
                is not installed. Install it from Settings &rarr; Plugins to access boilerplate features.
              </p>
            </div>
          </div>
        )}

        {/* Plugin Overview */}
        {linkedPlugin && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Plugin Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Name and Version */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {linkedPlugin.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {linkedPlugin.description}
                    </p>
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    v{linkedPlugin.version}
                  </Badge>
                </div>

                <Separator />

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lightbulb className="h-3 w-3" />
                      Skills
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {linkedPlugin.metadata.skillCount || skills.length}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Grid3X3 className="h-3 w-3" />
                      Domains
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {linkedPlugin.metadata.domains?.length || domains.length}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Linked
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(boilerplateInfo.linkedAt)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Update Status */}
                <div className="flex items-center gap-2">
                  {linkedPlugin.updateStatus === 'update_available' ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <span className="text-sm text-warning">
                        Update available: v{linkedPlugin.latestVersion}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-sm text-success">Up to date</span>
                    </>
                  )}
                </div>

                {/* Domains */}
                {domains.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Domains</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domains.map((domain) => (
                        <Badge key={domain} variant="outline" className="text-xs capitalize">
                          {domain}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Skills List */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Available Skills ({skills.length})
              </h3>

              {domains.map((domain) => (
                <Card key={domain}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium capitalize">
                      {domain}
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {skillsByDomain[domain].length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      {skillsByDomain[domain].map((skill) => (
                        <div
                          key={skill.id}
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <Lightbulb className="h-4 w-4 text-info mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {skill.name}
                            </p>
                            {skill.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {skill.description}
                              </p>
                            )}
                          </div>
                          {skill.category && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {skill.category}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Empty skills state */}
              {skills.length === 0 && !isLoadingPlugins && (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground">No Skills Found</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                        This plugin does not define any skills, or the skills have not been loaded yet.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
