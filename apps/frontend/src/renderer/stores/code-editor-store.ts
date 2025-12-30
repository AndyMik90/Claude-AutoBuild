import { create } from 'zustand';

export interface EditorTab {
  id: string;
  relPath: string;
  fileName: string;
  language: string;
  originalContent: string;
  content: string;
  isDirty: boolean;
  lastOpenedAt: number;
}

export interface FileNode {
  name: string;
  relPath: string;
  isDir: boolean;
}

export interface FolderState {
  expanded: Set<string>;
  childrenByDir: Map<string, FileNode[] | 'loading' | { error: string }>;
}

interface ProjectEditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  folderState: FolderState;
}

interface CodeEditorState {
  // State per project (keyed by projectId)
  projectStates: Map<string, ProjectEditorState>;

  // Actions
  getTabs: (projectId: string) => EditorTab[];
  getActiveTabId: (projectId: string) => string | null;
  getFolderState: (projectId: string) => FolderState;

  setTabs: (projectId: string, tabs: EditorTab[]) => void;
  setActiveTabId: (projectId: string, tabId: string | null) => void;
  setFolderState: (projectId: string, folderState: FolderState) => void;

  addTab: (projectId: string, tab: EditorTab) => void;
  updateTab: (projectId: string, tabId: string, updates: Partial<EditorTab>) => void;
  removeTab: (projectId: string, tabId: string) => void;
  clearProject: (projectId: string) => void;
}

// Stable default values to avoid creating new objects on every call
const EMPTY_TABS: EditorTab[] = [];
const DEFAULT_FOLDER_STATE: FolderState = {
  expanded: new Set<string>(),
  childrenByDir: new Map()
};

const getDefaultProjectState = (): ProjectEditorState => ({
  tabs: [],
  activeTabId: null,
  folderState: {
    expanded: new Set<string>(),
    childrenByDir: new Map()
  }
});

export const useCodeEditorStore = create<CodeEditorState>((set, get) => ({
  projectStates: new Map(),

  getTabs: (projectId: string) => {
    const projectState = get().projectStates.get(projectId);
    return projectState?.tabs ?? EMPTY_TABS;
  },

  getActiveTabId: (projectId: string) => {
    const projectState = get().projectStates.get(projectId);
    return projectState?.activeTabId ?? null;
  },

  getFolderState: (projectId: string) => {
    const projectState = get().projectStates.get(projectId);
    return projectState?.folderState ?? DEFAULT_FOLDER_STATE;
  },

  setTabs: (projectId: string, tabs: EditorTab[]) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId) ?? getDefaultProjectState();
      newStates.set(projectId, { ...projectState, tabs });
      return { projectStates: newStates };
    });
  },

  setActiveTabId: (projectId: string, tabId: string | null) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId) ?? getDefaultProjectState();
      newStates.set(projectId, { ...projectState, activeTabId: tabId });
      return { projectStates: newStates };
    });
  },

  setFolderState: (projectId: string, folderState: FolderState) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId) ?? getDefaultProjectState();
      newStates.set(projectId, { ...projectState, folderState });
      return { projectStates: newStates };
    });
  },

  addTab: (projectId: string, tab: EditorTab) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId) ?? getDefaultProjectState();
      const existingTabIndex = projectState.tabs.findIndex((t) => t.id === tab.id);

      if (existingTabIndex >= 0) {
        // Update existing tab
        const newTabs = [...projectState.tabs];
        newTabs[existingTabIndex] = { ...newTabs[existingTabIndex], ...tab };
        newStates.set(projectId, { ...projectState, tabs: newTabs, activeTabId: tab.id });
      } else {
        // Add new tab
        newStates.set(projectId, {
          ...projectState,
          tabs: [...projectState.tabs, tab],
          activeTabId: tab.id
        });
      }

      return { projectStates: newStates };
    });
  },

  updateTab: (projectId: string, tabId: string, updates: Partial<EditorTab>) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId);
      if (!projectState) return state;

      const tabIndex = projectState.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return state;

      const newTabs = [...projectState.tabs];
      newTabs[tabIndex] = { ...newTabs[tabIndex], ...updates };
      newStates.set(projectId, { ...projectState, tabs: newTabs });

      return { projectStates: newStates };
    });
  },

  removeTab: (projectId: string, tabId: string) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      const projectState = newStates.get(projectId);
      if (!projectState) return state;

      const newTabs = projectState.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = projectState.activeTabId;

      // If we're closing the active tab, switch to another tab
      if (projectState.activeTabId === tabId && newTabs.length > 0) {
        // Find the most recently opened tab
        const sortedTabs = [...newTabs].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
        newActiveTabId = sortedTabs[0]?.id ?? null;
      } else if (newTabs.length === 0) {
        newActiveTabId = null;
      }

      newStates.set(projectId, { ...projectState, tabs: newTabs, activeTabId: newActiveTabId });
      return { projectStates: newStates };
    });
  },

  clearProject: (projectId: string) => {
    set((state) => {
      const newStates = new Map(state.projectStates);
      newStates.delete(projectId);
      return { projectStates: newStates };
    });
  }
}));
