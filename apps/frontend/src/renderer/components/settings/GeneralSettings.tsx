import { useTranslation } from 'react-i18next';
import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Settings2, FolderOpen } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { SettingsSection } from './SettingsSection';
import { AgentProfileSettings } from './AgentProfileSettings';
import { CondaDetectionDisplay } from './CondaDetectionDisplay';
import { CondaSetupWizard } from './CondaSetupWizard';
import { PythonPackageValidator } from './PythonPackageValidator';
import {
  AVAILABLE_MODELS,
  THINKING_LEVELS,
  DEFAULT_FEATURE_MODELS,
  DEFAULT_FEATURE_THINKING,
  FEATURE_LABELS
} from '../../../shared/constants';
import type {
  AppSettings,
  FeatureModelConfig,
  ModelTypeShort,
  ThinkingLevel,
  ToolDetectionResult,
  CondaDetectionResult,
  CondaEnvValidation
} from '../../../shared/types';

interface GeneralSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  section: 'agent' | 'paths';
}

/**
 * Helper component to display auto-detected CLI tool information
 */
interface ToolDetectionDisplayProps {
  info: ToolDetectionResult | null;
  isLoading: boolean;
  t: (key: string) => string;
}

function ToolDetectionDisplay({ info, isLoading, t }: ToolDetectionDisplayProps) {
  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground mt-1">
        {t('python.detecting')}
      </div>
    );
  }

  if (!info || !info.found) {
    return (
      <div className="text-xs text-muted-foreground mt-1">
        {t('general.notDetected')}
      </div>
    );
  }

  const getSourceLabel = (source: ToolDetectionResult['source']): string => {
    const sourceMap: Record<ToolDetectionResult['source'], string> = {
      'user-config': t('general.sourceUserConfig'),
      'venv': t('general.sourceVenv'),
      'homebrew': t('general.sourceHomebrew'),
      'nvm': t('general.sourceNvm'),
      'system-path': t('general.sourceSystemPath'),
      'bundled': t('general.sourceBundled'),
      'fallback': t('general.sourceFallback'),
    };
    return sourceMap[source] || source;
  };

  return (
    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
      <div>
        <span className="font-medium">{t('general.detectedPath')}:</span>{' '}
        <code className="bg-muted px-1 py-0.5 rounded">{info.path}</code>
      </div>
      {info.version && (
        <div>
          <span className="font-medium">{t('general.detectedVersion')}:</span>{' '}
          {info.version}
        </div>
      )}
      <div>
        <span className="font-medium">{t('general.detectedSource')}:</span>{' '}
        {getSourceLabel(info.source)}
      </div>
    </div>
  );
}

/**
 * General settings component for agent configuration and paths
 */
export function GeneralSettings({ settings, onSettingsChange, section }: GeneralSettingsProps) {
  const { t } = useTranslation('settings');
  const [toolsInfo, setToolsInfo] = useState<{
    python: ToolDetectionResult;
    git: ToolDetectionResult;
    gh: ToolDetectionResult;
    claude: ToolDetectionResult;
  } | null>(null);
  const [isLoadingTools, setIsLoadingTools] = useState(false);

  // Conda/Python environment state
  const [condaDetection, setCondaDetection] = useState<CondaDetectionResult | null>(null);
  const [isLoadingConda, setIsLoadingConda] = useState(false);
  const [autoClaudeEnvStatus, setAutoClaudeEnvStatus] = useState<CondaEnvValidation | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [isPythonValidating, setIsPythonValidating] = useState(false);

  // Fetch CLI tools detection info when component mounts (paths section only)
  useEffect(() => {
    if (section === 'paths') {
      setIsLoadingTools(true);
      window.electronAPI
        .getCliToolsInfo()
        .then((result: { success: boolean; data?: { python: ToolDetectionResult; git: ToolDetectionResult; gh: ToolDetectionResult; claude: ToolDetectionResult } }) => {
          if (result.success && result.data) {
            setToolsInfo(result.data);
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to fetch CLI tools info:', error);
        })
        .finally(() => {
          setIsLoadingTools(false);
        });
    }
  }, [section]);

  // Check Auto Claude environment status
  const checkAutoClaudeEnv = useCallback(async () => {
    try {
      const result = await window.electronAPI.conda.checkAutoClaudeEnv();
      if (result.success && result.data) {
        setAutoClaudeEnvStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to check Auto Claude env:', error);
    }
  }, []);

  // Load Conda detection and Auto Claude env status
  const loadCondaDetection = useCallback(async () => {
    setIsLoadingConda(true);
    try {
      const result = await window.electronAPI.conda.detectConda();
      if (result.success && result.data) {
        setCondaDetection(result.data);
        // If conda is detected, also check the Auto Claude environment status
        if (result.data.found) {
          checkAutoClaudeEnv();
        }
      }
    } catch (error) {
      console.error('Failed to detect Conda:', error);
    } finally {
      setIsLoadingConda(false);
    }
  }, [checkAutoClaudeEnv]);

  // Load Conda detection when paths section is active
  useEffect(() => {
    if (section === 'paths') {
      loadCondaDetection();
    }
  }, [section, loadCondaDetection]);

  const handleRefreshConda = useCallback(() => {
    loadCondaDetection();
  }, [loadCondaDetection]);

  async function handleBrowseConda() {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        onSettingsChange({ ...settings, condaPath: path });
      }
    } catch (error) {
      console.error('Failed to open directory picker:', error);
    }
  }

  if (section === 'agent') {
    return (
      <div className="space-y-8">
        {/* Agent Profile Selection */}
        <AgentProfileSettings />

        {/* Other Agent Settings */}
        <SettingsSection
          title={t('general.otherAgentSettings')}
          description={t('general.otherAgentSettingsDescription')}
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="agentFramework" className="text-sm font-medium text-foreground">{t('general.agentFramework')}</Label>
              <p className="text-sm text-muted-foreground">{t('general.agentFrameworkDescription')}</p>
              <Select
                value={settings.agentFramework}
                onValueChange={(value) => onSettingsChange({ ...settings, agentFramework: value })}
              >
                <SelectTrigger id="agentFramework" className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto-claude">{t('general.agentFrameworkAutoClaude')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between max-w-md">
                <div className="space-y-1">
                  <Label htmlFor="autoNameTerminals" className="text-sm font-medium text-foreground">
                    {t('general.aiTerminalNaming')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('general.aiTerminalNamingDescription')}
                  </p>
                </div>
                <Switch
                  id="autoNameTerminals"
                  checked={settings.autoNameTerminals}
                  onCheckedChange={(checked) => onSettingsChange({ ...settings, autoNameTerminals: checked })}
                />
              </div>
            </div>

            {/* Feature Model Configuration */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{t('general.featureModelSettings')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('general.featureModelSettingsDescription')}
                </p>
              </div>

              {(Object.keys(FEATURE_LABELS) as Array<keyof FeatureModelConfig>).map((feature) => {
                const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
                const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

                return (
                  <div key={feature} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-foreground">
                        {FEATURE_LABELS[feature].label}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {FEATURE_LABELS[feature].description}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      {/* Model Select */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t('general.model')}</Label>
                        <Select
                          value={featureModels[feature]}
                          onValueChange={(value) => {
                            const newFeatureModels = { ...featureModels, [feature]: value as ModelTypeShort };
                            onSettingsChange({ ...settings, featureModels: newFeatureModels });
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_MODELS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Thinking Level Select */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{t('general.thinkingLevel')}</Label>
                        <Select
                          value={featureThinking[feature]}
                          onValueChange={(value) => {
                            const newFeatureThinking = { ...featureThinking, [feature]: value as ThinkingLevel };
                            onSettingsChange({ ...settings, featureThinking: newFeatureThinking });
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {THINKING_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                {level.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SettingsSection>
      </div>
    );
  }

  // paths section
  return (
    <SettingsSection
      title={t('general.paths')}
      description={t('general.pathsDescription')}
    >
      {/* Loading Overlay - Show during Python validation */}
      {isPythonValidating && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-lg font-medium text-foreground">{t('python.validatingEnvironment')}</p>
          <p className="text-sm text-muted-foreground mt-2">{t('python.validatingHint')}</p>
        </div>
      )}
      <div className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="pythonPath" className="text-sm font-medium text-foreground">{t('general.pythonPath')}</Label>
          <p className="text-sm text-muted-foreground">{t('general.pythonPathDescription')}</p>
          <div className="flex gap-2 w-full max-w-lg">
            <Input
              id="pythonPath"
              placeholder={t('general.pythonPathPlaceholder')}
              className="flex-1"
              value={settings.pythonPath || ''}
              onChange={(e) => onSettingsChange({ ...settings, pythonPath: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={async () => {
                const path = await window.electronAPI.selectDirectory();
                if (path) {
                  onSettingsChange({ ...settings, pythonPath: path });
                }
              }}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('general.browse')}
            </Button>
          </div>
          {!settings.pythonPath && (
            <ToolDetectionDisplay
              info={toolsInfo?.python || null}
              isLoading={isLoadingTools}
              t={t}
            />
          )}
        </div>

        {/* Python Activation Script */}
        <div className="space-y-3">
          <Label htmlFor="pythonActivationScript" className="text-sm font-medium text-foreground">
            {t('general.pythonActivationScript')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('general.pythonActivationScriptDescription')}
          </p>
          <div className="flex gap-2 w-full max-w-lg">
            <Input
              id="pythonActivationScript"
              placeholder={t('general.pythonActivationScriptPlaceholder')}
              className="flex-1"
              value={settings.pythonActivationScript || ''}
              onChange={(e) => onSettingsChange({ ...settings, pythonActivationScript: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={async () => {
                const path = await window.electronAPI.selectDirectory();
                if (path) {
                  onSettingsChange({ ...settings, pythonActivationScript: path });
                }
              }}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('general.browse')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('general.pythonActivationScriptHint')}
          </p>
        </div>

        {/* Package Validation (only show if pythonPath is set) */}
        {settings.pythonPath && (
          <div className="space-y-3 p-4 border border-border rounded-md bg-muted/50">
            <Label className="text-sm font-medium text-foreground">
              {t('general.pythonPackageValidation')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('general.pythonPackageValidationDescription')}
            </p>
            <PythonPackageValidator
              pythonPath={settings.pythonPath}
              activationScript={settings.pythonActivationScript}
              onValidationStateChange={setIsPythonValidating}
            />
          </div>
        )}

        <div className="space-y-3">
          <Label htmlFor="gitPath" className="text-sm font-medium text-foreground">{t('general.gitPath')}</Label>
          <p className="text-sm text-muted-foreground">{t('general.gitPathDescription')}</p>
          <Input
            id="gitPath"
            placeholder={t('general.gitPathPlaceholder')}
            className="w-full max-w-lg"
            value={settings.gitPath || ''}
            onChange={(e) => onSettingsChange({ ...settings, gitPath: e.target.value })}
          />
          {!settings.gitPath && (
            <ToolDetectionDisplay
              info={toolsInfo?.git || null}
              isLoading={isLoadingTools}
              t={t}
            />
          )}
        </div>
        <div className="space-y-3">
          <Label htmlFor="githubCLIPath" className="text-sm font-medium text-foreground">{t('general.githubCLIPath')}</Label>
          <p className="text-sm text-muted-foreground">{t('general.githubCLIPathDescription')}</p>
          <Input
            id="githubCLIPath"
            placeholder={t('general.githubCLIPathPlaceholder')}
            className="w-full max-w-lg"
            value={settings.githubCLIPath || ''}
            onChange={(e) => onSettingsChange({ ...settings, githubCLIPath: e.target.value })}
          />
          {!settings.githubCLIPath && (
            <ToolDetectionDisplay
              info={toolsInfo?.gh || null}
              isLoading={isLoadingTools}
              t={t}
            />
          )}
        </div>
        <div className="space-y-3">
          <Label htmlFor="claudePath" className="text-sm font-medium text-foreground">{t('general.claudePath')}</Label>
          <p className="text-sm text-muted-foreground">{t('general.claudePathDescription')}</p>
          <Input
            id="claudePath"
            placeholder={t('general.claudePathPlaceholder')}
            className="w-full max-w-lg"
            value={settings.claudePath || ''}
            onChange={(e) => onSettingsChange({ ...settings, claudePath: e.target.value })}
          />
          {!settings.claudePath && (
            <ToolDetectionDisplay
              info={toolsInfo?.claude || null}
              isLoading={isLoadingTools}
              t={t}
            />
          )}
        </div>
        <div className="space-y-3">
          <Label htmlFor="autoBuildPath" className="text-sm font-medium text-foreground">{t('general.autoClaudePath')}</Label>
          <p className="text-sm text-muted-foreground">{t('general.autoClaudePathDescription')}</p>
          <Input
            id="autoBuildPath"
            placeholder={t('general.autoClaudePathPlaceholder')}
            className="w-full max-w-lg"
            value={settings.autoBuildPath || ''}
            onChange={(e) => onSettingsChange({ ...settings, autoBuildPath: e.target.value })}
          />
        </div>

        {/* Conda / Python Environment Section */}
        <div className="pt-6 border-t border-border space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">{t('python.title')}</h3>
            <p className="text-sm text-muted-foreground">{t('sections.pythonEnv.description')}</p>
          </div>

          {/* Conda Installation Detection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
              {t('python.condaInstallation')}
            </Label>
            <CondaDetectionDisplay
              detection={condaDetection}
              isLoading={isLoadingConda}
              onRefresh={handleRefreshConda}
              onBrowse={handleBrowseConda}
              manualPath={settings.condaPath}
              onManualPathChange={(path) => onSettingsChange({ ...settings, condaPath: path })}
            />
          </div>

          {/* Auto Claude Environment Status (only shown if conda is detected) */}
          {condaDetection?.found && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">
                {t('python.autoClaudeEnv')}
              </Label>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                {/* Status display */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {autoClaudeEnvStatus?.valid ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {t('python.statusReady')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Python {autoClaudeEnvStatus.pythonVersion}
                            {autoClaudeEnvStatus.packageCount !== undefined && (
                              <span className="ml-2">
                                {t('python.packagesInstalled', { count: autoClaudeEnvStatus.packageCount })}
                              </span>
                            )}
                          </div>
                        </div>
                      </>
                    ) : autoClaudeEnvStatus?.error ? (
                      <>
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {t('python.statusBroken')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {autoClaudeEnvStatus.message || autoClaudeEnvStatus.error}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <Settings2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {t('python.statusNotConfigured')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t('sections.pythonEnv.description')}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Setup / Reinstall button */}
                  <Button
                    variant={autoClaudeEnvStatus?.valid ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => setShowSetupWizard(true)}
                  >
                    {autoClaudeEnvStatus?.valid
                      ? t('python.reinstallEnv')
                      : t('python.setupEnv')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conda Setup Wizard Dialog */}
      <CondaSetupWizard
        open={showSetupWizard}
        onOpenChange={setShowSetupWizard}
        type="app"
        onComplete={() => {
          loadCondaDetection();
          checkAutoClaudeEnv();
        }}
      />
    </SettingsSection>
  );
}
