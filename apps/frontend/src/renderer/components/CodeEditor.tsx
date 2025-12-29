import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Save, FileCode, Folder, FolderOpen, ChevronRight, ChevronDown, File, X, Search, Clock, AlertCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';
import { useProjectStore } from '../stores/project-store';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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

interface EditorTab {
  id: string;
  relPath: string;
  fileName: string;
  language: string;
  originalContent: string;
  content: string;
  isDirty: boolean;
  lastOpenedAt: number;
}

interface SearchMatch {
  line: number;
  column: number;
  preview: string;
}

interface SearchResult {
  relPath: string;
  matches: SearchMatch[];
}

export function CodeEditor({ projectId }: CodeEditorProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === projectId);
  const workspaceRoot = selectedProject?.path;

  // Tabs state
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // UI state
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'searching' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [tabToClose, setTabToClose] = useState<string | null>(null);

  // File explorer state
  const [folderState, setFolderState] = useState<FolderState>({
    expanded: new Set<string>(),
    childrenByDir: new Map()
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | undefined>();

  // Recent files state
  const [recentFiles, setRecentFiles] = useState<string[]>([]);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Load recent files from project settings
  useEffect(() => {
    if (selectedProject?.settings.codeEditorRecentFiles) {
      setRecentFiles(selectedProject.settings.codeEditorRecentFiles);
    }
  }, [selectedProject?.settings.codeEditorRecentFiles]);

  // Save recent files to project settings
  const saveRecentFiles = useCallback(async (files: string[]) => {
    if (!selectedProject) return;
    await window.electronAPI.updateProjectSettings(projectId, {
      codeEditorRecentFiles: files
    });
  }, [projectId, selectedProject]);

  // Update recent files when a file is opened
  const addToRecentFiles = useCallback(async (relPath: string) => {
    let previousRecents: string[] = [];
    let newRecents: string[] = [];

    setRecentFiles(prev => {
      previousRecents = prev;
      newRecents = [relPath, ...prev.filter(f => f !== relPath)].slice(0, 30);
      return newRecents;
    });

    try {
      await saveRecentFiles(newRecents);
    } catch (error) {
      console.error('Failed to save recent files:', error);
      // Revert UI state to keep it consistent with persisted settings
      setRecentFiles(previousRecents);
    }
  }, [saveRecentFiles]);

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

  // Load root directory on mount
  useEffect(() => {
    if (!workspaceRoot) return;
    loadDirectory('');
  }, [workspaceRoot, loadDirectory]);

  // Toggle folder expansion
  const toggleFolder = useCallback((relPath: string) => {
    setFolderState(prev => {
      const newExpanded = new Set(prev.expanded);

      if (newExpanded.has(relPath)) {
        newExpanded.delete(relPath);
      } else {
        newExpanded.add(relPath);
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

  // Get Monaco language from file extension
  const getMonacoLanguage = (relPath: string): string => {
    const fileName = relPath.split(/[/\\]/).pop() || '';

    const noExtensionFiles: Record<string, string> = {
      'Makefile': 'makefile',
      'Dockerfile': 'dockerfile',
      'Jenkinsfile': 'groovy',
      'Vagrantfile': 'ruby',
    };

    if (noExtensionFiles[fileName]) {
      return noExtensionFiles[fileName];
    }

    const ext = relPath.split('.').pop()?.toLowerCase();

    if (!ext || ext === relPath) {
      return 'plaintext';
    }

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

  // Open or activate file in a tab
  const openFile = useCallback(async (relPath: string) => {
    if (!workspaceRoot) return;

    // Check if file is already open
    const existingTab = tabs.find(t => t.relPath === relPath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      addToRecentFiles(relPath);
      return;
    }

    // Check if active tab is dirty
    const currentActiveTab = tabs.find(t => t.id === activeTabId);
    if (currentActiveTab?.isDirty) {
      setPendingFilePath(relPath);
      setShowUnsavedDialog(true);
      return;
    }

    // Load file
    setStatus('loading');
    setErrorMessage(undefined);

    try {
      const result = await window.electronAPI.codeEditorReadFile(workspaceRoot, relPath);

      if (result.success && result.data !== undefined) {
        const fileName = relPath.split('/').pop() || relPath;
        const language = getMonacoLanguage(relPath);

        const newTab: EditorTab = {
          id: `${Date.now()}-${Math.random()}`,
          relPath,
          fileName,
          language,
          originalContent: result.data,
          content: result.data,
          isDirty: false,
          lastOpenedAt: Date.now()
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
        addToRecentFiles(relPath);
        setStatus('idle');
      } else {
        setErrorMessage(result.error || 'Failed to read file');
        setStatus('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to read file');
      setStatus('error');
    }
  }, [workspaceRoot, tabs, activeTabId, addToRecentFiles]);

  // Handle unsaved changes dialog confirmation
  const handleDiscardChanges = useCallback(async () => {
    setShowUnsavedDialog(false);
    if (pendingFilePath) {
      await openFile(pendingFilePath);
      setPendingFilePath(null);
    } else if (tabToClose) {
      // Actually close the tab
      setTabs(prev => {
        const filtered = prev.filter(t => t.id !== tabToClose);

        // If we're closing the active tab, switch to another
        if (activeTabId === tabToClose && filtered.length > 0) {
          const closingIndex = prev.findIndex(t => t.id === tabToClose);
          const nextTab = filtered[Math.max(0, closingIndex - 1)];
          setActiveTabId(nextTab.id);
        } else if (filtered.length === 0) {
          setActiveTabId(null);
        }

        return filtered;
      });
      setTabToClose(null);
    }
  }, [pendingFilePath, tabToClose, activeTabId, openFile]);

  // Handle unsaved changes dialog cancellation
  const handleKeepEditing = useCallback(() => {
    setShowUnsavedDialog(false);
    setPendingFilePath(null);
    setTabToClose(null);
  }, []);

  // Close tab
  const closeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.isDirty) {
      setTabToClose(tabId);
      setShowUnsavedDialog(true);
      return;
    }

    // Close immediately if not dirty
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);

      if (activeTabId === tabId && filtered.length > 0) {
        const closingIndex = prev.findIndex(t => t.id === tabId);
        const nextTab = filtered[Math.max(0, closingIndex - 1)];
        setActiveTabId(nextTab.id);
      } else if (filtered.length === 0) {
        setActiveTabId(null);
      }

      return filtered;
    });
  }, [tabs, activeTabId]);

  // Save active tab
  const saveActiveTab = useCallback(async () => {
    if (!workspaceRoot || !activeTab || !activeTab.isDirty) return;

    setStatus('saving');
    setErrorMessage(undefined);

    try {
      const result = await window.electronAPI.codeEditorWriteFile(workspaceRoot, activeTab.relPath, activeTab.content);

      if (result.success) {
        setTabs(prev => prev.map(t =>
          t.id === activeTab.id
            ? { ...t, originalContent: t.content, isDirty: false }
            : t
        ));
        setStatus('idle');
      } else {
        setErrorMessage(result.error || 'Failed to save file');
        setStatus('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save file');
      setStatus('error');
    }
  }, [workspaceRoot, activeTab]);

  // Handle editor change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined && activeTab) {
      setTabs(prev => prev.map(t =>
        t.id === activeTab.id
          ? { ...t, content: value, isDirty: value !== t.originalContent }
          : t
      ));
    }
  }, [activeTab]);

  // Search functionality
  const performSearch = useCallback(async () => {
    if (!workspaceRoot || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(undefined);
      return;
    }

    setStatus('searching');
    setSearchError(undefined);

    try {
      const result = await window.electronAPI.codeEditorSearchText(workspaceRoot, searchQuery);

      if (result.success && result.data) {
        setSearchResults(result.data);
        setStatus('idle');
      } else {
        setSearchError(result.error || 'Search failed');
        setStatus('idle');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setStatus('idle');
    }
  }, [workspaceRoot, searchQuery]);

  // Handle search result click - open file and jump to line
  const handleSearchResultClick = useCallback(async (relPath: string, line: number, column: number) => {
    // Check if file is already open
    const existingTab = tabs.find(t => t.relPath === relPath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      addToRecentFiles(relPath);

      // Jump to line after a short delay to ensure editor is ready
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.revealLineInCenter(line);
          editorRef.current.setPosition({ lineNumber: line, column });
          editorRef.current.focus();
        }
      }, 100);
      return;
    }

    // Open file first
    await openFile(relPath);

    // Jump to line after file loads
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column });
        editorRef.current.focus();
      }
    }, 200);
  }, [tabs, addToRecentFiles, openFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S: Save active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab?.isDirty) {
          saveActiveTab();
        }
      }

      // Ctrl/Cmd+W: Close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }

      // Enter in search: perform search
      if (e.key === 'Enter' && document.activeElement?.getAttribute('data-search-input') === 'true') {
        performSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeTabId, saveActiveTab, closeTab, performSearch]);

  // Render file tree node
  const renderFileNode = useCallback((node: FileNode, depth: number = 0) => {
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
                  {[...children]
                    .sort((a, b) => {
                      if (a.isDir && !b.isDir) return -1;
                      if (!a.isDir && b.isDir) return 1;
                      return a.name.localeCompare(b.name);
                    })
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
            activeTab?.relPath === node.relPath ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          onClick={() => openFile(node.relPath)}
        >
          <File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </div>
      );
    }
  }, [folderState, activeTab, toggleFolder, openFile]);

  const rootChildren = folderState.childrenByDir.get('');

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden rounded-none border-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                <CardTitle>Code Editor</CardTitle>
              </div>
              <Button
                onClick={saveActiveTab}
                disabled={!activeTab || !activeTab.isDirty || status === 'saving'}
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

            {/* Tabs */}
            {tabs.length > 0 && (
              <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                {tabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm border transition-colors ${
                      activeTabId === tab.id
                        ? 'bg-accent border-accent-foreground/20'
                        : 'bg-muted border-transparent hover:bg-accent/50'
                    }`}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <File className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[150px]" title={tab.relPath}>{tab.fileName}</span>
                    {tab.isDirty && <span className="text-orange-500 font-bold">●</span>}
                    <X
                      className="h-3 w-3 flex-shrink-0 hover:bg-destructive/20 rounded"
                      onClick={(e) => closeTab(tab.id, e)}
                    />
                  </div>
                ))}
              </div>
            )}

            {errorMessage && (
              <div className="mt-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex gap-4 overflow-hidden p-0">
            {/* Left Sidebar */}
            <div className="w-64 border-r flex-shrink-0 flex flex-col">
              {/* Search */}
              <div className="p-3 border-b">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Search in workspace..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                    data-search-input="true"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={performSearch}
                    disabled={!searchQuery.trim() || status === 'searching'}
                  >
                    {status === 'searching' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {searchError && (
                  <div className="mt-2 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
                    {searchError}
                  </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-3 max-h-64 overflow-y-auto">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      {searchResults.reduce((acc, r) => acc + r.matches.length, 0)} results in {searchResults.length} files
                    </div>
                    {searchResults.map(result => (
                      <div key={result.relPath} className="mb-2">
                        <div className="text-xs font-medium text-foreground mb-1">{result.relPath}</div>
                        {result.matches.slice(0, 5).map((match, idx) => (
                          <div
                            key={idx}
                            className="text-xs py-1 px-2 hover:bg-accent cursor-pointer rounded truncate"
                            onClick={() => handleSearchResultClick(result.relPath, match.line, match.column)}
                            title={match.preview}
                          >
                            <span className="text-muted-foreground">Line {match.line}:</span>{' '}
                            <span className="font-mono">{match.preview}</span>
                          </div>
                        ))}
                        {result.matches.length > 5 && (
                          <div className="text-xs text-muted-foreground italic px-2">
                            +{result.matches.length - 5} more matches
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Files */}
              {recentFiles.length > 0 && (
                <div className="p-3 border-b">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Clock className="h-4 w-4" />
                    <span>Recent</span>
                  </div>
                  <div className="space-y-1">
                    {recentFiles.slice(0, 10).map(relPath => {
                      const fileName = relPath.split('/').pop() || relPath;
                      return (
                        <Tooltip key={relPath}>
                          <TooltipTrigger asChild>
                            <div
                              className={`flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded truncate ${
                                activeTab?.relPath === relPath ? 'bg-accent' : ''
                              }`}
                              onClick={() => openFile(relPath)}
                            >
                              <File className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                              <span className="truncate">{fileName}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{relPath}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* File Explorer */}
              <ScrollArea className="flex-1">
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
                      {[...rootChildren]
                        .sort((a, b) => {
                          if (a.isDir !== b.isDir) {
                            return a.isDir ? -1 : 1;
                          }
                          return a.name.localeCompare(b.name);
                        })
                        .map(node => renderFileNode(node, 0))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              {activeTab ? (
                <Editor
                  height="100%"
                  language={activeTab.language}
                  value={activeTab.content}
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

        {/* Unsaved changes dialog */}
        <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. If you continue, your changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleKeepEditing}>Keep Editing</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscardChanges}>Discard Changes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
