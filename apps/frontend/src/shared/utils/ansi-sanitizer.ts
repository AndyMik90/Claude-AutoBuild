/**
 * ANSI escape code sanitization utility.
 *
 * Removes ANSI escape sequences from strings for clean UI display.
 * These sequences are used for terminal coloring/formatting but appear
 * as raw text in UI components.
 *
 * Example:
 * - Input:  "\x1b[90m[21:40:22.196]\x1b[0m \x1b[36m[DEBUG]\x1b[0m Sending query"
 * - Output: "[21:40:22.196] [DEBUG] Sending query"
 */

/**
 * ANSI CSI (Control Sequence Introducer) escape sequence pattern.
 * Matches:
 * - \x1b[ or \e[ or \033[ - Escape sequence start
 * - [0-9;]* - Parameter bytes (numbers and semicolons)
 * - [A-Za-z] - Final byte (command)
 * - m - Specifically for SGR (Select Graphic Rendition) color codes
 */
// eslint-disable-next-line no-control-regex
const ANSI_CSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * OSC (Operating System Command) escape sequences.
 * Two patterns are needed because OSC uses different terminators:
 * - BEL (bell): \x1b]...\x07 - Single character terminator
 * - ST (string terminator): \x1b]...\x1b\\ - Two character terminator (ESC + backslash)
 */
// eslint-disable-next-line no-control-regex
const ANSI_OSC_BEL_PATTERN = /\x1b\][^\x07]*\x07/g;
// eslint-disable-next-line no-control-regex
const ANSI_OSC_ST_PATTERN = /\x1b\][^\x1b]*\x1b\\/g;

/**
 * Removes ANSI escape codes from a string.
 *
 * @param text - The string potentially containing ANSI escape codes
 * @returns The string with all ANSI escape sequences removed
 *
 * @example
 * ```ts
 * stripAnsiCodes('\x1b[90m[21:40:22.196]\x1b[0m \x1b[36m[DEBUG]\x1b[0m')
 * // Returns: '[21:40:22.196] [DEBUG]'
 * ```
 */
export function stripAnsiCodes(text: string): string {
  if (!text) return '';

  return text
    .replace(ANSI_CSI_PATTERN, '')
    .replace(ANSI_OSC_BEL_PATTERN, '')
    .replace(ANSI_OSC_ST_PATTERN, '');
}
