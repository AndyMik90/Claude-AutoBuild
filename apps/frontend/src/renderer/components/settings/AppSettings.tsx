import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  Sparkles,
  Monitor,
  Globe,
  Code,
  Bug,
  Server,
  LayoutTemplate,
  User,
  Shield,
  LogOut
} from 'lucide-react';

// GitLab icon component (lucide-react doesn't have one)
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" role="img" aria-labelledby="gitlab-icon-title">
      <title id="gitlab-icon-title">GitLab</title>
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
    </svg>
  );
}
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
import { DisplaySettings } from './DisplaySettings';
import { LanguageSettings } from './LanguageSettings';
import { GeneralSettings } from './GeneralSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { DevToolsSettings } from './DevToolsSettings';
import { DebugSettings } from './DebugSettings';
import { ProfileList } from './ProfileList';
import { ProjectSelector } from './ProjectSelector';
import { ProjectSettingsContent, ProjectSettingsSection } from './ProjectSettingsContent';
import { useProjectStore } from '../../stores/project-store';
import type { UseProjectSettingsReturn } from '../project-settings/hooks/useProjectSettings';
import { AccountProfile } from './account/AccountProfile';
import { AccountSecurity } from './account/AccountSecurity';
import { AccountLogin } from './account/AccountLogin';
import { useConvexAuth } from '../../providers/convex/ConvexAuthProvider';
import { useAuthClient } from '../../../shared/lib/convex/auth-client';
import { authStore } from '../../stores/auth-store';

interface AppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: AppSection;
  initialProjectSection?: ProjectSettingsSection;
  initialAccountSection?: AccountSection;
  onRerunWizard?: () => void;
}

// App-level settings sections
export type AppSection = 'appearance' | 'display' | 'language' | 'devtools' | 'agent' | 'paths' | 'integrations' | 'api-profiles' | 'updates' | 'notifications' | 'debug';

// Account-level settings sections
export type AccountSection = 'profile' | 'security' | 'login';

interface NavItemConfig<T extends string> {
  id: T;
  icon: React.ElementType;
}

const appNavItemsConfig: NavItemConfig<AppSection>[] = [
  { id: 'appearance', icon: Palette },
  { id: 'display', icon: Monitor },
  { id: 'language', icon: Globe },
  { id: 'devtools', icon: Code },
  { id: 'agent', icon: Bot },
  { id: 'paths', icon: FolderOpen },
  { id: 'integrations', icon: Key },
  { id: 'api-profiles', icon: Server },
  { id: 'updates', icon: Package },
  { id: 'notifications', icon: Bell },
  { id: 'debug', icon: Bug }
];

const projectNavItemsConfig: NavItemConfig<ProjectSettingsSection>[] = [
  { id: 'general', icon: Settings2 },
  { id: 'linear', icon: Zap },
  { id: 'github', icon: Github },
  { id: 'gitlab', icon: GitLabIcon },
  { id: 'memory', icon: Database }
];

/**
 * Main application settings dialog container
 * Coordinates app and project settings sections
 */
export function AppSettingsDialog({ open, onOpenChange, initialSection, initialProjectSection, initialAccountSection, onRerunWizard }: AppSettingsDialogProps) {
  const { t } = useTranslation('settings');
  const { settings, setSettings, isSaving, error, saveSettings, revertTheme, commitTheme } = useSettings();
  const [version, setVersion] = useState<string>('');

  // Authentication state from Convex + Better Auth integration
  const { isAuthenticated, user } = useConvexAuth();
  const authClient = useAuthClient();

  // Track which top-level section is active
  const [activeTopLevel, setActiveTopLevel] = useState<'app' | 'project' | 'account'>('app');
  const [appSection, setAppSection] = useState<AppSection>(initialSection || 'appearance');
  const [projectSection, setProjectSection] = useState<ProjectSettingsSection>('general');
  // Default to 'login' if not authenticated, otherwise 'profile'
  const [accountSection, setAccountSection] = useState<AccountSection>(
    initialAccountSection || 'login'
  );

  // Dynamic account nav items based on auth state
  const accountNavItemsConfig: NavItemConfig<AccountSection>[] = isAuthenticated
    ? [
        { id: 'profile', icon: User },
        { id: 'security', icon: Shield },
      ]
    : [
        { id: 'login', icon: Key },
      ];

  // Update account section when authentication state changes
  useEffect(() => {
    if (isAuthenticated && accountSection === 'login') {
      setAccountSection('profile');
    } else if (!isAuthenticated && accountSection !== 'login') {
      setAccountSection('login');
    }
  }, [isAuthenticated]);

  // Navigate to initial section when dialog opens with a specific section
  useEffect(() => {
    if (open) {
      if (initialAccountSection) {
        setActiveTopLevel('account');
        setAccountSection(initialAccountSection);
      } else if (initialProjectSection) {
        setActiveTopLevel('project');
        setProjectSection(initialProjectSection);
      } else if (initialSection) {
        setActiveTopLevel('app');
        setAppSection(initialSection);
      }
    }
  }, [open, initialSection, initialProjectSection, initialAccountSection]);

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
      // Commit the theme so future cancels won't revert to old values
      commitTheme();
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    // onOpenChange handler will revert theme changes
    onOpenChange(false);
  };

  const handleProjectChange = (projectId: string | null) => {
    selectProject(projectId);
  };

  const handleSignOut = async () => {
    try {
      // Sign out using Better Auth
      await authClient?.signOut?.();

      // Clear local session
      authStore.clearSession();

      // Navigate to login section
      setAccountSection('login');
    } catch (error) {
      console.error('[Settings] Failed to sign out:', error);
    }
  };

  const renderAppSection = () => {
    switch (appSection) {
      case 'appearance':
        return <ThemeSettings settings={settings} onSettingsChange={setSettings} />;
      case 'display':
        return <DisplaySettings settings={settings} onSettingsChange={setSettings} />;
      case 'language':
        return <LanguageSettings settings={settings} onSettingsChange={setSettings} />;
      case 'devtools':
        return <DevToolsSettings settings={settings} onSettingsChange={setSettings} />;
      case 'agent':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="agent" />;
      case 'paths':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="paths" />;
      case 'integrations':
        return <IntegrationSettings settings={settings} onSettingsChange={setSettings} isOpen={open} />;
      case 'api-profiles':
        return <ProfileList />;
      case 'updates':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="updates" version={version} />;
      case 'notifications':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="notifications" version={version} />;
      case 'debug':
        return <DebugSettings />;
      default:
        return null;
    }
  };

  const renderAccountSection = () => {
    switch (accountSection) {
      case 'login':
        return <AccountLogin />;
      case 'profile':
        return <AccountProfile />;
      case 'security':
        return <AccountSecurity />;
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (activeTopLevel === 'app') {
      return renderAppSection();
    }
    if (activeTopLevel === 'account') {
      return renderAccountSection();
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
    <FullScreenDialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        // Dialog is being closed (via X, escape, or overlay click)
        // Revert any unsaved theme changes
        revertTheme();
      }
      onOpenChange(newOpen);
    }}>
      <FullScreenDialogContent>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <Settings className="h-6 w-6" />
            {t('title')}
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            {t('tabs.app')} & {t('tabs.project')}
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
                      {t('tabs.app')}
                    </h3>
                    <div className="space-y-1">
                      {appNavItemsConfig.map((item) => {
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
                              <div className="font-medium text-sm">{t(`sections.${item.id}.title`)}</div>
                              <div className="text-xs text-muted-foreground truncate">{t(`sections.${item.id}.description`)}</div>
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
                            <div className="font-medium text-sm">{t('actions.rerunWizard')}</div>
                            <div className="text-xs text-muted-foreground truncate">{t('actions.rerunWizardDescription')}</div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PROJECT Section */}
                  <div>
                    <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('tabs.project')}
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
                      {projectNavItemsConfig.map((item) => {
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
                              <div className="font-medium text-sm">{t(`projectSections.${item.id}.title`)}</div>
                              <div className="text-xs text-muted-foreground truncate">{t(`projectSections.${item.id}.description`)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ACCOUNT Section */}
                  <div>
                    <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('tabs.account')}
                    </h3>
                    <div className="space-y-1">
                      {accountNavItemsConfig.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTopLevel === 'account' && accountSection === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTopLevel('account');
                              setAccountSection(item.id);
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
                              <div className="font-medium text-sm">{t(`accountSections.${item.id}.title`)}</div>
                              <div className="text-xs text-muted-foreground truncate">{t(`accountSections.${item.id}.description`)}</div>
                            </div>
                          </button>
                        );
                      })}

                      {/* Sign Out Button */}
                      {isAuthenticated && (
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all hover:bg-destructive/10 text-muted-foreground hover:text-destructive mt-2 border border-border hover:border-destructive/50"
                        >
                          <LogOut className="h-5 w-5 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm">Sign Out</div>
                            <div className="text-xs text-muted-foreground">Sign out of your account</div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Version at bottom */}
                {version && (
                  <div className="mt-8 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      {t('updates.version')} {version}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </nav>

            {/* Main content */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className={`p-8 ${
                  appSection === 'templates' ? 'max-w-6xl' :
                  activeTopLevel === 'account' ? 'max-w-full' : // Full width for account sections
                  'max-w-2xl'
                }`}>
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
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || (activeTopLevel === 'project' && projectSettingsHook?.isSaving)}
          >
            {(isSaving || (activeTopLevel === 'project' && projectSettingsHook?.isSaving)) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common:buttons.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('actions.save')}
              </>
            )}
          </Button>
        </FullScreenDialogFooter>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}
