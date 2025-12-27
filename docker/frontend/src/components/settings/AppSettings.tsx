import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Save,
  Loader2,
  Palette,
  Bot,
  FolderOpen,
  Key,
  Package,
  Bell,
  Settings2,
  Zap,
  Github,
  Database,
  Sparkles
} from 'lucide-react';
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogFooter,
  FullScreenDialogTitle,
  FullScreenDialogDescription
} from '../ui/full-screen-dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { useSettings } from './hooks/useSettings';
import { ThemeSettings } from './ThemeSettings';
import { GeneralSettings } from './GeneralSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { ProjectSelector } from './ProjectSelector';
import { ProjectSettingsContent, ProjectSettingsSection } from './ProjectSettingsContent';
import { useProjectStore } from '../../stores/project-store';
import type { UseProjectSettingsReturn } from '../project-settings/hooks/useProjectSettings';

interface AppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: AppSection;
  initialProjectSection?: ProjectSettingsSection;
  onRerunWizard?: () => void;
}

// App-level settings sections
export type AppSection = 'appearance' | 'agent' | 'paths' | 'integrations' | 'updates' | 'notifications';

interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: React.ElementType;
  description: string;
}

const appNavItems: NavItem<AppSection>[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and visual preferences' },
  { id: 'agent', label: 'Agent Settings', icon: Bot, description: 'Default model and framework' },
  { id: 'paths', label: 'Paths', icon: FolderOpen, description: 'Python and framework paths' },
  { id: 'integrations', label: 'Integrations', icon: Key, description: 'API keys & Claude accounts' },
  { id: 'updates', label: 'Updates', icon: Package, description: 'Auto Claude updates' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alert preferences' }
];

const projectNavItems: NavItem<ProjectSettingsSection>[] = [
  { id: 'general', label: 'General', icon: Settings2, description: 'Auto-Build and agent config' },
  { id: 'claude', label: 'Claude Auth', icon: Key, description: 'Claude authentication' },
  { id: 'linear', label: 'Linear', icon: Zap, description: 'Linear integration' },
  { id: 'github', label: 'GitHub', icon: Github, description: 'GitHub issues sync' },
  { id: 'memory', label: 'Memory', icon: Database, description: 'Graphiti memory backend' }
];

/**
 * Main application settings dialog container
 * Coordinates app and project settings sections
 */
export function AppSettingsDialog({ open, onOpenChange, initialSection, initialProjectSection, onRerunWizard }: AppSettingsDialogProps) {
  const { settings, setSettings, isSaving, error, saveSettings } = useSettings();
  const [version, setVersion] = useState<string>('');

  // Track which top-level section is active
  const [activeTopLevel, setActiveTopLevel] = useState<'app' | 'project'>('app');
  const [appSection, setAppSection] = useState<AppSection>(initialSection || 'appearance');
  const [projectSection, setProjectSection] = useState<ProjectSettingsSection>('general');

  // Navigate to initial section when dialog opens with a specific section
  useEffect(() => {
    if (open) {
      if (initialProjectSection) {
        setActiveTopLevel('project');
        setProjectSection(initialProjectSection);
      } else if (initialSection) {
        setActiveTopLevel('app');
        setAppSection(initialSection);
      }
    }
  }, [open, initialSection, initialProjectSection]);

  // Project state
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Project settings hook state (lifted from child)
  const [projectSettingsHook, setProjectSettingsHook] = useState<UseProjectSettingsReturn | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Load app version on mount
  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion);
  }, []);

  // Memoize the callback to avoid infinite loops
  const handleProjectHookReady = useCallback((hook: UseProjectSettingsReturn | null) => {
    setProjectSettingsHook(hook);
    if (hook) {
      setProjectError(hook.error || hook.envError || null);
    } else {
      setProjectError(null);
    }
  }, []);

  const handleSave = async () => {
    // Save app settings first
    const appSaveSuccess = await saveSettings();

    // If on project section with a project selected, save project settings too
    if (activeTopLevel === 'project' && selectedProject && projectSettingsHook) {
      await projectSettingsHook.handleSave(() => {});
      // Check for project errors
      if (projectSettingsHook.error || projectSettingsHook.envError) {
        setProjectError(projectSettingsHook.error || projectSettingsHook.envError);
        return; // Don't close dialog on error
      }
    }

    if (appSaveSuccess) {
      onOpenChange(false);
    }
  };

  const handleProjectChange = (projectId: string | null) => {
    selectProject(projectId);
  };

  const renderAppSection = () => {
    switch (appSection) {
      case 'appearance':
        return <ThemeSettings settings={settings} onSettingsChange={setSettings} />;
      case 'agent':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="agent" />;
      case 'paths':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="paths" />;
      case 'integrations':
        return <IntegrationSettings settings={settings} onSettingsChange={setSettings} isOpen={open} />;
      case 'updates':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="updates" version={version} />;
      case 'notifications':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="notifications" version={version} />;
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (activeTopLevel === 'app') {
      return renderAppSection();
    }
    return (
      <ProjectSettingsContent
        project={selectedProject}
        activeSection={projectSection}
        isOpen={open}
        onHookReady={handleProjectHookReady}
      />
    );
  };

  // Determine if project nav items should be disabled
  const projectNavDisabled = !selectedProjectId;

  return (
    <FullScreenDialog open={open} onOpenChange={onOpenChange}>
      <FullScreenDialogContent>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <Settings className="h-6 w-6" />
            Settings
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            Configure application and project settings
          </FullScreenDialogDescription>
        </FullScreenDialogHeader>

        <FullScreenDialogBody>
          <div className="flex h-full">
            {/* Navigation sidebar */}
            <nav className="w-80 border-r border-border bg-muted/30 p-4">
              <ScrollArea className="h-full">
                <div className="space-y-6">
                  {/* APPLICATION Section */}
                  <div>
                    <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Application
                    </h3>
                    <div className="space-y-1">
                      {appNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTopLevel === 'app' && appSection === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTopLevel('app');
                              setAppSection(item.id);
                            }}
                            className={cn(
                              'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{item.label}</div>
                              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                            </div>
                          </button>
                        );
                      })}

                      {/* Re-run Wizard button */}
                      {onRerunWizard && (
                        <button
                          onClick={() => {
                            onOpenChange(false);
                            onRerunWizard();
                          }}
                          className={cn(
                            'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all mt-2',
                            'border border-dashed border-muted-foreground/30',
                            'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Sparkles className="h-5 w-5 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm">Re-run Wizard</div>
                            <div className="text-xs text-muted-foreground truncate">Start the setup wizard again</div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PROJECT Section */}
                  <div>
                    <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Project
                    </h3>

                    {/* Project Selector */}
                    <div className="px-1 mb-3">
                      <ProjectSelector
                        selectedProjectId={selectedProjectId}
                        onProjectChange={handleProjectChange}
                      />
                    </div>

                    {/* Project Nav Items */}
                    <div className="space-y-1">
                      {projectNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTopLevel === 'project' && projectSection === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTopLevel('project');
                              setProjectSection(item.id);
                            }}
                            disabled={projectNavDisabled}
                            className={cn(
                              'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : projectNavDisabled
                                  ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                                  : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{item.label}</div>
                              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Version at bottom */}
                {version && (
                  <div className="mt-8 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      Version {version}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </nav>

            {/* Main content */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-8 max-w-2xl">
                  {renderContent()}
                </div>
              </ScrollArea>
            </div>
          </div>
        </FullScreenDialogBody>

        <FullScreenDialogFooter>
          {(error || projectError) && (
            <div className="flex-1 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
              {error || projectError}
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || (activeTopLevel === 'project' && projectSettingsHook?.isSaving)}
          >
            {(isSaving || (activeTopLevel === 'project' && projectSettingsHook?.isSaving)) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </FullScreenDialogFooter>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}
