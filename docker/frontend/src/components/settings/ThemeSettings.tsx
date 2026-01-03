import { Sun, Moon, Monitor } from 'lucide-react';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import type { AppSettings } from '../../../shared/types';

interface ThemeSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Theme and appearance settings section
 */
export function ThemeSettings({ settings, onSettingsChange }: ThemeSettingsProps) {
  const getThemeIcon = (theme: string) => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <SettingsSection
      title="Appearance"
      description="Customize how Auto Claude looks"
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <Label htmlFor="theme" className="text-sm font-medium text-foreground">Theme</Label>
          <p className="text-sm text-muted-foreground">Choose your preferred color scheme</p>
          <div className="grid grid-cols-3 gap-3">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => onSettingsChange({ ...settings, theme })}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                  settings.theme === theme
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                )}
              >
                {getThemeIcon(theme)}
                <span className="text-sm font-medium capitalize">{theme}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
