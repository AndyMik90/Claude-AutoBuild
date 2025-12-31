import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Label } from './label';

/* Apple HIG-inspired Field component
   Key principles:
   - Consistent form field spacing and layout
   - Proper accessibility with ARIA attributes
   - Support for labels, hints, errors, and descriptions
   - Clear visual hierarchy
   - Glass variant support
*/

const fieldVariants = cva(
  'flex flex-col gap-1.5',
  {
    variants: {
      orientation: {
        horizontal: 'flex-row items-center justify-between gap-4',
        vertical: 'flex-col gap-1.5',
      },
      variant: {
        default: '',
        glass: 'bg-card/60 backdrop-blur-md border border-border/50 rounded-xl p-4',
      },
    },
    defaultVariants: {
      orientation: 'vertical',
      variant: 'default',
    },
  }
);

export interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fieldVariants> {
  /** Field label */
  label?: string;
  /** Field description/hint */
  description?: string;
  /** Error message */
  error?: string;
  /** Required field indicator */
  required?: boolean;
  /** Field identifier */
  id?: string;
  /** Children (form input) */
  children: React.ReactNode;
  /** Label position */
  labelPosition?: 'top' | 'left' | 'hidden';
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({
    className,
    orientation,
    variant,
    label,
    description,
    error,
    required = false,
    id,
    children,
    labelPosition = 'top',
    ...props
  },
  ref
) => {
    const fieldId = React.useId();
    const descriptionId = React.useId();
    const errorId = React.useId();

    const actualId = id || fieldId;

    // Clone child and add aria attributes
    const childWithAria = React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<any>, {
          id: actualId,
          'aria-describedby': error ? errorId : description ? descriptionId : undefined,
          'aria-invalid': !!error,
          'aria-required': required,
        })
      : children;

    return (
      <div
        ref={ref}
        className={cn(
          fieldVariants({ orientation: labelPosition === 'left' ? 'horizontal' : 'vertical', variant }),
          className
        )}
        {...props}
      >
        {label && labelPosition !== 'hidden' && (
          <Label
            htmlFor={actualId}
            className={cn(
              labelPosition === 'left' && 'min-w-[120px] shrink-0',
              error && 'text-destructive'
            )}
          >
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </Label>
        )}

        <div className="flex-1 min-w-0">
          {childWithAria}

          {description && !error && (
            <p
              id={descriptionId}
              className={cn(
                'text-xs text-muted-foreground mt-1.5',
                'transition-colors duration-150'
              )}
            >
              {description}
            </p>
          )}

          {error && (
            <p
              id={errorId}
              className={cn(
                'text-xs text-destructive mt-1.5',
                'flex items-center gap-1',
                'animate-in fade-in slide-in-from-top-1'
              )}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M6 3V6M6 8V8.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }
);

Field.displayName = 'Field';

/* Fieldset component for grouping related fields */
export interface FieldsetProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** Legend/title for the fieldset */
  legend?: string;
  /** Description for the fieldset */
  description?: string;
  /** Whether the fieldset is disabled */
  disabled?: boolean;
  /** Error state for entire fieldset */
  error?: string;
  /** Orientation */
  orientation?: 'vertical' | 'horizontal';
  /** Field children */
  children: React.ReactNode;
}

const Fieldset = React.forwardRef<HTMLFieldSetElement, FieldsetProps>(
  ({ className, legend, description, disabled = false, error, orientation = 'vertical', children, ...props }, ref) => {
    return (
      <fieldset
        ref={ref}
        disabled={disabled}
        className={cn(
          'border border-border rounded-lg',
          'p-4',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-destructive',
          className
        )}
        {...props}
      >
        {legend && (
          <legend className="text-sm font-medium text-foreground px-2">
            {legend}
          </legend>
        )}

        {description && (
          <p className="text-xs text-muted-foreground mb-3 -mt-1">
            {description}
          </p>
        )}

        <div
          className={cn(
            orientation === 'horizontal' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'
          )}
        >
          {children}
        </div>

        {error && (
          <p className="text-xs text-destructive mt-2 flex items-center gap-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M6 3V6M6 8V8.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {error}
          </p>
        )}
      </fieldset>
    );
  }
);

Fieldset.displayName = 'Fieldset';

/* Checkbox Field - pre-configured field with checkbox */
export interface CheckboxFieldProps extends Omit<FieldProps, 'children'> {
  /** Checkbox checked state */
  checked?: boolean;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Checkbox label (rendered next to checkbox) */
  checkboxLabel: string;
}

const CheckboxField = React.forwardRef<HTMLDivElement, CheckboxFieldProps>(
  ({ label, description, error, required, checkboxLabel, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false);
    const isChecked = checked !== undefined ? checked : internalChecked;

    const handleChange = (newChecked: boolean) => {
      if (checked === undefined) {
        setInternalChecked(newChecked);
      }
      onCheckedChange?.(newChecked);
    };

    return (
      <div ref={ref} className="flex items-start gap-3" {...props}>
        <div className="flex items-center h-5 mt-0.5">
          <input
            type="checkbox"
            id={`checkbox-${checkboxLabel.replace(/\s+/g, '-')}`}
            checked={isChecked}
            onChange={(e) => handleChange(e.target.checked)}
            className={cn(
              'w-4 h-4 rounded border-border',
              'text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'cursor-pointer',
              'transition-all duration-150'
            )}
            aria-invalid={!!error}
            aria-required={required}
          />
        </div>

        <div className="flex-1 min-w-0">
          {label && (
            <Label
              htmlFor={`checkbox-${checkboxLabel.replace(/\s+/g, '-')}`}
              className={cn(error && 'text-destructive')}
            >
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </Label>
          )}

          {description && !error && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}

          {error && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M6 3V6M6 8V8.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }
);

CheckboxField.displayName = 'CheckboxField';

/* Switch Field - pre-configured field with switch */
export interface SwitchFieldProps extends Omit<FieldProps, 'children'> {
  /** Switch checked state */
  checked?: boolean;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Switch label (rendered next to switch) */
  switchLabel?: string;
}

const SwitchField = React.forwardRef<HTMLDivElement, SwitchFieldProps>(
  ({ label, description, error, required, switchLabel, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false);
    const isChecked = checked !== undefined ? checked : internalChecked;

    const handleChange = (newChecked: boolean) => {
      if (checked === undefined) {
        setInternalChecked(newChecked);
      }
      onCheckedChange?.(newChecked);
    };

    return (
      <Field
        ref={ref}
        label={label}
        description={description}
        error={error}
        required={required}
        {...props}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm">{switchLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isChecked}
            onClick={() => handleChange(!isChecked)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isChecked ? 'bg-primary' : 'bg-input'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition',
                'duration-200 ease-in-out',
                isChecked ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </Field>
    );
  }
);

SwitchField.displayName = 'SwitchField';

/* Radio Group Field - pre-configured field with radio group */
export interface RadioGroupFieldProps extends Omit<FieldProps, 'children'> {
  /** Radio options */
  options: Array<{
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }>;
  /** Selected value */
  value?: string;
  /** Default value */
  defaultValue?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
}

const RadioGroupField = React.forwardRef<HTMLDivElement, RadioGroupFieldProps>(
  ({ label, description, error, required, options, value, defaultValue, onValueChange, orientation = 'vertical', ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue || '');
    const selectedValue = value !== undefined ? value : internalValue;

    const handleChange = (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    };

    return (
      <Field
        ref={ref}
        label={label}
        description={description}
        error={error}
        required={required}
        {...props}
      >
        <div
          className={cn(
            'flex gap-4',
            orientation === 'horizontal' ? 'flex-row' : 'flex-col'
          )}
          role="radiogroup"
        >
          {options.map((option) => {
            const optionId = `radio-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={optionId}
                className={cn(
                  'flex items-start gap-3 cursor-pointer',
                  'p-3 rounded-lg border border-transparent',
                  'hover:bg-accent/50',
                  'transition-colors duration-150',
                  selectedValue === option.value && 'bg-accent border-border',
                  option.disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <input
                  type="radio"
                  id={optionId}
                  name={label}
                  value={option.value}
                  checked={selectedValue === option.value}
                  onChange={() => !option.disabled && handleChange(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    'mt-0.5 w-4 h-4',
                    'text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    'cursor-pointer',
                    'transition-all duration-150'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </Field>
    );
  }
);

RadioGroupField.displayName = 'RadioGroupField';

export {
  Field,
  Fieldset,
  CheckboxField,
  SwitchField,
  RadioGroupField,
  fieldVariants,
};
