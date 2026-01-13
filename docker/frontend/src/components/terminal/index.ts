// Export main component
export { Terminal } from '../Terminal';

// Export sub-components (in case they need to be used elsewhere)
export { TerminalHeader } from './TerminalHeader';
export { TerminalTitle } from './TerminalTitle';
export { TaskSelector } from './TaskSelector';

// Export hooks
export { useXterm } from './useXterm';
export { usePtyProcess } from './usePtyProcess';
export { useTerminalEvents } from './useTerminalEvents';
export { useAutoNaming } from './useAutoNaming';

// Export types and constants
export type { TerminalProps } from './types';
export { STATUS_COLORS, PHASE_CONFIG } from './types';
