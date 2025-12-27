/**
 * Scroll Controller
 *
 * Prevents automatic scroll-to-bottom during high-velocity terminal output
 * when the user has manually scrolled up.
 *
 * Uses public xterm APIs for compatibility with xterm 6.0.0+.
 * Falls back gracefully if scroll control is not available.
 */

import type { Terminal, IDisposable } from '@xterm/xterm';

export class ScrollController {
  private userScrolledUp = false;
  private xterm: Terminal | null = null;
  private scrollDisposable: IDisposable | null = null;
  private writeDisposable: IDisposable | null = null;
  private savedScrollPosition: number | null = null;

  /**
   * Attach to an xterm instance
   */
  attach(xterm: Terminal): void {
    this.xterm = xterm;

    // Track user scroll position using public API
    this.scrollDisposable = xterm.onScroll(() => {
      const buffer = xterm.buffer.active;
      // Check if user is at the bottom of the scrollback
      const atBottom = buffer.baseY + xterm.rows >= buffer.length - 1;
      this.userScrolledUp = !atBottom;

      // If user scrolled up, save position to restore after writes
      if (this.userScrolledUp) {
        this.savedScrollPosition = buffer.viewportY;
      }
    });

    // Intercept writes to prevent auto-scroll when user has scrolled up
    // This uses xterm's public onWriteParsed event (available in xterm 6.0.0+)
    try {
      // onWriteParsed fires after data is written and parsed
      this.writeDisposable = xterm.onWriteParsed(() => {
        if (this.userScrolledUp && this.savedScrollPosition !== null) {
          // Restore scroll position after write auto-scrolls
          // Use requestAnimationFrame to ensure it runs after xterm's internal scroll
          requestAnimationFrame(() => {
            if (this.xterm && this.savedScrollPosition !== null) {
              // Calculate scroll delta to restore position
              const buffer = this.xterm.buffer.active;
              const targetY = Math.min(this.savedScrollPosition, buffer.length - this.xterm.rows);
              const delta = targetY - buffer.viewportY;
              if (delta !== 0) {
                this.xterm.scrollLines(delta);
              }
            }
          });
        }
      });
    } catch {
      // onWriteParsed may not be available in older versions
      // Fall back to a simpler approach using scroll event only
      console.warn('[ScrollController] onWriteParsed not available, scroll locking limited');
    }

    console.warn('[ScrollController] Attached using public APIs');
  }

  /**
   * Detach from xterm and cleanup
   */
  detach(): void {
    this.scrollDisposable?.dispose();
    this.writeDisposable?.dispose();

    this.xterm = null;
    this.scrollDisposable = null;
    this.writeDisposable = null;
    this.userScrolledUp = false;
    this.savedScrollPosition = null;

    console.warn('[ScrollController] Detached');
  }

  /**
   * Force scroll to bottom (e.g., user clicks "scroll to bottom" button)
   */
  forceScrollToBottom(): void {
    this.userScrolledUp = false;
    this.savedScrollPosition = null;

    if (this.xterm) {
      const buffer = this.xterm.buffer.active;
      // Scroll to the very bottom
      const scrollAmount = buffer.length - buffer.viewportY - this.xterm.rows;
      if (scrollAmount > 0) {
        this.xterm.scrollLines(scrollAmount);
      }
    }
  }

  /**
   * Check if user has scrolled up (for UI indicators)
   */
  isScrolledUp(): boolean {
    return this.userScrolledUp;
  }

  /**
   * Manually reset scroll state (e.g., after clearing terminal)
   */
  reset(): void {
    this.userScrolledUp = false;
    this.savedScrollPosition = null;
  }

  /**
   * Get current scroll position info for debugging
   */
  getScrollInfo(): {
    userScrolledUp: boolean;
    baseY?: number;
    rows?: number;
    bufferLength?: number;
  } | null {
    if (!this.xterm) return null;

    const buffer = this.xterm.buffer.active;
    return {
      userScrolledUp: this.userScrolledUp,
      baseY: buffer.baseY,
      rows: this.xterm.rows,
      bufferLength: buffer.length,
    };
  }
}
