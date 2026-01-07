import { useTranslation } from 'react-i18next';
import { SettingsSection } from './SettingsSection';
import { ThemeSelector } from './ThemeSelector';
import type { AppSettings } from '../../../shared/types';

interface ThemeSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Theme and appearance settings section
 * Wraps the ThemeSelector component with a consistent settings section layout
 */
export function ThemeSettings({ settings, onSettingsChange }: ThemeSettingsProps) {
  const { t } = useTranslation('settings');

  return (
    <SettingsSection
      title={t('theme.title')}
      description={t('theme.description')}
    >
      <ThemeSelector settings={settings} onSettingsChange={onSettingsChange} />
    </SettingsSection>
  );
}
