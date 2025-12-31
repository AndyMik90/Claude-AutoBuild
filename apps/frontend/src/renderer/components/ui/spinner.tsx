import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* Apple HIG-inspired Spinner component
   Key principles:
   - Smooth animations with Apple easing
   - Multiple sizes for different contexts
   - Subtle, non-distracting loading states
   - Support for light/dark themes
*/

const spinnerVariants = cva(
  'relative inline-block shrink-0',
  {
    variants: {
      size: {
        xs: 'w-3 h-3',
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
        xl: 'w-8 h-8',
        '2xl': 'w-10 h-10',
      },
      variant: {
        default: 'text-primary',
        muted: 'text-muted-foreground',
        success: 'text-success',
        warning: 'text-warning',
        info: 'text-info',
        destructive: 'text-destructive',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  /** Label for screen readers */
  label?: string;
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size, variant, label = 'Loading...', ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn(spinnerVariants({ size, variant }), className)}
        {...props}
      >
        {/* Apple-style spinner with 8 segments */}
        <svg
          className="animate-[spin_1s_cubic-bezier(0.5,0,0.5,1)_infinite]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          {/* Outer ring */}
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          {/* Inner spinning segment */}
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {/* Screen reader only text */}
        <span className="sr-only">{label}</span>

        <style>{`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }
);

Spinner.displayName = 'Spinner';

/* Dots spinner variant - alternative loading animation */
export interface SpinnerDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'muted' | 'success' | 'warning' | 'info' | 'destructive';
  label?: string;
}

const SpinnerDots = React.forwardRef<HTMLDivElement, SpinnerDotsProps>(
  ({ className, size = 'md', variant = 'default', label = 'Loading...', ...props }, ref) => {
    const dotSizes = {
      xs: 'w-1 h-1',
      sm: 'w-1.5 h-1.5',
      md: 'w-2 h-2',
      lg: 'w-2.5 h-2.5',
      xl: 'w-3 h-3',
    };

    const variantColors = {
      default: 'bg-primary',
      muted: 'bg-muted-foreground',
      success: 'bg-success',
      warning: 'bg-warning',
      info: 'bg-info',
      destructive: 'bg-destructive',
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('flex items-center gap-1', className)}
        {...props}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-full animate-[bounce_1.4s_infinite_ease-in-out]',
              dotSizes[size],
              variantColors[variant]
            )}
            style={{
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

SpinnerDots.displayName = 'SpinnerDots';

/* Bars spinner variant - another alternative */
export interface SpinnerBarsProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'muted' | 'success' | 'warning' | 'info' | 'destructive';
  label?: string;
}

const SpinnerBars = React.forwardRef<HTMLDivElement, SpinnerBarsProps>(
  ({ className, size = 'md', variant = 'default', label = 'Loading...', ...props }, ref) => {
    const barSizes = {
      xs: 'w-1 h-3',
      sm: 'w-1.5 h-4',
      md: 'w-2 h-5',
      lg: 'w-2.5 h-6',
    };

    const variantColors = {
      default: 'bg-primary',
      muted: 'bg-muted-foreground',
      success: 'bg-success',
      warning: 'bg-warning',
      info: 'bg-info',
      destructive: 'bg-destructive',
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn('flex items-end gap-1', className)}
        {...props}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-sm animate-[pulse_1.2s_ease-in-out_infinite]',
              barSizes[size],
              variantColors[variant]
            )}
            style={{
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

SpinnerBars.displayName = 'SpinnerBars';

/* Glass variant support */
export interface SpinnerGlassProps extends SpinnerProps {
  blur?: 'sm' | 'md' | 'lg' | 'xl';
}

const SpinnerGlass = React.forwardRef<HTMLDivElement, SpinnerGlassProps>(
  ({ className, size = 'md', variant = 'default', blur = 'lg', label = 'Loading...', ...props }, ref) => {
    const blurAmounts = {
      sm: 'backdrop-blur-sm',
      md: 'backdrop-blur-md',
      lg: 'backdrop-blur-lg',
      xl: 'backdrop-blur-xl',
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center',
          'bg-card/60 backdrop-blur-lg',
          'border border-border/50',
          'rounded-full p-2',
          'shadow-lg',
          blurAmounts[blur],
          className
        )}
        {...props}
      >
        <Spinner size={size} variant={variant} />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
);

SpinnerGlass.displayName = 'SpinnerGlass';

export { Spinner, SpinnerDots, SpinnerBars, SpinnerGlass, spinnerVariants };
