/**
 * Type declarations for @lydell/node-pty
 *
 * @lydell/node-pty is a fork of node-pty maintained by Simon Lydell.
 * It provides pseudo-terminal (PTY) functionality for Node.js/Electron apps.
 *
 * Note: This is a native Node.js addon that requires platform-specific compilation.
 * The actual module is handled by electron-vite during build, but tsc --noEmit
 * needs these declarations for strict type checking.
 */

declare module '@lydell/node-pty' {
  /**
   * Event handler disposable interface
   */
  export interface IDisposable {
    dispose(): void;
  }

  /**
   * Exit event data from PTY process
   */
  export interface IPtyExitEvent {
    exitCode: number;
    signal?: number;
  }

  /**
   * PTY spawn options
   */
  export interface IPtySpawnOptions {
    /** Terminal name (e.g., 'xterm-256color') */
    name?: string;
    /** Number of columns */
    cols?: number;
    /** Number of rows */
    rows?: number;
    /** Current working directory */
    cwd?: string;
    /** Environment variables */
    env?: Record<string, string | undefined>;
    /** Encoding (default: 'utf8') */
    encoding?: string;
    /** Handle flow control (default: false) */
    handleFlowControl?: boolean;
    /** Use ConPTY on Windows (default: true on Windows) */
    useConpty?: boolean;
    /** ConPTY inherit cursor (Windows only) */
    conptyInheritCursor?: boolean;
  }

  /**
   * Pseudo-terminal instance interface
   */
  export interface IPty {
    /** Process ID of the spawned shell */
    readonly pid: number;
    /** Number of columns */
    readonly cols: number;
    /** Number of rows */
    readonly rows: number;
    /** The underlying process handle (platform-specific) */
    readonly process: string;
    /** Whether to handle flow control characters */
    handleFlowControl: boolean;

    /**
     * Register a callback for data events
     * @param callback Function called when data is received from the PTY
     * @returns Disposable to unregister the callback
     */
    onData(callback: (data: string) => void): IDisposable;

    /**
     * Register a callback for exit events
     * @param callback Function called when the PTY process exits
     * @returns Disposable to unregister the callback
     */
    onExit(callback: (event: IPtyExitEvent) => void): IDisposable;

    /**
     * Write data to the PTY
     * @param data String data to write
     */
    write(data: string): void;

    /**
     * Resize the PTY
     * @param cols New number of columns
     * @param rows New number of rows
     */
    resize(cols: number, rows: number): void;

    /**
     * Clear the PTY's internal representation of the screen
     */
    clear(): void;

    /**
     * Kill the PTY process
     * @param signal Optional signal to send (default: SIGHUP)
     */
    kill(signal?: string): void;

    /**
     * Pause the PTY (stop emitting data events)
     */
    pause(): void;

    /**
     * Resume the PTY (start emitting data events again)
     */
    resume(): void;
  }

  /**
   * Spawn a new PTY process
   * @param file The executable to spawn
   * @param args Arguments for the executable
   * @param options Spawn options
   * @returns A new IPty instance
   */
  export function spawn(
    file: string,
    args: string[],
    options: IPtySpawnOptions
  ): IPty;
}
