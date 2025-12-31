import * as React from 'react';
import { cn } from '../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/* Apple HIG-inspired Keyboard shortcut display component
   Key principles:
   - Clean, minimal key styling inspired by macOS
   - Support for single and multi-key combinations
   - Proper keyboard symbol rendering
   - Accessible screen reader support
   - Multiple size options
*/

const kbdVariants = cva(
  'inline-flex items-center justify-center',
  {
    variants: {
      size: {
        xs: 'h-5 px-1.5 text-[10px] min-w-[1.25rem]',
        sm: 'h-6 px-2 text-xs min-w-[1.5rem]',
        md: 'h-7 px-2.5 text-sm min-w-[1.75rem]',
        lg: 'h-8 px-3 text-base min-w-[2rem]',
      },
      variant: {
        default: 'bg-muted border-border text-foreground',
        outline: 'bg-transparent border-border text-foreground',
        ghost: 'bg-transparent border-transparent text-muted-foreground',
        glass: 'bg-card/60 backdrop-blur-md border-border/50 text-foreground shadow-sm',
      },
    },
    defaultVariants: {
      size: 'sm',
      variant: 'default',
    },
  }
);

export interface KbdProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {
  /** The key(s) to display - can be a string or array of strings for combinations */
  children?: React.ReactNode;
  /** Optional icon to display alongside the key */
  icon?: React.ReactNode;
  /** Whether to hide the visual representation (screen reader only) */
  hidden?: boolean;
}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, size, variant, children, icon, hidden = false, ...props }, ref) => {
    if (hidden) {
      return <span className="sr-only">{children}</span>;
    }

    return (
      <kbd
        ref={ref}
        className={cn(
          kbdVariants({ size, variant }),
          'font-sans font-medium',
          'rounded-md border',
          'shadow-sm',
          'select-none',
          'transition-all duration-150',
          'hover:border-primary/50',
          'active:scale-95',
          className
        )}
        {...props}
      >
        {icon && <span className="mr-1">{icon}</span>}
        {children}
      </kbd>
    );
  }
);

Kbd.displayName = 'Kbd';

/* Keyboard key mapping for proper symbol display */
const KEY_SYMBOLS: Record<string, string> = {
  '⌘': 'Command',
  '⇧': 'Shift',
  '⌥': 'Option',
  '⎋': 'Escape',
  '⇥': 'Tab',
  '⌫': 'Delete',
  '⎵': 'Space',
  '↵': 'Enter',
  '⇪': 'Caps Lock',
  '⌦': 'Forward Delete',
  '↑': 'Arrow Up',
  '↓': 'Arrow Down',
  '←': 'Arrow Left',
  '→': 'Arrow Right',
  '↖': 'Home',
  '↘': 'End',
  '⇞': 'Page Up',
  '⇟': 'Page Down',
  'fn': 'Function',
  '⎋': 'Escape',
  '⌧': 'Clear',
};

/* Key combination component */
export interface KbdComboProps extends Omit<KbdProps, 'children'> {
  /** Array of keys to display as a combination */
  keys: string[];
  /** Separator between keys */
  separator?: React.ReactNode;
}

const KbdCombo = React.forwardRef<HTMLElement, KbdComboProps>(
  ({ className, size, variant, keys, separator = '+', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn('inline-flex items-center gap-1', className)}
        {...props}
      >
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <span className="text-muted-foreground text-xs mx-0.5">{separator}</span>
            )}
            <Kbd size={size} variant={variant}>
              {key}
            </Kbd>
          </React.Fragment>
        ))}
      </span>
    );
  }
);

KbdCombo.displayName = 'KbdCombo';

/* Preset keyboard shortcuts */
export interface KbdPresetProps extends Omit<KbdComboProps, 'keys'> {
  /** Predefined keyboard shortcut */
  preset:
    | 'save'
    | 'open'
    | 'new'
    | 'close'
    | 'copy'
    | 'paste'
    | 'cut'
    | 'undo'
    | 'redo'
    | 'find'
    | 'selectAll'
    | 'bold'
    | 'italic'
    | 'zoomIn'
    | 'zoomOut'
    | 'zoomReset'
    | 'refresh'
    | 'reload'
    | 'back'
    | 'forward'
    | 'quit'
    | 'lock';
  /** Platform to use for shortcut display */
  platform?: 'mac' | 'windows' | 'linux' | 'auto';
}

const PRESET_SHORTCUTS: Record<string, { mac: string[]; win: string[]; linux: string[] }> = {
  save: { mac: ['⌘', 'S'], win: ['Ctrl', 'S'], linux: ['Ctrl', 'S'] },
  open: { mac: ['⌘', 'O'], win: ['Ctrl', 'O'], linux: ['Ctrl', 'O'] },
  new: { mac: ['⌘', 'N'], win: ['Ctrl', 'N'], linux: ['Ctrl', 'N'] },
  close: { mac: ['⌘', 'W'], win: ['Ctrl', 'W'], linux: ['Ctrl', 'W'] },
  copy: { mac: ['⌘', 'C'], win: ['Ctrl', 'C'], linux: ['Ctrl', 'C'] },
  paste: { mac: ['⌘', 'V'], win: ['Ctrl', 'V'], linux: ['Ctrl', 'V'] },
  cut: { mac: ['⌘', 'X'], win: ['Ctrl', 'X'], linux: ['Ctrl', 'X'] },
  undo: { mac: ['⌘', 'Z'], win: ['Ctrl', 'Z'], linux: ['Ctrl', 'Z'] },
  redo: { mac: ['⇧', '⌘', 'Z'], win: ['Ctrl', '⇧', 'Z'], linux: ['Ctrl', '⇧', 'Z'] },
  find: { mac: ['⌘', 'F'], win: ['Ctrl', 'F'], linux: ['Ctrl', 'F'] },
  selectAll: { mac: ['⌘', 'A'], win: ['Ctrl', 'A'], linux: ['Ctrl', 'A'] },
  bold: { mac: ['⌘', 'B'], win: ['Ctrl', 'B'], linux: ['Ctrl', 'B'] },
  italic: { mac: ['⌘', 'I'], win: ['Ctrl', 'I'], linux: ['Ctrl', 'I'] },
  zoomIn: { mac: ['⌘', '+'], win: ['Ctrl', '+'], linux: ['Ctrl', '+'] },
  zoomOut: { mac: ['⌘', '-'], win: ['Ctrl', '-'], linux: ['Ctrl', '-'] },
  zoomReset: { mac: ['⌘', '0'], win: ['Ctrl', '0'], linux: ['Ctrl', '0'] },
  refresh: { mac: ['⌘', 'R'], win: ['Ctrl', 'R'], linux: ['Ctrl', 'R'] },
  reload: { mac: ['⇧', '⌘', 'R'], win: ['Ctrl', '⇧', 'R'], linux: ['Ctrl', '⇧', 'R'] },
  back: { mac: ['⌘', '['], win: ['Alt', '←'], linux: ['Alt', '←'] },
  forward: { mac: ['⌘', ']'], win: ['Alt', '→'], linux: ['Alt', '→'] },
  quit: { mac: ['⌘', 'Q'], win: ['Ctrl', 'Q'], linux: ['Ctrl', 'Q'] },
  lock: { mac: ['⌃', '⌘', 'Q'], win: ['⊞', 'L'], linux: ['⊞', 'L'] },
};

const KbdPreset = React.forwardRef<HTMLElement, KbdPresetProps>(
  ({ className, size, variant, preset, platform = 'auto', ...props }, ref) => {
    // Auto-detect platform
    const detectedPlatform = platform === 'auto'
      ? (navigator.userAgent.includes('Mac') ? 'mac' : navigator.userAgent.includes('Win') ? 'win' : 'linux')
      : platform;

    const shortcut = PRESET_SHORTCUTS[preset];
    const keys = shortcut[detectedPlatform === 'win' ? 'win' : detectedPlatform === 'linux' ? 'linux' : 'mac'];

    return (
      <KbdCombo
        ref={ref}
        className={className}
        size={size}
        variant={variant}
        keys={keys}
        {...props}
      />
    );
  }
);

KbdPreset.displayName = 'KbdPreset';

export { Kbd, KbdCombo, KbdPreset, kbdVariants };
