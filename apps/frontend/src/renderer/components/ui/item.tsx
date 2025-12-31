import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* Apple HIG-inspired Item component
   Key principles:
   - Consistent list item styling
   - Support for various content layouts
   - Proper accessibility with ARIA roles
   - Multiple variants for different contexts
   - Glass variant support
*/

const itemVariants = cva(
  'flex items-center gap-3',
  {
    variants: {
      size: {
        sm: 'h-9 px-3 py-2 text-sm',
        default: 'h-11 px-4 py-2.5 text-sm',
        lg: 'h-13 px-4 py-3 text-base',
      },
      variant: {
        default: 'hover:bg-accent/50 cursor-pointer transition-colors duration-150',
        outline: 'border border-border rounded-lg hover:bg-accent/50',
        ghost: 'hover:bg-accent/30',
        active: 'bg-accent text-accent-foreground',
        disabled: 'opacity-50 cursor-not-allowed',
        glass: 'bg-card/40 backdrop-blur-md border border-border/50 rounded-lg hover:bg-card/60',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
      interactive: true,
    },
  }
);

export interface ItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemVariants> {
  /** Item icon/avatar */
  icon?: React.ReactNode;
  /** Item title */
  title?: string;
  /** Item description */
  description?: string;
  /** Right side content (e.g., badge, indicator) */
  trailing?: React.ReactNode;
  /** Whether item is selected */
  selected?: boolean;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Additional badge */
  badge?: string | number;
  /** Chevron indicator */
  chevron?: boolean;
  /** Link href */
  href?: string;
  /** Click handler */
  onClick?: () => void;
}

const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  ({
    className,
    size,
    variant,
    interactive,
    icon,
    title,
    description,
    trailing,
    selected = false,
    disabled = false,
    badge,
    chevron = false,
    href,
    onClick,
    ...props
  },
  ref
) => {
    const Component = href ? 'a' : 'div';

    const baseVariant = disabled ? 'disabled' : selected ? 'active' : variant;

    return (
      <Component
        ref={ref as any}
        href={href}
        className={cn(
          itemVariants({ size, variant: baseVariant, interactive }),
          selected && 'bg-accent/80',
          className
        )}
        onClick={!disabled ? onClick : undefined}
        role={interactive ? 'menuitem' : undefined}
        aria-selected={selected}
        aria-disabled={disabled}
        {...(props as any)}
      >
        {/* Icon/Avatar */}
        {icon && (
          <div className="shrink-0">
            {icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <div className={cn(
              'font-medium truncate',
              description && 'mb-0.5'
            )}>
              {title}
            </div>
          )}
          {description && (
            <div className="text-xs text-muted-foreground truncate">
              {description}
            </div>
          )}
        </div>

        {/* Badge */}
        {badge !== undefined && (
          <div className={cn(
            'shrink-0',
            'min-w-[20px] h-5 px-1.5',
            'flex items-center justify-center',
            'bg-muted text-muted-foreground',
            'rounded-full text-xs font-medium'
          )}>
            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
          </div>
        )}

        {/* Trailing content */}
        {trailing && !chevron && (
          <div className="shrink-0">
            {trailing}
          </div>
        )}

        {/* Chevron */}
        {chevron && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0 text-muted-foreground"
          >
            <path
              d="M6 4L10 8L6 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </Component>
    );
  }
);

Item.displayName = 'Item';

/* Item Group - container for related items */
export interface ItemGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Group title */
  title?: string;
  /** Group description */
  description?: string;
  /** Item children */
  children: React.ReactNode;
  /** Whether to show dividers between items */
  dividers?: boolean;
  /** Variant for all items */
  itemVariant?: ItemProps['variant'];
  /** Size for all items */
  itemSize?: ItemProps['size'];
}

const ItemGroup = React.forwardRef<HTMLDivElement, ItemGroupProps>(
  ({ className, title, description, children, dividers = true, itemVariant, itemSize, ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);

    return (
      <div ref={ref} className={cn('flex flex-col', className)} {...props}>
        {(title || description) && (
          <div className="px-4 py-2">
            {title && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-1">
                {description}
              </p>
            )}
          </div>
        )}

        <div
          className={cn(
            'flex flex-col',
            dividers && 'divide-y divide-border/50'
          )}
          role="menu"
        >
          {childrenArray.map((child, index) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<any>, {
                variant: child.props.variant || itemVariant,
                size: child.props.size || itemSize,
              });
            }
            return child;
          })}
        </div>
      </div>
    );
  }
);

ItemGroup.displayName = 'ItemGroup';

/* Item List - scrollable list of items */
export interface ItemListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Item children */
  children: React.ReactNode;
  /** Maximum height before scrolling */
  maxHeight?: string | number;
  /** Whether to show scroll indicator */
  scrollIndicator?: boolean;
}

const ItemList = React.forwardRef<HTMLDivElement, ItemListProps>(
  ({ className, children, maxHeight = '300px', scrollIndicator = true, ...props }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [showTopShadow, setShowTopShadow] = React.useState(false);
    const [showBottomShadow, setShowBottomShadow] = React.useState(false);

    const handleScroll = React.useCallback(() => {
      if (!containerRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      setShowTopShadow(scrollTop > 0);
      setShowBottomShadow(scrollTop < scrollHeight - clientHeight - 1);
    }, []);

    React.useEffect(() => {
      const container = containerRef.current;
      if (container) {
        container.addEventListener('scroll', handleScroll);
        handleScroll(); // Initial check
        return () => container.removeEventListener('scroll', handleScroll);
      }
    }, [handleScroll]);

    return (
      <div
        ref={(node) => {
          // Handle both refs
          if (node) {
            containerRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }
        }}
        className={cn(
          'relative overflow-auto',
          className
        )}
        style={{ maxHeight }}
        {...props}
      >
        <div className="flex flex-col">
          {children}
        </div>

        {scrollIndicator && (
          <>
            {showTopShadow && (
              <div
                className={cn(
                  'absolute top-0 left-0 right-0 z-10',
                  'h-8 bg-gradient-to-b from-background to-transparent',
                  'pointer-events-none'
                )}
              />
            )}
            {showBottomShadow && (
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 z-10',
                  'h-8 bg-gradient-to-t from-background to-transparent',
                  'pointer-events-none'
                )}
              />
            )}
          </>
        )}
      </div>
    );
  }
);

ItemList.displayName = 'ItemList';

/* Checkbox Item - item with built-in checkbox */
export interface CheckboxItemProps extends Omit<ItemProps, 'icon' | 'trailing'> {
  /** Checked state */
  checked?: boolean;
  /** Default checked state */
  defaultChecked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Checkbox position */
  checkboxPosition?: 'left' | 'right';
}

const CheckboxItem = React.forwardRef<HTMLDivElement, CheckboxItemProps>(
  ({
    className,
    checked,
    defaultChecked = false,
    onCheckedChange,
    checkboxPosition = 'right',
    title,
    description,
    disabled = false,
    ...props
  },
  ref
) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    const isChecked = checked !== undefined ? checked : internalChecked;

    const handleToggle = () => {
      if (!disabled) {
        const newChecked = !isChecked;
        if (checked === undefined) {
          setInternalChecked(newChecked);
        }
        onCheckedChange?.(newChecked);
      }
    };

    const checkbox = (
      <div
        className={cn(
          'shrink-0 w-5 h-5 rounded border',
          'flex items-center justify-center',
          'transition-all duration-150',
          isChecked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border bg-background',
          disabled && 'opacity-50'
        )}
      >
        {isChecked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6L4.5 8.5L10 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3',
          'h-11 px-4',
          'hover:bg-accent/50 cursor-pointer',
          'transition-colors duration-150',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onClick={handleToggle}
        role="menuitemcheckbox"
        aria-checked={isChecked}
        {...props}
      >
        {checkboxPosition === 'left' && checkbox}
        <div className="flex-1 min-w-0">
          {title && (
            <div className={cn('font-medium truncate', description && 'mb-0.5')}>
              {title}
            </div>
          )}
          {description && (
            <div className="text-xs text-muted-foreground truncate">
              {description}
            </div>
          )}
        </div>
        {checkboxPosition === 'right' && checkbox}
      </div>
    );
  }
);

CheckboxItem.displayName = 'CheckboxItem';

/* Avatar Item - specialized item with avatar */
export interface AvatarItemProps extends Omit<ItemProps, 'icon'> {
  /** Avatar src */
  src?: string;
  /** Avatar alt text */
  alt?: string;
  /** Avatar fallback initials */
  initials?: string;
  /** Avatar size */
  avatarSize?: 'xs' | 'sm' | 'md' | 'lg';
  /** Online indicator */
  online?: boolean;
}

const AvatarItem = React.forwardRef<HTMLDivElement, AvatarItemProps>(
  ({
    className,
    size = 'default',
    variant,
    src,
    alt,
    initials,
    avatarSize = 'md',
    online,
    title,
    description,
    trailing,
    selected,
    disabled,
    badge,
    chevron,
    href,
    onClick,
    ...props
  },
  ref
) => {
    const avatarSizes = {
      xs: 'w-6 h-6 text-xs',
      sm: 'w-8 h-8 text-sm',
      md: 'w-10 h-10 text-base',
      lg: 'w-12 h-12 text-lg',
    };

    const avatar = (
      <div className="relative shrink-0">
        {src ? (
          <img
            src={src}
            alt={alt || title}
            className={cn(
              'rounded-full object-cover',
              avatarSizes[avatarSize]
            )}
          />
        ) : (
          <div
            className={cn(
              'rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground',
              avatarSizes[avatarSize]
            )}
          >
            {initials || title?.charAt(0) || '?'}
          </div>
        )}
        {online && (
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full border-2 border-background" />
        )}
      </div>
    );

    return (
      <Item
        ref={ref}
        className={className}
        size={size}
        variant={variant}
        icon={avatar}
        title={title}
        description={description}
        trailing={trailing}
        selected={selected}
        disabled={disabled}
        badge={badge}
        chevron={chevron}
        href={href}
        onClick={onClick}
        {...props}
      />
    );
  }
);

AvatarItem.displayName = 'AvatarItem';

export {
  Item,
  ItemGroup,
  ItemList,
  CheckboxItem,
  AvatarItem,
  itemVariants,
};
