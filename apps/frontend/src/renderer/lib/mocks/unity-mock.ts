/**
 * Mock implementation for Unity operations
 */

export const unityMock = {
  // Unity project detection
  detectUnityProject: async (projectPath: string) => ({
    success: true,
    data: {
      isUnityProject: false,
      projectPath
    }
  }),

  updateUnityProjectVersion: async () => ({
    success: true,
    data: undefined
  }),

  // Unity Editor discovery
  discoverUnityEditors: async () => ({
    success: true,
    data: { editors: [] }
  }),

  autoDetectUnityHub: async () => ({
    success: true,
    data: { path: null }
  }),

  autoDetectUnityEditorsFolder: async () => ({
    success: true,
    data: { path: null }
  }),

  scanUnityEditorsFolder: async () => ({
    success: true,
    data: { editors: [] }
  }),

  // Unity settings
  getUnitySettings: async () => ({
    success: true,
    data: {}
  }),

  saveUnitySettings: async () => ({
    success: true,
    data: undefined
  }),

  // Unity actions
  runUnityEditModeTests: async () => ({
    success: true,
    data: undefined
  }),

  runUnityBuild: async () => ({
    success: true,
    data: undefined
  }),

  // Unity runs
  loadUnityRuns: async () => ({
    success: true,
    data: { runs: [] }
  }),

  // File operations
  openPath: async (path: string) => {
    console.warn('[Browser Mock] openPath:', path);
    return { success: true, data: undefined };
  }
};
