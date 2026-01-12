import { useState, useRef, useEffect } from 'react';
import { useDndMonitor, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { useProjectStore } from '../stores/project-store';

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

  // Get open tabs count from store
  const openProjectIds = useProjectStore(state => state.openProjectIds);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const accumulatedDistance = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeProjectId = useRef<string | null>(null);
  const DETACH_THRESHOLD = 100; // pixels downward

  useEffect(() => {
    console.log('[useCrossWindowDrag] Hook initialized for window type:', windowType);
  }, [windowType]);

  useDndMonitor({
    onDragStart(event) {
      // Only track pointer events (mouse/touch)
      if (!event.activatorEvent || !('clientX' in event.activatorEvent)) {
        console.log('[useCrossWindowDrag] Drag start skipped - no pointer event');
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

      // Reset accumulated distance
      accumulatedDistance.current = { x: 0, y: 0 };

      console.log('[useCrossWindowDrag] Drag started', {
        windowType,
        projectId: activeProjectId.current,
        startPos: dragStartPos.current,
        activeId: event.active.id
      });

      setDragState({
        isDetachThresholdCrossed: false,
        isOverMainWindow: false,
        dragDistance: { x: 0, y: 0 }
      });
    },

    onDragMove(event: DragMoveEvent) {
      if (!dragStartPos.current) {
        return;
      }

      // Accumulate delta from @dnd-kit to track total movement
      accumulatedDistance.current.x += event.delta.x;
      accumulatedDistance.current.y += event.delta.y;

      const distance = {
        x: accumulatedDistance.current.x,
        y: accumulatedDistance.current.y
      };

      // Check if dragged down past threshold (main window only)
      const thresholdCrossed = windowType === 'main' && distance.y > DETACH_THRESHOLD;

      // Log drag movement every 20px or when threshold is crossed
      if (windowType === 'main' && (Math.abs(distance.y) % 20 < 5 || thresholdCrossed)) {
        console.log('[useCrossWindowDrag] Dragging:', {
          windowType,
          delta: event.delta,
          accumulated: distance,
          threshold: DETACH_THRESHOLD,
          thresholdCrossed
        });
      }

      // Check if dragging over main window (project window only)
      let overMainWindow = false;
      if (windowType === 'project' && event.activatorEvent && 'screenX' in event.activatorEvent) {
        // Use IPC to get main window bounds and check if cursor is over it
        const activatorEvent = event.activatorEvent as PointerEvent;
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

      console.log('[useCrossWindowDrag] Drag ended', {
        windowType,
        projectId,
        dragState,
        accumulatedDistance: accumulatedDistance.current,
        hasActivatorEvent: !!event.activatorEvent
      });

      if (!projectId || !event.activatorEvent || !('clientX' in event.activatorEvent)) {
        console.log('[useCrossWindowDrag] Drag end skipped - missing projectId or activatorEvent');
        resetDragState();
        return;
      }

      const activatorEvent = event.activatorEvent as PointerEvent;

      // Main window: detach if threshold crossed AND not the last tab
      if (windowType === 'main' && dragState.isDetachThresholdCrossed) {
        // Get the current open tabs count from store
        const tabCount = openProjectIds.length;

        console.log('[useCrossWindowDrag] Detach attempt', {
          projectId,
          tabCount,
          openProjectIds,
          thresholdCrossed: dragState.isDetachThresholdCrossed
        });

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

        console.log('[useCrossWindowDrag] Detaching project to new window', { projectId, position });
        onDetach(projectId, position);
      }

      // Project window: reattach if over main window
      if (windowType === 'project' && dragState.isOverMainWindow) {
        console.log('[useCrossWindowDrag] Reattaching project to main window', { projectId });
        onReattach(projectId);
      }

      resetDragState();
    },

    onDragCancel() {
      console.log('[useCrossWindowDrag] Drag cancelled');
      resetDragState();
    }
  });

  function resetDragState() {
    dragStartPos.current = null;
    activeProjectId.current = null;
    accumulatedDistance.current = { x: 0, y: 0 };
    setDragState({
      isDetachThresholdCrossed: false,
      isOverMainWindow: false,
      dragDistance: { x: 0, y: 0 }
    });
  }

  return dragState;
}
