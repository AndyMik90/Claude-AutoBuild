import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AVAILABLE_MODELS } from '../../../shared/constants';
import type { ProjectSettings } from '../../../shared/types';

interface AgentConfigSectionProps {
  settings: ProjectSettings;
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
}

export function AgentConfigSection({ settings, onUpdateSettings }: AgentConfigSectionProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Agent Configuration</h3>
      <div className="space-y-2">
        <Label htmlFor="model" className="text-sm font-medium text-foreground">Model</Label>
        <Select
          value={settings.model}
          onValueChange={(value) => onUpdateSettings({ model: value })}
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
    </section>
  );
}
