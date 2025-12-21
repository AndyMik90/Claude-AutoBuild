import { create } from 'zustand';
import type { Project, ProjectSettings, AutoBuildVersionInfo, InitializationResult } from '../../shared/types';

// localStorage keys for persisting project state
const LAST_SELECTED_PROJECT_KEY = 'lastSelectedProjectId';
const OPEN_PROJECTS_KEY = 'openProjectIds';
const TAB_ORDER_KEY = 'projectTabOrder';
const ACTIVE_PROJECT_KEY = 'activeProjectId';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  // Tab state
  openProjectIds: string[]; // Array of open project IDs
  activeProjectId: string | null; // Currently active tab
  tabOrder: string[]; // Order of tabs for drag and drop

  // Actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  selectProject: (projectId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Tab management actions
  openProjectTab: (projectId: string) => void;
  closeProjectTab: (projectId: string) => void;
  setActiveProject: (projectId: string | null) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  restoreTabState: () => void;

  // Selectors
  getSelectedProject: () => Project | undefined;
  getOpenProjects: () => Project[];
  getActiveProject: () => Project | undefined;
  getProjectTabs: () => Project[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  error: null,

  // Initialize tab state from localStorage
  openProjectIds: JSON.parse(localStorage.getItem(OPEN_PROJECTS_KEY) || '[]'),
  activeProjectId: localStorage.getItem(ACTIVE_PROJECT_KEY) || null,
  tabOrder: JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]'),

  setProjects: (projects) => set({ projects }),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project]
    })),

  removeProject: (projectId) =>
    set((state) => {
      const isSelectedProject = state.selectedProjectId === projectId;
      // Clear localStorage if we're removing the currently selected project
      if (isSelectedProject) {
        localStorage.removeItem(LAST_SELECTED_PROJECT_KEY);
      }
      return {
        projects: state.projects.filter((p) => p.id !== projectId),
        selectedProjectId: isSelectedProject ? null : state.selectedProjectId
      };
    }),

  updateProject: (projectId, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, ...updates } : p
      )
    })),

  selectProject: (projectId) => {
    // Persist to localStorage for restoration on app reload
    if (projectId) {
      localStorage.setItem(LAST_SELECTED_PROJECT_KEY, projectId);
    } else {
      localStorage.removeItem(LAST_SELECTED_PROJECT_KEY);
    }
    set({ selectedProjectId: projectId });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  // Tab management actions
  openProjectTab: (projectId) => {
    const state = get();
    if (!state.openProjectIds.includes(projectId)) {
      const newOpenProjectIds = [...state.openProjectIds, projectId];
      const newTabOrder = state.tabOrder.includes(projectId)
        ? state.tabOrder
        : [...state.tabOrder, projectId];

      localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(newOpenProjectIds));
      localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(newTabOrder));

      set({
        openProjectIds: newOpenProjectIds,
        tabOrder: newTabOrder,
        activeProjectId: projectId
      });
      localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    } else {
      // Project already open, just make it active
      get().setActiveProject(projectId);
    }
  },

  closeProjectTab: (projectId) => {
    const state = get();
    const newOpenProjectIds = state.openProjectIds.filter(id => id !== projectId);
    const newTabOrder = state.tabOrder.filter(id => id !== projectId);

    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(newOpenProjectIds));
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(newTabOrder));

    // If closing the active project, select another one or null
    let newActiveProjectId = state.activeProjectId;
    if (state.activeProjectId === projectId) {
      const remainingTabs = newTabOrder.length > 0 ? newTabOrder : [];
      newActiveProjectId = remainingTabs.length > 0 ? remainingTabs[0] : null;
      localStorage.setItem(ACTIVE_PROJECT_KEY, newActiveProjectId || '');
    }

    set({
      openProjectIds: newOpenProjectIds,
      tabOrder: newTabOrder,
      activeProjectId: newActiveProjectId
    });
  },

  setActiveProject: (projectId) => {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId || '');
    set({ activeProjectId: projectId });
    // Also update selectedProjectId for backward compatibility
    get().selectProject(projectId);
  },

  reorderTabs: (fromIndex, toIndex) => {
    const state = get();
    const newTabOrder = [...state.tabOrder];
    const [movedTab] = newTabOrder.splice(fromIndex, 1);
    newTabOrder.splice(toIndex, 0, movedTab);

    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(newTabOrder));
    set({ tabOrder: newTabOrder });
  },

  restoreTabState: () => {
    const openProjectIds = JSON.parse(localStorage.getItem(OPEN_PROJECTS_KEY) || '[]');
    const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY);
    const tabOrder = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]');

    set({
      openProjectIds,
      activeProjectId,
      tabOrder
    });
  },

  // Original selectors
  getSelectedProject: () => {
    const state = get();
    return state.projects.find((p) => p.id === state.selectedProjectId);
  },

  // New selectors for tab functionality
  getOpenProjects: () => {
    const state = get();
    return state.projects.filter((p) => state.openProjectIds.includes(p.id));
  },

  getActiveProject: () => {
    const state = get();
    return state.projects.find((p) => p.id === state.activeProjectId);
  },

  getProjectTabs: () => {
    const state = get();
    const orderedProjects = state.tabOrder
      .map(id => state.projects.find(p => p.id === id))
      .filter(Boolean) as Project[];

    // Add any open projects not in tabOrder to the end
    const remainingProjects = state.projects
      .filter(p => state.openProjectIds.includes(p.id) && !state.tabOrder.includes(p.id));

    return [...orderedProjects, ...remainingProjects];
  }
}));

/**
 * Load projects from main process
 */
export async function loadProjects(): Promise<void> {
  const store = useProjectStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.getProjects();
    if (result.success && result.data) {
      store.setProjects(result.data);

      // Clean up tab state - remove any project IDs that no longer exist
      const validOpenProjectIds = store.openProjectIds.filter(id =>
        result.data?.some((p) => p.id === id) ?? false
      );
      const validTabOrder = store.tabOrder.filter(id =>
        result.data?.some((p) => p.id === id) ?? false
      );
      const validActiveProjectId = store.activeProjectId &&
        result.data?.some((p) => p.id === store.activeProjectId)
        ? store.activeProjectId
        : null;

      // Update store with cleaned tab state
      if (validOpenProjectIds.length !== store.openProjectIds.length ||
          validTabOrder.length !== store.tabOrder.length ||
          validActiveProjectId !== store.activeProjectId) {
        localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(validOpenProjectIds));
        localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(validTabOrder));
        localStorage.setItem(ACTIVE_PROJECT_KEY, validActiveProjectId || '');

        // Update the store state
        useProjectStore.setState({
          openProjectIds: validOpenProjectIds,
          tabOrder: validTabOrder,
          activeProjectId: validActiveProjectId
        });
      }

      // Restore last selected project from localStorage for backward compatibility,
      // or fall back to active project, or first project
      if (!store.selectedProjectId && result.data.length > 0) {
        const lastSelectedId = localStorage.getItem(LAST_SELECTED_PROJECT_KEY);
        const projectExists = lastSelectedId && result.data.some((p) => p.id === lastSelectedId);

        if (projectExists) {
          store.selectProject(lastSelectedId);
        } else if (store.activeProjectId) {
          store.selectProject(store.activeProjectId);
        } else {
          store.selectProject(result.data[0].id);
        }
      }
    } else {
      store.setError(result.error || 'Failed to load projects');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Add a new project
 */
export async function addProject(projectPath: string): Promise<Project | null> {
  const store = useProjectStore.getState();

  try {
    const result = await window.electronAPI.addProject(projectPath);
    if (result.success && result.data) {
      store.addProject(result.data);
      store.selectProject(result.data.id);
      // Also open a tab for the new project
      store.openProjectTab(result.data.id);
      return result.data;
    } else {
      store.setError(result.error || 'Failed to add project');
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Remove a project
 */
export async function removeProject(projectId: string): Promise<boolean> {
  const store = useProjectStore.getState();

  try {
    const result = await window.electronAPI.removeProject(projectId);
    if (result.success) {
      store.removeProject(projectId);
      // Also close the tab if it's open
      if (store.openProjectIds.includes(projectId)) {
        store.closeProjectTab(projectId);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Update project settings
 */
export async function updateProjectSettings(
  projectId: string,
  settings: Partial<ProjectSettings>
): Promise<boolean> {
  const store = useProjectStore.getState();

  try {
    const result = await window.electronAPI.updateProjectSettings(
      projectId,
      settings
    );
    if (result.success) {
      const project = store.projects.find((p) => p.id === projectId);
      if (project) {
        store.updateProject(projectId, {
          settings: { ...project.settings, ...settings }
        });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check auto-claude version status for a project
 */
export async function checkProjectVersion(
  projectId: string
): Promise<AutoBuildVersionInfo | null> {
  try {
    const result = await window.electronAPI.checkProjectVersion(projectId);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Initialize auto-claude in a project
 */
export async function initializeProject(
  projectId: string
): Promise<InitializationResult | null> {
  const store = useProjectStore.getState();

  try {
    console.log('[ProjectStore] initializeProject called for:', projectId);
    const result = await window.electronAPI.initializeProject(projectId);
    console.log('[ProjectStore] IPC result:', result);

    if (result.success && result.data) {
      console.log('[ProjectStore] IPC succeeded, result.data:', result.data);
      // Update the project's autoBuildPath in local state
      if (result.data.success) {
        console.log('[ProjectStore] Updating project autoBuildPath to .auto-claude');
        store.updateProject(projectId, { autoBuildPath: '.auto-claude' });
      } else {
        console.log('[ProjectStore] result.data.success is false, not updating project');
      }
      return result.data;
    }
    console.log('[ProjectStore] IPC failed or no data, setting error');
    store.setError(result.error || 'Failed to initialize project');
    return null;
  } catch (error) {
    console.error('[ProjectStore] Exception during initializeProject:', error);
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Update auto-claude in a project
 */
export async function updateProjectAutoBuild(
  projectId: string
): Promise<InitializationResult | null> {
  const store = useProjectStore.getState();

  try {
    const result = await window.electronAPI.updateProjectAutoBuild(projectId);
    if (result.success && result.data) {
      return result.data;
    }
    store.setError(result.error || 'Failed to update auto-claude');
    return null;
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
