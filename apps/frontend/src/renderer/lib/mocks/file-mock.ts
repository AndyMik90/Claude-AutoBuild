/**
 * Mock implementation for file operations
 */

export const fileMock = {
  // File explorer
  listDirectory: async () => ({
    success: true,
    data: []
  }),

  // Code editor operations
  codeEditorListDir: async () => ({
    success: true,
    data: [
      { name: 'src', relPath: 'src', isDir: true },
      { name: 'README.md', relPath: 'README.md', isDir: false },
      { name: 'package.json', relPath: 'package.json', isDir: false }
    ]
  }),

  codeEditorReadFile: async (_workspaceRoot: string, relPath: string) => ({
    success: true,
    data: `// Mock content for ${relPath}\n// This is a browser mock - file operations are not available in browser mode.\n`
  }),

  codeEditorWriteFile: async () => ({
    success: true
  })
};
