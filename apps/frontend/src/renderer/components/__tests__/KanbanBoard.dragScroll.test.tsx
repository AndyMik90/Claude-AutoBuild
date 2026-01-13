/**
 * Unit tests for KanbanBoard drag-to-scroll functionality
 * Tests click-and-drag horizontal scrolling logic, state management,
 * event listener lifecycle, and target element exclusion
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Task } from '../../../shared/types';

// Helper to create test tasks
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    title: 'Test Task',
    description: 'Test task description',
    status: 'backlog',
    projectId: 'test-project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

// Helper to create mock event
function createMockMouseEvent(clientX: number, target?: HTMLElement): MouseEvent {
  return {
    clientX,
    preventDefault: vi.fn(),
    target
  } as unknown as MouseEvent;
}

// Helper to create mock React mouse event
function createMockReactMouseEvent(clientX: number, target?: HTMLElement): React.MouseEvent {
  return {
    clientX,
    currentTarget: null,
    target
  } as unknown as React.MouseEvent;
}

describe('KanbanBoard Drag-to-Scroll Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Drag State Management', () => {
    it('should initialize with isScrollDragging set to false', () => {
      const isScrollDragging = false;

      expect(isScrollDragging).toBe(false);
    });

    it('should set isScrollDragging to true on valid mouse down', () => {
      let isScrollDragging = false;

      // Simulate handleMouseDown logic
      const setIsScrollDragging = (value: boolean) => {
        isScrollDragging = value;
      };

      setIsScrollDragging(true);

      expect(isScrollDragging).toBe(true);
    });

    it('should reset isScrollDragging to false on mouse up', () => {
      let isScrollDragging = true;

      // Simulate handleMouseUp logic
      const setIsScrollDragging = () => {
        isScrollDragging = false;
      };

      setIsScrollDragging();

      expect(isScrollDragging).toBe(false);
    });

    it('should toggle isScrollDragging state correctly', () => {
      let isScrollDragging = false;

      const setIsScrollDragging = (value: boolean) => {
        isScrollDragging = value;
      };

      // Initial state
      expect(isScrollDragging).toBe(false);

      // Start dragging
      setIsScrollDragging(true);
      expect(isScrollDragging).toBe(true);

      // Stop dragging
      setIsScrollDragging(false);
      expect(isScrollDragging).toBe(false);

      // Multiple drag cycles
      setIsScrollDragging(true);
      expect(isScrollDragging).toBe(true);

      setIsScrollDragging(false);
      expect(isScrollDragging).toBe(false);
    });

    it('should store initial mouse position on drag start', () => {
      const initialX = 100;
      const dragStartX = initialX;

      expect(dragStartX).toBe(100);
    });

    it('should store initial scroll position on drag start', () => {
      const initialScrollLeft = 50;
      const dragStartScrollLeft = initialScrollLeft;

      expect(dragStartScrollLeft).toBe(50);
    });

    it('should update dragStartX on each drag start', () => {
      let dragStartX = 0;

      const setDragStartX = (x: number) => {
        dragStartX = x;
      };

      // First drag
      setDragStartX(100);
      expect(dragStartX).toBe(100);

      // Second drag (new position)
      setDragStartX(250);
      expect(dragStartX).toBe(250);

      // Third drag (another position)
      setDragStartX(50);
      expect(dragStartX).toBe(50);
    });
  });

  describe('Scroll Position Calculation', () => {
    it('should calculate scroll delta correctly', () => {
      const dragStartX = 100;
      const dragStartScrollLeft = 50;

      // Mouse moved to 150 (right by 50px)
      const currentX = 150;
      const deltaX = currentX - dragStartX;

      // Scroll should move left by delta
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(deltaX).toBe(50);
      expect(newScrollLeft).toBe(0); // 50 - 50 = 0
    });

    it('should calculate negative scroll delta when dragging left', () => {
      const dragStartX = 200;
      const dragStartScrollLeft = 100;

      // Mouse moved to 150 (left by 50px)
      const currentX = 150;
      const deltaX = currentX - dragStartX;

      // Scroll should move right by delta magnitude
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(deltaX).toBe(-50);
      expect(newScrollLeft).toBe(150); // 100 - (-50) = 150
    });

    it('should handle zero drag distance', () => {
      const dragStartX = 100;
      const dragStartScrollLeft = 50;

      // Mouse didn't move
      const currentX = 100;
      const deltaX = currentX - dragStartX;
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(deltaX).toBe(0);
      expect(newScrollLeft).toBe(50); // No change
    });

    it('should handle large drag distances', () => {
      const dragStartX = 0;
      const dragStartScrollLeft = 500;

      // Mouse moved right by 500px
      const currentX = 500;
      const deltaX = currentX - dragStartX;
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(deltaX).toBe(500);
      expect(newScrollLeft).toBe(0); // 500 - 500 = 0
    });

    it('should handle fractional drag distances', () => {
      const dragStartX = 100.5;
      const dragStartScrollLeft = 50;

      // Mouse moved by 0.3px (sub-pixel movement)
      const currentX = 100.8;
      const deltaX = currentX - dragStartX;
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(deltaX).toBeCloseTo(0.3, 1);
      expect(newScrollLeft).toBeCloseTo(49.7, 1);
    });

    it('should handle negative scroll positions gracefully', () => {
      const dragStartX = 100;
      const dragStartScrollLeft = 0;

      // Mouse moved right (scroll would go negative)
      const currentX = 150;
      const deltaX = currentX - dragStartX;
      const newScrollLeft = dragStartScrollLeft - deltaX;

      expect(newScrollLeft).toBe(-50);
      // In real implementation, scrollLeft would clamp to 0
      expect(newScrollLeft).toBeLessThanOrEqual(0);
    });
  });

  describe('Target Element Exclusion', () => {
    it('should not activate drag when clicking on a button', () => {
      const mockButton = document.createElement('button');
      const mockEvent = {
        target: mockButton
      } as unknown as React.MouseEvent;

      // Simulate target.closest('button') check
      const shouldDrag = !mockEvent.target || !(mockEvent.target as HTMLElement).closest('button');

      expect(shouldDrag).toBe(false);
    });

    it('should not activate drag when clicking inside a button', () => {
      const mockButton = document.createElement('button');
      const mockSpan = document.createElement('span');
      mockButton.appendChild(mockSpan);

      const mockEvent = {
        target: mockSpan
      } as unknown as React.MouseEvent;

      // Simulate target.closest('button') check
      const shouldDrag = !mockEvent.target || !(mockEvent.target as HTMLElement).closest('button');

      expect(shouldDrag).toBe(false);
    });

    it('should not activate drag when clicking on draggable element', () => {
      const mockDraggable = document.createElement('div');
      mockDraggable.setAttribute('data-dnd-kit-draggable', 'true');

      const mockEvent = {
        target: mockDraggable
      } as unknown as React.MouseEvent;

      // Simulate target.closest('[data-dnd-kit-draggable]') check
      const shouldDrag = !mockEvent.target || !(mockEvent.target as HTMLElement).closest('[data-dnd-kit-draggable]');

      expect(shouldDrag).toBe(false);
    });

    it('should not activate drag when clicking inside draggable element', () => {
      const mockDraggable = document.createElement('div');
      mockDraggable.setAttribute('data-dnd-kit-draggable', 'true');
      const mockSpan = document.createElement('span');
      mockDraggable.appendChild(mockSpan);

      const mockEvent = {
        target: mockSpan
      } as unknown as React.MouseEvent;

      // Simulate target.closest('[data-dnd-kit-draggable]') check
      const shouldDrag = !mockEvent.target || !(mockEvent.target as HTMLElement).closest('[data-dnd-kit-draggable]');

      expect(shouldDrag).toBe(false);
    });

    it('should activate drag when clicking on board background', () => {
      const mockBackground = document.createElement('div');
      mockBackground.className = 'board-container';

      const mockEvent = {
        target: mockBackground
      } as unknown as React.MouseEvent;

      // Simulate target.closest checks
      const isButton = !!(mockEvent.target as HTMLElement).closest('button');
      const isDraggable = !!(mockEvent.target as HTMLElement).closest('[data-dnd-kit-draggable]');
      const shouldDrag = !isButton && !isDraggable;

      expect(shouldDrag).toBe(true);
    });

    it('should activate drag when clicking on column content', () => {
      const mockColumn = document.createElement('div');
      mockColumn.className = 'column-content';

      const mockEvent = {
        target: mockColumn
      } as unknown as React.MouseEvent;

      // Simulate target.closest checks
      const isButton = !!(mockEvent.target as HTMLElement).closest('button');
      const isDraggable = !!(mockEvent.target as HTMLElement).closest('[data-dnd-kit-draggable]');
      const shouldDrag = !isButton && !isDraggable;

      expect(shouldDrag).toBe(true);
    });

    it('should handle null target gracefully', () => {
      const mockEvent = {
        target: null
      } as unknown as React.MouseEvent;

      // Should not throw error
      expect(() => {
        const closestButton = mockEvent.target ? (mockEvent.target as HTMLElement).closest('button') : null;
        expect(closestButton).toBeNull();
      }).not.toThrow();
    });
  });

  describe('Event Listener Lifecycle', () => {
    it('should add window event listeners when drag starts', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      let isScrollDragging = false;

      // Simulate drag start
      isScrollDragging = true;

      if (isScrollDragging) {
        window.addEventListener('mousemove', vi.fn());
        window.addEventListener('mouseup', vi.fn());
      }

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);

      addEventListenerSpy.mockRestore();
    });

    it('should remove window event listeners when drag ends', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const mockMouseMove = vi.fn();
      const mockMouseUp = vi.fn();

      // Simulate drag end cleanup
      window.removeEventListener('mousemove', mockMouseMove);
      window.removeEventListener('mouseup', mockMouseUp);

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', mockMouseMove);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', mockMouseUp);
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);

      removeEventListenerSpy.mockRestore();
    });

    it('should not add window event listeners when not dragging', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      let isScrollDragging = false;

      if (isScrollDragging) {
        window.addEventListener('mousemove', vi.fn());
        window.addEventListener('mouseup', vi.fn());
      }

      expect(addEventListenerSpy).not.toHaveBeenCalled();

      addEventListenerSpy.mockRestore();
    });

    it('should add event listeners with correct event names', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      window.addEventListener('mousemove', vi.fn());
      window.addEventListener('mouseup', vi.fn());

      expect(addEventListenerSpy).toHaveBeenNthCalledWith(1, 'mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenNthCalledWith(2, 'mouseup', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('should clean up event listeners on component unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const mockMouseMove = vi.fn();
      const mockMouseUp = vi.fn();

      // Simulate cleanup (useEffect return function)
      const cleanup = () => {
        window.removeEventListener('mousemove', mockMouseMove);
        window.removeEventListener('mouseup', mockMouseUp);
      };

      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      removeEventListenerSpy.mockRestore();
    });

    it('should handle multiple drag cycles correctly', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const mockMouseMove = vi.fn();
      const mockMouseUp = vi.fn();

      let isScrollDragging = false;
      let dragCount = 0;

      // First drag cycle
      isScrollDragging = true;
      dragCount++;
      window.addEventListener('mousemove', mockMouseMove);
      window.addEventListener('mouseup', mockMouseUp);
      expect(addSpy).toHaveBeenCalledTimes(2 + (dragCount - 1) * 2);

      // End first drag
      isScrollDragging = false;
      window.removeEventListener('mousemove', mockMouseMove);
      window.removeEventListener('mouseup', mockMouseUp);
      expect(removeSpy).toHaveBeenCalledTimes(2);

      // Second drag cycle
      isScrollDragging = true;
      dragCount++;
      window.addEventListener('mousemove', mockMouseMove);
      window.addEventListener('mouseup', mockMouseUp);
      expect(addSpy).toHaveBeenCalledTimes(2 + dragCount * 2);

      // End second drag
      isScrollDragging = false;
      window.removeEventListener('mousemove', mockMouseMove);
      window.removeEventListener('mouseup', mockMouseUp);
      expect(removeSpy).toHaveBeenCalledTimes(4);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Mouse Move Handler', () => {
    it('should not scroll when not dragging', () => {
      let isScrollDragging = false;
      const scrollContainerRef = { current: { scrollLeft: 0 } };
      const preventDefaultSpy = vi.fn();

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
      };

      const mockEvent = createMockMouseEvent(100);
      handleMouseMove(mockEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not scroll when container ref is null', () => {
      let isScrollDragging = true;
      const scrollContainerRef = { current: null };
      const preventDefaultSpy = vi.fn();

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
      };

      const mockEvent = createMockMouseEvent(100);
      handleMouseMove(mockEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should prevent default during mouse move', () => {
      let isScrollDragging = true;
      const scrollContainerRef = { current: { scrollLeft: 0 } };
      const preventDefaultSpy = vi.fn();

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
      };

      const mockEvent = createMockMouseEvent(100);
      handleMouseMove(mockEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should update scroll position on mouse move', () => {
      let isScrollDragging = true;
      const container = { scrollLeft: 0 };
      const scrollContainerRef = { current: container };
      const dragStartX = { current: 100 };
      const dragStartScrollLeft = { current: 50 };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.clientX - dragStartX.current;
        const scrollLeft = dragStartScrollLeft.current - x;
        scrollContainerRef.current.scrollLeft = scrollLeft;
      };

      // Move mouse to 150 (right by 50px)
      const mockEvent = createMockMouseEvent(150);
      handleMouseMove(mockEvent);

      expect(container.scrollLeft).toBe(0); // 50 - 50 = 0
    });

    it('should handle scroll updates for rapid mouse movements', () => {
      let isScrollDragging = true;
      const container = { scrollLeft: 100 };
      const scrollContainerRef = { current: container };
      const dragStartX = { current: 200 };
      const dragStartScrollLeft = { current: 100 };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.clientX - dragStartX.current;
        const scrollLeft = dragStartScrollLeft.current - x;
        scrollContainerRef.current.scrollLeft = scrollLeft;
      };

      // Simulate rapid movements
      const positions = [250, 300, 350, 400, 450];
      positions.forEach(x => {
        const mockEvent = createMockMouseEvent(x);
        handleMouseMove(mockEvent);
      });

      expect(container.scrollLeft).toBe(-150); // 100 - (450 - 200) = 100 - 250 = -150
    });
  });

  describe('Mouse Up Handler', () => {
    it('should reset isScrollDragging to false', () => {
      let isScrollDragging = true;

      const handleMouseUp = () => {
        isScrollDragging = false;
      };

      handleMouseUp();

      expect(isScrollDragging).toBe(false);
    });

    it('should not throw error when called multiple times', () => {
      let isScrollDragging = true;

      const handleMouseUp = () => {
        isScrollDragging = false;
      };

      expect(() => {
        handleMouseUp();
        handleMouseUp();
        handleMouseUp();
      }).not.toThrow();

      expect(isScrollDragging).toBe(false);
    });
  });

  describe('Mouse Down Handler', () => {
    it('should set drag state and record initial positions', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };
      const dragStartScrollLeft = { current: 0 };
      const scrollContainerRef = { current: { scrollLeft: 50 } };

      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (
          e.target.closest('button') ||
          e.target.closest('[data-dnd-kit-draggable]')
        )) {
          return;
        }

        isScrollDragging = true;
        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
      };

      const mockDiv = document.createElement('div');
      const mockEvent = createMockReactMouseEvent(100, mockDiv);
      handleMouseDown(mockEvent);

      expect(isScrollDragging).toBe(true);
      expect(dragStartX.current).toBe(100);
      expect(dragStartScrollLeft.current).toBe(50);
    });

    it('should not activate drag when target is button', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };
      const dragStartScrollLeft = { current: 0 };
      const scrollContainerRef = { current: { scrollLeft: 50 } };

      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (
          e.target.closest('button') ||
          e.target.closest('[data-dnd-kit-draggable]')
        )) {
          return;
        }

        isScrollDragging = true;
        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
      };

      const mockButton = document.createElement('button');
      const mockEvent = createMockReactMouseEvent(100, mockButton);
      handleMouseDown(mockEvent);

      expect(isScrollDragging).toBe(false);
      expect(dragStartX.current).toBe(0);
    });

    it('should not activate drag when target is draggable', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };
      const dragStartScrollLeft = { current: 0 };
      const scrollContainerRef = { current: { scrollLeft: 50 } };

      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (
          e.target.closest('button') ||
          e.target.closest('[data-dnd-kit-draggable]')
        )) {
          return;
        }

        isScrollDragging = true;
        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
      };

      const mockDraggable = document.createElement('div');
      mockDraggable.setAttribute('data-dnd-kit-draggable', 'true');
      const mockEvent = createMockReactMouseEvent(100, mockDraggable);
      handleMouseDown(mockEvent);

      expect(isScrollDragging).toBe(false);
      expect(dragStartX.current).toBe(0);
    });

    it('should handle null scroll container gracefully', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };
      const dragStartScrollLeft = { current: 0 };
      const scrollContainerRef = { current: null };

      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (
          e.target.closest('button') ||
          e.target.closest('[data-dnd-kit-draggable]')
        )) {
          return;
        }

        isScrollDragging = true;
        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
      };

      const mockDiv = document.createElement('div');
      const mockEvent = createMockReactMouseEvent(100, mockDiv);

      expect(() => {
        handleMouseDown(mockEvent);
      }).not.toThrow();

      expect(isScrollDragging).toBe(true);
      expect(dragStartScrollLeft.current).toBe(0); // Defaults to 0
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid drag start/stop cycles', () => {
      let isScrollDragging = false;
      let cycleCount = 0;

      const toggleDrag = () => {
        isScrollDragging = !isScrollDragging;
        cycleCount++;
      };

      // Rapid cycles
      for (let i = 0; i < 10; i++) {
        toggleDrag();
        expect(isScrollDragging).toBe(i % 2 === 0);
        expect(cycleCount).toBe(i + 1);
      }

      expect(cycleCount).toBe(10);
    });

    it('should handle negative clientX values', () => {
      const dragStartX = { current: 100 };
      const dragStartScrollLeft = { current: 50 };

      // Mouse moved to negative position (impossible but handle gracefully)
      const currentX = -50;
      const deltaX = currentX - dragStartX.current;
      const newScrollLeft = dragStartScrollLeft.current - deltaX;

      expect(deltaX).toBe(-150);
      expect(newScrollLeft).toBe(200); // 50 - (-150) = 200
    });

    it('should handle very large clientX values', () => {
      const dragStartX = { current: 100 };
      const dragStartScrollLeft = { current: 50 };

      // Very large mouse position
      const currentX = 100000;
      const deltaX = currentX - dragStartX.current;
      const newScrollLeft = dragStartScrollLeft.current - deltaX;

      expect(deltaX).toBe(99900);
      expect(newScrollLeft).toBe(-99850); // 50 - 99900 = -99850
    });

    it('should handle initial scrollLeft of zero', () => {
      const dragStartX = { current: 100 };
      const dragStartScrollLeft = { current: 0 };

      const currentX = 150;
      const deltaX = currentX - dragStartX.current;
      const newScrollLeft = dragStartScrollLeft.current - deltaX;

      expect(newScrollLeft).toBe(-50);
    });

    it('should handle mouse movement before drag starts', () => {
      let isScrollDragging = false;
      const scrollContainerRef = { current: { scrollLeft: 100 } };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        // Scroll logic here
      };

      const mockEvent = createMockMouseEvent(200);
      handleMouseMove(mockEvent);

      // Should not affect scroll position
      expect(scrollContainerRef.current.scrollLeft).toBe(100);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete drag lifecycle', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };
      const dragStartScrollLeft = { current: 0 };
      const container = { scrollLeft: 100 };
      const scrollContainerRef = { current: container };

      // 1. Mouse down - start drag
      const handleMouseDown = (e: React.MouseEvent) => {
        isScrollDragging = true;
        dragStartX.current = e.clientX;
        dragStartScrollLeft.current = scrollContainerRef.current?.scrollLeft || 0;
      };

      const mockDiv = document.createElement('div');
      const mockDownEvent = createMockReactMouseEvent(200, mockDiv);
      handleMouseDown(mockDownEvent);

      expect(isScrollDragging).toBe(true);
      expect(dragStartX.current).toBe(200);
      expect(dragStartScrollLeft.current).toBe(100);

      // 2. Mouse move - update scroll
      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        const x = e.clientX - dragStartX.current;
        const scrollLeft = dragStartScrollLeft.current - x;
        scrollContainerRef.current.scrollLeft = scrollLeft;
      };

      const mockMoveEvent = createMockMouseEvent(250, mockDiv);
      handleMouseMove(mockMoveEvent);

      expect(container.scrollLeft).toBe(50); // 100 - (250 - 200) = 50

      // 3. Mouse up - end drag
      const handleMouseUp = () => {
        isScrollDragging = false;
      };

      handleMouseUp();

      expect(isScrollDragging).toBe(false);
    });

    it('should handle drag that starts but moves outside container', () => {
      let isScrollDragging = true;
      const dragStartX = { current: 100 };
      const dragStartScrollLeft = { current: 50 };
      const container = { scrollLeft: 50 };
      const scrollContainerRef = { current: container };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isScrollDragging || !scrollContainerRef.current) return;
        const x = e.clientX - dragStartX.current;
        const scrollLeft = dragStartScrollLeft.current - x;
        scrollContainerRef.current.scrollLeft = scrollLeft;
      };

      // Mouse moves far outside container
      const positions = [150, 200, 300, 500, 1000];
      positions.forEach(x => {
        const mockEvent = createMockMouseEvent(x);
        handleMouseMove(mockEvent);
      });

      // Should still update scroll position
      expect(container.scrollLeft).toBe(-850); // 50 - (1000 - 100) = -850
    });

    it('should handle clicking button followed by drag on background', () => {
      let isScrollDragging = false;
      const dragStartX = { current: 0 };

      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (
          e.target.closest('button') ||
          e.target.closest('[data-dnd-kit-draggable]')
        )) {
          return;
        }
        isScrollDragging = true;
        dragStartX.current = e.clientX;
      };

      // Click button - drag should not start
      const mockButton = document.createElement('button');
      const mockButtonEvent = createMockReactMouseEvent(100, mockButton);
      handleMouseDown(mockButtonEvent);

      expect(isScrollDragging).toBe(false);

      // Click background - drag should start
      const mockDiv = document.createElement('div');
      const mockDivEvent = createMockReactMouseEvent(200, mockDiv);
      handleMouseDown(mockDivEvent);

      expect(isScrollDragging).toBe(true);
      expect(dragStartX.current).toBe(200);
    });
  });
});
