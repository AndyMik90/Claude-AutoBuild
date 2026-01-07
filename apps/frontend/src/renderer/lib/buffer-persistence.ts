/**
 * Terminal Buffer Persistence (Renderer)
 *
 * Uses xterm's SerializeAddon to periodically save terminal buffers
 * to disk via IPC. This provides fallback recovery when the PTY daemon
 * is not available.
 */

import { SerializeAddon } from '@xterm/addon-serialize';
import type { Terminal } from '@xterm/xterm';

// Save interval: 30 seconds during active use
const SAVE_INTERVAL_MS = 30_000;

// Save threshold: when buffer grows by 50KB
const SAVE_THRESHOLD_BYTES = 50_000;

interface ManagedTerminal {
  terminalId: string;
  xterm: Terminal;
  serializeAddon: SerializeAddon;
  saveInterval: NodeJS.Timeout;
  lastSavedSize: number;
}

class BufferPersistence {
  private terminals = new Map<string, ManagedTerminal>();
  private isSaving = new Map<string, boolean>();

  /**
   * Register a terminal for buffer persistence
   */
  register(terminalId: string, xterm: Terminal): SerializeAddon {
    // Clean up if already registered
    if (this.terminals.has(terminalId)) {
      this.unregister(terminalId);
    }

    // Create and load serialize addon
    const serializeAddon = new SerializeAddon();
    xterm.loadAddon(serializeAddon);

    // Start periodic saves
    const saveInterval = setInterval(() => {
      this.saveBuffer(terminalId).catch((error) => {
        console.warn(`[BufferPersistence] Auto-save failed for ${terminalId}:`, error);
      });
    }, SAVE_INTERVAL_MS);

    // Store managed terminal
    const managed: ManagedTerminal = {
      terminalId,
      xterm,
      serializeAddon,
      saveInterval,
      lastSavedSize: 0,
    };

    this.terminals.set(terminalId, managed);

    console.warn(`[BufferPersistence] Registered terminal ${terminalId}`);

    return serializeAddon;
  }

  /**
   * Unregister a terminal and cleanup
   */
  unregister(terminalId: string): void {
    const managed = this.terminals.get(terminalId);
    if (!managed) return;

    // Stop interval
    clearInterval(managed.saveInterval);

    // Remove from map
    this.terminals.delete(terminalId);
    this.isSaving.delete(terminalId);

    console.warn(`[BufferPersistence] Unregistered terminal ${terminalId}`);
  }

  /**
   * Save buffer if changed significantly
   */
  async saveBuffer(terminalId: string): Promise<void> {
    const managed = this.terminals.get(terminalId);
    if (!managed) {
      console.warn(`[BufferPersistence] Terminal ${terminalId} not registered`);
      return;
    }

    // Skip if already saving
    if (this.isSaving.get(terminalId)) {
      return;
    }

    try {
      this.isSaving.set(terminalId, true);

      // Serialize the buffer
      const serialized = managed.serializeAddon.serialize();
      const currentSize = serialized.length;
      const lastSize = managed.lastSavedSize;

      // Only save if buffer grew significantly or was cleared
      const shouldSave =
        currentSize - lastSize > SAVE_THRESHOLD_BYTES || // Grew significantly
        currentSize < lastSize; // Buffer was cleared

      if (!shouldSave) {
        return;
      }

      // Save via IPC
      await window.electronAPI.saveTerminalBuffer(terminalId, serialized);

      // Update last saved size
      managed.lastSavedSize = currentSize;

      console.warn(
        `[BufferPersistence] Saved buffer for ${terminalId} (${currentSize} bytes)`
      );
    } catch (error) {
      console.error(`[BufferPersistence] Failed to save ${terminalId}:`, error);
      throw error;
    } finally {
      this.isSaving.set(terminalId, false);
    }
  }

  /**
   * Force immediate save (call before close)
   */
  async saveNow(terminalId: string): Promise<void> {
    const managed = this.terminals.get(terminalId);
    if (!managed) return;

    try {
      const serialized = managed.serializeAddon.serialize();
      await window.electronAPI.saveTerminalBuffer(terminalId, serialized);
      managed.lastSavedSize = serialized.length;
      console.warn(`[BufferPersistence] Immediate save for ${terminalId} complete`);
    } catch (error) {
      console.error(`[BufferPersistence] Failed to immediately save ${terminalId}:`, error);
      throw error;
    }
  }

  /**
   * Save all registered terminals
   */
  async saveAll(): Promise<void> {
    console.warn(`[BufferPersistence] Saving all buffers (${this.terminals.size} terminals)`);

    const saves = Array.from(this.terminals.keys()).map((id) =>
      this.saveNow(id).catch((error) => {
        console.error(`[BufferPersistence] Failed to save ${id}:`, error);
      })
    );

    await Promise.all(saves);
    console.warn('[BufferPersistence] All buffers saved');
  }

  /**
   * Get current buffer size for a terminal
   */
  getBufferSize(terminalId: string): number | null {
    const managed = this.terminals.get(terminalId);
    if (!managed) return null;

    try {
      const serialized = managed.serializeAddon.serialize();
      return serialized.length;
    } catch {
      return null;
    }
  }

  /**
   * Check if a terminal is registered
   */
  isRegistered(terminalId: string): boolean {
    return this.terminals.has(terminalId);
  }

  /**
   * Get all registered terminal IDs
   */
  getRegisteredTerminals(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Cleanup all terminals
   */
  cleanup(): void {
    console.warn('[BufferPersistence] Cleaning up all terminals');
    Array.from(this.terminals.keys()).forEach((id) => this.unregister(id));
  }
}

// Singleton instance
export const bufferPersistence = new BufferPersistence();

// Save all buffers before page unload
window.addEventListener('beforeunload', () => {
  console.warn('[BufferPersistence] Page unloading, saving all buffers...');
  // Use synchronous save via IPC if available, otherwise fire and forget
  bufferPersistence.saveAll().catch((error) => {
    console.error('[BufferPersistence] Failed to save all buffers on unload:', error);
  });
});

// Cleanup on page hide (browser background/minimize)
window.addEventListener('pagehide', () => {
  bufferPersistence.saveAll().catch(console.error);
});
