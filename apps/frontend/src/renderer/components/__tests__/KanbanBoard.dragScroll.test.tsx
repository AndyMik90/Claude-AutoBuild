/**
 * Integration tests for KanbanBoard drag-to-scroll functionality
 * Tests click-and-drag horizontal scrolling behavior through actual
 * component interactions, verifying cursor state and scroll behavior.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import type { Task } from '../../../shared/types';
import { KanbanBoard } from '../KanbanBoard';
import { ViewStateProvider } from '../../contexts/ViewStateContext';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children
}));

// Mock the toast hook
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

// Mock IntersectionObserver for components that use it (e.g., PhaseProgressIndicator)
// Must be set up globally before component imports
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// Test wrapper with required providers
function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ViewStateProvider>
      {children}
    </ViewStateProvider>
  );
}

// Helper to create test tasks
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    specId: `spec-${Date.now()}`,
    title: 'Test Task',
    description: 'Test task description',
    status: 'backlog',
    projectId: 'test-project',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to get the scroll container (board region)
function getBoardRegion() {
  return screen.getByRole('region', { name: 'tasks:kanban.boardRegion' });
}

describe('KanbanBoard Drag-to-Scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should render with cursor-grab class indicating draggable area', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      expect(boardRegion).toBeInTheDocument();
      expect(boardRegion).toHaveClass('cursor-grab');
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
    });

    it('should have select-none class to prevent text selection during drag', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      expect(boardRegion).toHaveClass('select-none');
    });
  });

  describe('Cursor State Changes', () => {
    it('should change to cursor-grabbing when mouse is pressed down', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      fireEvent.mouseDown(boardRegion, { clientX: 100 });

      expect(boardRegion).toHaveClass('cursor-grabbing');
    });

    it('should revert to cursor-grab when mouse is released', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Start dragging
      fireEvent.mouseDown(boardRegion, { clientX: 100 });
      expect(boardRegion).toHaveClass('cursor-grabbing');

      // Stop dragging via window mouseup (simulates releasing mouse anywhere)
      fireEvent.mouseUp(window);
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
      expect(boardRegion).toHaveClass('cursor-grab');
    });

    it('should handle multiple drag cycles correctly', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Multiple drag cycles should work correctly
      for (let i = 0; i < 3; i++) {
        fireEvent.mouseDown(boardRegion, { clientX: 100 + i * 50 });
        expect(boardRegion).toHaveClass('cursor-grabbing');

        fireEvent.mouseUp(window);
        expect(boardRegion).not.toHaveClass('cursor-grabbing');
        expect(boardRegion).toHaveClass('cursor-grab');
      }
    });
  });

  describe('Target Element Exclusion', () => {
    it('should NOT activate drag when clicking on a button', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} onNewTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      // The backlog column has a "+" button for adding tasks
      // Note: The mock translation returns the key without namespace prefix
      const addButton = screen.getByRole('button', { name: 'kanban.addTaskAriaLabel' });

      // Click on the button
      fireEvent.mouseDown(addButton, { clientX: 100 });

      // Board should NOT be in dragging state
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
      expect(boardRegion).toHaveClass('cursor-grab');
    });

    it('should NOT activate drag when clicking on a draggable task card', () => {
      const tasks = [
        createTestTask({ id: 'task-1', title: 'Task 1', status: 'backlog' })
      ];

      render(
        <TestWrapper>
          <KanbanBoard tasks={tasks} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      // Find the task card by its data attribute
      const taskCard = document.querySelector('[data-dnd-kit-draggable="true"]');
      expect(taskCard).toBeInTheDocument();

      // Click on the task card
      fireEvent.mouseDown(taskCard!, { clientX: 100 });

      // Board should NOT be in dragging state because we clicked on a dnd-kit draggable
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
      expect(boardRegion).toHaveClass('cursor-grab');
    });

    it('should activate drag when clicking on empty column area', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      // Click on the board region itself (empty area)
      fireEvent.mouseDown(boardRegion, { clientX: 100 });

      expect(boardRegion).toHaveClass('cursor-grabbing');
    });
  });

  describe('Scroll Behavior', () => {
    it('should update scroll position during drag', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Mock scrollLeft as jsdom doesn't support actual scrolling
      // Initial scroll position is 100
      let currentScrollLeft = 100;
      Object.defineProperty(boardRegion, 'scrollLeft', {
        get: () => currentScrollLeft,
        set: (value: number) => { currentScrollLeft = value; },
        configurable: true
      });

      // Start drag at position 200 (dragStartX = 200, dragStartScrollLeft = 100)
      fireEvent.mouseDown(boardRegion, { clientX: 200 });
      expect(boardRegion).toHaveClass('cursor-grabbing');

      // Move mouse to 250 (right by 50px from start)
      // Formula: newScrollLeft = dragStartScrollLeft - (clientX - dragStartX)
      // newScrollLeft = 100 - (250 - 200) = 100 - 50 = 50
      fireEvent.mouseMove(window, { clientX: 250 });
      expect(currentScrollLeft).toBe(50);

      // Move mouse to 150 (left by 50px from start)
      // newScrollLeft = 100 - (150 - 200) = 100 - (-50) = 150
      fireEvent.mouseMove(window, { clientX: 150 });
      expect(currentScrollLeft).toBe(150);

      // Release
      fireEvent.mouseUp(window);
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
    });

    it('should not scroll when not in drag state', () => {
      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Track scroll changes
      let scrollCallCount = 0;
      const originalScrollLeft = 0;
      Object.defineProperty(boardRegion, 'scrollLeft', {
        get: () => originalScrollLeft,
        set: () => { scrollCallCount++; },
        configurable: true
      });

      // Move mouse without starting a drag
      fireEvent.mouseMove(window, { clientX: 250 });
      fireEvent.mouseMove(window, { clientX: 300 });

      // Scroll should not have been modified
      expect(scrollCallCount).toBe(0);
    });
  });

  describe('Event Listener Management', () => {
    it('should add window listeners when drag starts and remove on drag end', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      render(
        <TestWrapper>
          <KanbanBoard tasks={[]} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Start drag
      fireEvent.mouseDown(boardRegion, { clientX: 100 });

      // Should have added mousemove and mouseup listeners
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      // End drag
      fireEvent.mouseUp(window);

      // Should have removed the listeners
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Integration with Tasks', () => {
    it('should maintain drag functionality with tasks present', () => {
      const tasks = [
        createTestTask({ id: 'task-1', title: 'Task 1', status: 'backlog' }),
        createTestTask({ id: 'task-2', title: 'Task 2', status: 'in_progress' }),
        createTestTask({ id: 'task-3', title: 'Task 3', status: 'done' })
      ];

      render(
        <TestWrapper>
          <KanbanBoard tasks={tasks} onTaskClick={vi.fn()} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();

      // Verify tasks are rendered
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
      expect(screen.getByText('Task 3')).toBeInTheDocument();

      // Drag behavior should still work
      fireEvent.mouseDown(boardRegion, { clientX: 150 });
      expect(boardRegion).toHaveClass('cursor-grabbing');

      fireEvent.mouseUp(window);
      expect(boardRegion).not.toHaveClass('cursor-grabbing');
    });

    it('should distinguish between board drag and task card drag', () => {
      const mockOnTaskClick = vi.fn();
      const tasks = [
        createTestTask({ id: 'task-1', title: 'Test Task', status: 'backlog' })
      ];

      render(
        <TestWrapper>
          <KanbanBoard tasks={tasks} onTaskClick={mockOnTaskClick} />
        </TestWrapper>
      );

      const boardRegion = getBoardRegion();
      const taskCard = document.querySelector('[data-dnd-kit-draggable="true"]');

      // Clicking on task card should NOT activate board drag
      fireEvent.mouseDown(taskCard!, { clientX: 100 });
      expect(boardRegion).not.toHaveClass('cursor-grabbing');

      // Clicking on board background SHOULD activate board drag
      fireEvent.mouseDown(boardRegion, { clientX: 500 });
      expect(boardRegion).toHaveClass('cursor-grabbing');

      fireEvent.mouseUp(window);
    });
  });
});
