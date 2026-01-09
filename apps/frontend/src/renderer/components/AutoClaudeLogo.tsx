import { cn } from '../lib/utils';

interface AutoClaudeLogoProps {
  className?: string;
}

/**
 * Auto Claude ASCII art logo component
 * Adapts to theme colors using the --primary CSS variable
 */
export function AutoClaudeLogo({ className }: AutoClaudeLogoProps) {
  return (
    <svg
      width="140"
      height="24.5"
      viewBox="0 0 1301 228"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label="Auto Claude"
      className={cn('shrink-0', className)}
    >
      <title>Auto Claude</title>
      <text
        x="24"
        y="42"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {' █████╗ ██╗   ██╗████████╗ ██████╗     ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗'}
      </text>
      <text
        x="24"
        y="72"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {'██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗   ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝'}
      </text>
      <text
        x="24"
        y="102"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {'███████║██║   ██║   ██║   ██║   ██║   ██║     ██║     ███████║██║   ██║██║  ██║█████╗  '}
      </text>
      <text
        x="24"
        y="132"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {'██╔══██║██║   ██║   ██║   ██║   ██║   ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  '}
      </text>
      <text
        x="24"
        y="162"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {'██║  ██║╚██████╔╝   ██║   ╚██████╔╝   ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗'}
      </text>
      <text
        x="24"
        y="192"
        fontFamily="Courier New, monospace"
        fontSize="24"
        fill="var(--primary)"
        letterSpacing="1px"
        xmlSpace="preserve"
        style={{ whiteSpace: 'pre' }}
      >
        {'╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝     ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝'}
      </text>
    </svg>
  );
}
