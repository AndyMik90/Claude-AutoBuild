import { Monitor, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';
import { SettingsSection } from './SettingsSection';
import { useSettingsStore } from '../../stores/settings-store';
import { UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT, UI_SCALE_STEP } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';

interface DisplaySettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

// Preset scale values with translation keys
const SCALE_PRESETS = [
  { value: UI_SCALE_DEFAULT, label: '100%', descriptionKey: 'scale.default' },
  { value: 125, label: '125%', descriptionKey: 'scale.comfortable' },
  { value: 150, label: '150%', descriptionKey: 'scale.large' }
] as const;

/**
 * Display settings section for UI scale/zoom control
 * Provides preset buttons (100%, 125%, 150%) and a fine-tune slider (75-200%)
 * Changes apply immediately for live preview (like theme), saved on "Save Settings"
 */
export function DisplaySettings({ settings, onSettingsChange }: DisplaySettingsProps) {
  const { t } = useTranslation('settings');
  const updateStoreSettings = useSettingsStore((state) => state.updateSettings);

  const currentScale = settings.uiScale ?? UI_SCALE_DEFAULT;

  const handleScaleChange = (newScale: number) => {
    // Clamp to valid range
    const clampedScale = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, newScale));

    // Update local draft state
    onSettingsChange({ ...settings, uiScale: clampedScale });

    // Apply immediately to store for live preview (triggers App.tsx useEffect)
    updateStoreSettings({ uiScale: clampedScale });
  };

  const handleReset = () => {
    handleScaleChange(UI_SCALE_DEFAULT);
  };

  return (
    <SettingsSection
      title={t('sections.display.title')}
      description={t('sections.display.description')}
    >
      <div className="space-y-6">
        {/* Preset Buttons */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">{t('scale.presets')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('scale.presetsDescription')}
          </p>
          <div className="grid grid-cols-3 gap-3 max-w-md pt-1">
            {SCALE_PRESETS.map((preset) => {
              const isSelected = currentScale === preset.value;
              return (
                <button
                  key={preset.value}
                  onClick={() => handleScaleChange(preset.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                >
                  <Monitor className="h-4 w-4" />
                  <div className="text-center">
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-muted-foreground">{t(preset.descriptionKey)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fine-tune Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">{t('scale.fineTune')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">
                {currentScale}%
              </span>
              {currentScale !== UI_SCALE_DEFAULT && (
                <button
                  onClick={handleReset}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    'hover:bg-accent text-muted-foreground hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  title="Reset to default (100%)"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('scale.fineTuneDescription')}
          </p>

          {/* Slider with icons */}
          <div className="flex items-center gap-3 pt-1">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={currentScale}
              onChange={(e) => handleScaleChange(parseInt(e.target.value, 10))}
              className={cn(
                'flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                // Webkit (Chrome, Safari, Edge)
                '[&::-webkit-slider-thumb]:appearance-none',
                '[&::-webkit-slider-thumb]:w-4',
                '[&::-webkit-slider-thumb]:h-4',
                '[&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-primary',
                '[&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-webkit-slider-thumb]:transition-all',
                '[&::-webkit-slider-thumb]:hover:scale-110',
                // Firefox
                '[&::-moz-range-thumb]:w-4',
                '[&::-moz-range-thumb]:h-4',
                '[&::-moz-range-thumb]:rounded-full',
                '[&::-moz-range-thumb]:bg-primary',
                '[&::-moz-range-thumb]:border-0',
                '[&::-moz-range-thumb]:cursor-pointer',
                '[&::-moz-range-thumb]:transition-all',
                '[&::-moz-range-thumb]:hover:scale-110'
              )}
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          {/* Scale markers */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{UI_SCALE_MIN}%</span>
            <span>{UI_SCALE_MAX}%</span>
          </div>
        </div>

        {/* Preview hint */}
        <div className="rounded-lg bg-muted/50 border border-border p-4 text-sm">
          <p className="text-muted-foreground">
            {t('scale.preview')}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
