import { useMemo } from 'react';
import { useFileExplorerStore } from '../stores/file-explorer-store';
import type { FileNode } from '../../shared/types';

/**
 * A flattened representation of a FileNode for virtualized rendering.
 * Includes depth information and expansion state for proper indentation
 * and folder rendering without recursive component nesting.
 */
export interface FlattenedNode {
  /** The original file node data */
  node: FileNode;
  /** Depth level in the tree (0 = root level) */
  depth: number;
  /** Whether this folder is expanded (only relevant for directories) */
  isExpanded: boolean;
  /** Whether this folder is currently loading children */
  isLoading: boolean;
  /** Unique key for React rendering (uses node.path) */
  key: string;
}

/**
 * Flattens a hierarchical tree of FileNodes into a flat array suitable for virtualized rendering.
 * Only includes nodes that should be visible (i.e., nodes whose ancestors are all expanded).
 *
 * @param nodes - The array of FileNodes at the current level
 * @param depth - The current depth level (0 for root)
 * @param expandedFolders - Set of folder paths that are currently expanded
 * @param filesCache - Map of directory paths to their loaded children
 * @param loadingDirs - Map of directory paths to their loading state
 * @returns An array of FlattenedNode objects in display order
 */
export function flattenTree(
  nodes: FileNode[],
  depth: number,
  expandedFolders: Set<string>,
  filesCache: Map<string, FileNode[]>,
  loadingDirs: Map<string, boolean>
): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  for (const node of nodes) {
    const isExpanded = expandedFolders.has(node.path);
    const isLoading = loadingDirs.get(node.path) ?? false;

    // Add the current node
    result.push({
      node,
      depth,
      isExpanded,
      isLoading,
      key: node.path,
    });

    // If this is an expanded directory, recursively add its children
    if (node.isDirectory && isExpanded) {
      const children = filesCache.get(node.path);
      if (children && children.length > 0) {
        const childNodes = flattenTree(
          children,
          depth + 1,
          expandedFolders,
          filesCache,
          loadingDirs
        );
        result.push(...childNodes);
      }
    }
  }

  return result;
}

/**
 * Hook that provides a flattened, virtualization-ready list of visible tree nodes.
 * Integrates with the file-explorer-store to automatically update when folders
 * are expanded/collapsed or new directories are loaded.
 *
 * @param rootPath - The root directory path to start from
 * @returns Object containing the flattened nodes array and helper functions
 */
export function useVirtualizedTree(rootPath: string) {
  const expandedFolders = useFileExplorerStore((state) => state.expandedFolders);
  const files = useFileExplorerStore((state) => state.files);
  const isLoading = useFileExplorerStore((state) => state.isLoading);
  const toggleFolder = useFileExplorerStore((state) => state.toggleFolder);
  const loadDirectory = useFileExplorerStore((state) => state.loadDirectory);

  // Get the root files
  const rootFiles = files.get(rootPath);

  // Compute the flattened list of visible nodes
  const flattenedNodes = useMemo(() => {
    if (!rootFiles) {
      return [];
    }
    return flattenTree(rootFiles, 0, expandedFolders, files, isLoading);
  }, [rootFiles, expandedFolders, files, isLoading]);

  // Handler for toggling a folder's expansion state
  const handleToggle = (node: FileNode) => {
    if (!node.isDirectory) return;

    const isCurrentlyExpanded = expandedFolders.has(node.path);

    // Toggle the folder
    toggleFolder(node.path);

    // If we're expanding and children aren't loaded yet, load them
    if (!isCurrentlyExpanded && !files.has(node.path)) {
      loadDirectory(node.path);
    }
  };

  return {
    /** Flattened array of visible nodes for virtualized rendering */
    flattenedNodes,
    /** Total count of visible nodes */
    count: flattenedNodes.length,
    /** Toggle a folder's expanded/collapsed state (also loads children if needed) */
    handleToggle,
    /** Whether the root directory is still loading */
    isRootLoading: isLoading.get(rootPath) ?? false,
    /** Whether we have root files loaded */
    hasRootFiles: !!rootFiles,
  };
}
