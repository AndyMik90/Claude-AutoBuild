# C# Language Service (LSP) Integration Guide

This document explains how to integrate the C# Language Service into the Code Editor component.

## Quick Start

### 1. Import the Hook

Add the import to your CodeEditor component:

```typescript
import { useCSharpLsp } from '../hooks/useCSharpLsp';
```

### 2. Use the Hook in Your Component

Add the hook call inside your component:

```typescript
export function CodeEditor({ projectId }: CodeEditorProps) {
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null);

  // Initialize C# LSP
  const csharpLsp = useCSharpLsp({
    workspaceRoot,
    monaco: monacoInstance,
    editor: editorRef.current
  });

  // ... rest of component
}
```

### 3. Update Monaco Editor Handlers

#### On Editor Mount

```typescript
function handleEditorDidMount(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
  editorRef.current = editor;
  setMonacoInstance(monaco);

  // Your existing code...
}
```

#### On File Open

When opening a .cs file, notify the LSP:

```typescript
const openFile = useCallback(async (relPath: string) => {
  // ... load file content

  const result = await window.electronAPI.codeEditorReadFile(workspaceRoot, relPath);

  if (result.success && result.data !== undefined) {
    const newTab: EditorTab = {
      id: `${Date.now()}-${relPath}`,
      relPath,
      fileName: relPath.split('/').pop() || relPath,
      language: getLanguageFromPath(relPath),
      originalContent: result.data,
      content: result.data,
      isDirty: false,
      lastOpenedAt: Date.now()
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);

    // Notify LSP if C# file
    if (newTab.language === 'csharp') {
      await csharpLsp.didOpen(relPath, result.data);
    }
  }
}, [workspaceRoot, csharpLsp]);
```

#### On Content Change

When the editor content changes, notify the LSP:

```typescript
function handleEditorChange(value: string | undefined) {
  if (!activeTab || value === undefined) return;

  setTabs(prev => prev.map(t =>
    t.id === activeTab.id
      ? { ...t, content: value, isDirty: value !== t.originalContent }
      : t
  ));

  // Notify LSP if C# file
  if (activeTab.language === 'csharp') {
    csharpLsp.didChange(activeTab.relPath, value);
  }
}
```

#### On File Save

When saving a file, notify the LSP:

```typescript
const saveFile = useCallback(async () => {
  if (!activeTab || !workspaceRoot) return;

  setStatus('saving');
  const result = await window.electronAPI.codeEditorWriteFile(
    workspaceRoot,
    activeTab.relPath,
    activeTab.content
  );

  if (result.success) {
    setTabs(prev => prev.map(t =>
      t.id === activeTab.id
        ? { ...t, originalContent: t.content, isDirty: false }
        : t
    ));

    // Notify LSP if C# file
    if (activeTab.language === 'csharp') {
      await csharpLsp.didSave(activeTab.relPath, activeTab.content);
    }
  }

  setStatus('idle');
}, [activeTab, workspaceRoot, csharpLsp]);
```

#### On Tab Close

When closing a tab, notify the LSP:

```typescript
const closeTab = useCallback(async (tabId: string) => {
  const tab = tabs.find(t => t.id === tabId);

  if (tab && tab.language === 'csharp') {
    await csharpLsp.didClose(tab.relPath);
  }

  setTabs(prev => prev.filter(t => t.id !== tabId));

  // ... rest of close logic
}, [tabs, csharpLsp]);
```

### 4. Add UI Elements

#### Status Indicator

Add a status indicator to show LSP state:

```tsx
{csharpLsp.status === 'ready' && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <div className="h-2 w-2 rounded-full bg-green-500" />
    <span>C# IntelliSense Active</span>
    {(csharpLsp.errorCount > 0 || csharpLsp.warningCount > 0) && (
      <span className="text-destructive">
        {csharpLsp.errorCount} errors, {csharpLsp.warningCount} warnings
      </span>
    )}
  </div>
)}

{csharpLsp.status === 'starting' && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    <span>Starting C# Language Service...</span>
  </div>
)}

{csharpLsp.status === 'error' && (
  <div className="flex items-center gap-2 text-xs text-destructive">
    <AlertCircle className="h-3 w-3" />
    <span>{csharpLsp.statusMessage || 'C# Language Service Error'}</span>
  </div>
)}
```

#### Format Document Button

Add a button to format the current document:

```tsx
{activeTab?.language === 'csharp' && csharpLsp.isReady && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => csharpLsp.formatDocument()}
          className="h-8 px-2"
        >
          <FileCode className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Format Document (Shift+Alt+F)</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

## Features

The integration provides:

- **Autocomplete/IntelliSense**: Triggered by `.`, space, `(`, `<`
- **Hover Information**: Hover over symbols to see type information
- **Go to Definition**: Click on symbols with Ctrl/Cmd key
- **Document Formatting**: Format code with Shift+Alt+F
- **Diagnostics**: Real-time error and warning squiggles
- **Debounced Updates**: Changes are debounced (300ms) to avoid excessive LSP calls

## Security

All LSP operations are workspace-scoped:
- Path validation prevents directory traversal
- Symlink escape detection
- File URIs are validated against workspace root

## Error Handling

The hook handles errors gracefully:
- Failed LSP requests return empty results
- Errors are logged to console
- Status updates reflect error states
- Diagnostics are cleared when documents close

## Performance

- **Lazy Start**: LSP starts only when needed
- **Debouncing**: Document changes are debounced (300ms)
- **Provider Caching**: Monaco providers are registered once and reused
- **Cleanup**: Resources are properly disposed on unmount

## Troubleshooting

### LSP Server Not Starting

If the LSP server fails to start, check:

1. OmniSharp is installed and accessible
2. Set `OMNISHARP_PATH` environment variable if needed:
   ```bash
   export OMNISHARP_PATH=/path/to/omnisharp
   ```

3. Check for `.sln` or `.csproj` files in workspace root

### No IntelliSense

If IntelliSense doesn't work:

1. Check LSP status in UI
2. Ensure file extension is `.cs`
3. Verify file is within workspace root
4. Check browser console for errors

### Slow Performance

If the editor feels slow:

1. Reduce debounce timeout if needed
2. Check for large files (>10k lines)
3. Verify OmniSharp server isn't overloaded

## Future Enhancements

Potential improvements not in M3:

- Symbol rename (F2)
- Code actions/quick fixes
- Semantic highlighting
- Workspace symbols search
- Unity-specific features (e.g., automatic solution regeneration)
