import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Button, buttonVariants, type ButtonProps } from './button';

/* Apple HIG-inspired Button Group component
   Key principles:
   - Connected buttons with shared borders
   - Proper visual hierarchy for primary actions
   - Support for segmented control style
   - Split button functionality
   - Glass variant support
*/

const buttonGroupVariants = cva(
  'inline-flex items-center',
  {
    variants: {
      orientation: {
        horizontal: 'flex-row',
        vertical: 'flex-col',
      },
      size: {
        sm: 'gap-px',
        default: 'gap-px',
        lg: 'gap-px',
      },
      variant: {
        default: 'rounded-lg overflow-hidden',
        outline: 'rounded-lg overflow-hidden',
        ghost: 'rounded-lg',
        glass: 'rounded-lg overflow-hidden bg-card/60 backdrop-blur-md border border-border/50 shadow-sm',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      size: 'default',
      variant: 'default',
    },
  }
);

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {
  /** Buttons to render in the group */
  children: React.ReactNode;
  /** Whether buttons should fill available space */
  fullWidth?: boolean;
}

const ButtonGroupContext = React.createContext<{
  size: ButtonProps['size'];
  variant: ButtonProps['variant'];
  isFirst: boolean;
  isLast: boolean;
}>({
  size: 'default',
  variant: 'default',
  isFirst: false,
  isLast: false,
});

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation, size, variant, fullWidth = false, children, ...props }, ref) => {
    // Infer size from variant if not explicitly set
    const groupSize = size || (variant === 'glass' ? 'default' : 'default');

    // Map group variant to button variant
    const buttonVariant: ButtonProps['variant'] = variant === 'default' ? 'outline' : variant as ButtonProps['variant'];

    const childCount = React.Children.count(children);
    const childrenArray = React.Children.toArray(children);

    return (
      <div
        ref={ref}
        className={cn(
          buttonGroupVariants({ orientation, size: groupSize, variant }),
          fullWidth && 'w-full',
          className
        )}
        role="group"
        {...props}
      >
        {childrenArray.map((child, index) => {
          if (React.isValidElement(child)) {
            const isVertical = orientation === 'vertical';

            // Add border radius and borders based on position
            const borderRadius = isVertical
              ? index === 0
                ? 'rounded-t-lg rounded-b-none'
                : index === childCount - 1
                ? 'rounded-b-lg rounded-t-none'
                : 'rounded-none'
              : index === 0
              ? 'rounded-l-lg rounded-r-none'
              : index === childCount - 1
              ? 'rounded-r-lg rounded-l-none'
              : 'rounded-none';

            // Add border between buttons
            const borderClass = isVertical
              ? index > 0 ? 'border-t border-border' : ''
              : index > 0 ? 'border-l border-border' : '';

            // Remove default borders from outline variant
            const noBorder = buttonVariant === 'outline' ? 'border-r-0 border-t-0 border-b-0' : '';

            return React.cloneElement(child as React.ReactElement<any>, {
              className: cn(
                borderRadius,
                borderClass,
                noBorder,
                child.props.className,
                fullWidth && 'flex-1'
              ),
              size: child.props.size || groupSize,
              variant: child.props.variant || buttonVariant,
            });
          }
          return child;
        })}
      </div>
    );
  }
);

ButtonGroup.displayName = 'ButtonGroup';

/* Split Button component - button with dropdown trigger */
export interface SplitButtonProps extends Omit<ButtonGroupProps, 'children'> {
  /** Primary button text */
  label: string;
  /** Primary button click handler */
  onClick: () => void;
  /** Dropdown items */
  items: Array<{
    label: string;
    value: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  /** Icon for the primary button */
  icon?: React.ReactNode;
  /** Dropdown icon */
  dropdownIcon?: React.ReactNode;
}

const SplitButton = React.forwardRef<HTMLDivElement, SplitButtonProps>(
  (
    {
      className,
      size = 'default',
      variant = 'default',
      label,
      onClick,
      items,
      icon,
      dropdownIcon,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    const buttonVariant: ButtonProps['variant'] = variant === 'default' ? 'outline' : variant as ButtonProps['variant'];

    return (
      <div
        ref={ref}
        className={cn('relative inline-flex', className)}
        {...props}
      >
        <ButtonGroup size={size} variant={variant}>
          <Button
            size={size}
            variant={buttonVariant}
            onClick={onClick}
            className="rounded-r-none border-r-0"
          >
            {icon && <span className="mr-2">{icon}</span>}
            {label}
          </Button>
          <Button
            size={size}
            variant={buttonVariant}
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-l-none px-3"
            aria-expanded={isOpen}
            aria-haspopup="menu"
          >
            {dropdownIcon || (
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={cn('transition-transform', isOpen && 'rotate-180')}
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </Button>
        </ButtonGroup>

        {/* Dropdown menu */}
        {isOpen && (
          <div
            ref={dropdownRef}
            className={cn(
              'absolute top-full left-0 mt-1 z-50',
              'min-w-[200px]',
              'bg-card border border-border rounded-lg shadow-lg',
              'py-1',
              'animate-in fade-in slide-in-from-top-1'
            )}
            role="menu"
          >
            {items.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  item.onClick();
                  setIsOpen(false);
                }}
                disabled={item.disabled}
                className={cn(
                  'w-full px-3 py-2 text-left',
                  'flex items-center gap-2',
                  'text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-colors duration-150'
                )}
                role="menuitem"
              >
                {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

SplitButton.displayName = 'SplitButton';

/* Segmented Control - iOS-style segmented control */
export interface SegmentedControlProps extends Omit<ButtonGroupProps, 'children'> {
  /** Segments to render */
  segments: Array<{
    value: string;
    label: string;
    icon?: React.ReactNode;
    disabled?: boolean;
  }>;
  /** Current selected value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Size variant */
  size?: 'sm' | 'default' | 'lg';
}

const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ className, segments, value, onChange, size = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center',
          'bg-muted/50',
          'p-1 rounded-lg',
          'border border-border/50',
          className
        )}
        role="radiogroup"
        {...props}
      >
        {segments.map((segment, index) => {
          const isSelected = value === segment.value;
          const isFirst = index === 0;
          const isLast = index === segments.length - 1;

          return (
            <button
              key={segment.value}
              onClick={() => !segment.disabled && onChange(segment.value)}
              disabled={segment.disabled}
              className={cn(
                'inline-flex items-center justify-center gap-2',
                'font-medium text-sm whitespace-nowrap',
                'transition-all duration-150',
                'active:scale-[0.97]',
                // Size
                size === 'sm' ? 'h-7 px-2.5 text-xs' : size === 'lg' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-sm',
                // Selected state
                isSelected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                // Border radius
                isFirst && 'rounded-l-md',
                isLast && 'rounded-r-md',
                !isFirst && !isLast && 'rounded-none',
                // Disabled
                segment.disabled && 'opacity-50 cursor-not-allowed'
              )}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
            >
              {segment.icon && <span className="text-sm">{segment.icon}</span>}
              <span>{segment.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
);

SegmentedControl.displayName = 'SegmentedControl';

/* Icon-only button group */
export interface IconButtonGroupProps extends Omit<ButtonGroupProps, 'children'> {
  /** Icon buttons to render */
  buttons: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
  }>;
  /** Display tooltip on hover */
  tooltip?: boolean;
  /** Size variant */
  size?: 'sm' | 'default' | 'lg';
}

const IconButtonGroup = React.forwardRef<HTMLDivElement, IconButtonGroupProps>(
  ({ className, buttons, tooltip = true, size = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('inline-flex', className)}
        role="group"
        {...props}
      >
        {buttons.map((button, index) => {
          const isFirst = index === 0;
          const isLast = index === buttons.length - 1;
          const buttonSize = size === 'sm' ? 'icon:sm' : size === 'lg' ? 'icon:lg' : 'icon:default';

          return (
            <Button
              key={button.value}
              size={buttonSize as any}
              variant={button.active ? 'default' : 'outline'}
              onClick={button.onClick}
              disabled={button.disabled}
              className={cn(
                isFirst && 'rounded-r-none border-r-0',
                isLast && 'rounded-l-none',
                !isFirst && !isLast && 'rounded-none border-r-0'
              )}
              title={tooltip ? button.label : undefined}
            >
              {button.icon}
              <span className="sr-only">{button.label}</span>
            </Button>
          );
        })}
      </div>
    );
  }
);

IconButtonGroup.displayName = 'IconButtonGroup';

export {
  ButtonGroup,
  SplitButton,
  SegmentedControl,
  IconButtonGroup,
  buttonGroupVariants,
};
