/**
 * Error message extraction utilities for agent processes.
 *
 * Provides shared logic for extracting meaningful error messages from
 * stderr output, used by both agent-process.ts and agent-queue.ts.
 */

/**
 * Extract meaningful error message from process stderr output.
 *
 * Searches for common error patterns (error, exception, failed, etc.)
 * and returns the most relevant lines. Falls back to the last few lines
 * of stderr if no patterns match.
 *
 * @param stderrOutput - Collected stderr output from the process
 * @param exitCode - Process exit code
 * @returns Formatted error message (max 500 chars)
 */
export function extractErrorMessage(
  stderrOutput: string,
  exitCode: number | null
): string {
  let errorMessage = `Process exited with code ${exitCode}`;

  if (stderrOutput.trim()) {
    const stderrLines = stderrOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    // Look for error-like patterns
    const errorPatterns = [
      /error[:\s]/i,
      /exception/i,
      /failed/i,
      /invalid/i,
      /unauthorized/i,
      /forbidden/i,
      /timeout/i,
      /traceback/i,
    ];
    const errorLines = stderrLines.filter((line) =>
      errorPatterns.some((pattern) => pattern.test(line))
    );
    // Use error lines if found, otherwise last few lines
    const relevantLines =
      errorLines.length > 0 ? errorLines.slice(-3) : stderrLines.slice(-3);
    if (relevantLines.length > 0) {
      const summary = relevantLines.join('\n').trim();
      errorMessage =
        summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
    }
  }

  return errorMessage;
}
