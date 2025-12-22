/**
 * Scroll Controller
 *
 * Prevents automatic scroll-to-bottom during high-velocity terminal output
 * when the user has manually scrolled up.
 *
 * Inspired by Tabby's scroll interception pattern - production-proven approach
 * that intercepts xterm's native scrollToBottom method.
 */

import type { Terminal } from '@xterm/xterm';

export class ScrollController {
  private userScrolledUp = false;
  private originalScrollToBottom: (() => void) | null = null;
  private xterm: Terminal | null = null;
  private scrollListener: (() => void) | null = null;

  /**
   * Attach to an xterm instance
   */
  attach(xterm: Terminal): void {
    this.xterm = xterm;

    // Access internal core (Tabby does this too - it's safe)
    const core = (xterm as unknown as { _core: { scrollToBottom: () => void } })._core;
    if (!core) {
      console.warn('[ScrollController] Cannot access xterm core - scroll locking disabled');
      return;
    }

    // Store original scrollToBottom method
    this.originalScrollToBottom = core.scrollToBottom.bind(core);

    // Intercept scrollToBottom - block when user has scrolled up
    core.scrollToBottom = () => {
      if (this.userScrolledUp) {
        // No-op when user has scrolled up - this is the key fix!
        return;
      }
      this.originalScrollToBottom?.();
    };

    // Track user scroll position
    this.scrollListener = () => {
      const buffer = xterm.buffer.active;
      const atBottom = buffer.baseY + xterm.rows >= buffer.length - 1;
      this.userScrolledUp = !atBottom;
    };

    xterm.onScroll(this.scrollListener);

    console.warn('[ScrollController] Attached and intercepted scrollToBottom');
  }

  /**
   * Detach from xterm and restore original behavior
   */
  detach(): void {
    if (this.xterm && this.originalScrollToBottom) {
      const core = (this.xterm as unknown as { _core: { scrollToBottom: () => void } })._core;
      if (core && this.originalScrollToBottom) {
        core.scrollToBottom = this.originalScrollToBottom;
      }
    }

    this.xterm = null;
    this.originalScrollToBottom = null;
    this.scrollListener = null;
    this.userScrolledUp = false;

    console.warn('[ScrollController] Detached');
  }

  /**
   * Force scroll to bottom (e.g., user clicks "scroll to bottom" button)
   */
  forceScrollToBottom(): void {
    this.userScrolledUp = false;
    this.originalScrollToBottom?.();
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
