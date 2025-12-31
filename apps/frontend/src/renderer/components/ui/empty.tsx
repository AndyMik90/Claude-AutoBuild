import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* Apple HIG-inspired Empty State component
   Key principles:
   - Clear, friendly messaging
   - Visual hierarchy with optional illustrations
   - Actionable next steps
   - Support for multiple contexts
   - Glass variant support
*/

const emptyVariants = cva(
  'flex flex-col items-center justify-center',
  {
    variants: {
      size: {
        sm: 'p-6 gap-3',
        default: 'p-8 gap-4',
        lg: 'p-12 gap-5',
      },
      variant: {
        default: '',
        card: 'bg-card border border-border rounded-2xl',
        glass: 'bg-card/60 backdrop-blur-md border border-border/50 rounded-2xl shadow-lg',
        muted: 'bg-muted/30 rounded-2xl',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  }
);

export interface EmptyProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyVariants> {
  /** Main title/headline */
  title?: string;
  /** Description text */
  description?: string;
  /** Custom illustration/icon */
  illustration?: React.ReactNode;
  /** Action button */
  action?: React.ReactNode;
  /** Secondary action */
  secondaryAction?: React.ReactNode;
  /** Empty state variant */
  state?: 'noData' | 'noResults' | 'error' | 'loading' | 'success' | 'custom';
}

const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(
  ({
    className,
    size,
    variant,
    title,
    description,
    illustration,
    action,
    secondaryAction,
    state = 'noData',
    ...props
  },
  ref
) => {
    // Default illustrations for different states
    const defaultIllustration = React.useMemo(() => {
      if (illustration) return illustration;

      const iconSize = size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-20 h-20' : 'w-16 h-16';

      switch (state) {
        case 'noData':
          return (
            <svg
              className={cn(iconSize, 'text-muted-foreground/50')}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 10H21"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 15H7.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );

        case 'noResults':
          return (
            <svg
              className={cn(iconSize, 'text-muted-foreground/50')}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M21 21L16.65 16.65"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );

        case 'error':
          return (
            <svg
              className={cn(iconSize, 'text-destructive/50')}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M12 8V12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16" r="1" fill="currentColor" />
            </svg>
          );

        case 'loading':
          return (
            <div className={cn(iconSize, 'flex items-center justify-center')}>
              <svg
                className="animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          );

        case 'success':
          return (
            <svg
              className={cn(iconSize, 'text-success/50')}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 12L10.5 14.5L16 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );

        default:
          return null;
      }
    }, [illustration, size, state]);

    // Default titles for different states
    const defaultTitle = React.useMemo(() => {
      if (title) return title;

      switch (state) {
        case 'noData':
          return 'No data yet';
        case 'noResults':
          return 'No results found';
        case 'error':
          return 'Something went wrong';
        case 'loading':
          return 'Loading...';
        case 'success':
          return 'All done!';
        default:
          return '';
      }
    }, [title, state]);

    // Default descriptions for different states
    const defaultDescription = React.useMemo(() => {
      if (description) return description;

      switch (state) {
        case 'noData':
          return 'Get started by adding your first item.';
        case 'noResults':
          return 'Try adjusting your search or filters.';
        case 'error':
          return 'Please try again later or contact support if the problem persists.';
        case 'loading':
          return 'Please wait while we load your content.';
        case 'success':
          return 'Your changes have been saved successfully.';
        default:
          return '';
      }
    }, [description, state]);

    return (
      <div
        ref={ref}
        className={cn(emptyVariants({ size, variant }), className)}
        role="status"
        aria-live="polite"
        {...props}
      >
        {/* Illustration */}
        {defaultIllustration && (
          <div className="animate-in fade-in zoom-in duration-300">
            {defaultIllustration}
          </div>
        )}

        {/* Title */}
        {defaultTitle && (
          <h3 className={cn(
            'font-semibold text-foreground',
            'text-center',
            size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'
          )}>
            {defaultTitle}
          </h3>
        )}

        {/* Description */}
        {defaultDescription && (
          <p className={cn(
            'text-muted-foreground text-center max-w-sm',
            size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
          )}>
            {defaultDescription}
          </p>
        )}

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className={cn(
            'flex items-center gap-3 mt-2',
            'animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100'
          )}>
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    );
  }
);

Empty.displayName = 'Empty';

/* Empty List Item - inline empty state for lists */
export interface EmptyListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Message to display */
  message?: string;
  /** Compact size */
  compact?: boolean;
}

const EmptyListItem = React.forwardRef<HTMLDivElement, EmptyListItemProps>(
  ({ className, message = 'No items', compact = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center',
          'text-muted-foreground',
          'py-8 px-4',
          compact && 'py-4',
          className
        )}
        role="status"
        {...props}
      >
        <span className={cn('text-sm', compact && 'text-xs')}>
          {message}
        </span>
      </div>
    );
  }
);

EmptyListItem.displayName = 'EmptyListItem';

/* Empty State with Icon - simplified empty state with custom icon */
export interface EmptyIconProps extends Omit<EmptyProps, 'illustration'> {
  /** Icon component */
  icon: React.ReactNode;
  /** Icon color variant */
  iconColor?: 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'destructive';
}

const EmptyIcon = React.forwardRef<HTMLDivElement, EmptyIconProps>(
  ({ className, size, icon, iconColor = 'muted', title, description, action, secondaryAction, ...props }, ref) => {
    const iconSize = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';

    const colorClasses = {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
    };

    return (
      <div
        ref={ref}
        className={cn(emptyVariants({ size, variant: 'default' }), className)}
        role="status"
        {...props}
      >
        {/* Icon */}
        <div className={cn(iconSize, colorClasses[iconColor])}>
          {icon}
        </div>

        {/* Title */}
        {title && (
          <h3 className={cn(
            'font-semibold text-foreground text-center',
            size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base'
          )}>
            {title}
          </h3>
        )}

        {/* Description */}
        {description && (
          <p className={cn(
            'text-muted-foreground text-center max-w-sm',
            size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
          )}>
            {description}
          </p>
        )}

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex items-center gap-3 mt-2">
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    );
  }
);

EmptyIcon.displayName = 'EmptyIcon';

/* Empty Page - full-page empty state */
export interface EmptyPageProps extends EmptyProps {
  /** Maximum width */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const EmptyPage = React.forwardRef<HTMLDivElement, EmptyPageProps>(
  ({ className, maxWidth = 'md', ...props }, ref) => {
    const maxWidths = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center min-h-[400px] p-8',
          maxWidths[maxWidth],
          className
        )}
      >
        <Empty {...props} />
      </div>
    );
  }
);

EmptyPage.displayName = 'EmptyPage';

/* Empty State Presets */
export interface EmptyPresetProps extends Omit<EmptyProps, 'state' | 'title' | 'description'> {
  preset:
    | 'noTasks'
    | 'noMessages'
    | 'noFiles'
    | 'noNotifications'
    | 'noFavorites'
    | 'noSearchResults'
    | 'noConnections'
    | 'noActivity'
    | 'networkError'
    | 'serverError'
    | 'accessDenied'
    | 'pageNotFound';
}

const presetContent: Record<
  string,
  { title: string; description: string; state: EmptyProps['state'] }
> = {
  noTasks: {
    title: 'No tasks yet',
    description: 'Create your first task to get started.',
    state: 'noData',
  },
  noMessages: {
    title: 'No messages',
    description: 'Start a conversation to see messages here.',
    state: 'noData',
  },
  noFiles: {
    title: 'No files',
    description: 'Upload files to see them here.',
    state: 'noData',
  },
  noNotifications: {
    title: 'All caught up',
    description: 'You have no new notifications.',
    state: 'noData',
  },
  noFavorites: {
    title: 'No favorites',
    description: 'Add items to your favorites to access them quickly.',
    state: 'noData',
  },
  noSearchResults: {
    title: 'No results found',
    description: 'We couldn\'t find anything matching your search.',
    state: 'noResults',
  },
  noConnections: {
    title: 'No connections',
    description: 'Connect with others to see them here.',
    state: 'noData',
  },
  noActivity: {
    title: 'No recent activity',
    description: 'Your activity will appear here.',
    state: 'noData',
  },
  networkError: {
    title: 'Network error',
    description: 'Check your internet connection and try again.',
    state: 'error',
  },
  serverError: {
    title: 'Server error',
    description: 'Something went wrong on our end. Please try again later.',
    state: 'error',
  },
  accessDenied: {
    title: 'Access denied',
    description: 'You don\'t have permission to view this content.',
    state: 'error',
  },
  pageNotFound: {
    title: 'Page not found',
    description: 'The page you\'re looking for doesn\'t exist.',
    state: 'error',
  },
};

const EmptyPreset = React.forwardRef<HTMLDivElement, EmptyPresetProps>(
  ({ className, preset, size, variant, illustration, action, secondaryAction, ...props }, ref) => {
    const content = presetContent[preset];

    return (
      <Empty
        ref={ref}
        className={className}
        size={size}
        variant={variant}
        state={content.state}
        title={content.title}
        description={content.description}
        illustration={illustration}
        action={action}
        secondaryAction={secondaryAction}
        {...props}
      />
    );
  }
);

EmptyPreset.displayName = 'EmptyPreset';

export {
  Empty,
  EmptyListItem,
  EmptyIcon,
  EmptyPage,
  EmptyPreset,
  emptyVariants,
};
