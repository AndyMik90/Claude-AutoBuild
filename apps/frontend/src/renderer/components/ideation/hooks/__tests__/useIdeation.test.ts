/**
 * Unit tests for useIdeation hook
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type {
  IdeationConfig,
  IdeationGenerationStatus,
  IdeationType
} from '../../../../../shared/types';
import { useIdeation } from '../useIdeation';

const mockGenerateIdeation = vi.hoisted(() => vi.fn());
const mockRefreshIdeation = vi.hoisted(() => vi.fn());
const mockAppendIdeation = vi.hoisted(() => vi.fn());
const mockLoadIdeation = vi.hoisted(() => vi.fn());
const mockSetupListeners = vi.hoisted(() => vi.fn(() => () => {}));
const mockAuthState = vi.hoisted(() => ({
  hasToken: true as boolean | null,
  isLoading: false,
  error: null as string | null,
  checkAuth: vi.fn()
}));

vi.mock('../useIdeationAuth', () => ({
  useIdeationAuth: () => mockAuthState
}));

vi.mock('../../../../stores/task-store', () => ({
  loadTasks: vi.fn()
}));

vi.mock('../../../../stores/ideation-store', () => {
  const state = {
    session: null,
    generationStatus: {} as IdeationGenerationStatus,
    isGenerating: false,
    config: {
      enabledTypes: [],
      includeRoadmapContext: false,
      includeKanbanContext: false,
      maxIdeasPerType: 3
    } as IdeationConfig,
    logs: [],
    typeStates: {},
    selectedIds: new Set()
  };

  return {
    useIdeationStore: (selector: (s: typeof state) => unknown) => selector(state),
    loadIdeation: mockLoadIdeation,
    generateIdeation: mockGenerateIdeation,
    refreshIdeation: mockRefreshIdeation,
    stopIdeation: vi.fn(),
    appendIdeation: mockAppendIdeation,
    dismissAllIdeasForProject: vi.fn(),
    deleteMultipleIdeasForProject: vi.fn(),
    getIdeasByType: vi.fn(() => []),
    getActiveIdeas: vi.fn(() => []),
    getArchivedIdeas: vi.fn(() => []),
    getIdeationSummary: vi.fn(() => ({ totalIdeas: 0, byType: {}, byStatus: {} })),
    setupIdeationListeners: mockSetupListeners
  };
});

describe('useIdeation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set up and clean up listeners on unmount', () => {
    const cleanupFn = vi.fn();
    mockSetupListeners.mockReturnValueOnce(cleanupFn);

    const { unmount } = renderHook(() => useIdeation('project-1'));

    expect(mockLoadIdeation).toHaveBeenCalledWith('project-1');

    unmount();

    expect(cleanupFn).toHaveBeenCalled();
  });

  it('should prompt for env config when token is missing', () => {
    mockAuthState.hasToken = false;
    mockAuthState.isLoading = false;

    const { result } = renderHook(() => useIdeation('project-1'));

    act(() => {
      result.current.handleGenerate();
    });

    expect(result.current.showEnvConfigModal).toBe(true);
    expect(mockGenerateIdeation).not.toHaveBeenCalled();
  });

  it('should generate when token is present', () => {
    mockAuthState.hasToken = true;
    mockAuthState.isLoading = false;

    const { result } = renderHook(() => useIdeation('project-1'));

    act(() => {
      result.current.handleGenerate();
    });

    expect(result.current.showEnvConfigModal).toBe(false);
    expect(mockGenerateIdeation).toHaveBeenCalledWith('project-1');
  });

  it('should retry generate after env is configured', () => {
    mockAuthState.hasToken = false;
    mockAuthState.isLoading = false;

    const { result } = renderHook(() => useIdeation('project-1'));

    act(() => {
      result.current.handleGenerate();
    });

    act(() => {
      result.current.handleEnvConfigured();
    });

    expect(mockAuthState.checkAuth).toHaveBeenCalled();
    expect(mockGenerateIdeation).toHaveBeenCalledWith('project-1');
  });

  it('should retry refresh after env is configured', () => {
    mockAuthState.hasToken = false;
    mockAuthState.isLoading = false;

    const { result } = renderHook(() => useIdeation('project-1'));

    act(() => {
      result.current.handleRefresh();
    });

    act(() => {
      result.current.handleEnvConfigured();
    });

    expect(mockAuthState.checkAuth).toHaveBeenCalled();
    expect(mockRefreshIdeation).toHaveBeenCalledWith('project-1');
  });

  it('should append ideas after env is configured', () => {
    mockAuthState.hasToken = false;
    mockAuthState.isLoading = false;

    const { result } = renderHook(() => useIdeation('project-1'));
    const typesToAdd = ['code_improvements'] as IdeationType[];

    act(() => {
      result.current.setTypesToAdd(typesToAdd);
    });

    act(() => {
      result.current.handleAddMoreIdeas();
    });

    act(() => {
      result.current.handleEnvConfigured();
    });

    expect(mockAuthState.checkAuth).toHaveBeenCalled();
    expect(mockAppendIdeation).toHaveBeenCalledWith('project-1', typesToAdd);
    expect(result.current.typesToAdd).toHaveLength(0);
  });
});
