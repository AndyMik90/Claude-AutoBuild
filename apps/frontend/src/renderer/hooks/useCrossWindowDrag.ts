import { useState, useRef } from 'react';
import { useDndMonitor, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';

/**
 * State for cross-window drag detection
 */
interface CrossWindowDragState {
  isDetachThresholdCrossed: boolean;
  isOverMainWindow: boolean;
  dragDistance: { x: number; y: number };
}

/**
 * Hook for detecting cross-window drag operations
 * - Detects when tabs are dragged down to create new windows
 * - Detects when tabs are dragged from project windows back to main
 *
 * @param onDetach - Callback when detach threshold is crossed
 * @param onReattach - Callback when dragging over main window
 * @param windowType - Current window type
 * @returns Current drag state
 */
export function useCrossWindowDrag(
  onDetach: (projectId: string, position: { x: number; y: number }) => void,
  onReattach: (projectId: string) => void,
  windowType: 'main' | 'project'
): CrossWindowDragState {
  const [dragState, setDragState] = useState<CrossWindowDragState>({
    isDetachThresholdCrossed: false,
    isOverMainWindow: false,
    dragDistance: { x: 0, y: 0 }
  });

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const activeProjectId = useRef<string | null>(null);
  const DETACH_THRESHOLD = 100; // pixels downward

  useDndMonitor({
    onDragStart(event) {
      // Only track pointer events (mouse/touch)
      if (!event.activatorEvent || !('clientX' in event.activatorEvent)) {
        return;
      }

      // Store start position
      const activatorEvent = event.activatorEvent as PointerEvent;
      dragStartPos.current = {
        x: activatorEvent.clientX,
        y: activatorEvent.clientY
      };

      // Extract project ID from active item
      if (event.active.id) {
        activeProjectId.current = event.active.id as string;
      }

      setDragState({
        isDetachThresholdCrossed: false,
        isOverMainWindow: false,
        dragDistance: { x: 0, y: 0 }
      });
    },

    onDragMove(event: DragMoveEvent) {
      if (!dragStartPos.current || !event.activatorEvent || !('clientX' in event.activatorEvent)) {
        return;
      }

      const activatorEvent = event.activatorEvent as PointerEvent;
      const currentPos = {
        x: activatorEvent.clientX,
        y: activatorEvent.clientY
      };

      const distance = {
        x: currentPos.x - dragStartPos.current.x,
        y: currentPos.y - dragStartPos.current.y
      };

      // Check if dragged down past threshold (main window only)
      const thresholdCrossed = windowType === 'main' && distance.y > DETACH_THRESHOLD;

      // Check if dragging over main window (project window only)
      let overMainWindow = false;
      if (windowType === 'project' && 'screenX' in activatorEvent) {
        // Use IPC to get main window bounds and check if cursor is over it
        window.electronAPI.window.getMainBounds().then(bounds => {
          if (bounds) {
            const screenPos = {
              x: activatorEvent.screenX,
              y: activatorEvent.screenY
            };
            overMainWindow =
              screenPos.x >= bounds.x &&
              screenPos.x <= bounds.x + bounds.width &&
              screenPos.y >= bounds.y &&
              screenPos.y <= bounds.y + bounds.height;

            setDragState({
              isDetachThresholdCrossed: thresholdCrossed,
              isOverMainWindow: overMainWindow,
              dragDistance: distance
            });
          }
        }).catch(err => {
          console.error('[useCrossWindowDrag] Failed to get main bounds:', err);
        });
      } else {
        setDragState({
          isDetachThresholdCrossed: thresholdCrossed,
          isOverMainWindow: false,
          dragDistance: distance
        });
      }
    },

    onDragEnd(event: DragEndEvent) {
      const projectId = activeProjectId.current;
      if (!projectId || !event.activatorEvent || !('clientX' in event.activatorEvent)) {
        resetDragState();
        return;
      }

      const activatorEvent = event.activatorEvent as PointerEvent;

      // Main window: detach if threshold crossed AND not the last tab
      if (windowType === 'main' && dragState.isDetachThresholdCrossed) {
        // Get the current open tabs count from the window
        const tabsContainer = document.querySelector('[role="tablist"]');
        const tabCount = tabsContainer?.querySelectorAll('[role="tab"]').length || 0;

        if (tabCount <= 1) {
          console.warn('[useCrossWindowDrag] Cannot detach the last project tab');
          resetDragState();
          return;
        }

        // Calculate position for new window
        const position = 'screenX' in activatorEvent && 'screenY' in activatorEvent
          ? {
              x: (activatorEvent as any).screenX - 600, // Center window under cursor
              y: (activatorEvent as any).screenY - 50
            }
          : { x: 100, y: 100 };

        onDetach(projectId, position);
      }

      // Project window: reattach if over main window
      if (windowType === 'project' && dragState.isOverMainWindow) {
        onReattach(projectId);
      }

      resetDragState();
    },

    onDragCancel() {
      resetDragState();
    }
  });

  function resetDragState() {
    dragStartPos.current = null;
    activeProjectId.current = null;
    setDragState({
      isDetachThresholdCrossed: false,
      isOverMainWindow: false,
      dragDistance: { x: 0, y: 0 }
    });
  }

  return dragState;
}
