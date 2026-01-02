import { useState, useEffect, useCallback } from 'react';
import { Globe, FolderCode, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { GlobalEnvSettings } from './environment/GlobalEnvSettings';
import { ProjectEnvSettings } from './environment/ProjectEnvSettings';
import { useProjectEnv } from './hooks/useProjectEnv';
import { useProjectStore } from '../../stores/project-store';
import type { AppSettings, GlobalEnvConfig } from '../../../shared/types/settings';
import type { ProjectEnvConfig } from '../../../shared/types/project';

interface EnvironmentSaveHook {
  save: () => Promise<boolean>;
  hasChanges: boolean;
  discard: () => void;
}

interface EnvironmentSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  isOpen: boolean;
  onEnvHookReady?: (hook: EnvironmentSaveHook | null) => void;
}

/**
 * Environment settings with Global and Project tabs
 * Global tab: Default API keys and memory configuration
 * Project tab: Project-specific overrides
 */
export function EnvironmentSettings({
  settings,
  onSettingsChange,
  isOpen,
  onEnvHookReady
}: EnvironmentSettingsProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');

  // Get selected project
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Get global config from settings
  const globalConfig: GlobalEnvConfig = settings.globalEnv || {
    defaultEmbeddingProvider: 'openai'
  };

  // Project environment hook
  const projectEnv = useProjectEnv(selectedProjectId, globalConfig);

  // Expose the save hook to parent
  useEffect(() => {
    if (onEnvHookReady) {
      if (isOpen && selectedProjectId) {
        onEnvHookReady({
          save: projectEnv.save,
          hasChanges: projectEnv.hasChanges,
          discard: projectEnv.discard
        });
      } else {
        onEnvHookReady(null);
      }
    }
  }, [isOpen, selectedProjectId, projectEnv.save, projectEnv.hasChanges, projectEnv.discard, onEnvHookReady]);

  // Handle global config changes
  const handleGlobalChange = useCallback((updates: Partial<GlobalEnvConfig>) => {
    onSettingsChange({
      globalEnv: {
        ...globalConfig,
        ...updates
      }
    });
  }, [globalConfig, onSettingsChange]);

  // Switch to global tab if no project is selected
  useEffect(() => {
    if (!selectedProjectId && activeTab === 'project') {
      setActiveTab('global');
    }
  }, [selectedProjectId, activeTab]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Environment</h2>
        <p className="text-sm text-muted-foreground">
          Configure API keys and integration settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'global' | 'project')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="global" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Global Defaults
          </TabsTrigger>
          <TabsTrigger
            value="project"
            className="flex items-center gap-2"
            disabled={!selectedProjectId}
          >
            <FolderCode className="h-4 w-4" />
            Project
            {!selectedProjectId && (
              <span className="text-xs text-muted-foreground">(Select a project)</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="mt-6">
          <GlobalEnvSettings
            config={globalConfig}
            onChange={handleGlobalChange}
            disabled={false}
          />
        </TabsContent>

        <TabsContent value="project" className="mt-6">
          {selectedProjectId ? (
            <>
              {projectEnv.error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {projectEnv.error}
                </div>
              )}

              {projectEnv.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <ProjectEnvSettings
                  config={projectEnv.config}
                  globalConfig={globalConfig}
                  sources={projectEnv.sources}
                  onChange={(updates) => {
                    // Stage changes for each field
                    Object.entries(updates).forEach(([key, value]) => {
                      projectEnv.updateField(key as keyof typeof projectEnv.config, value as never);
                    });
                  }}
                  onOverrideGlobal={projectEnv.overrideGlobal}
                  onUseGlobal={projectEnv.useGlobal}
                  disabled={projectEnv.isLoading}
                />
              )}

              {projectEnv.hasChanges && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  You have unsaved changes
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderCode className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">No Project Selected</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Select a project from the sidebar to configure project-specific environment settings.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Export a function to get project env save handler for use by parent
export function useEnvironmentSettingsSave(projectId: string | null, globalConfig: GlobalEnvConfig | null) {
  const projectEnv = useProjectEnv(projectId, globalConfig);

  return {
    saveProjectEnv: projectEnv.save,
    hasProjectChanges: projectEnv.hasChanges,
    discardProjectChanges: projectEnv.discard
  };
}
