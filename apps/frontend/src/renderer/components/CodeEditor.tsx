import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Save, FileCode, Folder, FolderOpen, ChevronRight, ChevronDown, File } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { useProjectStore } from '../stores/project-store';
import { TooltipProvider } from './ui/tooltip';

interface CodeEditorProps {
  projectId: string;
}

interface FileNode {
  name: string;
  relPath: string;
  isDir: boolean;
}

interface FolderState {
  expanded: Set<string>;
  childrenByDir: Map<string, FileNode[] | 'loading' | { error: string }>;
}

export function CodeEditor({ projectId }: CodeEditorProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === projectId);
  const workspaceRoot = selectedProject?.path;

  // Editor state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // File explorer state
  const [folderState, setFolderState] = useState<FolderState>({
    expanded: new Set<string>(),
    childrenByDir: new Map()
  });

  const editorRef = useRef<any>(null);

  // Load root directory on mount
  useEffect(() => {
    if (!workspaceRoot) return;
    loadDirectory('');
  }, [workspaceRoot]);

  // Load directory contents
  const loadDirectory = useCallback(async (relPath: string) => {
    if (!workspaceRoot) return;

    setFolderState(prev => ({
      ...prev,
      childrenByDir: new Map(prev.childrenByDir).set(relPath, 'loading')
    }));

    try {
      const result = await window.electronAPI.codeEditorListDir(workspaceRoot, relPath);

      if (result.success && result.data) {
        setFolderState(prev => ({
          ...prev,
          childrenByDir: new Map(prev.childrenByDir).set(relPath, result.data!)
        }));
      } else {
        setFolderState(prev => ({
          ...prev,
          childrenByDir: new Map(prev.childrenByDir).set(relPath, { error: result.error || 'Failed to load directory' })
        }));
      }
    } catch (err) {
      setFolderState(prev => ({
        ...prev,
        childrenByDir: new Map(prev.childrenByDir).set(relPath, { error: err instanceof Error ? err.message : 'Failed to load directory' })
      }));
    }
  }, [workspaceRoot]);

  // Toggle folder expansion
  const toggleFolder = useCallback((relPath: string) => {
    setFolderState(prev => {
      const newExpanded = new Set(prev.expanded);

      if (newExpanded.has(relPath)) {
        newExpanded.delete(relPath);
      } else {
        newExpanded.add(relPath);
        // Load children if not already loaded
        if (!prev.childrenByDir.has(relPath)) {
          loadDirectory(relPath);
        }
      }

      return {
        ...prev,
        expanded: newExpanded
      };
    });
  }, [loadDirectory]);

  // Open file
  const openFile = useCallback(async (relPath: string) => {
    if (!workspaceRoot) return;

    // If dirty, confirm discard
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
    }

    setStatus('loading');
    setErrorMessage(undefined);

    try {
      const result = await window.electronAPI.codeEditorReadFile(workspaceRoot, relPath);

      if (result.success && result.data !== undefined) {
        setFileContent(result.data);
        setSelectedFilePath(relPath);
        setIsDirty(false);
        setStatus('idle');
      } else {
        setErrorMessage(result.error || 'Failed to read file');
        setStatus('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to read file');
      setStatus('error');
    }
  }, [workspaceRoot, isDirty]);

  // Save file
  const saveFile = useCallback(async () => {
    if (!workspaceRoot || !selectedFilePath || !isDirty) return;

    setStatus('saving');
    setErrorMessage(undefined);

    try {
      const result = await window.electronAPI.codeEditorWriteFile(workspaceRoot, selectedFilePath, fileContent);

      if (result.success) {
        setIsDirty(false);
        setStatus('idle');
      } else {
        setErrorMessage(result.error || 'Failed to save file');
        setStatus('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save file');
      setStatus('error');
    }
  }, [workspaceRoot, selectedFilePath, fileContent, isDirty]);

  // Handle editor change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setFileContent(value);
      setIsDirty(true);
    }
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S (Win/Linux) or Cmd+S (macOS)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (selectedFilePath && isDirty) {
          saveFile();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilePath, isDirty, saveFile]);

  // Get Monaco language from file extension
  const getMonacoLanguage = (relPath: string): string => {
    const ext = relPath.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'cs': return 'csharp';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'shader':
      case 'hlsl':
      case 'cginc': return 'cpp';
      case 'js': return 'javascript';
      case 'jsx': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'xml': return 'xml';
      case 'yaml':
      case 'yml': return 'yaml';
      case 'txt': return 'plaintext';
      default: return 'plaintext';
    }
  };

  // Render file tree node
  const renderFileNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = folderState.expanded.has(node.relPath);
    const children = folderState.childrenByDir.get(node.relPath);

    if (node.isDir) {
      return (
        <div key={node.relPath}>
          <div
            className="flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleFolder(node.relPath)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-blue-500" />
            )}
            <span className="truncate">{node.name}</span>
          </div>
          {isExpanded && (
            <div>
              {children === 'loading' && (
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading...</span>
                </div>
              )}
              {typeof children === 'object' && !Array.isArray(children) && (
                <div className="px-2 py-1 text-sm text-destructive" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                  Error: {children.error}
                </div>
              )}
              {Array.isArray(children) && children.length === 0 && (
                <div className="px-2 py-1 text-sm text-muted-foreground italic" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                  Empty folder
                </div>
              )}
              {Array.isArray(children) && children.length > 0 && (
                <>
                  {children
                    .filter(child => child.isDir)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(child => renderFileNode(child, depth + 1))}
                  {children
                    .filter(child => !child.isDir)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(child => renderFileNode(child, depth + 1))}
                </>
              )}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div
          key={node.relPath}
          className={`flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-sm ${
            selectedFilePath === node.relPath ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          onClick={() => openFile(node.relPath)}
        >
          <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </div>
      );
    }
  };

  const rootChildren = folderState.childrenByDir.get('');

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col p-6">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                <CardTitle>Code Editor</CardTitle>
                {selectedFilePath && (
                  <>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-sm font-normal text-muted-foreground">{selectedFilePath}</span>
                    {isDirty && <span className="text-orange-500 font-bold">●</span>}
                  </>
                )}
              </div>
              <Button
                onClick={saveFile}
                disabled={!selectedFilePath || !isDirty || status === 'saving'}
                size="sm"
              >
                {status === 'saving' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
            {errorMessage && (
              <div className="mt-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {errorMessage}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex gap-4 overflow-hidden p-0">
            {/* File Explorer */}
            <div className="w-64 border-r flex-shrink-0">
              <ScrollArea className="h-full">
                <div className="p-2">
                  {rootChildren === 'loading' && (
                    <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Loading...</span>
                    </div>
                  )}
                  {typeof rootChildren === 'object' && !Array.isArray(rootChildren) && (
                    <div className="px-2 py-1 text-sm text-destructive">
                      Error: {rootChildren.error}
                    </div>
                  )}
                  {Array.isArray(rootChildren) && rootChildren.length > 0 && (
                    <>
                      {rootChildren
                        .filter(node => node.isDir)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(node => renderFileNode(node, 0))}
                      {rootChildren
                        .filter(node => !node.isDir)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(node => renderFileNode(node, 0))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              {selectedFilePath ? (
                <Editor
                  height="100%"
                  language={getMonacoLanguage(selectedFilePath)}
                  value={fileContent}
                  onChange={handleEditorChange}
                  theme="vs-dark"
                  loading={
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  }
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    readOnly: status === 'loading' || status === 'saving',
                    automaticLayout: true,
                  }}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Select a file to start editing</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
