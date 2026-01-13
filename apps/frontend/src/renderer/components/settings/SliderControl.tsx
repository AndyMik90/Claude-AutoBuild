import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';

interface SliderControlProps {
  // Label and display (one of label or labelKey is required)
  label?: string;
  labelKey?: string;
  // Description (one of description or descriptionKey is required)
  description?: string;
  descriptionKey?: string;
  value: number;
  displayValue?: string; // Optional custom display format

  // Slider configuration
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  ariaLabel: string;

  // State management
  onChange: (value: number) => void;

  // Optional epsilon comparison for floating-point values
  approxEqual?: (a: number, b: number) => boolean;
}

/**
 * Reusable slider control component for terminal settings
 * Provides label, value display, reset button, +/- buttons, and min/max markers
 */
export function SliderControl({
  label,
  labelKey,
  description,
  descriptionKey,
  value,
  displayValue,
  min,
  max,
  step,
  defaultValue,
  ariaLabel,
  onChange,
  approxEqual
}: SliderControlProps) {
  const { t } = useTranslation('settings');

  const labelText = labelKey ? t(labelKey) : label ?? '';
  const descriptionText = descriptionKey ? t(descriptionKey) : description ?? '';

  // Check if value differs from default for reset button visibility
  const isDefault = approxEqual
    ? approxEqual(value, defaultValue)
    : value === defaultValue;

  // Button styling classes
  const buttonClasses = (disabled: boolean) => cn(
    'p-1 rounded-md transition-colors shrink-0',
    'hover:bg-accent text-muted-foreground hover:text-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent'
  );

  // Slider styling classes
  const sliderClasses = cn(
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
  );

  return (
    <div className="space-y-3">
      {/* Header with label, value display, and reset button */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">{labelText}</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-muted-foreground">
            {displayValue ?? value}
          </span>
          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className={buttonClasses(false)}
              title={t('terminal.resetToDefault')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {descriptionText}
      </p>

      {/* Slider with +/- buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          disabled={value <= min}
          className={buttonClasses(value <= min)}
          title={t('terminal.decrease')}
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={ariaLabel}
          className={sliderClasses}
        />
        <button
          type="button"
          onClick={() => onChange(value + step)}
          disabled={value >= max}
          className={buttonClasses(value >= max)}
          title={t('terminal.increase')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Min/max markers */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
