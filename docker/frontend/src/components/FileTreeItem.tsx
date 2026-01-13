import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Folder, File, FileCode, FileJson, FileText, FileImage, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { FileNode } from '../../shared/types';

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onFileSelect?: (node: FileNode) => void;
}

// Get appropriate icon based on file extension
function getFileIcon(name: string): React.ReactNode {
  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'rb':
    case 'go':
    case 'rs':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'cs':
    case 'php':
    case 'swift':
    case 'kt':
      return <FileCode className="h-4 w-4 text-info" />;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return <FileJson className="h-4 w-4 text-warning" />;
    case 'md':
    case 'txt':
    case 'rst':
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return <FileImage className="h-4 w-4 text-purple-400" />;
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return <FileCode className="h-4 w-4 text-pink-400" />;
    case 'html':
    case 'htm':
      return <FileCode className="h-4 w-4 text-orange-400" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

export function FileTreeItem({
  node,
  depth,
  isExpanded,
  isLoading,
  onToggle,
}: FileTreeItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: node.path,
    data: {
      type: 'file',
      path: node.path,
      name: node.name,
      isDirectory: node.isDirectory
    }
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDirectory) {
      onToggle();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDirectory) {
      onToggle();
    }
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-1 py-1 px-2 rounded cursor-grab select-none',
        'hover:bg-accent/50 transition-colors',
        isDragging && 'opacity-50 bg-accent'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Expand/collapse chevron for directories */}
      {node.isDirectory ? (
        <button
          className="flex items-center justify-center w-4 h-4 hover:bg-accent rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      ) : (
        <span className="w-4" />
      )}

      {/* Icon */}
      {node.isDirectory ? (
        <Folder className={cn(
          'h-4 w-4',
          isExpanded ? 'text-primary' : 'text-warning'
        )} />
      ) : (
        getFileIcon(node.name)
      )}

      {/* Name */}
      <span className="text-xs truncate flex-1 text-foreground">
        {node.name}
      </span>
    </div>
  );
}
