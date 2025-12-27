/**
 * Flow Controller
 *
 * Implements high/low watermark flow control to prevent terminal overwhelm
 * during high-velocity streaming (e.g., Claude Code output).
 *
 * Inspired by:
 * - Tabby's 128KB threshold approach
 * - xterm.js official flow control recommendations (< 500KB for responsiveness)
 * - Production-proven backpressure handling
 */

import type { Terminal } from '@xterm/xterm';

export class FlowController {
  // Thresholds based on xterm.js recommendations and Tabby's implementation
  private static readonly BYTE_THRESHOLD = 100_000; // 100KB - trigger callback tracking
  private static readonly HIGH_WATERMARK = 5; // Pause at 5 pending callbacks
  private static readonly LOW_WATERMARK = 2; // Resume at 2 pending callbacks

  private pendingCallbacks = 0;
  private bytesWritten = 0;
  private blocked = false;
  private resolveBlock: (() => void) | null = null;

  // Statistics for debugging/monitoring
  private stats = {
    totalWrites: 0,
    totalBytes: 0,
    blockedCount: 0,
    maxPendingCallbacks: 0,
  };

  /**
   * Write data to terminal with backpressure handling
   *
   * For small chunks (< 100KB accumulated): fast path, no callback overhead
   * For large chunks: use callbacks to track completion and apply backpressure
   */
  async write(terminal: Terminal, data: string): Promise<void> {
    // Wait if we're blocked (too many pending writes)
    if (this.blocked) {
      await new Promise<void>((resolve) => {
        this.resolveBlock = resolve;
      });
    }

    this.bytesWritten += data.length;
    this.stats.totalWrites++;
    this.stats.totalBytes += data.length;

    // Use callbacks for large accumulated chunks to track completion
    if (this.bytesWritten >= FlowController.BYTE_THRESHOLD) {
      terminal.write(data, () => {
        // Callback fires when xterm finishes processing this chunk
        this.pendingCallbacks = Math.max(0, this.pendingCallbacks - 1);

        // Unblock if we've drained below low watermark
        if (this.pendingCallbacks < FlowController.LOW_WATERMARK && this.blocked) {
          this.blocked = false;
          this.resolveBlock?.();
          this.resolveBlock = null;
        }
      });

      this.pendingCallbacks++;
      this.stats.maxPendingCallbacks = Math.max(
        this.stats.maxPendingCallbacks,
        this.pendingCallbacks
      );
      this.bytesWritten = 0;

      // Block if we've exceeded high watermark
      if (this.pendingCallbacks > FlowController.HIGH_WATERMARK) {
        if (!this.blocked) {
          this.blocked = true;
          this.stats.blockedCount++;
        }
      }
    } else {
      // Fast path - no callback overhead for small chunks
      terminal.write(data);
    }
  }

  /**
   * Check if currently blocked (for debugging/metrics)
   */
  isBlocked(): boolean {
    return this.blocked;
  }

  /**
   * Get pending callbacks count
   */
  getPendingCallbacks(): number {
    return this.pendingCallbacks;
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalWrites: number;
    totalBytes: number;
    blockedCount: number;
    maxPendingCallbacks: number;
    currentPending: number;
    isBlocked: boolean;
  } {
    return {
      ...this.stats,
      currentPending: this.pendingCallbacks,
      isBlocked: this.blocked,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalWrites: 0,
      totalBytes: 0,
      blockedCount: 0,
      maxPendingCallbacks: 0,
    };
  }

  /**
   * Force unblock (emergency recovery)
   */
  forceUnblock(): void {
    if (this.blocked) {
      console.warn('[FlowController] Force unblock - resetting state');
      this.blocked = false;
      this.pendingCallbacks = 0;
      this.bytesWritten = 0;
      this.resolveBlock?.();
      this.resolveBlock = null;
    }
  }
}
