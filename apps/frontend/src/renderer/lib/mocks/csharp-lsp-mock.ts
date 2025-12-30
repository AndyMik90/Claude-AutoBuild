/**
 * C# LSP mock implementations for browser preview
 */

import type { CSharpLspAPI } from '../../../preload/api/csharp-lsp-api';

export const csharpLspMock: CSharpLspAPI = {
  // C# LSP Operations
  csharpLspStart: async () => ({
    success: true,
    data: { ok: true }
  }),

  csharpLspStop: async () => ({
    success: true,
    data: { ok: true }
  }),

  csharpLspStatus: async () => ({
    success: true,
    data: { state: 'stopped' }
  }),

  csharpLspDidOpen: async () => ({
    success: true,
    data: undefined
  }),

  csharpLspDidChange: async () => ({
    success: true,
    data: undefined
  }),

  csharpLspDidSave: async () => ({
    success: true,
    data: undefined
  }),

  csharpLspDidClose: async () => ({
    success: true,
    data: undefined
  }),

  csharpLspCompletion: async () => ({
    success: true,
    data: { isIncomplete: false, items: [] }
  }),

  csharpLspHover: async () => ({
    success: true,
    data: null
  }),

  csharpLspDefinition: async () => ({
    success: true,
    data: null
  }),

  csharpLspFormatDocument: async () => ({
    success: true,
    data: []
  }),

  // C# LSP Event Listeners
  onCSharpLspPublishDiagnostics: () => () => {},
  onCSharpLspLog: () => () => {},
  onCSharpLspProgress: () => () => {}
};
