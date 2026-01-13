import { Terminal, Type, Minus, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';
import { SettingsSection } from './SettingsSection';
import { useSettingsStore } from '../../stores/settings-store';
import {
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_STEP,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_STEP,
  TERMINAL_LETTER_SPACING_MIN,
  TERMINAL_LETTER_SPACING_MAX,
  TERMINAL_LETTER_SPACING_STEP,
  DEFAULT_TERMINAL_FONT_SETTINGS,
  TERMINAL_FONT_FAMILY_OPTIONS
} from '../../../shared/constants/config';
import type { AppSettings, TerminalFontFamily } from '../../../shared/types';

interface TerminalSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Terminal settings section for font customization
 * Provides font family selector, size slider, line height, and letter spacing controls
 * Changes apply immediately to all open terminals
 */
export function TerminalSettings({ settings, onSettingsChange }: TerminalSettingsProps) {
  const { t } = useTranslation('settings');
  const updateStoreSettings = useSettingsStore((state) => state.updateSettings);

  const currentFontSettings = settings.terminalFont ?? DEFAULT_TERMINAL_FONT_SETTINGS;

  // fontFamily is now a TerminalFontFamily key (e.g., 'system', 'jetbrainsMono')
  const selectedFontFamily = currentFontSettings.fontFamily;

  // Update font settings immediately (applies to all open terminals)
  const updateFontSettings = (updates: Partial<typeof DEFAULT_TERMINAL_FONT_SETTINGS> & { fontFamily?: TerminalFontFamily }) => {
    const newFontSettings = { ...currentFontSettings, ...updates };
    onSettingsChange({ ...settings, terminalFont: newFontSettings });
    updateStoreSettings({ terminalFont: newFontSettings });
  };

  const handleFontFamilyChange = (fontFamily: TerminalFontFamily) => {
    updateFontSettings({ fontFamily });
  };

  const handleFontSizeChange = (fontSize: number) => {
    const clampedSize = Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, fontSize));
    updateFontSettings({ fontSize: clampedSize });
  };

  const handleLineHeightChange = (lineHeight: number) => {
    const clampedHeight = Math.max(TERMINAL_LINE_HEIGHT_MIN, Math.min(TERMINAL_LINE_HEIGHT_MAX, lineHeight));
    updateFontSettings({ lineHeight: clampedHeight });
  };

  const handleLetterSpacingChange = (letterSpacing: number) => {
    const clampedSpacing = Math.max(TERMINAL_LETTER_SPACING_MIN, Math.min(TERMINAL_LETTER_SPACING_MAX, letterSpacing));
    updateFontSettings({ letterSpacing: clampedSpacing });
  };

  const handleReset = () => {
    updateFontSettings(DEFAULT_TERMINAL_FONT_SETTINGS);
  };

  // Epsilon-based comparison for floating-point values
  // Slider interactions can introduce tiny precision errors
  const approxEqual = (a: number, b: number, eps = 0.0001): boolean => Math.abs(a - b) < eps;

  const isDefault =
    currentFontSettings.fontSize === DEFAULT_TERMINAL_FONT_SETTINGS.fontSize &&
    approxEqual(currentFontSettings.lineHeight, DEFAULT_TERMINAL_FONT_SETTINGS.lineHeight) &&
    approxEqual(currentFontSettings.letterSpacing, DEFAULT_TERMINAL_FONT_SETTINGS.letterSpacing) &&
    selectedFontFamily === DEFAULT_TERMINAL_FONT_SETTINGS.fontFamily;

  return (
    <SettingsSection
      title={t('sections.terminal.title')}
      description={t('sections.terminal.description')}
    >
      <div className="space-y-6">
        {/* Font Family Selector */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">{t('terminal.fontFamily')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('terminal.fontFamilyDescription')}
          </p>
          <div className="grid grid-cols-2 gap-2 max-w-lg pt-1">
            {Object.entries(TERMINAL_FONT_FAMILY_OPTIONS).map(([key, { label, fontStack }]) => {
              const isSelected = selectedFontFamily === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleFontFamilyChange(key as TerminalFontFamily)}
                  className={cn(
                    'flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                  style={{ fontFamily: fontStack }}
                >
                  <Terminal className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Size Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">{t('terminal.fontSize')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">
                {currentFontSettings.fontSize}px
              </span>
              {currentFontSettings.fontSize !== DEFAULT_TERMINAL_FONT_SETTINGS.fontSize && (
                <button
                  type="button"
                  onClick={() => handleFontSizeChange(DEFAULT_TERMINAL_FONT_SETTINGS.fontSize)}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    'hover:bg-accent text-muted-foreground hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  title={t('terminal.resetToDefault')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('terminal.fontSizeDescription')}
          </p>

          {/* Slider with +/- buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleFontSizeChange(currentFontSettings.fontSize - TERMINAL_FONT_SIZE_STEP)}
              disabled={currentFontSettings.fontSize <= TERMINAL_FONT_SIZE_MIN}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.decrease')}
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={TERMINAL_FONT_SIZE_MIN}
              max={TERMINAL_FONT_SIZE_MAX}
              step={TERMINAL_FONT_SIZE_STEP}
              value={currentFontSettings.fontSize}
              onChange={(e) => handleFontSizeChange(parseFloat(e.target.value))}
              aria-label={t('terminal.fontSize')}
              className={cn(
                'flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                '[&::-webkit-slider-thumb]:appearance-none',
                '[&::-webkit-slider-thumb]:w-4',
                '[&::-webkit-slider-thumb]:h-4',
                '[&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-primary',
                '[&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-webkit-slider-thumb]:transition-all',
                '[&::-webkit-slider-thumb]:hover:scale-110',
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
            <button
              type="button"
              onClick={() => handleFontSizeChange(currentFontSettings.fontSize + TERMINAL_FONT_SIZE_STEP)}
              disabled={currentFontSettings.fontSize >= TERMINAL_FONT_SIZE_MAX}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.increase')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Size markers */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{TERMINAL_FONT_SIZE_MIN}px</span>
            <span>{TERMINAL_FONT_SIZE_MAX}px</span>
          </div>
        </div>

        {/* Line Height Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">{t('terminal.lineHeight')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">
                {currentFontSettings.lineHeight.toFixed(2)}
              </span>
              {currentFontSettings.lineHeight !== DEFAULT_TERMINAL_FONT_SETTINGS.lineHeight && (
                <button
                  type="button"
                  onClick={() => handleLineHeightChange(DEFAULT_TERMINAL_FONT_SETTINGS.lineHeight)}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    'hover:bg-accent text-muted-foreground hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  title={t('terminal.resetToDefault')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('terminal.lineHeightDescription')}
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleLineHeightChange(currentFontSettings.lineHeight - TERMINAL_LINE_HEIGHT_STEP)}
              disabled={currentFontSettings.lineHeight <= TERMINAL_LINE_HEIGHT_MIN}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.decrease')}
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={TERMINAL_LINE_HEIGHT_MIN}
              max={TERMINAL_LINE_HEIGHT_MAX}
              step={TERMINAL_LINE_HEIGHT_STEP}
              value={currentFontSettings.lineHeight}
              onChange={(e) => handleLineHeightChange(parseFloat(e.target.value))}
              aria-label={t('terminal.lineHeight')}
              className={cn(
                'flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                '[&::-webkit-slider-thumb]:appearance-none',
                '[&::-webkit-slider-thumb]:w-4',
                '[&::-webkit-slider-thumb]:h-4',
                '[&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-primary',
                '[&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-webkit-slider-thumb]:transition-all',
                '[&::-webkit-slider-thumb]:hover:scale-110',
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
            <button
              type="button"
              onClick={() => handleLineHeightChange(currentFontSettings.lineHeight + TERMINAL_LINE_HEIGHT_STEP)}
              disabled={currentFontSettings.lineHeight >= TERMINAL_LINE_HEIGHT_MAX}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.increase')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{TERMINAL_LINE_HEIGHT_MIN.toFixed(2)}</span>
            <span>{TERMINAL_LINE_HEIGHT_MAX.toFixed(2)}</span>
          </div>
        </div>

        {/* Letter Spacing Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">{t('terminal.letterSpacing')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">
                {currentFontSettings.letterSpacing > 0 ? '+' : ''}{currentFontSettings.letterSpacing.toFixed(1)}
              </span>
              {currentFontSettings.letterSpacing !== DEFAULT_TERMINAL_FONT_SETTINGS.letterSpacing && (
                <button
                  type="button"
                  onClick={() => handleLetterSpacingChange(DEFAULT_TERMINAL_FONT_SETTINGS.letterSpacing)}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    'hover:bg-accent text-muted-foreground hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  title={t('terminal.resetToDefault')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('terminal.letterSpacingDescription')}
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleLetterSpacingChange(currentFontSettings.letterSpacing - TERMINAL_LETTER_SPACING_STEP)}
              disabled={currentFontSettings.letterSpacing <= TERMINAL_LETTER_SPACING_MIN}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.decrease')}
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={TERMINAL_LETTER_SPACING_MIN}
              max={TERMINAL_LETTER_SPACING_MAX}
              step={TERMINAL_LETTER_SPACING_STEP}
              value={currentFontSettings.letterSpacing}
              onChange={(e) => handleLetterSpacingChange(parseFloat(e.target.value))}
              aria-label={t('terminal.letterSpacing')}
              className={cn(
                'flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                '[&::-webkit-slider-thumb]:appearance-none',
                '[&::-webkit-slider-thumb]:w-4',
                '[&::-webkit-slider-thumb]:h-4',
                '[&::-webkit-slider-thumb]:rounded-full',
                '[&::-webkit-slider-thumb]:bg-primary',
                '[&::-webkit-slider-thumb]:cursor-pointer',
                '[&::-webkit-slider-thumb]:transition-all',
                '[&::-webkit-slider-thumb]:hover:scale-110',
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
            <button
              type="button"
              onClick={() => handleLetterSpacingChange(currentFontSettings.letterSpacing + TERMINAL_LETTER_SPACING_STEP)}
              disabled={currentFontSettings.letterSpacing >= TERMINAL_LETTER_SPACING_MAX}
              className={cn(
                'p-1 rounded-md transition-colors shrink-0',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              )}
              title={t('terminal.increase')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{TERMINAL_LETTER_SPACING_MIN}</span>
            <span>{TERMINAL_LETTER_SPACING_MAX}</span>
          </div>
        </div>

        {/* Reset All Button */}
        {!isDefault && (
          <div className="pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleReset}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md transition-colors',
                'hover:bg-accent text-muted-foreground hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-sm font-medium">{t('terminal.resetAll')}</span>
            </button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
