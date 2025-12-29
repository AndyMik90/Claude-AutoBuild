import { useEffect, useRef, useCallback } from 'react';
import type * as Monaco from 'monaco-editor';
import { useCSharpLspStore } from '../stores/csharp-lsp-store';
import type {
  CSharpLspCompletionList,
  CSharpLspHover,
  CSharpLspLocation
} from '../../shared/types';

interface UseCSharpLspOptions {
  workspaceRoot: string | null;
  monaco: typeof Monaco | null;
  editor: Monaco.editor.IStandaloneCodeEditor | null;
}

interface DocumentState {
  relPath: string;
  version: number;
  changeTimeout?: ReturnType<typeof setTimeout>;
}

export function useCSharpLsp({ workspaceRoot, monaco, editor }: UseCSharpLspOptions) {
  const lspStore = useCSharpLspStore();
  const initializeLspStore = useCallback(() => lspStore.initialize(), [lspStore]);
  const documentsRef = useRef<Map<string, DocumentState>>(new Map());
  const providersRef = useRef<Monaco.IDisposable[]>([]);

  // Initialize LSP store event listeners
  useEffect(() => {
    const cleanup = initializeLspStore();
    return cleanup;
  }, [initializeLspStore]);

  // Start LSP server when workspace changes
  useEffect(() => {
    if (workspaceRoot && lspStore.status === 'stopped') {
      lspStore.start(workspaceRoot).catch((error) => {
        console.error('Failed to start C# LSP:', error);
      });
    }

    return () => {
      // Stop LSP when workspace changes or component unmounts
      if (lspStore.status !== 'stopped') {
        lspStore.stop();
      }
    };
  }, [workspaceRoot, lspStore.status, lspStore.stop]);

  // Register Monaco language providers
  useEffect(() => {
    if (!monaco || !lspStore.isReady()) {
      return;
    }

    // Clear existing providers
    providersRef.current.forEach(d => d.dispose());
    providersRef.current = [];

    // Register completion provider
    const completionProvider = monaco.languages.registerCompletionItemProvider('csharp', {
      triggerCharacters: ['.', ' ', '(', '<'],
      provideCompletionItems: async (model, position) => {
        try {
          const relPath = model.uri.path.replace(/^\//, '');
          const result = await window.electronAPI.csharpLspCompletion(
            relPath,
            position.lineNumber - 1, // Monaco is 1-based, LSP is 0-based
            position.column - 1
          );

          if (!result.success || !result.data) {
            return { suggestions: [] };
          }

          const completionList = result.data as CSharpLspCompletionList;

          const suggestions: Monaco.languages.CompletionItem[] = completionList.items.map((item) => ({
            label: item.label,
            kind: mapCompletionItemKind(monaco, item.kind || 1),
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText || item.label,
            insertTextRules: item.insertTextFormat === 2
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            sortText: item.sortText,
            filterText: item.filterText,
            preselect: item.preselect,
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            )
          }));

          return {
            incomplete: completionList.isIncomplete,
            suggestions
          };
        } catch (error) {
          console.error('Completion error:', error);
          return { suggestions: [] };
        }
      }
    });
    providersRef.current.push(completionProvider);

    // Register hover provider
    const hoverProvider = monaco.languages.registerHoverProvider('csharp', {
      provideHover: async (model, position) => {
        try {
          const relPath = model.uri.path.replace(/^\//, '');
          const result = await window.electronAPI.csharpLspHover(
            relPath,
            position.lineNumber - 1,
            position.column - 1
          );

          if (!result.success || !result.data) {
            return null;
          }

          const hover = result.data as CSharpLspHover;

          const contents: Monaco.IMarkdownString[] = [];
          if (typeof hover.contents === 'string') {
            contents.push({ value: hover.contents });
          } else if (Array.isArray(hover.contents)) {
            hover.contents.forEach((c) => {
              if (typeof c === 'string') {
                contents.push({ value: c });
              } else {
                contents.push({
                  value: c.language ? `\`\`\`${c.language}\n${c.value}\n\`\`\`` : c.value
                });
              }
            });
          } else {
            const c = hover.contents;
            contents.push({
              value: c.language ? `\`\`\`${c.language}\n${c.value}\n\`\`\`` : c.value
            });
          }

          return {
            contents,
            range: hover.range ? new monaco.Range(
              hover.range.start.line + 1,
              hover.range.start.column + 1,
              hover.range.end.line + 1,
              hover.range.end.column + 1
            ) : undefined
          };
        } catch (error) {
          console.error('Hover error:', error);
          return null;
        }
      }
    });
    providersRef.current.push(hoverProvider);

    // Register definition provider
    const definitionProvider = monaco.languages.registerDefinitionProvider('csharp', {
      provideDefinition: async (model, position) => {
        try {
          const relPath = model.uri.path.replace(/^\//, '');
          const result = await window.electronAPI.csharpLspDefinition(
            relPath,
            position.lineNumber - 1,
            position.column - 1
          );

          if (!result.success || !result.data) {
            return null;
          }

          const location = result.data as CSharpLspLocation;

          // Convert file:// URI to path
          const targetPath = location.uri.replace(/^file:\/\//, '');

          return {
            uri: monaco.Uri.file(targetPath),
            range: new monaco.Range(
              location.range.start.line + 1,
              location.range.start.column + 1,
              location.range.end.line + 1,
              location.range.end.column + 1
            )
          };
        } catch (error) {
          console.error('Definition error:', error);
          return null;
        }
      }
    });
    providersRef.current.push(definitionProvider);

    // Register document formatting provider
    const formattingProvider = monaco.languages.registerDocumentFormattingEditProvider('csharp', {
      provideDocumentFormattingEdits: async (model) => {
        try {
          const relPath = model.uri.path.replace(/^\//, '');
          const result = await window.electronAPI.csharpLspFormatDocument(
            relPath,
            model.getValue()
          );

          if (!result.success || !result.data) {
            return [];
          }

          const edits = result.data as Array<{
            range: { start: { line: number; column: number }; end: { line: number; column: number } };
            newText: string;
          }>;

          return edits.map((edit) => ({
            range: new monaco.Range(
              edit.range.start.line + 1,
              edit.range.start.column + 1,
              edit.range.end.line + 1,
              edit.range.end.column + 1
            ),
            text: edit.newText
          }));
        } catch (error) {
          console.error('Formatting error:', error);
          return [];
        }
      }
    });
    providersRef.current.push(formattingProvider);

    return () => {
      providersRef.current.forEach(d => d.dispose());
      providersRef.current = [];
    };
  }, [monaco, lspStore.status]);

  // Sync diagnostics to Monaco markers
  useEffect(() => {
    if (!monaco || !editor) return;

    const model = editor.getModel();
    if (!model) return;

    const relPath = model.uri.path.replace(/^\//, '');
    const diagnostics = lspStore.getDiagnostics(relPath);

    const markers: Monaco.editor.IMarkerData[] = diagnostics.map((diag) => ({
      severity: mapDiagnosticSeverity(monaco, diag.severity || 1),
      startLineNumber: diag.range.start.line + 1,
      startColumn: diag.range.start.column + 1,
      endLineNumber: diag.range.end.line + 1,
      endColumn: diag.range.end.column + 1,
      message: diag.message,
      code: diag.code?.toString(),
      source: diag.source || 'csharp'
    }));

    monaco.editor.setModelMarkers(model, 'csharp-lsp', markers);

    return () => {
      monaco.editor.setModelMarkers(model, 'csharp-lsp', []);
    };
  }, [monaco, editor, lspStore.diagnostics]);

  // Document lifecycle: didOpen
  const didOpen = useCallback(async (relPath: string, text: string) => {
    if (!lspStore.isReady()) return;

    try {
      await window.electronAPI.csharpLspDidOpen(relPath, text);
      documentsRef.current.set(relPath, { relPath, version: 0 });
    } catch (error) {
      console.error('Failed to notify LSP of document open:', error);
    }
  }, [lspStore.status]);

  // Document lifecycle: didChange (debounced)
  const didChange = useCallback((relPath: string, text: string) => {
    if (!lspStore.isReady()) return;

    const doc = documentsRef.current.get(relPath);
    if (!doc) {
      // Document not opened yet, open it first
      didOpen(relPath, text);
      return;
    }

    // Clear previous timeout before incrementing version
    if (doc.changeTimeout) {
      clearTimeout(doc.changeTimeout);
    }

    // Increment version after clearing timeout
    const newVersion = doc.version + 1;
    doc.version = newVersion;

    doc.changeTimeout = setTimeout(async () => {
      try {
        await window.electronAPI.csharpLspDidChange(relPath, text, newVersion);
      } catch (error) {
        console.error('Failed to notify LSP of document change:', error);
      }
    }, 300);

    documentsRef.current.set(relPath, doc);
  }, [lspStore.status, didOpen]);

  // Document lifecycle: didSave
  const didSave = useCallback(async (relPath: string, text?: string) => {
    if (!lspStore.isReady()) return;

    try {
      await window.electronAPI.csharpLspDidSave(relPath, text);
    } catch (error) {
      console.error('Failed to notify LSP of document save:', error);
    }
  }, [lspStore.status]);

  // Document lifecycle: didClose
  const didClose = useCallback(async (relPath: string) => {
    if (!lspStore.isReady()) return;

    const doc = documentsRef.current.get(relPath);
    if (doc?.changeTimeout) {
      clearTimeout(doc.changeTimeout);
    }

    documentsRef.current.delete(relPath);

    try {
      await window.electronAPI.csharpLspDidClose(relPath);
      lspStore.clearDiagnostics(relPath);
    } catch (error) {
      console.error('Failed to notify LSP of document close:', error);
    }
  }, [lspStore.status]);

  // Format document
  const formatDocument = useCallback(async () => {
    if (!editor || !lspStore.isReady()) return;

    try {
      await editor.getAction('editor.action.formatDocument')?.run();
    } catch (error) {
      console.error('Failed to format document:', error);
    }
  }, [editor, lspStore.status]);

  return {
    status: lspStore.status,
    statusMessage: lspStore.statusMessage,
    isReady: lspStore.isReady(),
    errorCount: lspStore.getErrorCount(),
    warningCount: lspStore.getWarningCount(),
    didOpen,
    didChange,
    didSave,
    didClose,
    formatDocument
  };
}

// Helper functions
function mapCompletionItemKind(monaco: typeof Monaco, kind: number): Monaco.languages.CompletionItemKind {
  const map: Record<number, Monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter
  };
  return map[kind] || monaco.languages.CompletionItemKind.Text;
}

function mapDiagnosticSeverity(monaco: typeof Monaco, severity: number): Monaco.MarkerSeverity {
  const map: Record<number, Monaco.MarkerSeverity> = {
    1: monaco.MarkerSeverity.Error,
    2: monaco.MarkerSeverity.Warning,
    3: monaco.MarkerSeverity.Info,
    4: monaco.MarkerSeverity.Hint
  };
  return map[severity] || monaco.MarkerSeverity.Info;
}
