import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { SettingsSection } from './SettingsSection';
import { AgentProfileSettings } from './AgentProfileSettings';
import { AVAILABLE_MODELS } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';

interface GeneralSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  section: 'agent' | 'paths';
}

/**
 * General settings component for agent configuration and paths
 */
export function GeneralSettings({ settings, onSettingsChange, section }: GeneralSettingsProps) {
  if (section === 'agent') {
    return (
      <div className="space-y-8">
        {/* Agent Profile Selection */}
        <AgentProfileSettings />

        {/* Other Agent Settings */}
        <SettingsSection
          title="Other Agent Settings"
          description="Additional agent configuration options"
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="agentFramework" className="text-sm font-medium text-foreground">Agent Framework</Label>
              <p className="text-sm text-muted-foreground">The coding framework used for autonomous tasks</p>
              <Select
                value={settings.agentFramework}
                onValueChange={(value) => onSettingsChange({ ...settings, agentFramework: value })}
              >
                <SelectTrigger id="agentFramework" className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto-claude">Auto Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between max-w-md">
                <div className="space-y-1">
                  <Label htmlFor="autoNameTerminals" className="text-sm font-medium text-foreground">
                    AI Terminal Naming
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically name terminals based on commands (uses Haiku)
                  </p>
                </div>
                <Switch
                  id="autoNameTerminals"
                  checked={settings.autoNameTerminals}
                  onCheckedChange={(checked) => onSettingsChange({ ...settings, autoNameTerminals: checked })}
                />
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    );
  }

  // paths section
  return (
    <SettingsSection
      title="Paths"
      description="Configure executable and framework paths"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Label htmlFor="pythonPath" className="text-sm font-medium text-foreground">Python Path</Label>
          <p className="text-sm text-muted-foreground">Path to Python executable (leave empty for default)</p>
          <Input
            id="pythonPath"
            placeholder="python3 (default)"
            className="w-full max-w-lg"
            value={settings.pythonPath || ''}
            onChange={(e) => onSettingsChange({ ...settings, pythonPath: e.target.value })}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="autoBuildPath" className="text-sm font-medium text-foreground">Auto Claude Path</Label>
          <p className="text-sm text-muted-foreground">Relative path to auto-claude directory in projects</p>
          <Input
            id="autoBuildPath"
            placeholder="auto-claude (default)"
            className="w-full max-w-lg"
            value={settings.autoBuildPath || ''}
            onChange={(e) => onSettingsChange({ ...settings, autoBuildPath: e.target.value })}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
