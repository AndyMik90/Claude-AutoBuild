/**
 * ComplexitySelector - Dropdown for selecting task execution complexity level
 *
 * Allows users to choose how much planning and effort the AI should invest:
 * - Auto-detect: Let AI assess the complexity automatically
 * - Quick: Simple tasks with minimal planning
 * - Standard: Normal tasks with full planning
 * - Complex: Large features with extensive research
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Zap, Settings2, Layers } from 'lucide-react';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { cn } from '../../lib/utils';
import type { ExecutionComplexity } from '../../../shared/types/task';

// Re-export for convenience
export type { ExecutionComplexity };

// Complexity options with their icons and color classes
const COMPLEXITY_OPTIONS: {
  value: ExecutionComplexity;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}[] = [
  { value: 'auto', icon: Sparkles, colorClass: 'text-info' },
  { value: 'quick', icon: Zap, colorClass: 'text-warning' },
  { value: 'standard', icon: Settings2, colorClass: 'text-primary' },
  { value: 'complex', icon: Layers, colorClass: 'text-destructive' }
];

interface ComplexitySelectorProps {
  /** Currently selected complexity level */
  value: ExecutionComplexity;
  /** Callback when complexity changes */
  onChange: (value: ExecutionComplexity) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Optional ID prefix for accessibility */
  idPrefix?: string;
}

export const ComplexitySelector = memo(function ComplexitySelector({
  value,
  onChange,
  disabled = false,
  idPrefix = ''
}: ComplexitySelectorProps) {
  const { t } = useTranslation(['tasks']);
  const prefix = idPrefix ? `${idPrefix}-` : '';

  // Find the current option to get its icon and color
  const currentOption = COMPLEXITY_OPTIONS.find(opt => opt.value === value);
  const CurrentIcon = currentOption?.icon || Sparkles;
  const currentColorClass = currentOption?.colorClass || 'text-info';

  return (
    <div className="space-y-2">
      <Label
        htmlFor={`${prefix}execution-complexity`}
        className="text-sm font-medium text-foreground"
      >
        {t('tasks:executionComplexity.label')}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ExecutionComplexity)}
        disabled={disabled}
      >
        <SelectTrigger
          id={`${prefix}execution-complexity`}
          aria-describedby={`${prefix}execution-complexity-help`}
          className="h-10"
        >
          <div className="flex items-center gap-2">
            <CurrentIcon className={cn('h-4 w-4', currentColorClass)} />
            <SelectValue placeholder={t('tasks:executionComplexity.auto.label')} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {COMPLEXITY_OPTIONS.map(({ value: optValue, icon: Icon, colorClass }) => (
            <SelectItem key={optValue} value={optValue}>
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', colorClass)} />
                <div className="flex flex-col">
                  <span>{t(`tasks:executionComplexity.${optValue}.label`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`tasks:executionComplexity.${optValue}.description`)}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p
        id={`${prefix}execution-complexity-help`}
        className="text-xs text-muted-foreground"
      >
        {t('tasks:executionComplexity.helpText')}
      </p>
    </div>
  );
});
