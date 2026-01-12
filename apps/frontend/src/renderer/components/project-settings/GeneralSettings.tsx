import {
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Separator } from '../ui/separator';
import { AVAILABLE_MODELS } from '../../../shared/constants';
import type {
  Project,
  ProjectSettings as ProjectSettingsType,
  AutoBuildVersionInfo,
  ProjectEnvConfig
} from '../../../shared/types';

interface GeneralSettingsProps {
  project: Project;
  settings: ProjectSettingsType;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettingsType>>;
  versionInfo: AutoBuildVersionInfo | null;
  isCheckingVersion: boolean;
  isUpdating: boolean;
  handleInitialize: () => Promise<void>;
  envConfig?: ProjectEnvConfig | null;
  updateEnvConfig?: (updates: Partial<ProjectEnvConfig>) => void;
}

export function GeneralSettings({
  project,
  settings,
  setSettings,
  versionInfo,
  isCheckingVersion,
  isUpdating,
  handleInitialize,
  envConfig,
  updateEnvConfig
}: GeneralSettingsProps) {
  const { t } = useTranslation(['settings']);

  return (
    <>
      {/* Auto-Build Integration */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Auto-Build Integration</h3>
        {!project.autoBuildPath ? (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Not Initialized</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Initialize Auto-Build to enable task creation and agent workflows.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={handleInitialize}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Initialize Auto-Build
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-foreground">Initialized</span>
              </div>
              <code className="text-xs bg-background px-2 py-1 rounded">
                {project.autoBuildPath}
              </code>
            </div>
            {isCheckingVersion ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking status...
              </div>
            ) : versionInfo && (
              <div className="text-xs text-muted-foreground">
                {versionInfo.isInitialized ? 'Initialized' : 'Not initialized'}
              </div>
            )}
          </div>
        )}
      </section>

      {project.autoBuildPath && (
        <>
          <Separator />

          {/* Agent Settings */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Agent Configuration</h3>
            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-medium text-foreground">Model</Label>
              <Select
                value={settings.model}
                onValueChange={(value) => setSettings({ ...settings, model: value })}
              >
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label className="font-normal text-foreground">
                  {t('projectSections.general.useClaudeMd')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('projectSections.general.useClaudeMdDescription')}
                </p>
              </div>
              <Switch
                checked={settings.useClaudeMd ?? true}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, useClaudeMd: checked })
                }
              />
            </div>
          </section>

          <Separator />

          {/* Workspace Settings */}
          {envConfig && updateEnvConfig && (
            <>
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Workspace Settings</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Workspace Mode</Label>
                    <Select
                      value={envConfig.workspaceMode || 'direct'}
                      onValueChange={(value: 'isolated' | 'direct') =>
                        updateEnvConfig({ workspaceMode: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">
                          <div className="flex flex-col items-start">
                            <span className="font-medium">Direct</span>
                            <span className="text-xs text-muted-foreground">Build directly in project (recommended)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="isolated">
                          <div className="flex flex-col items-start">
                            <span className="font-medium">Isolated (Worktree)</span>
                            <span className="text-xs text-muted-foreground">Build in separate worktree (safer)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {envConfig.workspaceMode === 'isolated'
                        ? 'Changes will be built in a separate Git worktree. Your project files are protected until you merge.'
                        : 'Changes will be made directly to your project. Faster but less isolated.'}
                    </p>
                  </div>

                  {/* Playwright Headless Mode */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-0.5">
                      <Label className="font-normal text-foreground">
                        Playwright Headless Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Run Playwright browser automation without visible browser window during QA validation
                      </p>
                    </div>
                    <Switch
                      checked={envConfig.playwrightHeadless ?? true}
                      onCheckedChange={(checked) =>
                        updateEnvConfig({ playwrightHeadless: checked })
                      }
                    />
                  </div>
                </div>
              </section>

              <Separator />

              {/* UI Framework Configuration */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">UI Framework Configuration</h3>
                <p className="text-xs text-muted-foreground">
                  Configure which UI framework and component library AI agents should use when building frontend features. Auto-detected from your project if not set.
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ui-styling" className="text-sm font-medium text-foreground">
                      UI Styling Framework
                    </Label>
                    <input
                      id="ui-styling"
                      type="text"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g., Tailwind CSS, styled-components, Emotion"
                      value={envConfig.uiFrameworkStyling || ''}
                      onChange={(e) =>
                        updateEnvConfig({ uiFrameworkStyling: e.target.value || undefined })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for auto-detection from package.json
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ui-library" className="text-sm font-medium text-foreground">
                      UI Component Library
                    </Label>
                    <input
                      id="ui-library"
                      type="text"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g., shadcn/ui, Material UI, Chakra UI, Ant Design"
                      value={envConfig.uiFrameworkLibrary || ''}
                      onChange={(e) =>
                        updateEnvConfig({ uiFrameworkLibrary: e.target.value || undefined })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for auto-detection from package.json
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ui-component-path" className="text-sm font-medium text-foreground">
                      Component Import Path
                    </Label>
                    <input
                      id="ui-component-path"
                      type="text"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g., @/components/ui"
                      value={envConfig.uiFrameworkComponentPath || ''}
                      onChange={(e) =>
                        updateEnvConfig({ uiFrameworkComponentPath: e.target.value || undefined })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Path prefix for component imports (default: @/components)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ui-instructions" className="text-sm font-medium text-foreground">
                      Custom UI Instructions
                    </Label>
                    <textarea
                      id="ui-instructions"
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      placeholder="e.g., Always use Button from @/components/ui/button, never create custom buttons"
                      value={envConfig.uiFrameworkInstructions || ''}
                      onChange={(e) =>
                        updateEnvConfig({ uiFrameworkInstructions: e.target.value || undefined })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Specific guidance for AI agents about your UI component usage patterns
                    </p>
                  </div>
                </div>
              </section>

              <Separator />
            </>
          )}

          {/* Notifications */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">On Task Complete</Label>
                <Switch
                  checked={settings.notifications.onTaskComplete}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        onTaskComplete: checked
                      }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">On Task Failed</Label>
                <Switch
                  checked={settings.notifications.onTaskFailed}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        onTaskFailed: checked
                      }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">On Review Needed</Label>
                <Switch
                  checked={settings.notifications.onReviewNeeded}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        onReviewNeeded: checked
                      }
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">Sound</Label>
                <Switch
                  checked={settings.notifications.sound}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        sound: checked
                      }
                    })
                  }
                />
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
