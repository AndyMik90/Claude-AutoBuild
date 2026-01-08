/**
 * ClassificationFields - Shared component for task classification fields
 *
 * Renders the 2x2 grid of classification dropdowns (category, priority, complexity, impact)
 * used in both TaskCreationWizard and TaskEditDialog.
 */
import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_COMPLEXITY_LABELS,
  TASK_IMPACT_LABELS
} from '../../../shared/constants';
import type { TaskCategory, TaskPriority, TaskComplexity, TaskImpact } from '../../../shared/types';

interface ClassificationFieldsProps {
  /** Current category value */
  category: TaskCategory | '';
  /** Current priority value */
  priority: TaskPriority | '';
  /** Current complexity value */
  complexity: TaskComplexity | '';
  /** Current impact value */
  impact: TaskImpact | '';
  /** Callback when category changes */
  onCategoryChange: (value: TaskCategory | '') => void;
  /** Callback when priority changes */
  onPriorityChange: (value: TaskPriority | '') => void;
  /** Callback when complexity changes */
  onComplexityChange: (value: TaskComplexity | '') => void;
  /** Callback when impact changes */
  onImpactChange: (value: TaskImpact | '') => void;
  /** Whether the fields are disabled */
  disabled?: boolean;
  /** Optional ID prefix for form elements (for accessibility) */
  idPrefix?: string;
}

export function ClassificationFields({
  category,
  priority,
  complexity,
  impact,
  onCategoryChange,
  onPriorityChange,
  onComplexityChange,
  onImpactChange,
  disabled = false,
  idPrefix = ''
}: ClassificationFieldsProps) {
  const { t } = useTranslation('tasks');
  const prefix = idPrefix ? `${idPrefix}-` : '';

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
      <div className="grid grid-cols-2 gap-4">
        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor={`${prefix}category`} className="text-xs font-medium text-muted-foreground">
            {t('form.classification.category')}
          </Label>
          <Select
            value={category}
            onValueChange={(value) => onCategoryChange(value as TaskCategory)}
            disabled={disabled}
          >
            <SelectTrigger id={`${prefix}category`} className="h-9">
              <SelectValue placeholder={t('form.classification.selectCategory')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label htmlFor={`${prefix}priority`} className="text-xs font-medium text-muted-foreground">
            {t('form.classification.priority')}
          </Label>
          <Select
            value={priority}
            onValueChange={(value) => onPriorityChange(value as TaskPriority)}
            disabled={disabled}
          >
            <SelectTrigger id={`${prefix}priority`} className="h-9">
              <SelectValue placeholder={t('form.classification.selectPriority')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Complexity */}
        <div className="space-y-2">
          <Label htmlFor={`${prefix}complexity`} className="text-xs font-medium text-muted-foreground">
            {t('form.classification.complexity')}
          </Label>
          <Select
            value={complexity}
            onValueChange={(value) => onComplexityChange(value as TaskComplexity)}
            disabled={disabled}
          >
            <SelectTrigger id={`${prefix}complexity`} className="h-9">
              <SelectValue placeholder={t('form.classification.selectComplexity')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_COMPLEXITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Impact */}
        <div className="space-y-2">
          <Label htmlFor={`${prefix}impact`} className="text-xs font-medium text-muted-foreground">
            {t('form.classification.impact')}
          </Label>
          <Select
            value={impact}
            onValueChange={(value) => onImpactChange(value as TaskImpact)}
            disabled={disabled}
          >
            <SelectTrigger id={`${prefix}impact`} className="h-9">
              <SelectValue placeholder={t('form.classification.selectImpact')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_IMPACT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('form.classification.helpText')}
      </p>
    </div>
  );
}
