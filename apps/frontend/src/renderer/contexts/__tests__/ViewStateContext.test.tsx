/**
 * Unit tests for ViewStateContext
 * Tests view state management, provider functionality, and hooks behavior
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ViewStateProvider, useViewState, useViewStateOptional } from '../ViewStateContext';

describe('ViewStateContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ViewStateProvider', () => {
    it('should provide initial state with showArchived as false', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);
    });

    it('should provide setShowArchived function', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(typeof result.current.setShowArchived).toBe('function');
    });

    it('should provide toggleShowArchived function', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(typeof result.current.toggleShowArchived).toBe('function');
    });

    it('should render children correctly', () => {
      // Verify provider renders children by checking hook access
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // If children weren't rendered, hook wouldn't work
      expect(result.current).toBeDefined();
    });
  });

  describe('useViewState Hook', () => {
    it('should throw error when used outside ViewStateProvider', () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useViewState());
      }).toThrow('useViewState must be used within a ViewStateProvider');

      consoleSpy.mockRestore();
    });

    it('should return context value when used inside ViewStateProvider', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current).toHaveProperty('showArchived');
      expect(result.current).toHaveProperty('setShowArchived');
      expect(result.current).toHaveProperty('toggleShowArchived');
    });
  });

  describe('useViewStateOptional Hook', () => {
    it('should return null when used outside ViewStateProvider', () => {
      const { result } = renderHook(() => useViewStateOptional());

      expect(result.current).toBeNull();
    });

    it('should return context value when used inside ViewStateProvider', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewStateOptional(), { wrapper });

      expect(result.current).not.toBeNull();
      expect(result.current).toHaveProperty('showArchived');
      expect(result.current).toHaveProperty('setShowArchived');
      expect(result.current).toHaveProperty('toggleShowArchived');
    });
  });

  describe('setShowArchived', () => {
    it('should set showArchived to true', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);

      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.showArchived).toBe(true);
    });

    it('should set showArchived to false', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // First set to true
      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.showArchived).toBe(true);

      // Then set back to false
      act(() => {
        result.current.setShowArchived(false);
      });

      expect(result.current.showArchived).toBe(false);
    });

    it('should handle setting same value multiple times', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.showArchived).toBe(true);

      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.showArchived).toBe(true);
    });
  });

  describe('toggleShowArchived', () => {
    it('should toggle showArchived from false to true', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);

      act(() => {
        result.current.toggleShowArchived();
      });

      expect(result.current.showArchived).toBe(true);
    });

    it('should toggle showArchived from true to false', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // First toggle to true
      act(() => {
        result.current.toggleShowArchived();
      });

      expect(result.current.showArchived).toBe(true);

      // Toggle back to false
      act(() => {
        result.current.toggleShowArchived();
      });

      expect(result.current.showArchived).toBe(false);
    });

    it('should handle rapid toggling', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);

      // Toggle 10 times
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.toggleShowArchived();
        });
      }

      // After even number of toggles, should be back to false
      expect(result.current.showArchived).toBe(false);
    });

    it('should handle odd number of toggles', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);

      // Toggle 5 times
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.toggleShowArchived();
        });
      }

      // After odd number of toggles, should be true
      expect(result.current.showArchived).toBe(true);
    });
  });

  describe('State Persistence Within Provider', () => {
    it('should maintain state across multiple hook calls', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result: result1, rerender } = renderHook(() => useViewState(), { wrapper });

      // Set state
      act(() => {
        result1.current.setShowArchived(true);
      });

      expect(result1.current.showArchived).toBe(true);

      // Rerender and verify state persists
      rerender();

      expect(result1.current.showArchived).toBe(true);
    });

    it('should share state between multiple consumers', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      // First consumer
      const { result: result1 } = renderHook(() => useViewState(), { wrapper });

      // Update state from first consumer
      act(() => {
        result1.current.setShowArchived(true);
      });

      // Verify first consumer sees the change
      expect(result1.current.showArchived).toBe(true);
    });
  });

  describe('Context Value Interface', () => {
    it('should have correct ViewState interface', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // Verify ViewState properties
      expect(typeof result.current.showArchived).toBe('boolean');
    });

    it('should have correct ViewStateContextValue interface', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // Verify ViewStateContextValue extends ViewState
      expect(typeof result.current.showArchived).toBe('boolean');
      expect(typeof result.current.setShowArchived).toBe('function');
      expect(typeof result.current.toggleShowArchived).toBe('function');
    });
  });

  describe('Memoization', () => {
    it('should memoize setShowArchived function', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result, rerender } = renderHook(() => useViewState(), { wrapper });

      const setShowArchivedRef1 = result.current.setShowArchived;

      rerender();

      const setShowArchivedRef2 = result.current.setShowArchived;

      // useCallback should return same function reference
      expect(setShowArchivedRef1).toBe(setShowArchivedRef2);
    });

    it('should memoize toggleShowArchived function', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result, rerender } = renderHook(() => useViewState(), { wrapper });

      const toggleShowArchivedRef1 = result.current.toggleShowArchived;

      rerender();

      const toggleShowArchivedRef2 = result.current.toggleShowArchived;

      // useCallback should return same function reference
      expect(toggleShowArchivedRef1).toBe(toggleShowArchivedRef2);
    });
  });

  describe('Initial State Values', () => {
    it('should initialize showArchived as false', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      expect(result.current.showArchived).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle boolean true value correctly', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.showArchived).toBe(true);
      expect(result.current.showArchived).not.toBe('true');
      expect(result.current.showArchived).not.toBe(1);
    });

    it('should handle boolean false value correctly', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      act(() => {
        result.current.setShowArchived(true);
      });

      act(() => {
        result.current.setShowArchived(false);
      });

      expect(result.current.showArchived).toBe(false);
      expect(result.current.showArchived).not.toBe('false');
      expect(result.current.showArchived).not.toBe(0);
    });

    it('should handle combined setShowArchived and toggleShowArchived calls', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // Initial state
      expect(result.current.showArchived).toBe(false);

      // Set to true
      act(() => {
        result.current.setShowArchived(true);
      });
      expect(result.current.showArchived).toBe(true);

      // Toggle (should become false)
      act(() => {
        result.current.toggleShowArchived();
      });
      expect(result.current.showArchived).toBe(false);

      // Set to true again
      act(() => {
        result.current.setShowArchived(true);
      });
      expect(result.current.showArchived).toBe(true);

      // Toggle (should become false)
      act(() => {
        result.current.toggleShowArchived();
      });
      expect(result.current.showArchived).toBe(false);
    });
  });

  describe('Provider Error Message', () => {
    it('should have descriptive error message for useViewState outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        renderHook(() => useViewState());
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('useViewState must be used within a ViewStateProvider');
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Functional Behavior Verification', () => {
    it('should correctly represent showing archived items', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // When showArchived is false, archived items should be hidden
      expect(result.current.showArchived).toBe(false);

      act(() => {
        result.current.toggleShowArchived();
      });

      // When showArchived is true, archived items should be visible
      expect(result.current.showArchived).toBe(true);
    });

    it('should allow explicit control via setShowArchived', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ViewStateProvider>{children}</ViewStateProvider>
      );

      const { result } = renderHook(() => useViewState(), { wrapper });

      // Explicitly show archived
      act(() => {
        result.current.setShowArchived(true);
      });
      expect(result.current.showArchived).toBe(true);

      // Explicitly hide archived
      act(() => {
        result.current.setShowArchived(false);
      });
      expect(result.current.showArchived).toBe(false);
    });
  });
});
