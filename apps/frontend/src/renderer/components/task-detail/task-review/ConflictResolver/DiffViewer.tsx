import { useEffect, useState } from 'react';
import { DiffEditor, loader } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import type { FileConflict } from '../../../../../shared/types';

// Configure Monaco to use local files
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
  }
});

interface DiffViewerProps {
  file: FileConflict | null;
  theme?: 'light' | 'dark';
}

/**
 * Monaco-based side-by-side diff viewer for conflict resolution
 * Shows "theirs" (main branch) on the left and "ours" (spec branch) on the right
 */
export function DiffViewer({ file, theme = 'dark' }: DiffViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Map file extension to Monaco language
  const getLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'html': 'html',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'ini',
      'sh': 'shell',
      'bash': 'shell',
      'sql': 'sql',
      'graphql': 'graphql',
      'vue': 'html',
      'svelte': 'html'
    };
    return languageMap[ext] || 'plaintext';
  };

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a file to view the diff
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Main Branch (theirs)</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
              original
            </span>
          </div>
          <span className="text-muted-foreground">|</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Spec Branch (ours)</span>
            <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-mono">
              modified
            </span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {file.filePath}
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <DiffEditor
          original={file.contentTheirs || ''}
          modified={file.contentOurs || ''}
          language={getLanguage(file.filePath)}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            diffWordWrap: 'on',
            renderOverviewRuler: true,
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
            automaticLayout: true
          }}
          onMount={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}
